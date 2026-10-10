export const CLAUDE_BROWSER_APP_URI =
  "ui://tongping/claude-browser-lab-v1";

export function renderClaudeBrowserApp(publicOrigin: string): string {
  const assetUrl =
    publicOrigin.replace(/\/+$/, "") + "/assets/mcp-app-v2.js";

  return CLAUDE_LAB_HTML.replace(
    /__ASSET_URL__/g,
    JSON.stringify(assetUrl),
  );
}

// 2026-09-20: 从「诊断仪」改成「操作台」。
// 原来只有 frame 图 + STAGES，用户点了也传不回去。
// 现在接管 / 点画面 / 打字 / Enter / Esc / 地址栏全有，
// 交互逻辑照 browser-app.ts（ChatGPT 那张）抄，但 meta 走 Claude 专线。
const CLAUDE_LAB_HTML = String.raw`<!doctype html><html lang="zh-CN"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
:root{color-scheme:light dark;font-family:ui-sans-serif,system-ui,sans-serif;
      --line:rgba(127,127,127,.28);--soft:rgba(127,127,127,.1)}
*{box-sizing:border-box}body{margin:0;background:transparent;color:inherit}
main{display:grid;gap:8px;padding:8px}
.panel{border:1px solid var(--line);border-radius:14px;overflow:hidden;background:rgba(30,30,34,.92)}
.bar{display:flex;gap:6px;align-items:center;padding:8px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.bar.bot{border-bottom:0;border-top:1px solid var(--line)}
.badge{font-size:11px;border:1px solid var(--line);border-radius:999px;padding:3px 8px;white-space:nowrap;opacity:.75}
input,button{font:inherit;border:1px solid var(--line);border-radius:9px;background:var(--soft);
             color:inherit;padding:7px 9px}
input{min-width:0;flex:1}button{cursor:pointer;white-space:nowrap}
button:active{opacity:.65}
button.primary{background:#e8563f;border-color:#e8563f;color:#fff;font-weight:600}
button.live{background:#2e7d4f;border-color:#2e7d4f;color:#fff;font-weight:600}
#viewportWrap{position:relative;min-height:240px;background:#050505;display:grid;place-items:center;overflow:hidden}
#frame{display:block;max-width:100%;max-height:68vh;object-fit:contain}
#frame.hot{cursor:crosshair}
#empty{opacity:.6;font-size:13px;padding:24px;text-align:center}
#hint{position:absolute;left:8px;bottom:8px;font-size:11px;padding:4px 8px;border-radius:999px;
      background:rgba(0,0,0,.62);color:#fff;pointer-events:none;opacity:0;transition:opacity .2s}
#hint.on{opacity:1}
#ping{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;
      border:2px solid #e8563f;pointer-events:none;opacity:0}
#ping.go{animation:pg .45s ease-out}
@keyframes pg{from{opacity:1;transform:scale(.35)}to{opacity:0;transform:scale(1.5)}}
.meta{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;padding:8px;font-size:12px}
.meta b{opacity:.6;font-weight:600}
.err{color:#ff9b9b}.ok{color:#8fe388}.warn{color:#ffd479}
#msg{padding:0 8px 8px;font-size:12px;min-height:16px}
details{border-top:1px solid var(--line)}
summary{padding:8px;font-size:12px;opacity:.7;cursor:pointer}
#stages{display:grid;gap:2px;padding:0 8px 8px;font-size:12px;font-variant-numeric:tabular-nums}
.stage{display:grid;grid-template-columns:20px 140px 1fr;gap:6px;align-items:baseline}
.stage span:last-child{opacity:.7;font-size:11px;word-break:break-word}
pre{margin:0;padding:8px;max-height:150px;overflow:auto;font-size:11px;
    white-space:pre-wrap;word-break:break-word;background:rgba(0,0,0,.2)}
</style></head><body><main>

<section class="panel">
  <div class="bar">
    <span class="badge">CLAUDE 操作台</span>
    <input id="profile" value="default" aria-label="profile" style="max-width:110px;flex:0 1 110px">
    <input id="addr" placeholder="网址，回车前往" aria-label="url">
    <button id="go">前往</button>
  </div>

  <div id="viewportWrap">
    <img id="frame" alt="同屏 画面">
    <div id="empty">连接中…</div>
    <div id="hint"></div>
    <div id="ping"></div>
  </div>

  <div class="bar bot">
    <button id="takeover" class="primary">我来操作</button>
    <button id="refresh">刷新帧</button>
    <button id="key-Enter">Enter</button>
    <button id="key-Escape">Esc</button>
    <button id="fullscreen">全屏</button>
  </div>
  <div class="bar bot">
    <input id="humanText" placeholder="接管后，先点画面里的输入框，再从这里打字">
    <button id="send">输入</button>
  </div>

  <div class="meta"><b>状态</b><span id="mode">模型控制中</span>
                    <b>url</b><span id="url">-</span>
                    <b>title</b><span id="title">-</span></div>
  <div id="msg"></div>

  <details>
    <summary>桥接诊断（STAGES）</summary>
    <div class="bar" style="border:0">
      <button id="context">host context</button><button id="probe">env probe</button>
    </div>
    <div id="stages"></div><pre id="log"></pre>
  </details>
</section>
</main>
<script type="module">
var $=function(id){return document.getElementById(id)};
var LOG=function(label,value){
  var text;
  try{text=typeof value==="string"?value:JSON.stringify(value,null,2)}catch(e){text=String(value)}
  $("log").textContent="["+new Date().toLocaleTimeString()+"] "+label+"\n"+text+"\n\n"+$("log").textContent;
};
var ORDER=["resource","asset","construct","connect","hostContext","toolCall","frameImage","takeover"];
var LABEL={resource:"1 resource html",asset:"2 import asset",construct:"3 new App()",
           connect:"4 App.connect()",hostContext:"5 getHostContext",toolCall:"6 app_refresh",
           frameImage:"7 frame <img>",takeover:"8 human takeover"};
var ST={};
function paint(){
  var h="";
  for(var i=0;i<ORDER.length;i++){
    var k=ORDER[i],s=ST[k]||{status:"idle",detail:""};
    var ic=s.status==="ok"?"OK":s.status==="fail"?"NG":s.status==="run"?"..":"--";
    var cl=s.status==="ok"?"ok":s.status==="fail"?"err":s.status==="run"?"warn":"";
    h+='<div class="stage"><span class="'+cl+'">'+ic+'</span><span>'+LABEL[k]+'</span><span>'+
       String(s.detail||"").replace(/[<&]/g,"")+'</span></div>';
  }
  $("stages").innerHTML=h;
}
function stage(k,st,d){ST[k]={status:st,detail:d||""};paint();}
for(var i=0;i<ORDER.length;i++){ST[ORDER[i]]={status:"idle",detail:""}}
stage("resource","ok","html executed");

function envProbe(){
  var g=globalThis;
  return {href:String(location.href).slice(0,160),framed:window.parent!==window,
          hasWindowOpenai:typeof g.openai!=="undefined",hasWindowClaude:typeof g.claude!=="undefined"};
}
$("probe").addEventListener("click",function(){LOG("env-probe",envProbe())});

function withTimeout(p,ms,label){
  return Promise.race([p,new Promise(function(_,rj){
    setTimeout(function(){rj(new Error(label+" 超时 "+ms+"ms"))},ms)})]);
}

var connected=false,busy=false,displayMode="inline",app=null,poll=null;
var S={profile:"default",url:"",title:"",takeover:false,viewport:{width:0,height:0}};

function say(m,bad){$("msg").textContent=m||"";$("msg").className=bad?"err":"";}
function profileValue(){
  var v=String($("profile").value||"").trim();
  return /^[a-zA-Z0-9._-]{1,64}$/.test(v)?v:"default";
}
function args(extra){
  S.profile=profileValue();
  return Object.assign({identity:"claude",profile:S.profile},extra||{});
}
function structured(r){
  return r&&typeof r==="object"&&r.structuredContent&&typeof r.structuredContent==="object"
    ? r.structuredContent : null;
}
async function call(name,a){
  if(!connected||!app)throw new Error("桥还没连上");
  // 远程 worker（用户电脑）单次往返实测 11.7s，截图更慢。20s 太紧：
  // 动作其实执行了、回执没等到，卡片却报「超时」——2026-09-20 踩过。
  var r=await withTimeout(app.callServerTool({name:name,arguments:a||{}}),75000,name);
  if(r&&r.isError){
    var t=Array.isArray(r.content)
      ? r.content.map(function(x){return x&&x.type==="text"?x.text:""}).filter(Boolean).join(" ") : "";
    throw new Error(t||"工具返回 isError");
  }
  return structured(r);
}

function applyState(d){
  if(!d||typeof d!=="object")return;
  if(typeof d.profile==="string")S.profile=d.profile;
  if(typeof d.url==="string")S.url=d.url;
  if(typeof d.title==="string")S.title=d.title;
  if(typeof d.takeover==="boolean")S.takeover=d.takeover;
  if(d.viewport&&typeof d.viewport==="object"){
    S.viewport={width:Number(d.viewport.width||0),height:Number(d.viewport.height||0)};
  }
  $("url").textContent=S.url||"-";
  $("title").textContent=S.title||"-";
  $("takeover").textContent=S.takeover?"还给模型":"我来操作";
  $("takeover").className=S.takeover?"live":"primary";
  $("mode").textContent=S.takeover?"你在操作 — 点画面即可":"模型控制中";
  $("mode").className=S.takeover?"ok":"";
  $("frame").className=S.takeover?"hot":"";
  $("hint").className=S.takeover?"on":"";
  $("hint").textContent=S.takeover
    ? "点画面 = 真实点击"+(S.viewport.width?(" · 视口 "+S.viewport.width+"×"+S.viewport.height):"")
    : "";
  stage("takeover",S.takeover?"ok":"idle",S.takeover?"active":"");
  if(d.frameUrl){
    stage("frameImage","run","loading");
    var sep=String(d.frameUrl).indexOf("?")>=0?"&":"?";
    $("frame").src=d.frameUrl+sep+"_ts="+Date.now();
    $("empty").style.display="none";
  }
}
$("frame").addEventListener("load",function(){
  stage("frameImage","ok",$("frame").naturalWidth+"x"+$("frame").naturalHeight);
});
$("frame").addEventListener("error",function(){
  stage("frameImage","fail","img error — CSP 或签名过期");
});

async function refresh(){
  if(busy)return; busy=true;
  try{
    stage("toolCall","run","calling");
    var d=await call("browser_app_refresh",args());
    stage("toolCall","ok",d?"structuredContent present":"empty");
    applyState(d); say("");
  }catch(e){
    stage("toolCall","fail",String(e&&e.message||e));
    say(String(e&&e.message||e),true);
  }finally{busy=false}

}
function startPoll(){
  stopPoll();
  // 接管时画面要跟手，两秒一帧；模型控制时不轮询，省得白刷
  if(S.takeover)poll=setInterval(function(){refresh()},6000);
}
function stopPoll(){if(poll){clearInterval(poll);poll=null}}

// ── 点画面 = 真实点击。换算成视口逻辑坐标，跟 ChatGPT 卡片同一套 ──
function logicalPoint(clientX,clientY){
  var f=$("frame"),r=f.getBoundingClientRect();
  var lw=Number(S.viewport.width||f.naturalWidth||0);
  var lh=Number(S.viewport.height||f.naturalHeight||0);
  if(!lw||!lh||!r.width||!r.height)return null;
  return {x:Math.max(0,Math.min(lw,(clientX-r.left)*lw/r.width)),
          y:Math.max(0,Math.min(lh,(clientY-r.top)*lh/r.height))};
}
$("frame").addEventListener("click",async function(ev){
  if(!S.takeover){say("先点「我来操作」，接管之后画面才收你的点击",true);return;}
  var p=logicalPoint(ev.clientX,ev.clientY);
  if(!p){say("拿不到视口尺寸，先点一次「刷新帧」",true);return;}
  var wrap=$("viewportWrap").getBoundingClientRect();
  $("ping").style.left=(ev.clientX-wrap.left)+"px";
  $("ping").style.top=(ev.clientY-wrap.top)+"px";
  $("ping").className=""; void $("ping").offsetWidth; $("ping").className="go";
  try{
    await call("browser_app_click",args({x:Math.round(p.x),y:Math.round(p.y)}));
    say("点了 ("+Math.round(p.x)+", "+Math.round(p.y)+")");
    setTimeout(refresh,1500);
  }catch(e){say(String(e&&e.message||e),true)}
});

$("takeover").addEventListener("click",async function(){
  var want=!S.takeover;
  say(want?"正在接管…远程 worker 慢，可能要等十几秒":"正在交还…");
  try{
    var d=await call("browser_app_takeover",args({takeover:want}));
    applyState(d); startPoll();
    say(S.takeover?"接管了，画面归你 — 直接点":"还给模型了");
  }catch(e){
    // 超时不等于没生效：worker 常常是动作做了、回执晚到。补查真实状态。
    say(String(e&&e.message||e)+" — 正在补查真实状态…",true);
    setTimeout(function(){refresh().then(function(){
      if(S.takeover===want)say(want?"其实接管成功了，画面归你 — 直接点":"其实已经交还了");
    })},3000);
  }
});
$("refresh").addEventListener("click",refresh);
$("go").addEventListener("click",navigate);
$("addr").addEventListener("keydown",function(e){if(e.key==="Enter")navigate()});
async function navigate(){
  var raw=String($("addr").value||"").trim();
  if(!raw)return;
  var u=/^https?:\/\//i.test(raw)?raw:("https://"+raw);
  try{ applyState(await call("browser_app_navigate",args({url:u}))); startPoll(); say(""); }
  catch(e){say(String(e&&e.message||e),true)}
}
["Enter","Escape"].forEach(function(k){
  $("key-"+k).addEventListener("click",async function(){
    if(!S.takeover){say("先点「我来操作」",true);return;}
    try{ await call("browser_app_key",args({key:k})); setTimeout(refresh,300); }
    catch(e){say(String(e&&e.message||e),true)}
  });
});
$("send").addEventListener("click",async function(){
  if(!S.takeover){say("先点「我来操作」",true);return;}
  var t=$("humanText").value;
  if(!t)return;
  try{ await call("browser_app_type",args({text:t})); $("humanText").value=""; setTimeout(refresh,300); }
  catch(e){say(String(e&&e.message||e),true)}
});
$("context").addEventListener("click",function(){
  try{LOG("host-context",app&&app.getHostContext&&app.getHostContext()||"(empty)")}
  catch(e){LOG("host-context-error",String(e))}
});
$("fullscreen").addEventListener("click",async function(){
  try{
    var want=displayMode==="fullscreen"?"inline":"fullscreen";
    var r=await withTimeout(app.requestDisplayMode({mode:want}),10000,"requestDisplayMode");
    displayMode=(r&&r.mode)||want;
  }catch(e){say(String(e&&e.message||e),true)}
});

var mod=null;
try{
  stage("asset","run","importing");
  mod=await import(__ASSET_URL__);
  stage("asset","ok","imported");
}catch(e){
  stage("asset","fail",String(e&&e.message||e));
  LOG("asset-import-error",String(e&&e.stack||e));
}
if(mod){
  try{
    app=new mod.App({name:"tongping-claude-console",version:"0.3.0"},
                    {availableDisplayModes:["inline","fullscreen"]},{autoResize:true});
    stage("construct","ok","");
  }catch(e){stage("construct","fail",String(e&&e.message||e))}
}
if(app){
  app.ontoolresult=function(r){applyState(structured(r))};
  app.onhostcontextchanged=function(ctx){
    try{
      if(ctx&&ctx.theme&&mod.applyDocumentTheme)mod.applyDocumentTheme(ctx.theme);
      if(ctx&&ctx.styles&&ctx.styles.variables&&mod.applyHostStyleVariables)
        mod.applyHostStyleVariables(ctx.styles.variables);
      if(ctx&&ctx.displayMode)displayMode=ctx.displayMode;
    }catch(e){}
  };
  try{
    stage("connect","run","awaiting host");
    await withTimeout(app.connect(),8000,"App.connect()");
    connected=true;
    stage("connect","ok","");
    var ctx=null;
    try{ctx=app.getHostContext&&app.getHostContext();stage("hostContext",ctx?"ok":"fail",ctx?"present":"empty")}
    catch(e){stage("hostContext","fail",String(e&&e.message||e))}
    await refresh();
  }catch(e){
    stage("connect","fail",String(e&&e.message||e));
    $("empty").textContent="桥没连上 — 展开下面的 STAGES 看卡在哪一级";
    say(String(e&&e.message||e),true);
  }
}else{
  $("empty").textContent="MCP App SDK 没加载 — 展开 STAGES";
}
</script></body></html>`;
