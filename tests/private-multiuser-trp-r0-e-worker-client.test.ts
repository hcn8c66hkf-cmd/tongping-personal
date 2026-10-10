import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";

const source = fs.readFileSync(new URL("../src/worker-client.ts", import.meta.url), "utf8");

function compile(body: string): string {
  return ts.transpileModule(body, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
}

function functionSource(...names: string[]): string {
  const file = ts.createSourceFile("worker-client.ts", source, ts.ScriptTarget.Latest, true);
  return names.map((name) => {
    const declaration = file.statements.find((statement): statement is ts.FunctionDeclaration =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
    );
    assert(declaration, `missing ${name}`);
    return declaration.getText(file);
  }).join("\n");
}

test("trusted Worker startup opens a service session without reading or pairing a legacy token", async () => {
  const start = source.indexOf("const trustedTransport =");
  const end = source.indexOf("// Local installation identity is independent", start);
  assert(start >= 0 && end > start);
  const startup = compile(`async function start() { ${source.slice(start, end)} return { trustedSession, token }; }`);
  let opens = 0;
  const context = {
    process: { env: {
      TONGPING_TRUSTED_WORKER_TRANSPORT: "1",
      TONGPING_WORKER_TOKEN: "legacy-env-token",
      TONGPING_PAIR_CODE: "legacy-pair-code",
    } },
    config: { homeDir: "worker-home" }, cloudUrl: "https://cloud.test", tokenFile: "cloud-worker-token",
    openWorkerServiceSession: async (home: string, url: string) => {
      opens++;
      assert.equal(home, "worker-home");
      assert.equal(url, "https://cloud.test");
      return { sessionId: "session-1", sessionCredential: "session-secret", expiresAt: Date.now() + 60_000 };
    },
    readOptional: async () => { throw new Error("legacy token read"); },
    pairWorker: async () => { throw new Error("legacy pairing"); },
    fs: { mkdir: async () => { throw new Error("legacy mkdir"); }, writeFile: async () => { throw new Error("legacy token write"); } },
    console,
  };
  const startWorker = vm.runInNewContext(`${startup}\nstart`, context) as () => Promise<{ trustedSession: { sessionCredential: string }; token: string }>;
  const result = await startWorker();
  assert.equal(opens, 1);
  assert.equal(result.trustedSession.sessionCredential, "session-secret");
  assert.equal(result.token, "");
});

test("legacy private startup keeps the explicit token compatibility path", async () => {
  const start = source.indexOf("const trustedTransport =");
  const end = source.indexOf("// Local installation identity is independent", start);
  const startup = compile(`async function start() { ${source.slice(start, end)} return { trustedSession, token }; }`);
  const context = {
    process: { env: { TONGPING_WORKER_TOKEN: "legacy-env-token" } },
    config: { homeDir: "worker-home" }, cloudUrl: "https://cloud.test", tokenFile: "cloud-worker-token",
    openWorkerServiceSession: async () => { throw new Error("trusted session opened in legacy mode"); },
    readOptional: async () => { throw new Error("file read with explicit token"); },
    pairWorker: async () => { throw new Error("pair with explicit token"); },
    fs: {}, console,
  };
  const startWorker = vm.runInNewContext(`${startup}\nstart`, context) as () => Promise<{ trustedSession: unknown; token: string }>;
  const result = await startWorker();
  assert.equal(result.trustedSession, null);
  assert.equal(result.token, "legacy-env-token");
});

function sessionContext(options: {
  expiresAt?: number;
  open?: () => Promise<{ sessionId: string; sessionCredential: string; expiresAt: number }>;
  fetch?: (url: URL | string, options: RequestInit) => Promise<Response>;
  sleep?: (ms: number) => Promise<void>;
}) {
  return {
    trustedTransport: true,
    trustedSession: { sessionId: "session-1", sessionCredential: "session-secret", expiresAt: options.expiresAt ?? Date.now() + 10 * 60_000 },
    token: "legacy-secret",
    stopping: false,
    activePoll: null,
    renewingSession: null,
    SESSION_RENEW_AHEAD_MS: 60_000,
    SESSION_REJECT_QUIET_MS: 30_000,
    lastSessionRenewedAt: 0,
    rejectBackoffMs: 0,
    socketCredential: new WeakMap(),
    config: { homeDir: "worker-home" },
    cloudUrl: "https://cloud.test",
    workerName: "worker-1",
    WORKER_BUILD: "test-build",
    openWorkerServiceSession: options.open ?? (async () => ({ sessionId: "session-2", sessionCredential: "session-renewed", expiresAt: Date.now() + 10 * 60_000 })),
    sleep: options.sleep ?? (async () => {}),
    AbortController, AbortSignal, Response, URL, Buffer, Date,
    console: { error() {} },
    fetch: options.fetch ?? (async () => Response.json({ ok: true })),
  };
}

const SESSION_FUNCTIONS = ["credentialOf", "renewTrustedSession", "rejectTrustedHttp", "workerHeaders", "poll", "postResult", "uploadFrame"];

type SessionApi = {
  poll(): Promise<unknown>;
  postResult(id: string, reply: unknown): Promise<void>;
  uploadFrame(profile: string, image: Buffer, width: number, height: number): Promise<unknown>;
  workerHeaders(): Record<string, string>;
  state(): { stopping: boolean; trustedSession: { sessionCredential: string } | null; renewing: Promise<void> | null };
};

function sessionApi(context: object): SessionApi {
  const functions = compile(functionSource(...SESSION_FUNCTIONS));
  return vm.runInNewContext(
    `${functions}\n({ poll, postResult, uploadFrame, workerHeaders, state: () => ({ stopping, trustedSession, renewing: renewingSession }) })`,
    context,
  ) as SessionApi;
}

test("one transient credential authenticates Worker HTTP paths and a rejected session is replaced", async () => {
  const requests: Array<{ url: string; authorization: string }> = [];
  let reject = false;
  const context = sessionContext({
    fetch: async (url: URL | string, options: RequestInit) => {
      requests.push({ url: String(url), authorization: String((options.headers as Record<string, string>).authorization) });
      return reject ? new Response("rejected", { status: 401 }) : String(url).includes("/poll")
        ? new Response(null, { status: 204 })
        : String(url).includes("/frame")
          ? Response.json({ frameUrl: "/frame/1" })
          : Response.json({ ok: true });
    },
  });
  const api = sessionApi(context);
  assert.equal(await api.poll(), null);
  await api.postResult("command-1", { ok: true });
  await api.uploadFrame("default", Buffer.from("image"), 1, 1);
  assert.equal(requests.length, 3);
  assert(requests.every((request) => request.authorization === "Worker session-secret"));
  reject = true;
  await assert.rejects(api.poll(), /HTTP 401/);
  // A server restart drops sessions; the device opens a fresh one instead of
  // stopping the whole transport.
  await api.state().renewing;
  assert.equal(api.state().stopping, false);
  assert.equal(api.state().trustedSession?.sessionCredential, "session-renewed");
  reject = false;
  await api.postResult("command-2", { ok: true });
  assert.equal(requests.at(-1)?.authorization, "Worker session-renewed");
});

test("a rejected device stops the transport", async () => {
  const api = sessionApi(sessionContext({
    fetch: async () => new Response("rejected", { status: 401 }),
    open: async () => { throw new Error("Worker service session rejected: HTTP 401"); },
  }));
  await assert.rejects(api.poll(), /HTTP 401/);
  await api.state().renewing;
  assert.equal(api.state().stopping, true);
  assert.equal(api.state().trustedSession, null);
  assert.throws(() => api.workerHeaders(), /session expired or unavailable/);
});

test("an unreachable server keeps retrying the session instead of stopping", async () => {
  let attempts = 0;
  const api = sessionApi(sessionContext({
    fetch: async () => new Response("rejected", { status: 401 }),
    open: async () => {
      attempts++;
      if (attempts < 3) throw new Error("Worker service session rejected: HTTP 502");
      return { sessionId: "session-3", sessionCredential: "session-third", expiresAt: Date.now() + 10 * 60_000 };
    },
  }));
  await assert.rejects(api.poll(), /HTTP 401/);
  await api.state().renewing;
  assert.equal(attempts, 3);
  assert.equal(api.state().stopping, false);
  assert.equal(api.state().trustedSession?.sessionCredential, "session-third");
});

test("a session about to lapse is swapped while the current one keeps working", async () => {
  const api = sessionApi(sessionContext({ expiresAt: Date.now() + 30_000 }));
  const headers = api.workerHeaders();
  assert.equal(headers.authorization, "Worker session-secret");
  await api.state().renewing;
  assert.equal(api.workerHeaders().authorization, "Worker session-renewed");
});

test("all four Worker WebSockets use the shared Worker authorization headers", () => {
  const file = ts.createSourceFile("worker-client.ts", source, ts.ScriptTarget.Latest, true);
  let sockets = 0;
  function visit(node: ts.Node): void {
    if (ts.isNewExpression(node) && node.expression.getText(file) === "WebSocket") {
      sockets++;
      assert.match(node.getText(file), /headers: workerHeaders\(\)/);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  assert.equal(sockets, 4);
});

test("a late 401 for the retired credential keeps the session just opened", async () => {
  let opens = 0;
  const context = sessionContext({
    fetch: async () => new Response("rejected", { status: 401 }),
    open: async () => {
      opens++;
      return { sessionId: "session-" + (opens + 1), sessionCredential: "fresh-" + opens, expiresAt: Date.now() + 10 * 60_000 };
    },
  });
  const api = sessionApi(context);
  await assert.rejects(api.poll(), /HTTP 401/);
  await api.state().renewing;
  assert.equal(api.state().trustedSession?.sessionCredential, "fresh-1");
  // A request that left with the old credential is refused afterwards.
  const renew = vm.runInNewContext("renewTrustedSession", context) as (r: string, k: boolean, c?: string) => void;
  renew("rejected", false, "session-secret");
  assert.equal(api.state().renewing, null);
  assert.equal(opens, 1);
  assert.equal(api.state().trustedSession?.sessionCredential, "fresh-1");
});

test("rejected again right after a renewal backs off instead of trading sessions", async () => {
  const waits: number[] = [];
  let opens = 0;
  const api = sessionApi(sessionContext({
    fetch: async () => new Response("rejected", { status: 401 }),
    sleep: async (ms) => { waits.push(ms); },
    open: async () => {
      opens++;
      return { sessionId: "session-" + (opens + 1), sessionCredential: "fresh-" + opens, expiresAt: Date.now() + 10 * 60_000 };
    },
  }));
  await assert.rejects(api.poll(), /HTTP 401/);
  await api.state().renewing;
  assert.deepEqual(waits, []);
  // The fresh session is refused at once too (another Worker on this device).
  await assert.rejects(api.poll(), /HTTP 401/);
  await api.state().renewing;
  assert.equal(opens, 2);
  assert(waits.length === 1 && waits[0]! >= 30_000, "waited " + waits.join(","));
});
