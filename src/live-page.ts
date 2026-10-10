export function renderLivePage(): string {
  return String.raw`<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover" />
  <title>同屏 · Live</title>
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #111; color: #f4f4f4; }
    main { max-width: 980px; margin: 0 auto; padding: 14px; }
    .bar { display: grid; grid-template-columns: 1fr 1fr auto; gap: 8px; margin-bottom: 10px; }
    input, button { font: inherit; border-radius: 10px; border: 1px solid #555; padding: 10px 12px; background: #1c1c1c; color: inherit; }
    button { cursor: pointer; }
    button.primary { background: #f2f2f2; color: #111; border-color: #f2f2f2; }
    button.danger { background: #512020; border-color: #8a3d3d; }
    button.approve { background: #173d25; border-color: #2f7d49; }
    #status { font-size: 13px; opacity: .82; margin: 8px 2px; word-break: break-all; min-height: 38px; }
    #approvals { display: grid; gap: 8px; margin: 10px 0; }
    .approval { border: 1px solid #654f20; background: #282114; border-radius: 12px; padding: 10px; }
    .approval strong { display: block; margin-bottom: 4px; }
    .approval .meta { font-size: 12px; opacity: .72; margin-top: 4px; }
    .approval .actions { display: flex; gap: 8px; margin-top: 8px; }
    #frameWrap { background: #000; border: 1px solid #333; border-radius: 14px; overflow: hidden; min-height: 180px; display: grid; place-items: center; }
    #frame { width: 100%; height: auto; display: block; touch-action: manipulation; user-select: none; -webkit-user-drag: none; }
    .controls { display: grid; gap: 8px; margin-top: 10px; }
    .row { display: flex; gap: 8px; flex-wrap: wrap; }
    .row > input { flex: 1 1 240px; }
    .hint { font-size: 12px; opacity: .65; line-height: 1.45; }
    .badge { display:inline-block; border:1px solid #555; border-radius:999px; padding:2px 8px; margin-right:6px; }
    @media (max-width: 680px) {
      .bar { grid-template-columns: 1fr; }
      main { padding: 8px; }
    }
  </style>
</head>
<body>
<main>
  <div class="bar">
    <input id="token" type="password" autocomplete="off" placeholder="daemon token（只存在本页 session）" />
    <input id="profile" value="goofish" placeholder="profile，例如 goofish / douyin" />
    <button id="connect" class="primary">连接</button>
  </div>

  <div id="status">未连接。</div>
  <div id="approvals"></div>

  <div id="frameWrap">
    <img id="frame" alt="browser live view" />
  </div>

  <div class="controls">
    <div class="row">
      <button id="takeover" class="primary">接管浏览器</button>
      <button data-key="Enter">Enter</button>
      <button data-key="Escape">Esc</button>
      <button data-key="Tab">Tab</button>
      <button data-key="Backspace">⌫</button>
    </div>
    <div class="row">
      <input id="text" placeholder="接管后：点画面定位输入框，再在这里输入文字" />
      <button id="sendText">输入</button>
    </div>
    <div class="hint">
      画面默认只读。模型遇到购买/支付/删除等高风险按钮时，只能先发审批请求；你可以在上方批准或拒绝。批准只对那个精确按钮生效一次，并会过期。需要验证码或密码时再点“接管浏览器”，直接由你输入；点“还给模型”后恢复自动控制。
    </div>
  </div>
</main>

<script>
(() => {
  const token = document.getElementById("token");
  const profile = document.getElementById("profile");
  const connect = document.getElementById("connect");
  const status = document.getElementById("status");
  const approvals = document.getElementById("approvals");
  const frame = document.getElementById("frame");
  const takeover = document.getElementById("takeover");
  const text = document.getElementById("text");
  const sendText = document.getElementById("sendText");

  let connected = false;
  let takeoverActive = false;
  let refreshTimer = null;
  let frameUrl = null;
  let viewportWidth = 0;
  let viewportHeight = 0;

  token.value = sessionStorage.getItem("tongping-token") || "";
  const queryProfile = new URLSearchParams(location.search).get("profile");
  profile.value =
    queryProfile ||
    sessionStorage.getItem("tongping-profile") ||
    "goofish";

  function headers(json = false) {
    const value = {
      Authorization: "Bearer " + token.value,
      "x-tongping-client": "human-mobile",
    };
    if (json) value["Content-Type"] = "application/json";
    return value;
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: {
        ...headers(Boolean(options.body)),
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      let detail = "";
      try { detail = (await response.json()).error || ""; } catch {}
      throw new Error(detail || "HTTP " + response.status);
    }
    return response;
  }

  function renderApprovals(items) {
    approvals.innerHTML = "";
    if (!Array.isArray(items) || items.length === 0) return;

    for (const item of items) {
      const card = document.createElement("div");
      card.className = "approval";

      const title = document.createElement("strong");
      title.textContent = "模型请求高风险操作";

      const target = document.createElement("div");
      target.textContent = item.targetSummary || "(无法读取按钮文本)";

      const meta = document.createElement("div");
      meta.className = "meta";
      const bits = [];
      if (item.requestedBy) bits.push("请求：" + item.requestedBy);
      if (item.reason) bits.push("原因：" + item.reason);
      if (item.expiresAt) bits.push("过期：" + new Date(item.expiresAt).toLocaleTimeString());
      meta.textContent = bits.join(" · ");

      const actions = document.createElement("div");
      actions.className = "actions";

      const approve = document.createElement("button");
      approve.className = "approve";
      approve.textContent = "批准一次";
      approve.addEventListener("click", () => decideApproval(item.id, true));

      const deny = document.createElement("button");
      deny.className = "danger";
      deny.textContent = "拒绝";
      deny.addEventListener("click", () => decideApproval(item.id, false));

      actions.append(approve, deny);
      card.append(title, target, meta, actions);
      approvals.append(card);
    }
  }

  async function decideApproval(approvalId, approved) {
    try {
      await api("/v1/human/approval/decision", {
        method: "POST",
        body: JSON.stringify({ approvalId, approved }),
      });
      await refreshStatus();
    } catch (error) {
      status.textContent = "审批失败：" + error.message;
    }
  }

  async function refreshStatus() {
    if (!connected) return;
    const p = encodeURIComponent(profile.value.trim());
    const response = await api("/v1/human/status?profile=" + p);
    const data = await response.json();

    takeoverActive = Boolean(data.takeover && data.takeover.active);
    takeover.textContent = takeoverActive ? "还给模型" : "接管浏览器";
    takeover.className = takeoverActive ? "danger" : "primary";

    const url =
      data.browser && data.browser.url
        ? data.browser.url
        : "(尚未打开页面)";
    const owner = takeoverActive
      ? " · HUMAN " + (data.takeover.owner || "")
      : " · MODEL";

    status.innerHTML =
      '<span class="badge">' + escapeHtml(profile.value) + "</span>" +
      (data.browser && data.browser.active ? "browser active" : "browser idle") +
      owner + "<br>" + escapeHtml(url);

    renderApprovals(data.approvals);
  }

  async function refreshFrame() {
    if (!connected) return;
    const p = encodeURIComponent(profile.value.trim());
    const response = await api("/v1/human/screenshot?profile=" + p);

    viewportWidth = Number(
      response.headers.get("x-tongping-viewport-width") || "0",
    );
    viewportHeight = Number(
      response.headers.get("x-tongping-viewport-height") || "0",
    );

    const blob = await response.blob();
    const next = URL.createObjectURL(blob);
    frame.src = next;
    if (frameUrl) URL.revokeObjectURL(frameUrl);
    frameUrl = next;
  }

  async function tick() {
    try {
      await Promise.all([refreshStatus(), refreshFrame()]);
    } catch (error) {
      status.textContent = "连接错误：" + error.message;
    }
  }

  connect.addEventListener("click", async () => {
    if (!token.value.trim() || !profile.value.trim()) {
      status.textContent = "需要 token 和 profile。";
      return;
    }
    sessionStorage.setItem("tongping-token", token.value);
    sessionStorage.setItem("tongping-profile", profile.value.trim());
    connected = true;
    if (refreshTimer) clearInterval(refreshTimer);
    await tick();
    refreshTimer = setInterval(tick, 1200);
  });

  takeover.addEventListener("click", async () => {
    if (!connected) return;
    const endpoint = takeoverActive
      ? "/v1/human/takeover/end"
      : "/v1/human/takeover/start";
    try {
      await api(endpoint, {
        method: "POST",
        body: JSON.stringify({
          profile: profile.value.trim(),
        }),
      });
      await refreshStatus();
    } catch (error) {
      status.textContent = "接管切换失败：" + error.message;
    }
  });

  frame.addEventListener("click", async (event) => {
    if (!connected || !takeoverActive) return;

    const rect = frame.getBoundingClientRect();
    const logicalWidth = viewportWidth || frame.naturalWidth;
    const logicalHeight = viewportHeight || frame.naturalHeight;
    const x =
      (event.clientX - rect.left) * (logicalWidth / rect.width);
    const y =
      (event.clientY - rect.top) * (logicalHeight / rect.height);

    try {
      await api("/v1/human/click", {
        method: "POST",
        body: JSON.stringify({
          profile: profile.value.trim(),
          x,
          y,
        }),
      });
      await refreshFrame();
    } catch (error) {
      status.textContent = "点击失败：" + error.message;
    }
  });

  sendText.addEventListener("click", async () => {
    if (!connected || !takeoverActive || !text.value) return;
    try {
      await api("/v1/human/type", {
        method: "POST",
        body: JSON.stringify({
          profile: profile.value.trim(),
          text: text.value,
        }),
      });
      text.value = "";
      await refreshFrame();
    } catch (error) {
      status.textContent = "输入失败：" + error.message;
    }
  });

  text.addEventListener("keydown", (event) => {
    if (event.key === "Enter") sendText.click();
  });

  document.querySelectorAll("[data-key]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!connected || !takeoverActive) return;
      try {
        await api("/v1/human/key", {
          method: "POST",
          body: JSON.stringify({
            profile: profile.value.trim(),
            key: button.getAttribute("data-key"),
          }),
        });
        await refreshFrame();
      } catch (error) {
        status.textContent = "按键失败：" + error.message;
      }
    });
  });

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[char]);
  }
})();
</script>
</body>
</html>`;
}
