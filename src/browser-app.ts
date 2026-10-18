import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const BROWSER_APP_URI = "ui://tongping/shared-browser-v98";

// Keep the MCP Apps bridge inside the component HTML. A second module request
// could be blocked or time out in the ChatGPT iOS component sandbox, leaving
// the whole card at "Unable to open" before any of our diagnostics ran.
// app-with-deps is already bundled; replace its final ESM export list with the
// four local bindings used by this component.
function inlineMcpAppBridge(): string {
  const source = readFileSync(
    fileURLToPath(import.meta.resolve("@modelcontextprotocol/ext-apps/app-with-deps")),
    "utf8",
  );
  const exportAt = source.lastIndexOf("export{");
  if (exportAt < 0) {
    throw new Error("MCP Apps bridge export list was not found");
  }
  const exportList = source.slice(exportAt);
  const localName = (exportedName: string): string => {
    const match = exportList.match(
      new RegExp("([A-Za-z_$][A-Za-z0-9_$]*) as " + exportedName + "(?:[,}])"),
    );
    if (!match) throw new Error("MCP Apps bridge export missing: " + exportedName);
    return match[1]!;
  };
  return (
    source.slice(0, exportAt) +
    `const App=${localName("App")},` +
    `applyDocumentTheme=${localName("applyDocumentTheme")},` +
    `applyHostStyleVariables=${localName("applyHostStyleVariables")},` +
    `applyHostFonts=${localName("applyHostFonts")};`
  );
}

const MCP_APP_BRIDGE_SOURCE = inlineMcpAppBridge();

export function browserAppPublicOrigin(): string {
  const value =
    process.env.TONGPING_PUBLIC_ORIGIN?.trim() ||
    `http://127.0.0.1:${process.env.TONGPING_PORT?.trim() || "45921"}`;
  return value.replace(/\/+$/, "");
}

export function browserAppUiDomain(): string | undefined {
  const value = process.env.TONGPING_UI_DOMAIN?.trim();
  return value || undefined;
}

export function renderBrowserApp(publicOrigin: string): string {
  const baseOrigin = publicOrigin.replace(/\/+$/, "");
  const brandIconUrl = `${baseOrigin}/assets/tongping-icon.png`;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<style>
:root{
  color-scheme:light dark;
  font-family:-apple-system,BlinkMacSystemFont,"SF Pro Display","SF Pro Text","Helvetica Neue",system-ui,sans-serif;
  --bg:rgba(248,248,251,.92);
  --surface:rgba(255,255,255,.78);
  --surface-strong:rgba(255,255,255,.94);
  --surface-soft:rgba(118,118,128,.08);
  --border:rgba(60,60,67,.12);
  --border-strong:rgba(60,60,67,.18);
  --text:#111114;
  --secondary:rgba(60,60,67,.66);
  --tertiary:rgba(60,60,67,.42);
  --accent:#ff4f93;
  --accent-soft:rgba(255,79,147,.12);
  --blue:#0a84ff;
  --danger:#ff3b30;
  --shadow:0 20px 60px rgba(28,28,30,.14),0 2px 10px rgba(28,28,30,.06);
}
@media(prefers-color-scheme:dark){
  :root{
    --bg:rgba(24,24,27,.94);
    --surface:rgba(44,44,48,.78);
    --surface-strong:rgba(48,48,52,.96);
    --surface-soft:rgba(235,235,245,.08);
    --border:rgba(235,235,245,.10);
    --border-strong:rgba(235,235,245,.16);
    --text:#f5f5f7;
    --secondary:rgba(235,235,245,.68);
    --tertiary:rgba(235,235,245,.42);
    --accent:#ff66a3;
    --accent-soft:rgba(255,102,163,.14);
    --shadow:0 22px 70px rgba(0,0,0,.42),0 1px 0 rgba(255,255,255,.03);
  }
}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:transparent;color:var(--text)}
button,input{font:inherit;color:inherit}
button{cursor:pointer;-webkit-tap-highlight-color:transparent}
button:disabled{cursor:default;opacity:.42}
#app{width:100%;min-width:0;padding:8px 8px max(8px,env(safe-area-inset-bottom,0px))}
.shell{
  overflow:hidden;
  border:1px solid var(--border);
  border-radius:26px;
  background:var(--bg);
  box-shadow:var(--shadow);
  backdrop-filter:saturate(180%) blur(28px);
  -webkit-backdrop-filter:saturate(180%) blur(28px);
}
.brandbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  padding:12px 12px 7px 14px;
}
.brandlockup{display:flex;align-items:center;gap:10px;min-width:0}
.brandIcon{width:34px;height:34px;flex:0 0 auto;border-radius:10px;object-fit:cover;filter:drop-shadow(0 5px 10px rgba(255,79,147,.18))}
.brandcopy{display:grid;gap:1px;min-width:0}
.brandcopy strong{font-size:15px;line-height:1.15;letter-spacing:-.02em;font-weight:680}
#title{max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--tertiary);font-size:10.5px;line-height:1.25;font-weight:500}
.brandActions{display:flex;align-items:center;gap:6px;min-width:0}
.badge,.version{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  height:26px;
  padding:0 9px;
  border-radius:999px;
  white-space:nowrap;
  font-size:10px;
  font-weight:650;
  letter-spacing:.035em;
}
.badge{
  border:1px solid var(--border);
  color:var(--secondary);
  background:var(--surface-soft);
}
.badge::before{
  content:"";
  width:6px;height:6px;border-radius:50%;
  margin-right:6px;background:#34c759;
  box-shadow:0 0 0 3px rgba(52,199,89,.10);
}
.badge.on::before{background:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.version{padding:0 5px;color:var(--tertiary);font-size:9px}
.toolbar{
  display:grid;
  grid-template-columns:72px 92px 74px minmax(0,1fr) 38px;
  grid-template-areas:"identity profile history address refresh";
  gap:6px;
  padding:7px 10px 10px;
}
#identity{grid-area:identity}
#profile{grid-area:profile}
.historyNav{grid-area:history;display:grid;grid-template-columns:1fr 1fr;gap:4px}
.addressWrap{grid-area:address;position:relative;display:flex;align-items:center;min-width:0}
#refresh{grid-area:refresh}
.toolbar input,.talk input,.humanInput{
  min-width:0;width:100%;height:38px;
  border:1px solid var(--border);
  border-radius:13px;
  background:var(--surface);
  color:var(--text);
  padding:0 11px;
  font-size:13px;
  outline:none;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.32);
  transition:border-color .18s ease,background .18s ease,box-shadow .18s ease;
}
.toolbar input:focus,.talk input:focus,.humanInput:focus{
  border-color:rgba(10,132,255,.32);
  background:var(--surface-strong);
  box-shadow:0 0 0 3px rgba(10,132,255,.08),inset 0 1px 0 rgba(255,255,255,.30);
}
#identity,#profile{
  text-align:center;
  font-size:11px;
  font-weight:650;
  letter-spacing:.02em;
  padding:0 7px;
}
#address{padding-right:42px}
button{
  min-height:38px;
  border:1px solid var(--border);
  border-radius:13px;
  background:var(--surface);
  color:var(--text);
  padding:0 11px;
  transition:transform .12s ease,background .15s ease,border-color .15s ease,opacity .15s ease;
}
button:active:not(:disabled){transform:scale(.96);background:var(--surface-soft)}
button.primary{
  color:#fff;
  background:linear-gradient(180deg,#ff6aa7,#ff4f93);
  border-color:rgba(255,79,147,.20);
  box-shadow:0 6px 16px rgba(255,79,147,.18),inset 0 1px 0 rgba(255,255,255,.24);
}
button.on{background:var(--accent-soft);border-color:rgba(255,79,147,.22);color:var(--accent)}
.iconButton{
  width:38px;height:38px;min-height:38px;padding:0;
  display:grid;place-items:center;border-radius:50%;
}
.iconButton svg,.historyNav svg,.buttonIcon,.addressGo svg,.roundAction svg,.sendGlyph{
  width:18px;height:18px;display:block;
  fill:none;stroke:currentColor;stroke-width:1.85;
  stroke-linecap:round;stroke-linejoin:round;
}
.historyNav button{width:35px;padding:0;display:grid;place-items:center}
.addressGo{
  position:absolute;right:4px;top:4px;
  width:30px;height:30px;min-height:30px;padding:0;
  border-radius:10px;
  display:grid;place-items:center;
  background:transparent;border-color:transparent;color:var(--blue);
}
.addressGo:active:not(:disabled){background:rgba(10,132,255,.10)}
.meta{
  display:none;
  margin:0 9px 7px;
  padding:7px 10px;
  border:1px solid rgba(255,59,48,.16);
  border-radius:11px;
  background:rgba(255,59,48,.06);
  font-size:10.5px;
}
.meta.on{display:flex}
#urlLabel{display:none}
#error{color:var(--danger);white-space:normal;font-weight:550;width:100%}
.viewportWrap{
  position:relative;
  margin:0 8px;
  background:var(--surface-soft);
  border:1px solid var(--border);
  border-radius:19px;
  display:grid;place-items:start center;
  min-height:0;height:auto;
  aspect-ratio:var(--remote-aspect,16 / 9);
  overflow:hidden;
  box-shadow:inset 0 0 0 .5px rgba(255,255,255,.05),0 6px 24px rgba(0,0,0,.08);
}
#frame,#liveCanvas,#mediaVideo{
  width:100%;height:100%;max-width:100%;max-height:100%;
  object-fit:contain;object-position:top center;
}
#frame{display:block;user-select:none;-webkit-user-drag:none;pointer-events:none}
#liveCanvas{display:none}
#mediaVideo{display:none;background:#000;pointer-events:none}
#mediaVideo.companionPlayback{pointer-events:auto}
.companionPrep{
  position:absolute;inset:0;z-index:8;
  display:none;place-items:center;
  padding:22px;
  background:
    radial-gradient(circle at 50% 40%,rgba(255,105,160,.17),transparent 32%),
    linear-gradient(180deg,rgba(24,24,28,.80),rgba(16,16,20,.94));
  color:#fff;text-align:center;
  backdrop-filter:blur(8px);
  -webkit-backdrop-filter:blur(8px);
}
.companionPrep.on{display:grid}
.companionPrepCard{
  width:min(290px,90%);
  display:grid;justify-items:center;gap:8px;
}
.companionCounter{
  font-size:13px;font-weight:760;letter-spacing:.01em;
  color:rgba(255,255,255,.94);
}
.companionTv{
  position:relative;width:80px;height:58px;
  border:2px solid rgba(255,255,255,.82);
  border-radius:18px;
  background:rgba(255,255,255,.08);
  box-shadow:0 12px 30px rgba(0,0,0,.20),inset 0 1px 0 rgba(255,255,255,.15);
}
.companionTv::before,.companionTv::after{
  content:"";position:absolute;top:-13px;width:22px;height:2px;
  border-radius:999px;background:rgba(255,255,255,.72);
  transform-origin:bottom center;
}
.companionTv::before{left:23px;transform:rotate(-38deg)}
.companionTv::after{right:23px;transform:rotate(38deg)}
.companionTvScreen{
  position:absolute;inset:7px;
  display:flex;align-items:center;justify-content:center;gap:6px;
  border-radius:12px;
  background:linear-gradient(145deg,rgba(255,132,177,.30),rgba(123,161,255,.18));
  overflow:hidden;
}
.companionDot{
  width:7px;height:7px;border-radius:50%;
  background:#fff;
  box-shadow:0 0 12px rgba(255,255,255,.35);
  animation:companionBounce 1.15s ease-in-out infinite;
}
.companionDot:nth-child(2){animation-delay:.16s}
.companionDot:nth-child(3){animation-delay:.32s}
@keyframes companionBounce{
  0%,60%,100%{transform:translateY(0);opacity:.58}
  30%{transform:translateY(-8px);opacity:1}
}
.companionPrepTitle{
  font-size:15px;font-weight:690;letter-spacing:.01em;
}
.companionPrepText{
  max-width:250px;
  font-size:11.5px;line-height:1.55;
  color:rgba(255,255,255,.68);
}
.companionProgress{
  width:min(220px,78%);height:4px;
  border-radius:999px;overflow:hidden;
  background:rgba(255,255,255,.12);
}
.companionProgressBar{
  height:100%;width:4%;
  border-radius:inherit;
  background:linear-gradient(90deg,#ff79ad,#9dafff);
  transition:width .45s ease;
}
.companionPrepActions{
  display:flex;align-items:center;justify-content:center;gap:8px;
  margin-top:2px;
}
.companionPrepActions button{
  min-height:34px;height:34px;
  padding:0 13px;border-radius:12px;
  border-color:rgba(255,255,255,.15);
  background:rgba(255,255,255,.10);
  color:#fff;font-size:11px;
}
#companionStart{
  display:none;
  background:rgba(255,255,255,.94);
  color:#24242a;
}
#companionStart.on{display:inline-flex}
.companionTimeline{
  display:none;margin:7px 9px 0;padding:8px 10px 7px;
  border:1px solid var(--border);border-radius:14px;background:var(--surface);
}
.companionTimeline.on{display:block}
.timelineMeta{
  display:grid;grid-template-columns:auto minmax(0,1fr) auto;
  align-items:center;gap:8px;margin-bottom:5px;
  font-size:10px;color:var(--tertiary);
}
.timelineMeta strong{color:var(--secondary);font-variant-numeric:tabular-nums}
.timelineHint{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:center}
.timelineTrackWrap{position:relative;height:22px;display:flex;align-items:center}
.timelineBase,.timelineBuffered{
  position:absolute;left:0;right:0;height:4px;border-radius:999px;pointer-events:none;
}
.timelineBase{background:var(--surface-soft)}
.timelineBuffered{
  right:auto;width:0;
  background:linear-gradient(90deg,rgba(255,79,147,.68),rgba(10,132,255,.68));
}
#companionSeek{
  position:relative;z-index:2;width:100%;height:22px;margin:0;
  appearance:none;-webkit-appearance:none;background:transparent;accent-color:var(--accent);
}
#companionSeek::-webkit-slider-runnable-track{height:4px;background:transparent;border-radius:999px}
#companionSeek::-webkit-slider-thumb{
  -webkit-appearance:none;width:15px;height:15px;border-radius:50%;margin-top:-5.5px;
  border:2px solid var(--surface-strong);background:var(--accent);box-shadow:0 2px 7px rgba(0,0,0,.22);
}
#companionSeek:disabled{opacity:.45}
.modeBar{
  display:flex;align-items:center;justify-content:space-between;
  gap:8px;padding:8px 9px 0;
}
.modeStatus{
  display:flex;align-items:center;gap:7px;min-width:0;
  font-size:10.5px;color:var(--tertiary);
}
.modeStatusDot{
  width:7px;height:7px;border-radius:50%;
  background:#34c759;
  box-shadow:0 0 0 4px rgba(52,199,89,.10);
}
.modeStatus.companion .modeStatusDot{
  background:var(--accent);
  box-shadow:0 0 0 4px rgba(255,79,147,.10);
}
.modeStatus.preparing .modeStatusDot{
  background:#ff9f0a;
  box-shadow:0 0 0 4px rgba(255,159,10,.10);
  animation:modePulse 1.1s ease-in-out infinite;
}
@keyframes modePulse{50%{opacity:.35;transform:scale(.82)}}
/* The dot is a span: never let the generic span ellipsis rule or a crowded
   header squash it, and let it breathe so it reads as a live indicator. */
.modeStatus .modeStatusDot{flex:0 0 auto;display:block;overflow:visible;animation:modeBreath 2.4s ease-in-out infinite}
.modeStatus.preparing .modeStatusDot{animation:modePulse 1.1s ease-in-out infinite}
@keyframes modeBreath{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.78)}}
@media(prefers-reduced-motion:reduce){.modeStatus .modeStatusDot{animation:none}}
.modeStatus strong{
  color:var(--secondary);font-weight:680;white-space:nowrap;
}
.modeStatus span{
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
}
.modeActions{
  display:flex;align-items:center;gap:6px;flex:0 0 auto;
}
#companion{
  min-width:104px;height:34px;min-height:34px;
  border-radius:12px;padding:0 12px;
}
#showToAi{
  min-width:82px;height:34px;min-height:34px;
  border-radius:12px;padding:0 11px;
}
#watchTicket{
  min-width:74px;height:34px;min-height:34px;
  border-radius:12px;padding:0 10px;
}
#watchTicket.working svg{animation:showLookPulse .8s ease-in-out infinite}
.ticketOverlay{
  position:fixed;inset:0;z-index:40;
  display:none;align-items:flex-end;justify-content:center;
  padding:14px;
  background:rgba(10,10,14,.48);
  backdrop-filter:blur(10px);
  -webkit-backdrop-filter:blur(10px);
}
.ticketOverlay.on{display:flex}
.ticketSheet{
  width:min(680px,100%);
  max-height:min(88vh,760px);
  display:flex;flex-direction:column;
  border:1px solid rgba(255,255,255,.12);
  border-radius:22px;
  overflow:hidden;
  background:var(--surface);
  box-shadow:0 24px 80px rgba(0,0,0,.28);
}
.ticketSheetHead{
  min-height:50px;padding:8px 12px 8px 15px;
  display:flex;align-items:center;justify-content:space-between;gap:10px;
  border-bottom:1px solid var(--border);
}
.ticketSheetHead strong{font-size:13px;font-weight:720}
.ticketSheetHead span{font-size:10px;color:var(--tertiary)}
.ticketSheetClose{
  width:32px;height:32px;min-height:32px;padding:0;border-radius:50%;
  display:grid;place-items:center;font-size:18px;line-height:1;
}
.ticketSheetBody{
  overflow:auto;overscroll-behavior:contain;
  padding:12px;display:grid;gap:12px;
}
.ticketPreviewWrap{
  position:relative;overflow:hidden;
  border-radius:16px;background:#111;
  aspect-ratio:16/9;
  border:1px solid var(--border);
}
.ticketPreview{
  width:100%;height:100%;display:block;object-fit:contain;background:#111;
}
.ticketPreviewEmpty{
  position:absolute;inset:0;display:grid;place-items:center;
  padding:22px;text-align:center;color:rgba(255,255,255,.62);
  font-size:11px;line-height:1.55;
  background:linear-gradient(145deg,#17171c,#242431);
}
.ticketPreviewWrap.ready .ticketPreviewEmpty{display:none}
.ticketMetaRow{
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  flex-wrap:wrap;
}
.ticketMetaText{
  min-width:0;display:grid;gap:2px;
}
.ticketMetaText strong{
  font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.ticketMetaText span{font-size:9.5px;color:var(--tertiary)}
.collectionToggleRow{
  display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:10px 11px;border:1px solid var(--border);
  border-radius:14px;background:var(--surface-soft);
}
.collectionToggleText{min-width:0;display:grid;gap:2px}
.collectionToggleText strong{font-size:11px}
.collectionToggleText span{font-size:9.5px;color:var(--tertiary);line-height:1.35}
.collectionSwitch{
  position:relative;width:42px;height:24px;min-width:42px;
  border:0;padding:0;border-radius:999px;background:rgba(120,120,128,.28);
}
.collectionSwitch::after{
  content:"";position:absolute;top:3px;left:3px;
  width:18px;height:18px;border-radius:50%;background:#fff;
  box-shadow:0 1px 4px rgba(0,0,0,.2);
  transition:transform .2s ease;
}
.collectionSwitch.on{background:#34c759}
.collectionSwitch.on::after{transform:translateX(18px)}
.ticketActions{
  display:flex;gap:7px;align-items:center;flex-wrap:wrap;
}
.ticketActions button{
  min-height:36px;height:36px;border-radius:12px;padding:0 13px;
  font-size:10.5px;
}
.ticketActions .primary{flex:1 1 180px}
.ticketPrivacy{
  display:none;padding:11px 12px;border-radius:14px;
  border:1px solid rgba(255,159,10,.22);
  background:rgba(255,159,10,.08);
  gap:7px;
}
.ticketPrivacy.on{display:grid}
.ticketPrivacy strong{font-size:11px}
.ticketPrivacy p{
  margin:0;font-size:9.7px;line-height:1.5;color:var(--secondary);
}
.ticketPrivacyActions{display:flex;gap:7px;flex-wrap:wrap}
.ticketPrivacyActions button{min-height:34px;height:34px;border-radius:11px;padding:0 12px}
.ticketLibrary{
  display:none;gap:9px;
}
.ticketLibrary.on{display:grid}
.ticketLibraryToolbar{
  display:flex;align-items:center;justify-content:space-between;gap:8px;
}
.ticketLibraryToolbar strong{font-size:12px}
.ticketLibraryToolbar div{display:flex;gap:6px}
.ticketLibraryToolbar button{min-height:32px;height:32px;border-radius:10px;padding:0 10px;font-size:9.5px}
.ticketLibraryList{display:grid;gap:8px}
.ticketLibraryEmpty{
  padding:20px;border:1px dashed var(--border);border-radius:14px;
  text-align:center;font-size:10px;color:var(--tertiary);
}
.ticketLibraryItem{
  display:grid;grid-template-columns:108px minmax(0,1fr) auto;gap:9px;
  align-items:center;padding:7px;border:1px solid var(--border);
  border-radius:14px;background:var(--surface-soft);
}
.ticketLibraryThumb{
  width:108px;aspect-ratio:16/9;object-fit:cover;border-radius:9px;background:#111;
}
.ticketLibraryInfo{min-width:0;display:grid;gap:3px}
.ticketLibraryInfo strong{
  font-size:10.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
}
.ticketLibraryInfo span{font-size:9px;color:var(--tertiary)}
.ticketDelete{
  width:30px;height:30px;min-height:30px;padding:0;border-radius:50%;
  color:#ff3b30;
}
.ticketToast{
  min-height:18px;font-size:9.5px;color:var(--tertiary);
}
@media(max-width:520px){
  .companionPrep{padding:8px 12px}
  .companionPrepCard{width:min(300px,96%);gap:5px}
  .companionTv{width:58px;height:42px;border-radius:14px}
  .companionTv::before,.companionTv::after{top:-9px;width:16px}
  .companionTv::before{left:17px}.companionTv::after{right:17px}
  .companionTvScreen{inset:5px;border-radius:9px}
  .companionDot{width:5px;height:5px}
  .companionPrepTitle{font-size:13px}
  .companionPrepText{font-size:10px;line-height:1.35;max-width:270px}
  .companionCounter{font-size:12px}
  .companionPrepActions button{height:30px;min-height:30px;padding:0 10px}
  .modeActions{gap:4px}
  #showToAi,#watchTicket{min-width:34px;width:34px;padding:0}
  #showToAi .buttonLabel,#watchTicket .buttonLabel{display:none}
  #companion{min-width:86px;padding:0 9px}
  .ticketLibraryItem{grid-template-columns:88px minmax(0,1fr) auto}
  .ticketLibraryThumb{width:88px}
}

#showToAi.working svg{animation:showLookPulse .8s ease-in-out infinite}
@keyframes showLookPulse{50%{transform:scale(.82);opacity:.45}}
#companion.on{
  background:var(--accent-soft);
  border-color:rgba(255,79,147,.22);
  color:var(--accent);
}
.empty{
  position:absolute;inset:0;display:grid;place-items:center;
  color:var(--tertiary);font-size:12px;line-height:1.6;text-align:center;
  padding:30px;pointer-events:none;white-space:pre-line;
  background:
    radial-gradient(circle at 50% 42%,rgba(255,79,147,.08),transparent 34%),
    linear-gradient(180deg,var(--surface),var(--surface-soft));
}
.controls{
  display:grid;
  grid-template-columns:auto auto 38px 38px 38px minmax(120px,1fr) 38px;
  gap:6px;padding:9px 9px 7px;
}
.actionButton{
  display:inline-flex;align-items:center;justify-content:center;gap:7px;
  padding:0 13px;font-size:11.5px;font-weight:630;white-space:nowrap;
}
.actionButton .buttonIcon{width:16px;height:16px}
.roundAction{
  width:38px;height:38px;min-height:38px;padding:0;
  display:grid;place-items:center;border-radius:50%;
}
#sound .soundOff{display:none}
#sound:not(.on) .soundOn{display:none}
#sound:not(.on) .soundOff{display:block}
.keyButton{
  width:38px;height:38px;min-height:38px;padding:0;
  display:grid;place-items:center;border-radius:12px;
  font-size:11px;font-weight:650;color:var(--secondary);
}
#typeText{color:var(--blue)}
.remotePad{display:none;padding:0 9px 8px;gap:6px}
.remotePad.on{display:grid}
.touchMouse{
  overflow:hidden;border:1px solid var(--border);
  border-radius:18px;background:var(--surface);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.18);
}
.trackpad{
  height:138px;border:0;border-bottom:1px solid var(--border);
  background:linear-gradient(180deg,var(--surface),var(--surface-soft));
  display:grid;place-items:center;
  color:var(--tertiary);font-size:12px;touch-action:none;
  user-select:none;-webkit-user-select:none;position:relative;overflow:hidden;
}
.trackpad.active{background:var(--surface-soft)}
.trackLabel{display:grid;gap:3px;text-align:center;pointer-events:none}
.trackLabel strong{font-size:13px;font-weight:650;color:var(--secondary)}
.trackLabel span{font-size:10.5px;color:var(--tertiary)}
.trackDot{
  position:absolute;width:20px;height:20px;
  border:2px solid rgba(255,255,255,.92);border-radius:50%;
  transform:translate(-50%,-50%);pointer-events:none;display:none;
  box-shadow:0 2px 8px rgba(0,0,0,.24);
}
.trackDot.on{display:block}
.mouseKeys{display:grid;grid-template-columns:1fr 1fr}
.mouseKey{
  height:44px;min-height:44px;border:0;border-radius:0;background:transparent;
  touch-action:none;user-select:none;-webkit-user-select:none;
  color:var(--secondary);font-size:11px;
}
.mouseKey:first-child{border-right:1px solid var(--border)}
.mouseKey.pressed{background:var(--accent-soft);color:var(--accent)}
.nudgeStatus{
  font-size:10.5px;color:var(--tertiary);
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding:0 3px;
}
.talk{
  display:grid;grid-template-columns:38px 38px minmax(0,1fr) 38px;
  gap:6px;padding:0 9px 9px;
}
/* 「让 TA 看看你」: their camera (with face effects) shown above the chat. */
#cameraToggle{width:38px;height:38px;min-height:38px;padding:0;display:grid;place-items:center;border-radius:50%}
#cameraToggle svg,.cameraTools svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.85;stroke-linecap:round;stroke-linejoin:round}
.cameraPanel{display:none;margin:8px 9px 0}
.shell.cameraOn .cameraPanel{display:block}
.cameraStage{position:relative;display:grid;place-items:center;border-radius:18px;overflow:hidden;background:#141014;min-height:120px}
#cameraCanvas{display:block;width:100%;height:auto;max-height:44dvh;object-fit:contain}
#cameraVideo{position:absolute;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none}
.cameraNote{position:absolute;left:10px;top:10px;max-width:calc(100% - 96px);padding:4px 9px;border-radius:999px;
  background:rgba(20,16,20,.55);color:#fff;font-size:10.5px;line-height:1.3;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.cameraNote:empty{display:none}
.cameraTools{position:absolute;right:8px;top:8px;display:flex;gap:6px}
.cameraTools button{width:32px;height:32px;min-height:32px;padding:0;display:grid;place-items:center;border-radius:50%;
  color:#fff;background:rgba(20,16,20,.5);border-color:rgba(255,255,255,.25);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.cameraTools svg{width:16px;height:16px}
.cameraLooked{position:absolute;left:50%;bottom:12px;transform:translate(-50%,8px);opacity:0;display:flex;align-items:center;gap:5px;
  padding:6px 12px;border-radius:999px;background:var(--accent);color:#fff;font-size:12px;font-weight:650;white-space:nowrap;
  transition:opacity .25s,transform .25s;pointer-events:none}
.cameraLooked.on{opacity:1;transform:translate(-50%,0)}
.cameraLooked svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
/* Chat-only hides the dock (and its 「叫大家看」), so sharing lives here too. */
.cameraBar{display:flex;align-items:center;gap:6px;padding-top:7px}
.cameraBar .cameraLooks{flex:1 1 auto;min-width:0;padding-top:0}
#cameraShare{flex:0 0 auto;height:30px;min-height:30px;padding:0 11px;border-radius:999px;display:flex;align-items:center;gap:4px;
  font-size:12px;font-weight:700;white-space:nowrap}
#cameraShare svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
#cameraShare.working svg{animation:showLookPulse .8s ease-in-out infinite}
.cameraLooks{display:flex;gap:6px;overflow-x:auto;padding:7px 1px 1px;scrollbar-width:none}
.cameraLooks::-webkit-scrollbar{display:none}
.cameraLooks button{flex:0 0 auto;height:28px;min-height:28px;padding:0 11px;border-radius:999px;font-size:11.5px;font-weight:650}
/* Hold-to-talk: mic/keyboard swap like a chat app. The transcript lands in
   the input for them to fix up; it is never sent automatically. */
#voiceToggle{width:38px;height:38px;min-height:38px;padding:0;display:grid;place-items:center;border-radius:50%}
#voiceToggle svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.85;stroke-linecap:round;stroke-linejoin:round}
#voiceToggle .voiceIconKeys,.talk.voice #voiceToggle .voiceIconMic{display:none}
.talk.voice #voiceToggle .voiceIconKeys{display:block}
#holdToTalk{display:none;height:38px;min-height:38px;border-radius:13px;font-size:13px;font-weight:650;letter-spacing:.08em;
  user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;touch-action:none}
.talk.voice #talkText{display:none}
.talk.voice #holdToTalk{display:block}
#holdToTalk.recording{color:#fff;background:var(--accent);border-color:transparent}
#holdToTalk.cancelling{color:#fff;background:#e5484d;border-color:transparent}
#holdToTalk.busy{opacity:.6}
.talk input{height:38px;border-radius:13px}
#talkSend{
  width:38px;height:38px;min-height:38px;padding:0;
  display:grid;place-items:center;border-radius:50%;
}
.chatPanel{
  margin:0 9px 7px;
  border:1px solid var(--border);border-radius:15px;
  background:var(--surface-soft);overflow:hidden;
}
.chatHead{
  height:28px;padding:0 10px;
  display:flex;align-items:center;justify-content:space-between;gap:8px;
  border-bottom:1px solid var(--border);
  color:var(--tertiary);font-size:9.5px;
}
.chatHead strong{color:var(--secondary);font-size:10.5px;font-weight:680}
/* v90: screen folded away, chat only. */
/* Folded, not stopped: the player stays in the page (iOS pauses media that
   is display:none), squashed to nothing so playback and the clock go on. */
.shell.screenCollapsed .viewportWrap{height:0;min-height:0;aspect-ratio:auto;margin:0;border:0;opacity:0;pointer-events:none;box-shadow:none}
.shell.screenCollapsed .dock,.shell.screenCollapsed #remoteDrawer{display:none}
.nowPlaying{display:none}
.shell.screenCollapsed .nowPlaying{display:flex;align-items:center;gap:7px;margin:8px 8px 0;padding:5px 6px 5px 10px;
  border:1px solid var(--border);border-radius:14px;background:var(--surface-soft);font-size:11px;color:var(--secondary);min-width:0}
.nowPlaying .npIcon{color:var(--accent);flex:0 0 auto;display:grid;place-items:center;width:14px;height:14px}
.nowPlaying .npIcon svg{width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.nowPlaying .npIcon svg .fill{fill:currentColor;stroke:none}
.nowPlaying .npTitle{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text);font-weight:600}
.nowPlaying .npTime{flex:0 0 auto;font-variant-numeric:tabular-nums}
.nowPlaying button{flex:0 0 auto;height:22px;min-height:0;padding:0 9px;border-radius:999px;border:1px solid var(--border);
  background:var(--surface-strong);font-size:10.5px;font-weight:650;color:var(--accent)}
.shell.screenCollapsed .chatMessages{max-height:min(56vh,480px)}
#screenToggle.on{color:var(--accent);background:var(--accent-soft)}
.brandActions #screenToggle{display:flex;align-items:center;width:auto;padding:0 10px 0 8px;gap:4px;border-radius:999px;font-size:11px;font-weight:650;white-space:nowrap}
#screenToggle svg{flex:0 0 auto;width:16px;height:16px}
#screenToggle .screenIconChat{display:none}
#screenToggle:not(.on) .screenIconChat{display:block}
#screenToggle:not(.on) .screenIconScreen{display:none}
.chatMembers{display:flex;gap:4px;margin-left:auto;margin-right:4px}
.chatClear{flex:0 0 auto;height:17px;min-height:0;padding:0 7px;border-radius:999px;border:1px solid var(--border);
  background:transparent;font-size:9.5px;line-height:1;font-weight:620;color:var(--tertiary)}
.chatClear.armed{color:#fff;background:var(--danger,#e5484d);border-color:transparent}
.chatClear:disabled{opacity:.5}
.chatMember{display:inline-flex;align-items:center;gap:2px;height:17px;min-height:0;padding:0 6px;border-radius:999px;
  border:1px solid var(--border);background:transparent;font-size:9.5px;line-height:1;font-weight:620;color:var(--secondary)}
.chatMember.muted{opacity:.5}
.chatMember.muted .chatMemberName{text-decoration:line-through}
.chatMemberBell{display:grid;place-items:center}
.chatMemberBell svg{width:11px;height:11px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.chatMember[class*=" ai-claude"]{color:#c8603f}
.chatMember[class*=" ai-gpt"]{color:#4f9d83}
.chatRow.assistant[class*=" ai-claude"] .chatWho{color:#c8603f}
.chatRow.assistant[class*=" ai-gpt"] .chatWho{color:#4f9d83}
.chatNote{align-self:center;font-size:10.5px;color:var(--tertiary);padding:2px 0}
.chatMessages{
  min-height:46px;max-height:148px;overflow:auto;overscroll-behavior:contain;
  display:flex;flex-direction:column;gap:7px;padding:9px 8px 10px;
  scroll-behavior:smooth;
}
.chatEmpty{margin:auto;padding:8px 0;color:var(--tertiary);font-size:10.5px;text-align:center}
.chatEarlier{align-self:center;height:22px;min-height:0;padding:0 10px;border-radius:999px;border:1px solid var(--border);
  background:var(--surface-soft);color:var(--tertiary);font-size:10.5px}
.chatRow{display:flex;width:100%}
.chatRow.user{justify-content:flex-end}
.chatRow.assistant{justify-content:flex-start}
.chatBubble{
  max-width:84%;padding:7px 9px;border-radius:13px;
  font-size:10.8px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;color:var(--text);
}
.chatRow.user .chatBubble{
  background:linear-gradient(180deg,#ff6aa7,#ff4f93);
  color:#fff;border-bottom-right-radius:5px;
}
.chatRow.assistant .chatBubble{
  background:var(--surface-strong);
  border:1px solid var(--border);border-bottom-left-radius:5px;
}
.chatWho{
  display:block;margin-bottom:3px;font-size:8.5px;font-weight:700;
  letter-spacing:.03em;opacity:.58;
}
.chatPendingBubble{display:inline-flex;align-items:center;gap:4px;min-width:48px}
.chatTypingDot{
  width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.38;
  animation:chatTyping 1.1s ease-in-out infinite;
}
.chatTypingDot:nth-child(2){animation-delay:.15s}
.chatTypingDot:nth-child(3){animation-delay:.30s}
@keyframes chatTyping{
  0%,65%,100%{transform:translateY(0);opacity:.28}
  32%{transform:translateY(-3px);opacity:.75}
}
.shell.fullscreen .chatMessages{min-height:72px;max-height:min(28vh,240px)}
.hint{display:none}
.pointerDot{
  position:absolute;z-index:20;width:28px;height:28px;
  background:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Cpath d='M4 2v23l6-6 4 10 5-2-4-9h9z' fill='%23fff' stroke='%23111' stroke-width='2' stroke-linejoin='round'/%3E%3C/svg%3E") center/contain no-repeat;
  filter:drop-shadow(0 1px 2px rgba(0,0,0,.8));
  transform:translate(-2px,-2px);pointer-events:none;display:none;
}
.pointerDot.on{display:block}
.contextMirror{
  position:absolute;z-index:40;display:none;
  min-width:176px;max-width:min(270px,72vw);padding:6px;
  border:1px solid var(--border-strong);border-radius:16px;
  background:var(--surface-strong);
  box-shadow:0 16px 44px rgba(0,0,0,.22);
  backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);
}
.contextMirror.on{display:grid;gap:2px}
.contextMirror button{
  min-height:36px;border:0;border-radius:10px;background:transparent;text-align:left;padding:0 11px;
}
.contextMirror button:hover,.contextMirror button:active{background:var(--surface-soft)}
.contextMirror .sep{height:1px;background:var(--border);margin:3px 4px}
.contextMirror .muted{color:var(--tertiary)}
#refresh.working svg{animation:spin .8s linear infinite}
#refresh.done{color:#34c759}
@keyframes spin{to{transform:rotate(360deg)}}
.shell.fullscreen{
  border-radius:0;border-left:0;border-right:0;
  padding-top:max(env(safe-area-inset-top,0px),10px);
}
/* No close-button gutter in the header row: Claude and ChatGPT both put their
   close button in their own chrome above the card now, and the reserve only
   crowded the actions into the wordmark. */
.shell.fullscreen .viewportWrap{border-radius:16px}
/* v90: fill the host's fullscreen view and stay clear of host chrome
   (Claude overlays a close button/title on top and its composer below). */
.shell.fullscreen{
  display:flex;flex-direction:column;
  margin-top:var(--host-top,0px);margin-bottom:var(--host-bottom,0px);
  min-height:calc(100dvh - var(--host-top,0px) - var(--host-bottom,0px) - 16px);
}
.shell.fullscreen .viewportWrap{flex:1 1 auto;aspect-ratio:auto;min-height:38dvh;place-items:center}
.shell.fullscreen #frame,.shell.fullscreen #liveCanvas,.shell.fullscreen #mediaVideo{object-position:center}
/* Chat-only in fullscreen: the folded screen must not keep its 38dvh floor
   (that left a blank band under the header); the chat takes the height. */
.shell.fullscreen.screenCollapsed .viewportWrap{flex:0 0 0;height:0;min-height:0}
.shell.fullscreen.screenCollapsed .chatPanel{flex:1 1 auto;display:flex;flex-direction:column;min-height:0}
.shell.fullscreen.screenCollapsed .chatMessages{flex:1 1 auto;min-height:0;max-height:none}
@media(max-width:720px){
  #app{padding:4px 4px max(4px,env(safe-area-inset-bottom,0px))}
  .shell{border-radius:22px}
  .brandbar{padding:10px 9px 6px 11px}
  .brandIcon{width:31px;height:31px}
  .brandcopy strong{font-size:14px}
  .version{display:none}
  .toolbar{
    grid-template-columns:66px 82px 70px minmax(0,1fr) 36px;
    gap:5px;padding:6px 7px 8px;
  }
  .toolbar input{height:36px;border-radius:12px}
  .historyNav button,.iconButton{width:34px;height:36px;min-height:36px}
  .addressGo{top:3px;right:3px}
  .viewportWrap{margin:0 5px;border-radius:16px}
  .controls{
    grid-template-columns:auto auto 36px 36px minmax(0,1fr) 36px;
    gap:5px;padding:7px 6px 6px;
  }
  #esc{display:none}
  .roundAction,.keyButton{width:36px;height:36px;min-height:36px}
  .actionButton{padding:0 10px}
  .talk{grid-template-columns:36px 36px minmax(0,1fr) 36px;padding:0 6px 7px}
  #talkSend,#voiceToggle,#cameraToggle{width:36px;height:36px;min-height:36px}
  #holdToTalk{height:36px;min-height:36px}
}
@media(max-width:520px){
  .brandcopy #title{max-width:150px}
  .toolbar{
    grid-template-columns:62px 76px 66px 34px;
    grid-template-areas:
      "identity profile history refresh"
      "address address address address";
  }
  .addressWrap{margin-top:1px}
  .controls{
    grid-template-columns:1fr 1fr 36px 36px;
    grid-template-areas:
      "takeover login sound enter"
      "human human human type";
  }
  #takeover{grid-area:takeover}
  #localLogin{grid-area:login}
  #sound{grid-area:sound}
  #enter{grid-area:enter}
  #humanText{grid-area:human}
  #typeText{grid-area:type}
  .actionButton{min-width:0;padding:0 8px}
  .actionButton .buttonLabel{overflow:hidden;text-overflow:ellipsis}
  .meta{padding-left:10px;padding-right:10px}
}
/* ===== v89 skins: Morandi / candy colours under liquid glass ===== */
:root,:root[data-skin="candy"]{
  color-scheme:light;
  --bg:rgba(251,245,248,.66);
  --surface:rgba(255,255,255,.52);
  --surface-strong:rgba(255,255,255,.86);
  --surface-soft:rgba(255,255,255,.34);
  --border:rgba(255,255,255,.72);
  --border-strong:rgba(74,63,72,.14);
  --text:#4a3f48;
  --secondary:rgba(74,63,72,.74);
  --tertiary:rgba(74,63,72,.5);
  --accent:#d17f9f;
  --accent-soft:rgba(217,139,168,.18);
  --blue:#8c7fd4;
  --shadow:0 22px 60px -24px rgba(160,90,120,.35);
  --primary-grad:linear-gradient(135deg,#eda3be,#c9a2e3);
  --primary-glow:0 10px 26px -10px rgba(217,139,168,.8);
  --glass-inner:inset 0 1px 0 rgba(255,255,255,.85),inset 0 -1px 0 rgba(255,255,255,.2);
  --blob-1:#f2c3d2;--blob-2:#c5e6d8;--blob-3:#f5e2b2;--blob-4:#d8ccf1;
  --live:#6fb89a;
}
:root[data-skin="mist"]{
  color-scheme:light;
  --bg:rgba(240,230,228,.62);
  --surface:rgba(255,255,255,.5);--surface-strong:rgba(255,255,255,.84);--surface-soft:rgba(255,255,255,.3);
  --border:rgba(255,255,255,.7);--border-strong:rgba(61,51,54,.14);
  --text:#3d3336;--secondary:rgba(61,51,54,.74);--tertiary:rgba(61,51,54,.5);
  --accent:#b27f7b;--accent-soft:rgba(178,127,123,.18);--blue:#8a7fa8;
  --shadow:0 22px 60px -24px rgba(92,62,66,.35);
  --primary-grad:linear-gradient(135deg,#c6918c,#a8726f);
  --primary-glow:0 10px 26px -10px rgba(168,114,111,.75);
  --blob-1:#d6aea9;--blob-2:#b9c3ae;--blob-3:#c7bcd6;--blob-4:#efd3c4;
  --live:#7f9c85;
}
:root[data-skin="sage"]{
  color-scheme:light;
  --bg:rgba(226,231,224,.62);
  --surface:rgba(255,255,255,.48);--surface-strong:rgba(255,255,255,.82);--surface-soft:rgba(255,255,255,.28);
  --border:rgba(255,255,255,.66);--border-strong:rgba(47,56,51,.14);
  --text:#2f3833;--secondary:rgba(47,56,51,.74);--tertiary:rgba(47,56,51,.5);
  --accent:#6e8a7c;--accent-soft:rgba(110,138,124,.18);--blue:#6d8aa0;
  --shadow:0 22px 60px -24px rgba(52,70,62,.35);
  --primary-grad:linear-gradient(135deg,#82a092,#62806f);
  --primary-glow:0 10px 26px -10px rgba(98,128,111,.7);
  --blob-1:#a8b8a4;--blob-2:#9fb1bd;--blob-3:#cbc3b1;--blob-4:#b7c9c4;
  --live:#6e8a7c;
}
:root[data-skin="dusk"]{
  color-scheme:dark;
  --bg:rgba(42,40,48,.72);
  --surface:rgba(255,255,255,.1);--surface-strong:rgba(70,64,74,.94);--surface-soft:rgba(255,255,255,.06);
  --border:rgba(255,255,255,.16);--border-strong:rgba(255,255,255,.22);
  --text:#ece4e2;--secondary:rgba(236,228,226,.74);--tertiary:rgba(236,228,226,.5);
  --accent:#e0b7b1;--accent-soft:rgba(216,176,171,.18);--blue:#b8a9e0;
  --shadow:0 22px 70px -20px rgba(0,0,0,.7);
  --primary-grad:linear-gradient(135deg,#e0bbb5,#b98f8f);
  --primary-glow:0 10px 26px -10px rgba(216,176,171,.55);
  --glass-inner:inset 0 1px 0 rgba(255,255,255,.22),inset 0 -1px 0 rgba(255,255,255,.04);
  --blob-1:#6b5561;--blob-2:#4d5d5c;--blob-3:#5a5470;--blob-4:#7a6458;
  --live:#9fbfa8;
}
:root[data-skin="night"]{
  color-scheme:dark;
  --bg:rgba(14,15,19,.78);
  --surface:rgba(255,255,255,.07);--surface-strong:rgba(30,30,36,.96);--surface-soft:rgba(255,255,255,.04);
  --border:rgba(201,169,110,.28);--border-strong:rgba(201,169,110,.4);
  --text:#ede6d8;--secondary:rgba(237,230,216,.74);--tertiary:rgba(237,230,216,.5);
  --accent:#c9a96e;--accent-soft:rgba(201,169,110,.16);--blue:#d8c08c;
  --shadow:0 22px 70px -20px rgba(0,0,0,.85);
  --primary-grad:linear-gradient(135deg,#e3c68f,#b8955a);
  --primary-glow:0 10px 26px -10px rgba(201,169,110,.55);
  --glass-inner:inset 0 1px 0 rgba(232,211,166,.22),inset 0 -1px 0 rgba(0,0,0,.2);
  --blob-1:#3a3020;--blob-2:#1f2230;--blob-3:#2c2418;--blob-4:#242633;
  --live:#7fb3a0;
}
:root[data-skin="claude"]{
  color-scheme:light;
  --bg:rgba(250,245,237,.7);
  --surface:rgba(255,255,255,.54);--surface-strong:rgba(255,252,247,.9);--surface-soft:rgba(255,255,255,.32);
  --border:rgba(255,255,255,.72);--border-strong:rgba(61,47,40,.14);
  --text:#3d2f28;--secondary:rgba(61,47,40,.74);--tertiary:rgba(61,47,40,.5);
  --accent:#d97757;--accent-soft:rgba(217,119,87,.16);--blue:#c15f3c;
  --shadow:0 22px 60px -24px rgba(170,90,60,.34);
  --primary-grad:linear-gradient(135deg,#e8906f,#c8603f);
  --primary-glow:0 10px 26px -10px rgba(217,119,87,.75);
  --glass-inner:inset 0 1px 0 rgba(255,255,255,.85),inset 0 -1px 0 rgba(255,255,255,.2);
  --blob-1:#f2c1a8;--blob-2:#f6dfc8;--blob-3:#e9a58a;--blob-4:#fbe9d7;
  --live:#7fa37a;
}
.clawdMark{display:none;width:30px;flex:0 0 auto;filter:drop-shadow(0 4px 8px rgba(217,119,87,.35))}
.clawdMark svg{display:block;width:100%;height:auto}
:root[data-skin="claude"] .clawdMark{display:block;animation:clawdBob 2.8s ease-in-out infinite}
@keyframes clawdBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2px)}}
@media (prefers-reduced-motion:reduce){:root[data-skin="claude"] .clawdMark{animation:none}}
:root[data-skin="mint"]{
  color-scheme:dark;
  --bg:rgba(14,16,17,.86);
  --surface:rgba(255,255,255,.05);--surface-strong:rgba(24,27,28,.96);--surface-soft:rgba(255,255,255,.03);
  --border:rgba(236,232,222,.10);--border-strong:rgba(236,232,222,.18);
  --text:#ece8de;--secondary:rgba(236,232,222,.7);--tertiary:rgba(236,232,222,.45);
  --accent:#9fcfbd;--accent-soft:rgba(159,207,189,.12);--blue:#b9d8cc;
  --shadow:0 24px 70px -22px rgba(0,0,0,.85);
  --primary-grad:linear-gradient(180deg,#2c3031,#1a1d1e);
  --primary-glow:inset 0 1px 0 rgba(255,255,255,.08),0 0 0 1px rgba(236,232,222,.08),0 10px 24px -14px rgba(0,0,0,.9);
  --glass-inner:inset 0 1px 0 rgba(236,232,222,.10),inset 0 -1px 0 rgba(0,0,0,.35);
  --blob-1:#1b2a26;--blob-2:#141719;--blob-3:#1e2422;--blob-4:#16201d;
  --live:#8fd3b8;
}
:root[data-skin="mint"] .shellBlobs i{opacity:.5}
:root[data-skin="mint"] .viewportWrap{background:linear-gradient(180deg,rgba(12,14,15,.94),rgba(5,6,7,.97));
  box-shadow:inset 0 1px 0 rgba(236,232,222,.08),inset 0 0 0 1px rgba(236,232,222,.05),inset 0 -30px 60px -40px rgba(143,211,184,.12)}
:root[data-skin="mint"] .modeStatusDot{box-shadow:0 0 8px rgba(143,211,184,.75)}
:root[data-skin="mint"] button.primary{transition:box-shadow .25s ease,border-color .25s ease}
:root[data-skin="mint"] button.primary:hover,:root[data-skin="mint"] button.primary:active,:root[data-skin="mint"] button.primary.on{
  border-color:rgba(143,211,184,.32);box-shadow:var(--primary-glow),0 0 20px -6px rgba(143,211,184,.5)}
:root[data-skin="mint"] input:focus,:root[data-skin="mint"] textarea:focus{border-color:rgba(143,211,184,.35);box-shadow:0 0 0 3px rgba(143,211,184,.10);outline:none}
:root[data-skin="mint"] .empty{background:radial-gradient(circle at 50% 42%,rgba(143,211,184,.07),transparent 36%),linear-gradient(180deg,var(--surface),var(--surface-soft))}
:root[data-skin="mint"] .companionPrep{background:radial-gradient(circle at 50% 40%,rgba(143,211,184,.14),transparent 34%),linear-gradient(180deg,rgba(14,16,17,.84),rgba(8,9,10,.95))}
:root[data-skin="claude"] .empty{background:radial-gradient(circle at 50% 42%,rgba(217,119,87,.08),transparent 34%),linear-gradient(180deg,var(--surface),var(--surface-soft))}
:root[data-skin="claude"] .companionPrep{background:radial-gradient(circle at 50% 40%,rgba(217,119,87,.2),transparent 32%),linear-gradient(180deg,rgba(40,26,20,.82),rgba(26,18,14,.94))}
.mintMark{display:none;width:28px;flex:0 0 auto;filter:drop-shadow(0 0 6px rgba(143,211,184,.35))}
.mintMark svg{display:block;width:100%;height:auto}
:root[data-skin="mint"] .mintMark{display:block;animation:mintGlow 4.5s ease-in-out infinite}
@keyframes mintGlow{0%,100%{filter:drop-shadow(0 0 4px rgba(143,211,184,.25))}50%{filter:drop-shadow(0 0 9px rgba(143,211,184,.55))}}
@media (prefers-reduced-motion:reduce){:root[data-skin="mint"] .mintMark{animation:none}}
:root[data-skin="dusk"] .chatRow.user .chatBubble,:root[data-skin="night"] .chatRow.user .chatBubble,
:root[data-skin="dusk"] #companion,:root[data-skin="night"] #companion{color:#221c1e}

.shell{position:relative;isolation:isolate;background:var(--bg);border-color:var(--border);
  box-shadow:var(--glass-inner),var(--shadow);transition:background-color .5s ease}
.shellBlobs{position:absolute;inset:0;z-index:-1;overflow:hidden;border-radius:inherit;pointer-events:none}
.shellBlobs i{position:absolute;border-radius:50%;filter:blur(46px);opacity:.9;transition:background-color .8s ease;
  animation:blobDrift 28s ease-in-out infinite alternate}
.shellBlobs i:nth-child(1){width:70%;aspect-ratio:1;left:-22%;top:-12%;background:var(--blob-1)}
.shellBlobs i:nth-child(2){width:60%;aspect-ratio:1;right:-20%;top:18%;background:var(--blob-2);animation-duration:34s}
.shellBlobs i:nth-child(3){width:64%;aspect-ratio:1;left:4%;bottom:-18%;background:var(--blob-3);animation-duration:31s}
.shellBlobs i:nth-child(4){width:40%;aspect-ratio:1;right:6%;bottom:12%;background:var(--blob-4);animation-duration:25s}
@keyframes blobDrift{to{transform:translate(8%,6%) scale(1.08)}}
@media(prefers-reduced-motion:reduce){.shellBlobs i{animation:none}}

button{background:var(--surface);border-color:var(--border);box-shadow:var(--glass-inner);
  backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%)}
button.primary,.chatRow.user .chatBubble{background:var(--primary-grad);border-color:transparent;color:#fff;box-shadow:var(--primary-glow)}
button.on{background:var(--accent-soft);border-color:var(--border);color:var(--accent)}
.toolbar input,.talk input,.humanInput,.menuRow input{background:var(--surface-soft);border-color:var(--border);
  backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}
.brandcopy strong{display:flex;align-items:baseline;gap:4px;font-weight:600}
.wordmark{font-family:"Didot","Bodoni 72","Songti SC",Georgia,serif;font-style:italic;font-size:19px;letter-spacing:.01em;color:var(--accent)}
.brandbar{position:relative;flex-wrap:nowrap}
.brandActions{gap:6px}
.brandActions .iconButton{width:34px;height:34px;min-height:34px}
.modeStatus{height:28px;padding:0 10px;border-radius:999px;border:1px solid var(--border);background:var(--surface);
  box-shadow:var(--glass-inner);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px)}
.modeStatusDot{background:var(--live)}
.modeStatus #modeStatusText{display:none}
/* LIVE is tuned for clicking; a light one-time nudge toward 陪看 for video. */
.liveHint{position:absolute;left:50%;bottom:12px;transform:translateX(-50%);z-index:6;
  max-width:calc(100% - 32px);padding:6px 12px;border-radius:999px;
  background:var(--surface-strong);color:var(--text);font-size:11.5px;line-height:1.35;
  box-shadow:0 2px 10px rgba(0,0,0,.12);opacity:0;pointer-events:none;transition:opacity .25s ease}
.liveHint.on{opacity:1}
.modeStatus strong{font-size:10px;letter-spacing:.06em}

.menuSheet{position:absolute;right:10px;top:52px;z-index:30;width:min(280px,calc(100% - 20px));
  display:grid;gap:4px;padding:8px;border:1px solid var(--border);border-radius:20px;
  background:var(--surface-strong);box-shadow:var(--glass-inner),var(--shadow);
  backdrop-filter:blur(24px) saturate(170%);-webkit-backdrop-filter:blur(24px) saturate(170%)}
.menuSheet[hidden]{display:none}
.menuRow{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:10px;padding:5px 6px;
  font-size:11px;color:var(--secondary)}
.menuRow input{height:34px;min-width:0;width:100%;border:1px solid var(--border);border-radius:11px;padding:0 10px;font-size:12px}
.menuButtons{grid-template-columns:minmax(0,1fr) auto}
.menuButtons #localLogin{height:36px;min-height:36px;border-radius:12px}
.menuFoot{grid-template-columns:auto auto auto;justify-content:start}
.menuFoot .version{display:inline-flex}
.menuSkins{grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.skinDot{height:34px;min-height:34px;padding:0;border-radius:12px;font-size:9.5px;display:grid;place-items:center}
.skinDot.on{outline:2px solid var(--accent);outline-offset:1px}
.skinToast{position:absolute;right:52px;top:48px;z-index:31;padding:5px 10px;border-radius:999px;font-size:11px;
  background:var(--surface-strong);border:1px solid var(--border);box-shadow:var(--shadow);opacity:0;
  transform:translateY(-4px);transition:opacity .25s ease,transform .25s ease;pointer-events:none}
.skinToast.on{opacity:1;transform:none}

.viewportWrap{border-color:var(--border);box-shadow:var(--glass-inner),0 14px 34px -18px rgba(0,0,0,.4);border-radius:22px}
.companionTimeline{margin:8px 9px 0;border-radius:16px;border-color:var(--border);box-shadow:var(--glass-inner);
  backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
.timelineBuffered{background:var(--primary-grad)}

.dock{display:flex;align-items:center;gap:8px;padding:12px 9px 4px}
.dock #companion{flex:1 1 auto;min-width:0;height:48px;min-height:48px;border-radius:999px;font-size:14px;font-weight:700;
  letter-spacing:.04em;color:#fff;background:var(--primary-grad);border-color:transparent;box-shadow:var(--primary-glow);
  position:relative;overflow:hidden}
.dock #companion::after{content:"";position:absolute;top:0;left:-60%;width:45%;height:100%;
  background:linear-gradient(100deg,transparent,rgba(255,255,255,.4),transparent);transform:skewX(-18deg);
  animation:primarySheen 6s ease-in-out infinite}
@keyframes primarySheen{0%,72%{left:-60%}100%{left:130%}}
@media(prefers-reduced-motion:reduce){.dock #companion::after{animation:none}}
.dock #companion .buttonIcon{fill:currentColor}
/* One slim row of equal pills, icon then caption: watching and chatting are
   the point, so the controls between them take as little height as possible
   (a bare eye/ticket glyph was guesswork, hence the captions). */
.dock{gap:6px;padding:8px 9px 2px}
.dock #companion,.dock #companionPause,.dock #showToAi,.dock #watchTicket{flex:1 1 auto;width:auto;min-width:0;height:36px;min-height:36px;
  padding:0 7px;border-radius:999px;display:flex;flex-direction:row;align-items:center;justify-content:center;gap:3px;
  font-size:12px;font-weight:650;letter-spacing:0}
.dock #companion .buttonLabel,.dock #companionPause .buttonLabel,.dock #showToAi .buttonLabel,.dock #watchTicket .buttonLabel{display:block;
  white-space:nowrap;line-height:1}
.dock #companion .buttonIcon,.dock #companionPause .buttonIcon,.dock #showToAi .buttonIcon,.dock #watchTicket .buttonIcon{flex:0 0 auto;width:15px;height:15px}
/* Build numbers are for us when debugging: keep them in the menu foot. */
.brandcopy #title{display:none}
.menuFoot .version{display:inline;font-size:10px;color:var(--tertiary);white-space:nowrap}
.timelineBase{background:color-mix(in srgb,var(--text) 12%,transparent)}
.dock #companionPause[hidden]{display:none}

.drawer{margin:8px 9px 0;border:1px solid var(--border);border-radius:20px;background:var(--surface-soft);
  box-shadow:var(--glass-inner);overflow:hidden}
.drawerToggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px;
  border:0;border-radius:0;background:transparent;box-shadow:none;backdrop-filter:none;-webkit-backdrop-filter:none;
  padding:0 14px;min-height:44px}
.drawerToggle strong{font-size:12.5px;font-weight:700}
.drawerToggle span{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;color:var(--tertiary)}
.drawerToggle svg{width:15px;height:15px;fill:none;stroke:currentColor;stroke-width:2;transition:transform .25s ease}
.drawer.open .drawerToggle svg{transform:rotate(180deg)}
.drawerBody{display:none}
.drawer.open .drawerBody{display:block}
.drawer .toolbar{grid-template-columns:36px 36px minmax(0,1fr) 36px 36px;grid-template-areas:none;padding:2px 9px 8px;gap:6px}
.drawer .toolbar>*{grid-area:auto}
.drawer .historyNav{display:contents}
.drawer .historyNav button,.drawer .toolbar .iconButton{width:36px;height:36px;min-height:36px;border-radius:50%}
.bookmarks{display:flex;flex-wrap:wrap;gap:6px;padding:0 9px 8px}
.bookmarks:empty{display:none}
.bookmarkChip{display:inline-flex;align-items:center;gap:4px;max-width:100%;min-height:30px;height:30px;
  padding:0 4px 0 11px;border-radius:999px;font-size:11px}
.bookmarkChip span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:150px}
.bookmarkChip b{width:22px;height:22px;display:grid;place-items:center;border-radius:50%;font-weight:500;
  color:var(--tertiary);font-size:13px}
#bookmarkAdd.on svg{fill:currentColor}
.drawer .controls{padding-top:2px}
.chatPanel{border-color:var(--border);background:var(--surface-soft);box-shadow:var(--glass-inner);border-radius:18px;margin-top:9px}
.chatRow.assistant .chatBubble{background:var(--surface-strong);border-color:var(--border)}
.talk input{border-radius:999px}
#holdToTalk{border-radius:999px;background:var(--surface-soft);border:1px solid var(--border);color:var(--secondary)}
#holdToTalk.recording{color:#fff;background:var(--accent);border-color:transparent}
#holdToTalk.cancelling{color:#fff;background:#e5484d;border-color:transparent}
@media(max-width:520px){
  .modeStatus{padding:0 8px}
  .brandcopy #title{max-width:120px}
  .drawer .toolbar{grid-template-columns:34px 34px minmax(0,1fr) 34px 34px}
}

/* v89: menu, paused overlay, drawer grid, ticket sheet above the host composer */
.menuSheet{display:flex;flex-direction:column;gap:12px;padding:12px}
.menuSheet[hidden]{display:none}
.menuGroup{display:flex;flex-direction:column;gap:8px}
.menuField{display:flex;align-items:center;gap:10px}
.menuField label,.menuLabel{flex:0 0 58px;font-size:11px;color:var(--tertiary);letter-spacing:.02em}
.menuField input{flex:1 1 auto;min-width:0;height:36px;border:1px solid var(--border);border-radius:12px;
  padding:0 12px;font-size:12.5px;text-align:left;background:var(--surface-soft)}
.menuActions{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.menuActions button{width:100%;height:40px;min-height:40px;border-radius:14px;padding:0 10px;
  display:inline-flex;align-items:center;justify-content:center;gap:6px;font-size:12px}
.menuActions .buttonIcon,.menuActions svg{width:16px;height:16px}
.menuSkins{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.skinDot{height:auto;min-height:0;padding:8px 2px 7px;border-radius:14px;display:flex;flex-direction:column;
  align-items:center;gap:5px;font-size:10px;line-height:1.1}
.skinDot i{width:18px;height:18px;border-radius:50%;box-shadow:0 0 0 2px rgba(255,255,255,.7)}
.skinDot.on{outline:2px solid var(--accent);outline-offset:1px}
.menuFoot{display:flex;align-items:center;gap:8px;padding-top:10px;border-top:1px solid var(--border-strong)}
.menuSpacer{flex:1 1 auto}

.pausedOverlay{position:absolute;inset:0;z-index:7;display:grid;place-items:center;background:#000}
.pausedOverlay[hidden]{display:none}
.pausedOverlay img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:top center;
  filter:saturate(.85) brightness(.72)}
.pausedOverlay img:not([src]){display:none}
.pausedBadge{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:14px 20px;
  border-radius:20px;color:#fff;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.3);
  backdrop-filter:blur(14px) saturate(150%);-webkit-backdrop-filter:blur(14px) saturate(150%);text-align:center}
.pausedBadge svg{width:28px;height:28px;fill:none;stroke:#fff;stroke-width:2.4;stroke-linecap:round}
.pausedBadge strong{font-size:14px;letter-spacing:.06em}
.pausedBadge span{font-size:10.5px;opacity:.8}

.drawer .toolbar #refresh{grid-area:auto}
.drawer .controls{grid-template-columns:minmax(0,1fr) 38px 38px 38px;
  grid-template-areas:"takeover sound enter esc" "human human human type"}
.drawer #esc{display:grid;grid-area:esc}
.drawer #takeover{grid-area:takeover}
.drawer #sound{grid-area:sound}
.drawer #enter{grid-area:enter}
.drawer #humanText{grid-area:human}
.drawer #typeText{grid-area:type}

.ticketOverlay{align-items:flex-start;padding:max(12px,env(safe-area-inset-top,0px)) 12px 150px}
.ticketSheet{max-height:calc(100vh - 170px)}

/* 同屏 lettering: the artwork as a shape mask filled with the skin's accent,
   plus a neutral gloss layer, so it recolours with every skin. */
.brandcopy strong.wordmark{position:relative;display:block;width:124px;height:49px;margin:-4px 0 -2px -4px;
  background:var(--accent);
  background:linear-gradient(120deg,color-mix(in srgb,var(--accent) 80%,#fff),var(--accent) 55%,color-mix(in srgb,var(--accent) 82%,var(--text)));
  -webkit-mask:var(--wm-mask) center/contain no-repeat;mask:var(--wm-mask) center/contain no-repeat;
  filter:drop-shadow(0 2px 5px color-mix(in srgb,var(--accent) 38%,transparent))}
.brandcopy strong.wordmark::after{content:"";position:absolute;inset:0;background:var(--wm-gloss) center/contain no-repeat}
:root{--wm-mask:url("data:image/webp;base64,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");
  --wm-gloss:url("data:image/webp;base64,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")}

/* v89: menu fixes — old grid-area names and a column flex-basis leaked in */
.menuActions #localLogin,.menuActions #fullscreen{grid-area:auto}
.menuGroup > .menuLabel{flex:none}

/* ticket v2: 3:1 stub preview */
.ticketPreviewWrap{aspect-ratio:3/1;background:transparent;border:0}
.ticketPreview{object-fit:contain;background:transparent}
.ticketActions #ticketDownload,.ticketActions #ticketReframe{flex:0 0 auto}


/* v89 ticket sheet polish */
.ticketSheet{background:var(--surface-strong);border-color:var(--border);box-shadow:var(--glass-inner),var(--shadow);
  backdrop-filter:blur(24px) saturate(170%);-webkit-backdrop-filter:blur(24px) saturate(170%)}
.ticketSheetHead{border-bottom-color:var(--border-strong)}
.ticketSheetHead strong{font-size:14px}
.ticketSheetHead span{margin-left:6px}
.ticketSheetBody{gap:10px;padding:12px 14px 14px}
.ticketPreviewWrap{border-radius:14px;box-shadow:0 12px 30px -16px rgba(0,0,0,.35)}
.ticketMetaRow{gap:2px}
.ticketMetaText strong{font-size:11px;font-weight:650;color:var(--secondary)}
.ticketMetaText span{font-size:9.5px}
.collectionToggleRow{padding:8px 12px;border-radius:14px;border-color:var(--border);background:var(--surface-soft)}
.collectionToggleText strong{font-size:11.5px}
.collectionToggleText span{font-size:9.5px}
.collectionSwitch{width:38px;min-width:38px;height:22px}
.collectionSwitch::after{width:16px;height:16px}
.collectionSwitch.on{background:var(--live)}
.collectionSwitch.on::after{transform:translateX(16px)}
.ticketActions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
.ticketActions button{width:100%;height:38px;min-height:38px;border-radius:14px;padding:0 6px;font-size:11.5px}
.ticketToast{text-align:center;font-size:10px}

.chatPendingHint{display:block;margin-top:4px;font-size:10px;color:var(--tertiary)}
</style>
</head>
<body>
<div id="app">
  <div class="shell" id="shell">
    <div class="shellBlobs" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
    <div class="brandbar">
      <div class="brandlockup">
        <span class="mintMark" aria-hidden="true"><svg viewBox="0 0 13 13" shape-rendering="crispEdges"><g fill="#8fd3b8" opacity=".75"><rect x="6" y="0" width="1" height="1"/><rect x="6" y="12" width="1" height="1"/><rect x="0" y="6" width="1" height="1"/><rect x="12" y="6" width="1" height="1"/><rect x="2" y="2" width="1" height="1"/><rect x="10" y="2" width="1" height="1"/><rect x="2" y="10" width="1" height="1"/><rect x="10" y="10" width="1" height="1"/></g><g fill="#ece8de"><rect x="4" y="2" width="1" height="1"/><rect x="5" y="2" width="1" height="1"/><rect x="6" y="2" width="1" height="1"/><rect x="7" y="2" width="1" height="1"/><rect x="8" y="2" width="1" height="1"/><rect x="3" y="3" width="1" height="1"/><rect x="4" y="3" width="1" height="1"/><rect x="8" y="3" width="1" height="1"/><rect x="9" y="3" width="1" height="1"/><rect x="2" y="4" width="1" height="1"/><rect x="3" y="4" width="1" height="1"/><rect x="9" y="4" width="1" height="1"/><rect x="10" y="4" width="1" height="1"/><rect x="2" y="5" width="1" height="1"/><rect x="10" y="5" width="1" height="1"/><rect x="2" y="6" width="1" height="1"/><rect x="10" y="6" width="1" height="1"/><rect x="2" y="7" width="1" height="1"/><rect x="10" y="7" width="1" height="1"/><rect x="2" y="8" width="1" height="1"/><rect x="3" y="8" width="1" height="1"/><rect x="9" y="8" width="1" height="1"/><rect x="10" y="8" width="1" height="1"/><rect x="3" y="9" width="1" height="1"/><rect x="4" y="9" width="1" height="1"/><rect x="8" y="9" width="1" height="1"/><rect x="9" y="9" width="1" height="1"/><rect x="4" y="10" width="1" height="1"/><rect x="5" y="10" width="1" height="1"/><rect x="6" y="10" width="1" height="1"/><rect x="7" y="10" width="1" height="1"/><rect x="8" y="10" width="1" height="1"/></g></svg></span>
        <span class="clawdMark" aria-hidden="true"><svg viewBox="0 0 16 11" shape-rendering="crispEdges"><g fill="#d97757"><rect x="2" y="1" width="12" height="7"/><rect x="0" y="3" width="2" height="3"/><rect x="14" y="3" width="2" height="3"/><rect x="3" y="8" width="1" height="3"/><rect x="5" y="8" width="1" height="3"/><rect x="10" y="8" width="1" height="3"/><rect x="12" y="8" width="1" height="3"/></g><g fill="#2b1a14"><rect x="5" y="3" width="1" height="2"/><rect x="10" y="3" width="1" height="2"/></g></svg></span>
        <div class="brandcopy">
          <strong class="wordmark" role="img" aria-label="同屏"></strong>
          <span id="title">App v93 · Worker —</span>
        </div>
      </div>
      <div class="brandActions">
        <div class="modeStatus" id="modeStatus">
        <span class="modeStatusDot"></span>
        <strong id="modeStatusTitle">LIVE</strong>
        <span id="modeStatusText">实时控制画面</span>
      </div>
        <button id="screenToggle" class="iconButton" type="button" aria-label="收起画面" title="收起画面，只聊天" aria-pressed="false">
          <svg class="screenIconChat" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>
          <svg class="screenIconScreen" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
          <span id="screenToggleLabel">只聊天</span>
        </button>
        <button id="skinToggle" class="iconButton" type="button" aria-label="换皮肤" title="换皮肤">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.2 0 1.8-.9 1.8-1.8 0-1.2-1-1.6-1-2.7 0-1 .8-1.7 1.8-1.7H17a4 4 0 0 0 4-4c0-4.2-4-7.8-9-7.8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/></svg>
        </button>
        <button id="menuToggle" class="iconButton" type="button" aria-label="更多" title="更多" aria-expanded="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg>
        </button>
      </div>
      <div class="menuSheet" id="menuSheet" hidden>
        <div class="menuGroup">
          <div class="menuField"><label for="identity">操作身份</label><input id="identity" list="identityOptions" value="gpt.chat" aria-label="AI identity" title="操作身份">
      <datalist id="identityOptions"><option value="gpt.chat"><option value="claude.chat"><option value="claude.code"><option value="gpt.codex"><option value="gpt.work"></datalist></div>
          <div class="menuField"><label for="profile">Profile</label><input id="profile" list="profileOptions" value="default" aria-label="Browser profile" title="浏览器 profile">
      <datalist id="profileOptions"><option value="default"><option value="goofish"><option value="douyin"><option value="xiaohongshu"><option value="taobao"></datalist></div>
        </div>
        <div class="menuActions">
          <button id="localLogin" class="actionButton" title="用电脑上的正常 Chrome/Edge 完成人工登录">
        <svg class="buttonIcon" viewBox="0 0 24 24" aria-hidden="true">
          <rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>
        </svg>
        <span class="buttonLabel" id="localLoginLabel">本机登录</span>
      </button>
          <button id="fullscreen" class="actionButton" aria-label="全屏" title="全屏">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>
          </svg>
          <span class="buttonLabel">全屏</span>
        </button>
        </div>
        <div class="menuGroup">
          <span class="menuLabel">皮肤</span>
          <div class="menuSkins" id="menuSkins"></div>
        </div>
        <div class="menuFoot"><span class="menuLabel">控制权</span><span class="badge" id="controlBadge">MODEL</span><span class="menuSpacer"></span><span class="version" id="appVersion">v93</span></div>
      </div>
      <div class="skinToast" id="skinToast" aria-live="polite"></div>
    </div>
    <div class="meta" id="meta">
      <span id="urlLabel">尚未打开页面</span>
      <span id="error"></span>
    </div>
    <div class="viewportWrap" id="viewportWrap">
      <img id="frame" alt="">
      <canvas id="liveCanvas" aria-label="实时浏览器画面"></canvas>
      <div class="liveHint" id="liveHint" role="status" aria-live="polite"></div>
      <video id="mediaVideo" autoplay muted playsinline crossorigin="anonymous" aria-label="缓冲媒体画面"></video>
      <div class="companionPrep" id="companionPrep" aria-live="polite">
        <div class="companionPrepCard">
          <div class="companionTv" aria-hidden="true">
            <div class="companionTvScreen">
              <span class="companionDot"></span>
              <span class="companionDot"></span>
              <span class="companionDot"></span>
            </div>
          </div>
          <div class="companionPrepTitle" id="companionPrepTitle">正在攒一点点画面…</div>
          <div class="companionPrepText" id="companionPrepText">为了让声音和画面一起走，会故意落后电脑一小段时间。</div>
          <div class="companionCounter" id="companionCounter">缓存 0 / 20 秒</div>
          <div class="companionProgress" aria-hidden="true">
            <div class="companionProgressBar" id="companionProgressBar"></div>
          </div>
          <div class="companionPrepActions">
            <button id="companionStart" type="button">开始陪看</button>
            <button id="companionCancel" type="button">回到 LIVE</button>
          </div>
        </div>
      </div>
      <div class="pausedOverlay" id="pausedOverlay" hidden>
        <img id="pausedFrame" alt="">
        <div class="pausedBadge">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>
          <strong>已暂停</strong>
          <span>电脑端也停在这里 · 点一下继续</span>
        </div>
      </div>
      <div class="pointerDot" id="pointerDot"></div>
      <div class="contextMirror" id="contextMirror" role="menu" aria-label="右键菜单"></div>
      <div class="empty" id="empty">远程浏览器画面会显示在这里。<br>先输入网址，或者让 ChatGPT / Claude 打开页面。</div>
    </div>
    <div class="companionTimeline" id="companionTimeline">
      <div class="timelineMeta">
        <strong id="timelineCurrent">00:00</strong>
        <span class="timelineHint" id="timelineHint">等待缓存时间轴</span>
        <strong id="timelineDuration">--:--</strong>
      </div>
      <div class="timelineTrackWrap">
        <div class="timelineBase"></div>
        <div class="timelineBuffered" id="timelineBuffered"></div>
        <input id="companionSeek" type="range" min="0" max="1" value="0" step="0.1" disabled aria-label="陪看时间轴">
      </div>
    </div>
    <div class="dock">
      <button id="companion" class="actionButton" title="进入陪看模式">
          <svg class="buttonIcon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M8 5v14l11-7z"/>
          </svg>
          <span class="buttonLabel" id="companionLabel">进入陪看</span>
        </button>
      <button id="companionPause" class="actionButton" title="暂停陪看，电脑端的视频和录制一起暂停" hidden>
          <svg class="buttonIcon" viewBox="0 0 24 24" aria-hidden="true">
            <path id="companionPauseIcon" d="M8 5v14M16 5v14"/>
          </svg>
          <span class="buttonLabel" id="companionPauseLabel">暂停</span>
        </button>
      <button id="showToAi" class="actionButton" title="把你现在看到的这一帧分享给群里的 AI 看">
          <svg class="buttonIcon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M2.8 12s3.4-5.4 9.2-5.4S21.2 12 21.2 12s-3.4 5.4-9.2 5.4S2.8 12 2.8 12z"/>
            <circle cx="12" cy="12" r="2.6"/>
          </svg>
          <span class="buttonLabel" id="showToAiLabel">叫大家看</span>
        </button>
      <button id="watchTicket" class="actionButton" title="生成观影纪念票根">
          <svg class="buttonIcon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6.5h16v4a2 2 0 0 0 0 3v4H4v-4a2 2 0 0 0 0-3z"/>
            <path d="M15.5 7v10"/>
          </svg>
          <span class="buttonLabel" id="watchTicketLabel">票根</span>
        </button>
    </div>
    <section class="drawer" id="remoteDrawer">
      <button class="drawerToggle" id="drawerToggle" type="button" aria-expanded="false">
        <strong>遥控</strong>
        <span>网址 · 收藏 · 我来操作 · 打字
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
        </span>
      </button>
      <div class="drawerBody" id="drawerBody">
        <div class="toolbar">
          <div class="historyNav">
        <button id="back" aria-label="后退" title="后退">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
        </button>
        <button id="forward" aria-label="前进" title="前进">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>
          <div class="addressWrap">
        <input id="address" inputmode="url" autocapitalize="off" autocomplete="off" placeholder="搜索或输入网址" aria-label="网址">
        <button id="open" class="addressGo" aria-label="打开网址" title="打开">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h13M14 7l5 5-5 5"/></svg>
        </button>
      </div>
          <button id="refresh" class="iconButton" aria-label="刷新" title="刷新">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 6v5h-5"/><path d="M19 11a7.5 7.5 0 1 0 1 4"/></svg>
      </button>
          <button id="bookmarkAdd" class="iconButton" type="button" aria-label="收藏当前网址" title="收藏当前网址">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.8l2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7-5 2.7 1-5.6-4.1-3.9 5.6-.8z"/></svg>
          </button>
        </div>
        <div class="bookmarks" id="bookmarks" aria-label="收藏的网址"></div>
    <div class="controls">
      <button id="takeover" class="actionButton primary">
        <svg class="buttonIcon" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M8.5 11V7.6a1.5 1.5 0 0 1 3 0V11M11.5 10V6.4a1.5 1.5 0 0 1 3 0V11M14.5 10V7.4a1.5 1.5 0 0 1 3 0v5.4M8.5 10.2V9.1a1.5 1.5 0 0 0-3 0v5.3c0 4 2.8 6.6 6.7 6.6h1.2c4 0 6.1-2.7 6.1-6.4v-3.1"/>
        </svg>
        <span class="buttonLabel" id="takeoverLabel">我来操作</span>
      </button>
      <button id="sound" class="roundAction" title="远程网页声音" aria-label="声音">
        <svg class="soundOn" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11 5L6.8 8.5H4v7h2.8L11 19z"/><path d="M15 9a4 4 0 0 1 0 6M17.5 6.5a7.5 7.5 0 0 1 0 11"/>
        </svg>
        <svg class="soundOff" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M11 5L6.8 8.5H4v7h2.8L11 19z"/><path d="M15.5 10l5 5M20.5 10l-5 5"/>
        </svg>
      </button>
      <button id="enter" class="keyButton" aria-label="Enter" title="Enter">↵</button>
      <button id="esc" class="keyButton" aria-label="Esc" title="Esc">esc</button>
      <input id="humanText" class="humanInput" autocomplete="off" placeholder="接管后输入文字">
      <button id="typeText" class="roundAction" aria-label="输入" title="输入">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M7 10l5-5 5 5"/></svg>
      </button>
    </div>
    <div class="remotePad" id="remotePad">
      <div class="touchMouse" id="touchMouse">
        <div class="trackpad" id="trackpad">
          <span class="trackLabel">
            <strong>触控板</strong>
            <span>移动 · 点按 · 双击</span>
          </span>
          <span class="trackDot" id="trackDot"></span>
        </div>
        <div class="mouseKeys">
          <button class="mouseKey" id="leftMouse">左键</button>
          <button class="mouseKey" id="rightMouse">右键</button>
        </div>
      </div>
      <div class="nudgeStatus" id="nudgeStatus">滑动移动 · 轻点单击 · 左下按住可拖拽</div>
    </div>
      </div>
    </section>
    <section class="cameraPanel" id="cameraPanel" aria-label="让 TA 看看你">
      <div class="cameraStage">
        <video id="cameraVideo" playsinline muted autoplay></video>
        <canvas id="cameraCanvas" aria-label="你的摄像头画面"></canvas>
        <div class="cameraNote" id="cameraNote">摄像头开着 · TA 想看你时会自己看</div>
        <div class="cameraLooked" id="cameraLooked" aria-live="polite"></div>
        <div class="cameraTools">
          <button id="cameraFlip" type="button" aria-label="前后翻转" title="前后翻转">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9a8 8 0 0 1 14-3l2 2M20 15a8 8 0 0 1-14 3l-2-2"/><path d="M20 4v4h-4M4 20v-4h4"/></svg>
          </button>
          <button id="cameraClose" type="button" aria-label="关闭摄像头" title="关闭摄像头">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
      </div>
      <div class="cameraBar">
        <div class="cameraLooks" id="cameraLooks"></div>
        <button id="cameraShare" class="primary" type="button" title="把你现在的样子发给群里的 AI 看">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.8 12s3.4-5.4 9.2-5.4S21.2 12 21.2 12s-3.4 5.4-9.2 5.4S2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.6"/></svg>
          <span>给 TA 看</span>
        </button>
      </div>
    </section>
    <div class="nowPlaying" id="nowPlaying">
      <span class="npIcon" id="npIcon"></span>
      <span class="npTitle" id="npTitle">当前播放</span>
      <span class="npTime" id="npTime"></span>
      <button id="npExpand" type="button">展开</button>
    </div>
    <div class="chatPanel" id="chatPanel">
      <div class="chatHead">
        <strong>群聊</strong>
        <span class="chatMembers" id="chatMembers"></span>
        <button class="chatClear" id="chatClear" type="button" title="清空群聊记录">清空</button>
        <span id="chatStatus">我 · TA</span>
      </div>
      <div class="chatMessages" id="chatMessages">
        <div class="chatEmpty">这里会同时显示你和 TA 的消息</div>
      </div>
    </div>
    <div class="talk" id="talk">
      <button id="cameraToggle" type="button" aria-label="让 TA 看看你" title="让 TA 看看你">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 8.5a2 2 0 0 1 2-2h2l1.6-2h5.8l1.6 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/><circle cx="12" cy="13" r="3.6"/></svg>
      </button>
      <button id="voiceToggle" type="button" aria-label="切换到按住说话" title="按住说话">
        <svg class="voiceIconMic" viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>
        <svg class="voiceIconKeys" viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M8 14h8"/></svg>
      </button>
      <input id="talkText" autocomplete="off" placeholder="跟当前 AI 说…">
      <button id="holdToTalk" type="button" aria-label="按住说话">按住 说话</button>
      <button id="talkSend" class="primary" aria-label="发送" title="发送">
        <svg class="sendGlyph" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V5M7 10l5-5 5 5"/></svg>
      </button>
    </div>
    <div class="hint">登录态保存在真实 Chromium profile。接管时可以直接点、按住拖动、输入账号/验证码；还给模型后，ChatGPT 或 Claude 继续操作同一页面。浏览器审计只记录动作和人工输入字符数，不记录输入内容。</div>
  </div>
  <div class="ticketOverlay" id="ticketOverlay">
    <section class="ticketSheet" aria-label="观影纪念票根">
      <header class="ticketSheetHead">
        <div>
          <strong id="ticketSheetTitle">观影纪念票根</strong>
          <span id="ticketSheetSub">这一场真实看过的画面</span>
        </div>
        <button class="ticketSheetClose" id="ticketClose" aria-label="关闭">×</button>
      </header>
      <div class="ticketSheetBody">
        <div id="ticketCreateView">
          <div class="ticketPreviewWrap" id="ticketPreviewWrap">
            <img id="ticketPreview" class="ticketPreview" alt="观影纪念票根预览">
            <div class="ticketPreviewEmpty" id="ticketPreviewEmpty">按「票根」后，会用你此刻真正看到的画面生成固定格式纪念票。</div>
          </div>
          <div class="ticketMetaRow">
            <div class="ticketMetaText">
              <strong id="ticketMetaTitle">还没有生成</strong>
              <span id="ticketMetaDetail">不会默认留档</span>
            </div>
          </div>
          <div class="collectionToggleRow">
            <div class="collectionToggleText">
              <strong>收藏到观影集</strong>
              <span id="collectionToggleHint">默认关闭。开启后才会保存票根成品与必要信息。</span>
            </div>
            <button id="collectionSwitch" class="collectionSwitch" aria-label="收藏到观影集" aria-pressed="false"></button>
          </div>
          <div class="ticketPrivacy" id="ticketPrivacy">
            <strong>开启收藏模式前确认</strong>
            <p>开启后，会按一个随机收藏 ID 保存：票根成品、标题、平台、观看时间和来源链接。不会保存原始视频，也不会额外保存原始截图。默认不人工查看；你可以随时关闭、删除单张或清空整个观影集。</p>
            <div class="ticketPrivacyActions">
              <button id="collectionConsent" class="primary">同意并开启</button>
              <button id="collectionConsentCancel">暂不开启</button>
            </div>
          </div>
          <div class="ticketActions">
            <button id="ticketDownload">保存图片</button>
            <button id="ticketReframe">重新选一帧</button>
            <button id="ticketOpenLibrary">观影集</button>
          </div>
          <div class="ticketToast" id="ticketToast"></div>
        </div>
        <div class="ticketLibrary" id="ticketLibrary">
          <div class="ticketLibraryToolbar">
            <strong>我的观影集</strong>
            <div>
              <button id="ticketLibraryBack">返回票根</button>
              <button id="ticketLibraryClear">清空</button>
            </div>
          </div>
          <div class="ticketLibraryList" id="ticketLibraryList"></div>
        </div>
      </div>
    </section>
  </div>
</div>
<script type="module">
${MCP_APP_BRIDGE_SOURCE}

const $ = (id) => document.getElementById(id);
const app = new App(
  { name: "tongping-app", version: "0.4.0-wip" },
  { availableDisplayModes: ["inline", "fullscreen"] },
  { autoResize: true }
);

let connected = false;
let busy = false;
let stateTimer = null;
let frameTimer = null;
let chatTimer = null;
let chatAfterSeq = 0;
let chatPending = false;
// Room seq this card found on its first sync; older messages start folded.
let chatEarlierThroughSeq = -1;
let chatShowEarlier = false;
let chatPendingSince = 0;
let chatHintTimer = null;
const chatMessages = [];
// v90 group chat: identities the user has muted, as reported by the room.
const chatMuted = new Set();
const CHAT_MEMBERS = ["claude.chat", "gpt.chat"];
const chatMessageIds = new Set();
let showToAiBusy = false;
let watchTicketBusy = false;
let watchCollectionEnabled = false;
let watchCollectionId = "";
let watchCollectionLoaded = false;
let watchCollection = null;
let currentWatchTicket = null;
let ticketPrivacyPending = false;
let ticketClearConfirmUntil = 0;
let liveFailed = false;
let liveSuperseded = false;
let liveSocket = null;
let liveSocketUrl = "";
let liveRetryTimer = null;
let liveRetryCount = 0;
let liveImageErrors = 0;
let lastLivePacketAt = 0;
let liveStallRefreshAt = 0;
let pendingLivePacket = null;
let liveRenderScheduled = false;
let liveNewestCapturedAt = 0;
let liveRenderedCapturedAt = 0;
let liveRenderedAtMs = 0;
let liveCommandSeq = 0;
const liveCommandPending = new Map();
let audioEnabled = false;
let audioSocket = null;
let audioSocketUrl = "";
let audioRetryTimer = null;
let audioRetryCount = 0;
let audioContext = null;
let audioNextTime = 0;
let audioLastSequence = null;
let audioScheduledSources = new Set();
let audioOutputGain = null;
let audioSessionKeepAlive = null;
let audioPacketsReceived = 0;
let audioLastPcmRms = 0;
let audioLastCapturedAt = 0;
let audioSyncErrorMs = 0;
let audioStatusTimer = null;
const AUDIO_TARGET_AHEAD = 0.28;
const AUDIO_MIN_AHEAD = 0.08;
const AUDIO_MAX_AHEAD = 0.62;
const AUDIO_MAX_SMALL_GAP_PACKETS = 6;
const AV_SYNC_BASE_AHEAD = 0.08;
const AV_SYNC_MIN_AHEAD = 0.04;
const AV_SYNC_MAX_AHEAD = 1.20;
const AV_SYNC_MAX_FRAME_AGE_MS = 1800;
const AV_SYNC_HARD_RESET_MS = 280;
const AV_SYNC_NUDGE_PER_PACKET = 0.018;
let mediaSocket = null;
let mediaSocketUrl = "";
let mediaRetryTimer = null;
let mediaRetryCount = 0;
let mediaSessionBlocked = false;
let mediaModeActive = false;
let companionModeActive = false;
let companionPhase = "idle";
let companionDelaySeconds = 20;
let companionStartedAt = 0;
let companionReconnectTimer = null;
let companionProbeTimer = null;
let companionPlaybackStatusTimer = null;
let companionVideoStarted = false;
let companionPlaybackArmed = false;
let companionBufferedSeconds = 0;
let companionSourceAnchorPts = null;
let companionSourceAnchorDateMs = null;
let companionSourcePlaybackRate = 1;
let companionSourceDuration = null;
let companionSourceSamples = [];
let companionStreamId = "";
let companionBufferStartPts = null;
let companionBufferEndPts = null;
let companionSeekDragging = false;
let companionSeekPending = false;
let companionBufferingCheckTimer = null;
let companionLastProgressTime = 0;
let companionLastProgressAt = 0;
let companionLastRecoveryLoadAt = 0;
let companionLastUserMediaInteractionAt = 0;
let companionAutoResumeTimer = null;
let companionAiWatchRequested = false;
// Set only by the viewer's own pause button. While true nothing may auto-play
// the companion video, and the PC source + recorder are held as well.
let companionUserPaused = false;
let companionCaptureIssue = "";
let mediaSource = null;
let mediaSourceUrl = "";
let mediaSourceBuffer = null;
let mediaSegmentQueue = [];
let mediaStreamId = "";
let mediaMimeType = "";
let mediaSourceOpening = false;
let mediaPlaybackStarted = false;
let pointerGesture = null;
let gestureReady = Promise.resolve();
let pendingMove = null;
let movePumpActive = false;
let gestureFrameTimer = null;
let remoteCursor = null;
let remoteHeld = false;
let trackGesture = null;
let leftPointerId = null;
let rightPointerId = null;
let lastPadTapAt = 0;
let lastPadTapPoint = null;
let moveCommandInFlight = false;
let pendingRemoteMove = null;
let contextMenuOpen = false;
let contextMenuTarget = null;
let contextMenuPoint = null;
let state = {
  identity: "gpt.chat",
  profile: "default",
  title: "",
  appUiBuild: "v93",
  workerBuild: "",
  url: "",
  takeover: false,
  viewport: { width: 0, height: 0 },
  mimeType: "image/png",
  frameUrl: "",
  liveUrl: "",
  audioUrl: "",
  mediaUrl: "",
  companionHlsUrl: "",
  chatUrl: "",
  watchCollectionUrl: "",
  watchCollectionWriteUrl: "",
  inputUrl: "",
  controlUrl: "",
  base64: "",
  externalLoginEnabled: false,
  externalLogin: {
    active: false,
    supported: false,
    processRunning: false,
    readyToResume: false,
    browser: "",
    startedAt: ""
  },
  displayMode: "inline"
};

// name.entry, mirroring src/identity-alias.ts: older bare names fold in.
const LEGACY_IDENTITIES = { claude: "claude.chat", gpt: "gpt.chat", codex: "gpt.codex" };
function normalizeIdentity(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,40}$/.test(v)) return "gpt.chat";
  if (LEGACY_IDENTITIES[v]) return LEGACY_IDENTITIES[v];
  const dashed = /^(claude|gpt)-(chat|code|cloud|codex|work)(-\\d+)?$/.exec(v);
  if (dashed) return dashed[1] + "." + dashed[2] + (dashed[3] || "");
  const terminal = /^claude-(?:opus|sonnet|fable|haiku)(-\\d+)?$/.exec(v);
  if (terminal) return "claude.code" + (terminal[1] || "");
  return v;
}
function normalizeProfile(value) {
  const v = String(value || "").trim();
  return /^[a-zA-Z0-9._-]{1,64}$/.test(v) ? v : "default";
}
function syncFields() {
  $("identity").value = state.identity;
  $("profile").value = state.profile;
  if (state.url && document.activeElement !== $("address")) $("address").value = state.url;
}
function setError(message) {
  const text = message ? String(message).slice(0, 180) : "";
  $("error").textContent = text;
  $("meta").classList.toggle("on", Boolean(text));
}
function stableSignedSocketTarget(rawUrl) {
  const value = String(rawUrl || "");
  if (!value) return "";
  try {
    const url = new URL(value);
    const profile = url.searchParams.get("profile") || "";
    const appBuild = url.searchParams.get("app_build") || "";
    return (
      url.origin +
      url.pathname +
      "?profile=" +
      encodeURIComponent(profile) +
      "&app_build=" +
      encodeURIComponent(appBuild)
    );
  } catch {
    return value
      .replace(/([?&])(exp|sig)=[^&]*/g, "$1")
      .replace(/[?&]+$/, "");
  }
}

function applyState(next) {
  if (!next || typeof next !== "object") return;
  const wasExternalLogin = Boolean(state.externalLogin && state.externalLogin.active);
  if (next.identity) state.identity = normalizeIdentity(next.identity);
  if (next.profile) state.profile = normalizeProfile(next.profile);
  if (typeof next.title === "string") state.title = next.title;
  if (typeof next.appUiBuild === "string") state.appUiBuild = next.appUiBuild;
  if (typeof next.workerBuild === "string") state.workerBuild = next.workerBuild;
  if (typeof next.url === "string") state.url = next.url;
  if (typeof next.takeover === "boolean") state.takeover = next.takeover;
  if (typeof next.userName === "string") state.userName = next.userName.slice(0, 40);
  if (typeof next.aiName === "string") state.aiName = next.aiName.slice(0, 24);
  if (typeof next.externalLoginEnabled === "boolean") {
    state.externalLoginEnabled = next.externalLoginEnabled;
  }
  if (next.externalLogin && typeof next.externalLogin === "object") {
    state.externalLogin = {
      active: next.externalLogin.active === true,
      supported: next.externalLogin.supported !== false,
      processRunning: next.externalLogin.processRunning === true,
      readyToResume: next.externalLogin.readyToResume === true,
      browser:
        typeof next.externalLogin.browser === "string"
          ? next.externalLogin.browser
          : "",
      startedAt:
        typeof next.externalLogin.startedAt === "string"
          ? next.externalLogin.startedAt
          : ""
    };
  }
  if (next.viewport && typeof next.viewport === "object") {
    state.viewport = {
      width: Number(next.viewport.width || 0),
      height: Number(next.viewport.height || 0)
    };
    if (state.viewport.width > 0 && state.viewport.height > 0) {
      $("shell").style.setProperty(
        "--remote-aspect",
        state.viewport.width + " / " + state.viewport.height
      );
    }
  }
  if (typeof next.mimeType === "string") state.mimeType = next.mimeType;
  if (typeof next.frameUrl === "string") state.frameUrl = next.frameUrl;
  if (typeof next.liveUrl === "string") {
    // A re-signed ticket for the same lane is not a new target: keep it for
    // the next reconnect without dropping a healthy live socket.
    const changed =
      stableSignedSocketTarget(next.liveUrl) !==
      stableSignedSocketTarget(state.liveUrl);
    if (changed) {
      state.liveUrl = next.liveUrl;
      liveFailed = false;
      liveSuperseded = false;
      liveRetryCount = 0;

      if (
        liveSocket &&
        liveSocketUrl &&
        liveSocketUrl !== next.liveUrl
      ) {
        closeLiveSocket(false);
      }

      queueMicrotask(() => ensureLiveSocket());
    } else if (!liveSuperseded) {
      const rotated = next.liveUrl !== state.liveUrl;
      state.liveUrl = next.liveUrl;
      // A live lane that gave up on an expired ticket retries once it has
      // a freshly signed one.
      if (rotated && liveFailed) {
        liveFailed = false;
        liveRetryCount = 0;
        queueMicrotask(() => ensureLiveSocket());
      }
    }
  }
  if (typeof next.audioUrl === "string") {
    const audioActive =
      audioSocket &&
      (audioSocket.readyState === WebSocket.OPEN ||
       audioSocket.readyState === WebSocket.CONNECTING);
    if (!audioActive) {
      state.audioUrl = next.audioUrl;
    }
  }
  if (typeof next.companionHlsUrl === "string") {
    state.companionHlsUrl = next.companionHlsUrl;
  }
  if (typeof next.chatUrl === "string") {
    const changed =
      stableSignedSocketTarget(next.chatUrl) !==
      stableSignedSocketTarget(state.chatUrl);
    state.chatUrl = next.chatUrl;
    if (changed) queueMicrotask(() => startChatSync());
  }
  if (typeof next.watchCollectionUrl === "string") {
    const changed =
      stableSignedSocketTarget(next.watchCollectionUrl) !==
      stableSignedSocketTarget(state.watchCollectionUrl);
    state.watchCollectionUrl = next.watchCollectionUrl;
    if (changed) {
      queueMicrotask(() => syncWatchCollectionFromServer());
    }
  }
  if (typeof next.watchCollectionWriteUrl === "string") {
    state.watchCollectionWriteUrl = next.watchCollectionWriteUrl;
  }
  if (typeof next.mediaUrl === "string") {
    const targetChanged =
      stableSignedSocketTarget(next.mediaUrl) !==
      stableSignedSocketTarget(state.mediaUrl);
    // Always retain the newest signed URL so a later reconnect gets fresh
    // authority, but do not tear down a healthy media socket merely because
    // exp/sig rotated during normal App polling.
    state.mediaUrl = next.mediaUrl;
    if (targetChanged) {
      closeMediaSocket(!companionModeActive, true);
      mediaRetryCount = 0;
    }
    if (
      companionModeActive &&
      !state.takeover &&
      !state.externalLogin?.active
    ) {
      queueMicrotask(() => ensureMediaSocket());
    }
  }
  if (typeof next.inputUrl === "string") state.inputUrl = next.inputUrl;
  if (typeof next.controlUrl === "string") state.controlUrl = next.controlUrl;
  if (typeof next.base64 === "string") state.base64 = next.base64;
  render();

  // The worker hands a slider/login wall to local Chrome and takes the
  // profile back on its own; the card only learns that from state. Poll fast
  // while handed off, and reopen live the moment the profile is back.
  const isExternalLogin = Boolean(state.externalLogin && state.externalLogin.active);
  if (wasExternalLogin !== isExternalLogin) {
    queueMicrotask(() => {
      if (!isExternalLogin) {
        liveFailed = false;
        liveSuperseded = false;
        liveRetryCount = 0;
        liveImageErrors = 0;
        refreshImage();
        scheduleLiveFrameResync();
      }
      startPolling();
    });
  }
}
// LIVE is tuned for click response, not smooth video. On a video page in
// LIVE, say once (per page) that 陪看 plays it smoothly.
const VIDEO_PAGE_PATTERNS = [
  /bilibili\\.com\\/(video|bangumi\\/play)\\//i,
  /douyin\\.com\\/(video\\/|jingxuan|.*[?&]modal_id=)/i,
  /youtube\\.com\\/(watch|shorts\\/)/i,
  /youtu\\.be\\//i,
  /v\\.qq\\.com\\/x\\//i,
  /iqiyi\\.com\\/v_/i,
  /youku\\.com\\/v_show/i,
  /netflix\\.com\\/watch/i,
  /kuaishou\\.com\\/(short-video|video)/i,
];
let liveHintShownFor = "";
let liveHintTimer = null;
function maybeShowLiveVideoHint() {
  const url = String(state.url || "");
  const onVideo = VIDEO_PAGE_PATTERNS.some((pattern) => pattern.test(url));
  if (!onVideo || companionModeActive || state.externalLogin?.active || !connected) return;
  const page = url.replace(/[#].*$/, "");
  if (page === liveHintShownFor) return;
  liveHintShownFor = page;
  const hint = $("liveHint");
  hint.textContent = "实时画面优先点得跟手；看视频点「进入陪看」更流畅";
  hint.classList.add("on");
  if (liveHintTimer) clearTimeout(liveHintTimer);
  liveHintTimer = setTimeout(() => hint.classList.remove("on"), 6000);
}

function render() {
  if (typeof renderChromeExtras === "function") renderChromeExtras();
  maybeShowLiveVideoHint();
  syncFields();
  const externalActive = Boolean(state.externalLogin && state.externalLogin.active);
  $("controlBadge").textContent =
    externalActive ? "LOCAL LOGIN" : state.takeover ? "HUMAN" : "MODEL";
  $("controlBadge").classList.toggle("on", state.takeover || externalActive);
  $("takeoverLabel").textContent = state.takeover ? "还给模型" : "我来操作";
  $("takeover").classList.toggle("on", state.takeover);
  $("takeover").disabled = externalActive;

  $("localLogin").disabled =
    !externalActive && !state.externalLoginEnabled;
  $("localLogin").classList.toggle("on", externalActive);
  $("localLoginLabel").textContent = externalActive
    ? "登录好了，接回"
    : "本机登录";
  $("localLogin").title = externalActive
    ? "先在电脑上完成登录并关闭本机 Chrome/Edge 窗口，再点这里接回"
    : state.externalLoginEnabled
      ? "用电脑上的正常 Chrome/Edge 完成人工登录"
      : "需要 Windows Worker v28+";

  const companionPreparing =
    companionModeActive &&
    (companionPhase === "preparing" ||
     companionPhase === "ready" ||
     companionPhase === "buffering");
  $("watchTicket").classList.toggle("working", watchTicketBusy);
  $("watchTicketLabel").textContent =
    watchTicketBusy ? "制作中…" : "票根";
  $("watchTicket").disabled =
    watchTicketBusy || externalActive;

  $("showToAi").classList.toggle("working", showToAiBusy);
  $("showToAiLabel").textContent = showToAiBusy ? "截一下…" : "叫大家看";
  $("showToAi").disabled =
    showToAiBusy || externalActive;

  $("companionPause").hidden =
    !companionModeActive || (!companionVideoStarted && !companionUserPaused);
  $("companionPause").classList.toggle("on", companionUserPaused);
  $("companionPauseLabel").textContent = companionUserPaused ? "继续" : "暂停";
  $("companionPauseIcon").setAttribute(
    "d",
    companionUserPaused ? "M8 5v14l11-7z" : "M8 5v14M16 5v14"
  );

  $("companion").classList.toggle("on", companionModeActive);
  $("companionLabel").textContent = companionModeActive
    ? "回到 LIVE"
    : "进入陪看";
  $("companion").title = companionModeActive
    ? "退出陪看模式，立刻回到实时控制画面"
    : "音画合一缓冲播放；会故意落后电脑端约" + companionDelaySeconds + "秒";
  $("companion").disabled =
    externalActive || (!companionModeActive && (!state.companionHlsUrl || !state.mediaUrl));

  $("modeStatus").classList.toggle("companion", companionModeActive && !companionPreparing);
  $("modeStatus").classList.toggle("preparing", companionPreparing);
  $("modeStatusTitle").textContent = companionPreparing
    ? "准备中"
    : companionModeActive
      ? "陪看"
      : "LIVE";
  $("modeStatusText").textContent = companionPreparing
    ? "正在建立音画缓存"
    : companionModeActive
      ? "音画合一 · 延迟约" + companionDelaySeconds + "秒"
      : "实时控制画面";

  $("companionPrep").classList.toggle("on", companionPreparing);
  $("companionStart").classList.remove("on");

  $("sound").classList.toggle("on", audioEnabled);
  $("sound").title = audioEnabled ? "关闭声音" : "打开声音";
  $("sound").setAttribute("aria-label", audioEnabled ? "关闭声音" : "打开声音");
  $("sound").disabled = externalActive || companionModeActive;
  const visibleAppBuild = state.appUiBuild || "v93";
  const visibleWorkerBuild = state.workerBuild || "—";
  $("title").textContent =
    "App " + visibleAppBuild + " · Worker " + visibleWorkerBuild;
  $("title").title = state.title || "";
  $("appVersion").textContent = "App " + visibleAppBuild + " · Worker " + visibleWorkerBuild;
  $("urlLabel").textContent = state.url || "尚未打开页面";

  if (externalActive) {
    $("frame").style.display = "none";
    $("liveCanvas").style.display = "none";
    $("mediaVideo").style.display = "none";
    $("empty").textContent = state.externalLogin.readyToResume
      ? "电脑上的 Chrome 窗口已经关了，正在接回画面…\\n十几秒还没画面，就点「登录好了，接回」。"
      : "这一步要真人来：电脑上已经弹出一个普通 Chrome 窗口。\\n在那个窗口里登录或拖完滑块，然后把整个 Chrome 窗口关掉（右上角 ×；只关标签页不算），这边会自动接回画面。";
    $("empty").style.display = "grid";
  } else {
    $("empty").textContent =
      "远程浏览器画面会显示在这里。\\n先输入网址，或者让 ChatGPT / Claude 打开页面。";
    if (companionModeActive && !state.takeover) {
      $("mediaVideo").style.display = "block";
      $("frame").style.display = "none";
      $("liveCanvas").style.display = "none";
      $("empty").style.display = "none";
    } else if (mediaModeActive && !state.takeover) {
      $("mediaVideo").style.display = "block";
      $("frame").style.display = "none";
      $("liveCanvas").style.display = "none";
      $("empty").style.display = "none";
    } else if (state.liveUrl || state.frameUrl || state.base64) {
      $("mediaVideo").style.display = "none";
      refreshImage();
      $("empty").style.display = "none";
    } else {
      $("mediaVideo").style.display = "none";
      $("frame").removeAttribute("src");
      $("empty").style.display = "grid";
    }
  }

  $("shell").classList.toggle("fullscreen", state.displayMode === "fullscreen");
  $("shell").classList.toggle("takeover", state.takeover && !externalActive);
  $("remotePad").classList.toggle("on", state.takeover && !externalActive);
  if (state.takeover && !externalActive) {
    ensureRemoteCursor();
    setTimeout(updateRemoteCursorOverlay, 0);
  } else {
    $("pointerDot").classList.remove("on");
  }
  $("fullscreen").classList.toggle("on", state.displayMode === "fullscreen");
  $("fullscreen").title = state.displayMode === "fullscreen" ? "退出全屏" : "全屏";
  $("fullscreen").setAttribute("aria-label", state.displayMode === "fullscreen" ? "退出全屏" : "全屏");
}
function refreshImage() {
  const frame = $("frame");

  if (companionModeActive && !state.takeover) {
    $("mediaVideo").style.display = "block";
    frame.style.display = "none";
    $("liveCanvas").style.display = "none";
    $("empty").style.display = "none";
    return;
  }

  if (mediaModeActive && !state.takeover) {
    $("mediaVideo").style.display = "block";
    frame.style.display = "none";
    $("liveCanvas").style.display = "none";
    $("empty").style.display = "none";
    return;
  }

  if (state.liveUrl && !liveFailed) {
    ensureLiveSocket();

    // Keep the last valid live frame if one exists. Before the first live
    // packet arrives (or after a host display-mode remount), show the signed
    // snapshot instead of an empty <img>.
    if (
      frame.dataset.mode === "live" &&
      frame.getAttribute("src")
    ) {
      return;
    }

    if (state.frameUrl) {
      frame.dataset.mode = "snapshot";
      const sep = state.frameUrl.includes("?") ? "&" : "?";
      frame.src = state.frameUrl + sep + "_ts=" + Date.now();
      frame.style.display = "block";
      $("liveCanvas").style.display = "none";
      $("empty").style.display = "none";
      return;
    }

    if (state.base64) {
      frame.dataset.mode = "snapshot";
      frame.src =
        "data:" + (state.mimeType || "image/png") +
        ";base64," + state.base64;
      frame.style.display = "block";
      $("liveCanvas").style.display = "none";
      $("empty").style.display = "none";
      return;
    }

    $("empty").style.display = "grid";
    return;
  }

  if (state.frameUrl) {
    frame.dataset.mode = "snapshot";
    const sep = state.frameUrl.includes("?") ? "&" : "?";
    frame.src = state.frameUrl + sep + "_ts=" + Date.now();
    frame.style.display = "block";
    $("liveCanvas").style.display = "none";
    $("empty").style.display = "none";
    return;
  }
  if (state.base64) {
    frame.dataset.mode = "snapshot";
    frame.src =
      "data:" + (state.mimeType || "image/png") +
      ";base64," + state.base64;
    frame.style.display = "block";
    $("liveCanvas").style.display = "none";
    $("empty").style.display = "none";
  }
}

function ensureLiveSocket() {
  if (
    !state.liveUrl ||
    liveFailed ||
    liveSuperseded ||
    (companionModeActive && !state.takeover) ||
    (mediaModeActive && !state.takeover)
  ) return;
  if (
    liveSocket &&
    stableSignedSocketTarget(liveSocketUrl) ===
      stableSignedSocketTarget(state.liveUrl) &&
    (liveSocket.readyState === WebSocket.OPEN ||
     liveSocket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  if (liveRetryTimer) {
    clearTimeout(liveRetryTimer);
    liveRetryTimer = null;
  }
  closeLiveSocket(false);

  const socket = new WebSocket(withCardStamp(state.liveUrl));
  socket.binaryType = "arraybuffer";
  liveSocket = socket;
  liveSocketUrl = state.liveUrl;

  socket.addEventListener("open", () => {
    if (liveSocket !== socket) return;
    liveRetryCount = 0;
    liveImageErrors = 0;
    liveFailed = false;
    setError("");
    setTimeout(grantNextLiveFrame, 120);
  });

  socket.addEventListener("message", (event) => {
    if (liveSocket !== socket) return;

    if (typeof event.data === "string") {
      try {
        const message = JSON.parse(event.data);
        if (
          message &&
          message.type === "command_result" &&
          typeof message.id === "string"
        ) {
          const pending = liveCommandPending.get(message.id);
          if (pending) {
            liveCommandPending.delete(message.id);
            clearTimeout(pending.timer);
            if (message.ok === true) pending.resolve(message);
            else pending.reject(new Error(message.error || "实时控制失败"));
          }
        }
      } catch {}
      return;
    }

    if (event.data instanceof ArrayBuffer) {
      queueLivePacket(event.data);
      return;
    }
    if (event.data instanceof Blob) {
      void event.data.arrayBuffer().then((buffer) => {
        if (liveSocket === socket) queueLivePacket(buffer);
      });
    }
  });

  socket.addEventListener("close", (event) => {
    if (liveSocket !== socket) return;
    liveSocket = null;
    liveSocketUrl = "";

    if (event && event.code === 1012) {
      liveSuperseded = true;
      liveFailed = true;
      return;
    }

    if (event && event.code === 1006 && connected && !busy) {
      void refreshFrame();
      return;
    }

    scheduleLiveReconnect();
  });

  socket.addEventListener("error", () => {
    // The close event owns retry/fallback. Do not permanently poison
    // live mode on a transient network error.
  });
}

function scheduleLiveReconnect() {
  if (
    liveFailed ||
    liveSuperseded ||
    !state.liveUrl ||
    liveRetryTimer
  ) {
    return;
  }

  liveRetryCount += 1;
  const delay = Math.min(5000, 350 * (2 ** Math.min(liveRetryCount, 4)));
  liveRetryTimer = setTimeout(() => {
    liveRetryTimer = null;
    ensureLiveSocket();
  }, delay);
}

function grantNextLiveFrame(meta = {}) {
  const socket = liveSocket;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify({
      type: "frame_ready",
      ...meta,
    }));
  } catch {}
}

function queueLivePacket(buffer) {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 21) return;
  const view = new DataView(buffer);
  const sequence = view.getUint32(0);
  const capturedAt =
    view.getUint32(12) * 4294967296 + view.getUint32(16);
  if (!Number.isSafeInteger(capturedAt) || capturedAt <= 0) return;
  lastLivePacketAt = Date.now();

  // Never let a reconnect, resync, or stale socket paint history over a newer
  // frame. Sequence may reset when screencast restarts; capturedAt does not.
  if (capturedAt <= liveNewestCapturedAt) {
    grantNextLiveFrame({
      sequence,
      capturedAt,
      outcome: "dropped-stale-before-decode",
      presentationSemantics: "not-presented",
    });
    return;
  }
  liveNewestCapturedAt = capturedAt;

  // Newest-frame-wins: do not decode/render every websocket message.
  // If iOS/host is busy, intermediate video frames are intentionally dropped.
  pendingLivePacket = buffer;
  if (liveRenderScheduled) return;
  liveRenderScheduled = true;
  requestAnimationFrame(renderLatestLivePacket);
}

function renderLatestLivePacket() {
  liveRenderScheduled = false;
  const buffer = pendingLivePacket;
  pendingLivePacket = null;
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < 21) return;

  const view = new DataView(buffer);
  const sequence = view.getUint32(0);
  const width = view.getUint32(4);
  const height = view.getUint32(8);
  const capturedAt =
    view.getUint32(12) * 4294967296 + view.getUint32(16);
  if (!(width > 0 && height > 0)) {
    grantNextLiveFrame({
      sequence,
      capturedAt,
      outcome: "invalid-dimensions",
      presentationSemantics: "not-presented",
    });
    return;
  }

  state.viewport = { width, height };
  $("shell").style.setProperty(
    "--remote-aspect",
    width + " / " + height
  );

  const jpeg = new Uint8Array(buffer, 20);
  const blob = new Blob([jpeg], { type: "image/jpeg" });

  let ackOutcome = "released-without-presentation";
  let ackSemantics = "not-presented";

  const finish = () => {
    grantNextLiveFrame({
      sequence,
      capturedAt,
      outcome: ackOutcome,
      presentationSemantics: ackSemantics,
      presentedAt:
        ackOutcome === "presented" ? Date.now() : undefined,
    });
    if (pendingLivePacket && !liveRenderScheduled) {
      liveRenderScheduled = true;
      requestAnimationFrame(renderLatestLivePacket);
    }
  };

  if (typeof createImageBitmap === "function") {
    void createImageBitmap(blob)
      .then((bitmap) => {
        const canvas = $("liveCanvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { alpha: false });
        if (!ctx) {
          bitmap.close?.();
          throw new Error("Canvas 2D unavailable");
        }

        if (capturedAt <= liveRenderedCapturedAt) {
          ackOutcome = "dropped-stale-after-decode";
          ackSemantics = "not-presented";
          bitmap.close?.();
          return;
        }
        ctx.drawImage(bitmap, 0, 0, width, height);
        liveRenderedCapturedAt = capturedAt;
        liveRenderedAtMs = Date.now();
        ackOutcome = "presented";
        ackSemantics = "canvas-draw-committed";
        bitmap.close?.();

        liveFailed = false;
        liveImageErrors = 0;
        canvas.style.display = "block";
        $("frame").style.display = "none";
        $("mediaVideo").style.display = "none";
        $("frame").removeAttribute("data-mode");
        $("empty").style.display = "none";
        updateRemoteCursorOverlay();
      })
      .catch((error) => {
        ackOutcome = "decode-failed";
        ackSemantics = "not-presented";
        setError("实时画面解码失败：" + (
          error && error.message ? error.message : String(error)
        ));
      })
      .finally(finish);
    return;
  }

  // Older WebViews: one in-flight data URL frame at a time. Flow control
  // still prevents stale-frame buildup even on this fallback path.
  const reader = new FileReader();
  reader.onload = () => {
    const frame = $("frame");
    frame.dataset.mode = "live";
    frame.style.display = "block";
    $("liveCanvas").style.display = "none";
    $("mediaVideo").style.display = "none";
    $("empty").style.display = "none";
    frame.onload = () => {
      frame.onload = null;
      liveFailed = false;
      liveImageErrors = 0;
      liveRenderedCapturedAt = Math.max(liveRenderedCapturedAt, capturedAt);
      liveRenderedAtMs = Date.now();
      ackOutcome = "presented";
      ackSemantics = "img-load-complete";
      updateRemoteCursorOverlay();
      finish();
    };
    frame.onerror = () => {
      frame.onerror = null;
      ackOutcome = "decode-failed";
      ackSemantics = "not-presented";
      setError("实时画面解码失败");
      finish();
    };
    frame.src = String(reader.result || "");
  };
  reader.onerror = () => {
    setError("实时画面读取失败");
    finish();
  };
  reader.readAsDataURL(blob);
}


function isIosLikeHost() {
  const ua = String(navigator.userAgent || "");
  if (/iPhone|iPad|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function canUseBufferedMediaLane() {
  if (isIosLikeHost()) return false;
  if (
    typeof MediaSource === "undefined" ||
    typeof MediaSource.isTypeSupported !== "function"
  ) {
    return false;
  }
  return MediaSource.isTypeSupported("video/webm;codecs=vp8");
}

function disableMediaForSession(message) {
  mediaSessionBlocked = true;
  closeMediaSocket(true, true);
  fallbackFromMedia(message || "");
}

function ensureMediaSocket() {
  const companion = companionModeActive;
  if (
    state.takeover ||
    state.externalLogin?.active ||
    !state.mediaUrl ||
    !companion
  ) {
    return;
  }
  if (
    mediaSocket &&
    stableSignedSocketTarget(mediaSocketUrl) ===
      stableSignedSocketTarget(state.mediaUrl) &&
    (mediaSocket.readyState === WebSocket.OPEN ||
     mediaSocket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  if (mediaRetryTimer) {
    clearTimeout(mediaRetryTimer);
    mediaRetryTimer = null;
  }
  closeMediaSocket(false, true);

  const socket = new WebSocket(withCardStamp(state.mediaUrl));
  socket.binaryType = "arraybuffer";
  mediaSocket = socket;
  mediaSocketUrl = state.mediaUrl;

  socket.addEventListener("open", () => {
    if (mediaSocket !== socket) return;
    mediaRetryCount = 0;
    try {
      socket.send(JSON.stringify({
        type: companionModeActive
          ? "companion_ready"
          : "media_ready",
        appUiBuild: state.appUiBuild || "v93",
        entry: companionModeActive ? String(companionStartedAt || "") : ""
      }));
      if (companionModeActive) sendCompanionPlaybackStatus();
      if (companionModeActive && companionUserPaused) sendCompanionPause();
    } catch {}
  });

  socket.addEventListener("message", (event) => {
    if (mediaSocket !== socket || state.takeover) return;
    if (companionModeActive) return;

    if (typeof event.data === "string") {
      try {
        const message = JSON.parse(event.data);
        if (
          message &&
          message.type === "media_stream_start" &&
          typeof message.streamId === "string" &&
          typeof message.mimeType === "string"
        ) {
          beginMediaStream(message.streamId, message.mimeType);
          return;
        }
        if (
          message &&
          message.type === "media_stream_end" &&
          (!message.streamId || message.streamId === mediaStreamId)
        ) {
          fallbackFromMedia("");
        }
      } catch {}
      return;
    }

    if (event.data instanceof ArrayBuffer) {
      queueMediaSegment(event.data);
      return;
    }
    if (event.data instanceof Blob) {
      void event.data.arrayBuffer().then((buffer) => {
        if (mediaSocket === socket) queueMediaSegment(buffer);
      });
    }
  });

  socket.addEventListener("close", (event) => {
    if (mediaSocket !== socket) return;
    mediaSocket = null;
    mediaSocketUrl = "";
    if (state.takeover || state.externalLogin?.active) return;
    // The server turned 陪看 away: too many watching at once, or no 同屏点 left.
    if (companionModeActive && event && (event.code === 4002 || event.code === 4003)) {
      stopCompanionPlayback(true);
      setError(event.code === 4002
        ? "现在陪看的人有点多，稍后再点「进入陪看」试试；实时画面照常能用"
        : "今天的同屏点用完了（北京时间 0 点重置），陪看先停下；实时画面和群聊照常能用");
      return;
    }
    if (companionModeActive && event && event.code === 1008) {
      // v90: another (newer) card took the companion lane. Stand down
      // instead of reconnecting and fighting it for the single capture.
      stopCompanionPlayback(true);
      setError("另一个窗口正在陪看，这边先停下了；关掉那边再点陪看就能接上");
      return;
    }
    if (companionModeActive) {
      if (companionReconnectTimer) clearTimeout(companionReconnectTimer);
      // v90: a refused upgrade (another card holds the lane) closes as 1006
      // before open. Back off instead of hammering every 1.2s forever.
      mediaRetryCount += 1;
      const companionDelay = Math.min(
        10_000,
        1200 * (2 ** Math.min(mediaRetryCount - 1, 3)),
      );
      if (mediaRetryCount >= 4) {
        setError("陪看视频连不上，可能别的窗口也开着 同屏；关掉其它窗口会自动接上");
      }
      companionReconnectTimer = setTimeout(() => {
        companionReconnectTimer = null;
        if (companionModeActive) ensureMediaSocket();
      }, companionDelay);
      return;
    }
    if (event && event.code === 1012) return;
    mediaSessionBlocked = true;
    fallbackFromMedia("");
  });

  socket.addEventListener("error", () => {});
}

function scheduleMediaReconnect() {
  // Media transport is one-shot per mounted app session. Automatic reconnect
  // caused capture-helper tab storms and repeated MSE resets on mobile hosts.
  mediaSessionBlocked = true;
}

function beginMediaStream(streamId, mimeType) {
  if (
    !streamId ||
    !mimeType ||
    typeof MediaSource === "undefined" ||
    typeof MediaSource.isTypeSupported !== "function" ||
    !MediaSource.isTypeSupported(mimeType)
  ) {
    disableMediaForSession("当前宿主不支持缓冲媒体流，已回到实时画面");
    return;
  }

  resetMediaPlayback();
  mediaStreamId = String(streamId);
  mediaMimeType = String(mimeType);
  mediaSourceOpening = true;
  mediaSource = new MediaSource();

  const video = $("mediaVideo");
  video.muted = true;
  video.autoplay = true;
  video.playsInline = true;
  mediaSourceUrl = URL.createObjectURL(mediaSource);
  video.src = mediaSourceUrl;

  mediaSource.addEventListener("sourceopen", () => {
    if (!mediaSource || mediaSource.readyState !== "open") return;
    try {
      mediaSourceBuffer = mediaSource.addSourceBuffer(mediaMimeType);
      try { mediaSourceBuffer.mode = "sequence"; } catch {}
      mediaSourceBuffer.addEventListener("updateend", () => {
        syncMediaPlaybackToLiveEdge();
        drainMediaSegments();
      });
      mediaSourceBuffer.addEventListener("error", () => {
        disableMediaForSession("缓冲媒体解码失败，已回到实时画面");
      });
      mediaSourceOpening = false;
      drainMediaSegments();
    } catch (error) {
      disableMediaForSession(
        "缓冲媒体初始化失败，已回到实时画面"
      );
    }
  }, { once: true });
}

function queueMediaSegment(buffer) {
  if (
    !(buffer instanceof ArrayBuffer) ||
    buffer.byteLength <= 12 ||
    !mediaStreamId
  ) {
    return;
  }

  const payload = buffer.slice(12);
  if (!payload.byteLength) return;
  mediaSegmentQueue.push(payload);

  if (mediaSegmentQueue.length > 8) {
    disableMediaForSession("视频缓冲跟不上，已回到实时画面");
    return;
  }
  drainMediaSegments();
}

function drainMediaSegments() {
  if (
    mediaSourceOpening ||
    !mediaSourceBuffer ||
    mediaSourceBuffer.updating ||
    mediaSegmentQueue.length === 0
  ) {
    return;
  }

  try {
    const video = $("mediaVideo");
    const buffered = mediaSourceBuffer.buffered;
    if (
      buffered.length &&
      Number.isFinite(video.currentTime)
    ) {
      const firstStart = buffered.start(0);
      const cutoff = video.currentTime - 12;
      if (cutoff > firstStart + 2) {
        mediaSourceBuffer.remove(firstStart, cutoff);
        return;
      }
    }

    const next = mediaSegmentQueue.shift();
    mediaSourceBuffer.appendBuffer(next);
  } catch (error) {
    disableMediaForSession(
      "缓冲媒体追加失败，已回到实时画面"
    );
  }
}

function syncMediaPlaybackToLiveEdge() {
  const video = $("mediaVideo");
  if (!mediaSourceBuffer || !mediaSourceBuffer.buffered.length) return;

  try {
    const index = mediaSourceBuffer.buffered.length - 1;
    const start = mediaSourceBuffer.buffered.start(index);
    const end = mediaSourceBuffer.buffered.end(index);
    const lag = end - video.currentTime;

    if (!mediaPlaybackStarted) {
      video.currentTime = Math.max(start, end - 0.9);
      video.playbackRate = 1;
      mediaPlaybackStarted = true;
    } else if (lag > 2.4) {
      video.currentTime = Math.max(start, end - 1.0);
      video.playbackRate = 1.035;
    } else if (lag > 1.35) {
      video.playbackRate = 1.05;
    } else if (lag > 0.95) {
      video.playbackRate = 1.025;
    } else {
      video.playbackRate = 1;
    }

    void video.play().catch(() => {});

    if (!mediaModeActive) {
      mediaModeActive = true;
      video.style.display = "block";
      $("frame").style.display = "none";
      $("liveCanvas").style.display = "none";
      $("empty").style.display = "none";
      closeLiveSocket(false);
      setNudgeStatus("视频缓冲模式");
    }
  } catch {}
}

function fallbackFromMedia(message) {
  resetMediaPlayback();
  if (message) setNudgeStatus(message);
  if (!state.takeover && !state.externalLogin?.active) {
    liveFailed = false;
    liveSuperseded = false;
    ensureLiveSocket();
    refreshImage();
    const frame = $("frame");
    const canvas = $("liveCanvas");
    if (
      frame.style.display === "none" &&
      canvas.style.display === "none"
    ) {
      frame.style.display = "block";
    }
  }
}

function resetMediaPlayback() {
  mediaModeActive = false;
  mediaSourceOpening = false;
  mediaPlaybackStarted = false;
  mediaSegmentQueue = [];
  mediaStreamId = "";
  mediaMimeType = "";
  mediaSourceBuffer = null;

  if (mediaSource && mediaSource.readyState === "open") {
    try { mediaSource.endOfStream(); } catch {}
  }
  mediaSource = null;

  const video = $("mediaVideo");
  try { video.pause(); } catch {}
  video.style.display = "none";
  video.removeAttribute("src");
  try { video.load(); } catch {}

  if (mediaSourceUrl) {
    try { URL.revokeObjectURL(mediaSourceUrl); } catch {}
    mediaSourceUrl = "";
  }
}

function closeMediaSocket(
  clearPlayback = true,
  suppressLiveFallback = false,
  closeCode = 1000
) {
  if (mediaRetryTimer) {
    clearTimeout(mediaRetryTimer);
    mediaRetryTimer = null;
  }
  const socket = mediaSocket;
  mediaSocket = null;
  mediaSocketUrl = "";
  if (socket) {
    try {
      socket.close(closeCode, closeCode === 1000 ? "media viewer reset" : "companion leave");
    } catch {}
  }

  const wasActive = mediaModeActive;
  if (clearPlayback) resetMediaPlayback();

  if (
    wasActive &&
    !suppressLiveFallback &&
    !state.takeover &&
    !state.externalLogin?.active
  ) {
    liveFailed = false;
    liveSuperseded = false;
    ensureLiveSocket();
  }
}

function formatCompanionTime(value) {
  const seconds = Number(value);
  if (!Number.isFinite(seconds) || seconds < 0) return "--:--";
  const whole = Math.floor(seconds);
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  if (hours > 0) {
    return String(hours) + ":" + String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
  }
  return String(minutes).padStart(2, "0") + ":" + String(secs).padStart(2, "0");
}

function parseCompanionTimelineMetadata(text) {
  const numberTag = (name) => {
    const match = text.match(new RegExp("#TONGPING-" + name + ":([-+]?[0-9]+(?:\\.[0-9]+)?)"));
    if (!match) return null;
    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  };
  const anchorPts = numberTag("SOURCE-ANCHOR-PTS");
  const anchorDateMs = numberTag("SOURCE-ANCHOR-DATE-MS");
  const playbackRate = numberTag("SOURCE-PLAYBACK-RATE");
  const duration = numberTag("SOURCE-DURATION");
  const bufferStart = numberTag("BUFFER-START-PTS");
  const bufferEnd = numberTag("BUFFER-END-PTS");

  // Samples re-read the source every few seconds, so a looping clip or a
  // switched video maps correctly; the single anchor is only a fallback.
  const samples = [];
  for (const line of text.split(String.fromCharCode(10))) {
    if (!line.startsWith("#TONGPING-SOURCE-SAMPLE:")) continue;
    const parts = line.slice("#TONGPING-SOURCE-SAMPLE:".length).trim().split(",");
    const dateMs = Number(parts[0]);
    const pts = Number(parts[1]);
    const rate = Number(parts[2]);
    const sampleDuration = parts[3] === "-" ? null : Number(parts[3]);
    if (!Number.isFinite(dateMs) || !Number.isFinite(pts) || !Number.isFinite(rate) || rate < 0) continue;
    samples.push({
      dateMs,
      pts,
      rate,
      duration: sampleDuration !== null && Number.isFinite(sampleDuration) && sampleDuration > 0
        ? sampleDuration
        : null
    });
  }
  if (samples.length > 0) {
    samples.sort((a, b) => a.dateMs - b.dateMs);
    companionSourceSamples = samples;
  }

  if (anchorPts !== null) companionSourceAnchorPts = anchorPts;
  if (anchorDateMs !== null) companionSourceAnchorDateMs = anchorDateMs;
  if (playbackRate !== null && playbackRate > 0) companionSourcePlaybackRate = playbackRate;
  if (duration !== null && duration >= 0) companionSourceDuration = duration;
  if (bufferStart !== null) companionBufferStartPts = bufferStart;
  if (bufferEnd !== null) companionBufferEndPts = bufferEnd;
}

function applyCompanionSourceSample(presentationDateMs) {
  if (presentationDateMs === null || companionSourceSamples.length === 0) return;
  let pick = companionSourceSamples[0];
  for (const sample of companionSourceSamples) {
    if (sample.dateMs > presentationDateMs) break;
    pick = sample;
  }
  companionSourceAnchorPts = pick.pts;
  companionSourceAnchorDateMs = pick.dateMs;
  // A paused source has rate 0; keep a tiny positive rate so seek math that
  // divides by it stays finite.
  companionSourcePlaybackRate = pick.rate > 0 ? pick.rate : 0.000001;
  if (pick.duration !== null) companionSourceDuration = pick.duration;
}

function currentCompanionSourcePts(video = $("mediaVideo")) {
  const presentationDateMs = companionPresentationDateMs(video);
  applyCompanionSourceSample(presentationDateMs);
  if (
    presentationDateMs !== null &&
    companionSourceAnchorPts !== null &&
    companionSourceAnchorDateMs !== null &&
    companionSourcePlaybackRate > 0
  ) {
    const pts = Math.max(
      0,
      companionSourceAnchorPts +
        ((presentationDateMs - companionSourceAnchorDateMs) / 1000) *
          companionSourcePlaybackRate
    );
    return companionSourceDuration !== null && companionSourceDuration > 0
      ? Math.min(pts, companionSourceDuration)
      : pts;
  }

  if (
    companionBufferStartPts !== null &&
    companionBufferEndPts !== null &&
    video.seekable &&
    video.seekable.length > 0
  ) {
    try {
      const start = video.seekable.start(0);
      const end = video.seekable.end(video.seekable.length - 1);
      if (end > start) {
        const ratio = Math.max(0, Math.min(1, (video.currentTime - start) / (end - start)));
        return companionBufferStartPts +
          ratio * (companionBufferEndPts - companionBufferStartPts);
      }
    } catch {}
  }
  return null;
}

function sourcePtsToBufferedMediaTime(targetPts, video = $("mediaVideo")) {
  if (
    companionSourceAnchorPts !== null &&
    companionSourceAnchorDateMs !== null &&
    companionSourcePlaybackRate > 0 &&
    typeof video.getStartDate === "function"
  ) {
    try {
      const startDate = video.getStartDate();
      const startMs =
        startDate instanceof Date && Number.isFinite(startDate.getTime())
          ? startDate.getTime()
          : NaN;
      if (Number.isFinite(startMs)) {
        const targetDateMs =
          companionSourceAnchorDateMs +
          ((targetPts - companionSourceAnchorPts) / companionSourcePlaybackRate) * 1000;
        return (targetDateMs - startMs) / 1000;
      }
    } catch {}
  }

  if (
    companionBufferStartPts !== null &&
    companionBufferEndPts !== null &&
    companionBufferEndPts > companionBufferStartPts &&
    video.seekable &&
    video.seekable.length > 0
  ) {
    try {
      const start = video.seekable.start(0);
      const end = video.seekable.end(video.seekable.length - 1);
      const ratio =
        (targetPts - companionBufferStartPts) /
        (companionBufferEndPts - companionBufferStartPts);
      return start + Math.max(0, Math.min(1, ratio)) * (end - start);
    } catch {}
  }
  return null;
}

function renderCompanionTimeline() {
  const root = $("companionTimeline");
  if (!root) return;
  root.classList.toggle("on", companionModeActive);
  if (!companionModeActive) return;

  const video = $("mediaVideo");
  const currentSourcePts = currentCompanionSourcePts(video);
  const slider = $("companionSeek");
  const duration =
    companionSourceDuration !== null && companionSourceDuration > 0
      ? companionSourceDuration
      : null;

  if (duration !== null) {
    slider.max = String(duration);
    slider.disabled = companionSeekPending;
    if (!companionSeekDragging && currentSourcePts !== null) {
      slider.value = String(Math.max(0, Math.min(duration, currentSourcePts)));
    }
    $("timelineDuration").textContent = formatCompanionTime(duration);
  } else {
    slider.max = "1";
    slider.disabled = true;
    $("timelineDuration").textContent = "--:--";
  }

  const shownPts = companionSeekDragging ? Number(slider.value) : currentSourcePts;
  $("timelineCurrent").textContent = formatCompanionTime(shownPts);

  const buffered = $("timelineBuffered");
  if (
    duration !== null &&
    companionBufferStartPts !== null &&
    companionBufferEndPts !== null
  ) {
    const left = Math.max(0, Math.min(100, companionBufferStartPts / duration * 100));
    const right = Math.max(left, Math.min(100, companionBufferEndPts / duration * 100));
    buffered.style.left = left.toFixed(3) + "%";
    buffered.style.width = (right - left).toFixed(3) + "%";
    $("timelineHint").textContent =
      formatCompanionTime(companionBufferStartPts) + " – " +
      formatCompanionTime(companionBufferEndPts) + " 已缓存";
  } else {
    buffered.style.left = "0%";
    buffered.style.width = "0%";
    $("timelineHint").textContent = companionSeekPending
      ? "正在从新位置重建缓存…"
      : "等待缓存时间轴";
  }
}

async function seekCompanionToSource(targetPts) {
  if (!companionModeActive || companionSeekPending) return;
  // Seeking rebuilds the capture at the new position and plays from there.
  if (companionUserPaused) {
    companionUserPaused = false;
    hidePausedOverlay();
    sendCompanionPause();
  }
  const target = Math.max(
    0,
    companionSourceDuration !== null
      ? Math.min(companionSourceDuration, Number(targetPts) || 0)
      : Number(targetPts) || 0
  );
  const insideBuffer =
    companionBufferStartPts !== null &&
    companionBufferEndPts !== null &&
    target >= companionBufferStartPts - 0.25 &&
    target <= companionBufferEndPts + 0.25;

  const video = $("mediaVideo");
  if (insideBuffer) {
    const mediaTime = sourcePtsToBufferedMediaTime(target, video);
    if (mediaTime !== null && Number.isFinite(mediaTime)) {
      try {
        video.currentTime = Math.max(0, mediaTime);
        setNudgeStatus("缓存内跳转 · " + formatCompanionTime(target) + " · 保持陪看");
        sendCompanionPlaybackStatus();
        renderCompanionTimeline();
        return;
      } catch {}
    }
  }

  companionSeekPending = true;
  companionPhase = "preparing";
  companionVideoStarted = false;
  companionPlaybackArmed = false;
  companionBufferedSeconds = 0;
  companionBufferStartPts = null;
  companionBufferEndPts = null;
  try { video.pause(); } catch {}
  video.removeAttribute("src");
  try { video.load(); } catch {}
  video.style.display = "none";
  $("companionPrep").classList.add("on");
  $("companionPrepTitle").textContent = "正在从新位置接回…";
  $("companionPrepText").textContent =
    "目标 " + formatCompanionTime(target) +
    " 超出当前缓存，正在让电脑端跳转并重新建立 20 秒音画缓存。";
  $("companionCounter").textContent =
    "重新缓存 0 / " + companionDelaySeconds + " 秒";
  renderCompanionTimeline();

  try {
    await call(
      "browser_app_companion_seek_source",
      actorArgs({ targetSeconds: target })
    );
    companionSourceAnchorPts = target;
    companionSourceAnchorDateMs = Date.now();
    companionSourcePlaybackRate = 1;
    mediaSessionBlocked = false;

    video.controls = false;
    video.autoplay = true;
    video.playsInline = true;
    video.muted = false;
    video.classList.add("companionPlayback");
    video.src = companionPlaybackWaitUrl();
    companionPlaybackArmed = true;
    try { video.load(); } catch {}
    void video.play().catch(() => {
      companionPlaybackArmed = false;
    });
    updateCompanionPreparingUi();
    scheduleCompanionProbe(250);
  } catch (error) {
    setError(error && error.message ? error.message : error);
    setNudgeStatus("跳转失败");
  } finally {
    companionSeekPending = false;
    renderCompanionTimeline();
  }
}

function updateCompanionPreparingUi() {
  if (!companionModeActive) return;
  const cachedSeconds = Math.max(
    0,
    Math.min(companionDelaySeconds, Math.floor(companionBufferedSeconds))
  );
  const progress = Math.max(
    4,
    Math.min(100, cachedSeconds / companionDelaySeconds * 100)
  );
  $("companionProgressBar").style.width = progress.toFixed(1) + "%";
  $("companionCounter").textContent =
    "缓存 " + cachedSeconds + " / " + companionDelaySeconds + " 秒";

  if (companionPhase === "ready") {
    $("companionPrepTitle").textContent = "缓存好了，正在自动开始…";
    $("companionCounter").textContent =
      "缓存 " + companionDelaySeconds + " / " + companionDelaySeconds + " 秒";
    $("companionPrepText").textContent =
      "不需要再点；正在沿同一条录制时间轴自动接回音画。";
    return;
  }
  if (companionCaptureIssue && cachedSeconds < 1 && companionPhase === "preparing") {
    $("companionPrepTitle").textContent =
      companionCaptureIssue === "locked"
        ? "电脑好像锁屏了"
        : companionCaptureIssue === "no-video"
          ? "电脑页面上还没有视频"
          : "电脑那边还没开始录";
    $("companionPrepText").textContent =
      companionCaptureIssue === "locked"
        ? "锁屏或屏幕睡着时没法共享画面。解锁电脑后会自动接上，不用再点。"
        : companionCaptureIssue === "no-video"
          ? "在电脑页面上点开一个视频，就会自动开始录。"
          : "正在自动重试，不用再点。";
    return;
  }
  if (companionPhase === "buffering") {
    $("companionPrepTitle").textContent = "正在接回缓存…";
    $("companionPrepText").textContent =
      "网络刚刚抖了一下，先不追电脑端，等音画一起接回来。";
    return;
  }

  if (cachedSeconds >= companionDelaySeconds) {
    $("companionPrepTitle").textContent = "缓存已满，正在等起播片段…";
    $("companionPrepText").textContent =
      "音画缓存已经达到 " + companionDelaySeconds +
      " 秒；播放器正在等首批可播放 HLS 片段，不需要再点。";
    return;
  }

  $("companionPrepTitle").textContent = "正在攒一点点画面…";
  $("companionPrepText").textContent =
    "真实缓存 " + cachedSeconds + " 秒；达到 " +
    companionDelaySeconds + " 秒后自动开始。";
}

function clearCompanionProbe() {
  if (companionProbeTimer) {
    clearTimeout(companionProbeTimer);
    companionProbeTimer = null;
  }
}

function scheduleCompanionProbe(delay = 700) {
  clearCompanionProbe();
  companionProbeTimer = setTimeout(() => {
    companionProbeTimer = null;
    void probeCompanionPlaylist();
  }, delay);
}

async function probeCompanionPlaylist() {
  if (!companionModeActive || state.takeover) return;
  updateCompanionPreparingUi();

  try {
    const url = companionPlaylistUrl();
    const response = await fetch(
      url + (url.includes("?") ? "&" : "?") + "_probe=" + Date.now(),
      { cache: "no-store" }
    );
    const text = response.ok ? await response.text() : "";
    const streamMatch = text.match(
      /#TONGPING-STREAM-ID:([^\\r\\n]+)/
    );
    const nextStreamId = streamMatch ? String(streamMatch[1] || "").trim() : "";
    const video = $("mediaVideo");
    const streamChanged =
      Boolean(nextStreamId) &&
      Boolean(companionStreamId) &&
      nextStreamId !== companionStreamId;
    if (nextStreamId) companionStreamId = nextStreamId;

    companionCaptureIssue =
      text.indexOf("#TONGPING-CAPTURE-ISSUE:locked") >= 0
        ? "locked"
        : text.indexOf("#TONGPING-CAPTURE-ISSUE:no-video") >= 0
          ? "no-video"
          : text.indexOf("#TONGPING-CAPTURE-ISSUE:retrying") >= 0
            ? "retrying"
            : "";
    const bufferedMatch = text.match(
      /#TONGPING-BUFFERED-SECONDS:([0-9]+(?:\.[0-9]+)?)/
    );
    if (bufferedMatch) {
      companionBufferedSeconds = Math.max(
        0,
        Number(bufferedMatch[1]) || 0
      );
      updateCompanionPreparingUi();
    }
    parseCompanionTimelineMetadata(text);
    renderCompanionTimeline();
    const segmentCount = text
      .split(/\\r?\\n/)
      .map((line) => line.trim())
      .filter((line) => /\\.m4s(?:\\?|$)/.test(line))
      .length;

    if (streamChanged) {
      // A replacement recorder starts a new media timeline. Safari can hold
      // the old currentTime beyond every segment in that generation; reload
      // the same _playwait source once, then resume from its new window.
      companionVideoStarted = false;
      if (segmentCount >= 2) {
        companionLastRecoveryLoadAt = Date.now();
        companionLastProgressTime = 0;
        companionLastProgressAt = 0;
        video.load();
      }
    }

    const now = Date.now();
    const stalledPlayback =
      companionVideoStarted &&
      companionLastProgressAt > 0 &&
      now - companionLastProgressAt >= 6000 &&
      video.readyState < 3 &&
      !companionSeekPending &&
      now - companionLastUserMediaInteractionAt >= 1800;
    if (companionUserPaused) {
      scheduleCompanionProbe(1500);
      return;
    }
    if (segmentCount >= 2 &&
        (!companionVideoStarted || video.paused || stalledPlayback)) {
      video.style.display = "block";
      if ((video.paused || stalledPlayback) && !video.ended) {
        try {
          // A transient low-buffer pause needs play(), not another load().
          // Only reset an errored or genuinely stalled HLS source, at most
          // once per recovery window, preserving the same _playwait URL.
          if ((video.error || stalledPlayback) &&
              now - companionLastRecoveryLoadAt >= 8000) {
            companionLastRecoveryLoadAt = now;
            video.load();
          }
          await video.play();
          companionPlaybackArmed = true;
        } catch (error) {
          companionVideoStarted = false;
          companionPhase = "ready";
          const detail =
            error && error.name
              ? String(error.name) + (error.message ? ": " + String(error.message) : "")
              : String(error || "play rejected");
          setNudgeStatus("自动起播重试中 · " + detail);
          updateCompanionPreparingUi();
          render();
          scheduleCompanionProbe(900);
          return;
        }
      }
      companionVideoStarted = !video.paused && !video.ended;
      companionPlaybackArmed = companionVideoStarted || companionPlaybackArmed;
      if (!companionVideoStarted) {
        companionPhase = "ready";
        updateCompanionPreparingUi();
        render();
      }
      scheduleCompanionProbe(companionVideoStarted ? 1500 : 900);
      return;
    }
  } catch {}

  if (companionModeActive) {
    scheduleCompanionProbe(companionVideoStarted ? 1500 : 1200);
  }
}

function companionPresentationDateMs(video) {
  try {
    if (typeof video.getStartDate === "function") {
      const start = video.getStartDate();
      const startMs =
        start instanceof Date && Number.isFinite(start.getTime())
          ? start.getTime()
          : NaN;
      const currentTime = Number(video.currentTime);
      if (
        Number.isFinite(startMs) &&
        Number.isFinite(currentTime) &&
        currentTime >= 0
      ) {
        return Math.round(startMs + currentTime * 1000);
      }
    }
  } catch {}
  return null;
}

function sendCompanionPlaybackStatus() {
  if (
    !companionModeActive ||
    !mediaSocket ||
    mediaSocket.readyState !== WebSocket.OPEN
  ) {
    return;
  }
  const video = $("mediaVideo");
  const currentTime = Number(video.currentTime);
  const duration = Number(video.duration);
  const sourcePts = currentCompanionSourcePts(video);
  renderCompanionTimeline();
  try {
    mediaSocket.send(JSON.stringify({
      type: "companion_playback_status",
      currentTime:
        Number.isFinite(currentTime) && currentTime >= 0
          ? currentTime
          : null,
      duration:
        Number.isFinite(duration) && duration >= 0
          ? duration
          : null,
      sourcePts,
      bufferStartPts: companionBufferStartPts,
      bufferEndPts: companionBufferEndPts,
      sourceDuration: companionSourceDuration,
      presentationDateMs: companionPresentationDateMs(video),
      paused: video.paused === true,
      ended: video.ended === true,
      readyState: Number(video.readyState || 0),
      wallClockAt: Date.now()
    }));
  } catch {}
}

function startCompanionPlaybackStatus() {
  if (companionPlaybackStatusTimer) {
    clearInterval(companionPlaybackStatusTimer);
  }
  sendCompanionPlaybackStatus();
  companionPlaybackStatusTimer = setInterval(() => {
    sendCompanionPlaybackStatus();
  }, 500);
}

function stopCompanionPlaybackStatus() {
  if (!companionPlaybackStatusTimer) return;
  clearInterval(companionPlaybackStatusTimer);
  companionPlaybackStatusTimer = null;
}

function companionPlaylistUrl() {
  if (!state.companionHlsUrl) return "";
  try {
    const url = new URL(state.companionHlsUrl);
    url.searchParams.set("delay", String(companionDelaySeconds));
    // Name this watch session on every playlist request, so the server drops
    // older buffered media even if this request beats companion_ready.
    if (companionModeActive && companionStartedAt) {
      url.searchParams.set("entry", String(companionStartedAt));
    }
    return url.toString();
  } catch {
    return state.companionHlsUrl;
  }
}

function companionPlaybackWaitUrl() {
  const base = companionPlaylistUrl();
  if (!base) return "";
  try {
    const url = new URL(base);
    url.searchParams.set("_playwait", "1");
    url.searchParams.set("_play", String(Date.now()));
    return url.toString();
  } catch {
    return (
      base +
      (base.includes("?") ? "&" : "?") +
      "_playwait=1&_play=" +
      Date.now()
    );
  }
}

function stopCompanionPlayback(returnToLive = true) {
  companionModeActive = false;
  companionUserPaused = false;
  hidePausedOverlay();
  companionPhase = "idle";
  companionStartedAt = 0;
  companionVideoStarted = false;
  companionPlaybackArmed = false;
  companionBufferedSeconds = 0;
  companionSourceAnchorPts = null;
  companionSourceAnchorDateMs = null;
  companionSourcePlaybackRate = 1;
  companionSourceDuration = null;
  companionSourceSamples = [];
  companionStreamId = "";
  companionBufferStartPts = null;
  companionBufferEndPts = null;
  companionSeekPending = false;
  clearCompanionBufferingCheck();
  companionLastProgressTime = 0;
  companionLastProgressAt = 0;
  companionLastRecoveryLoadAt = 0;
  companionLastUserMediaInteractionAt = 0;
  companionAiWatchRequested = false;
  if (companionAutoResumeTimer) {
    clearTimeout(companionAutoResumeTimer);
    companionAutoResumeTimer = null;
  }
  clearCompanionProbe();
  stopCompanionPlaybackStatus();

  if (companionReconnectTimer) {
    clearTimeout(companionReconnectTimer);
    companionReconnectTimer = null;
  }

  const video = $("mediaVideo");
  try { video.pause(); } catch {}
  video.controls = false;
  video.muted = true;
  video.classList.remove("companionPlayback");
  video.removeAttribute("src");
  try { video.load(); } catch {}
  video.style.display = "none";

  $("companionPrep").classList.remove("on");
  $("companionProgressBar").style.width = "4%";

  // 4001 tells the server she chose LIVE, so it frees the uplink at once.
  closeMediaSocket(false, true, returnToLive ? 4001 : 1000);

  if (
    returnToLive &&
    !state.takeover &&
    !state.externalLogin?.active
  ) {
    liveFailed = false;
    liveSuperseded = false;
    ensureLiveSocket();
    refreshImage();
  }
  render();
}

async function startAiCompanionWatch() {
  if (
    companionAiWatchRequested ||
    !companionModeActive ||
    !companionVideoStarted ||
    chatMuted.has(normalizeIdentity(state.identity))
  ) {
    return;
  }
  companionAiWatchRequested = true;
  try {
    await app.updateModelContext({
      content: [{
        type: "text",
        text:
          "同屏陪看正在播放；identity=" + state.identity +
          "；profile=" + state.profile +
          "。这是持续陪看，不是单帧查看。先调用 browser_companion_context，再调用 browser_companion_tick；处理并 commit 每个 perceptionReceipt，随后在 continueWatching=true 时继续调用 tick，直到暂停、结束或不可用。只在确实有自然反应时用 browser_app_chat_push 发进群聊，不要逐帧复述。"
      }]
    });
    const result = await app.sendMessage({
      role: "user",
      content: [{
        type: "text",
        text:
          "【同屏 · 陪看开始】视频已经开始播放。请进入持续陪看：先读取 browser_companion_context，再每隔几秒调用 browser_companion_tick；看完并提交每一帧后继续下一次，直到视频暂停或结束。不要只看一帧就退出。"
      }]
    });
    if (result && result.isError) {
      throw new Error("宿主拒绝开始持续陪看");
    }
  } catch (error) {
    companionAiWatchRequested = false;
    setError(error && error.message ? error.message : error);
  }
}

function sendCompanionPause() {
  if (!mediaSocket || mediaSocket.readyState !== WebSocket.OPEN) return;
  try {
    mediaSocket.send(JSON.stringify({
      type: "companion_pause",
      paused: companionUserPaused
    }));
  } catch {}
}

// Hold the paused frame on screen ourselves: some hosts' players show
// nothing while an HLS element is paused.
function showPausedOverlay(video) {
  const image = $("pausedFrame");
  image.removeAttribute("src");
  try {
    if (video.videoWidth > 0 && video.videoHeight > 0) {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
      image.src = canvas.toDataURL("image/jpeg", 0.86);
    }
  } catch {}
  $("pausedOverlay").hidden = false;
}
function hidePausedOverlay() {
  $("pausedOverlay").hidden = true;
  $("pausedFrame").removeAttribute("src");
}

function toggleCompanionUserPause() {
  if (!companionModeActive) return;
  const video = $("mediaVideo");
  companionUserPaused = !companionUserPaused;
  companionLastUserMediaInteractionAt = Date.now();
  if (companionAutoResumeTimer) {
    clearTimeout(companionAutoResumeTimer);
    companionAutoResumeTimer = null;
  }
  clearCompanionBufferingCheck();
  sendCompanionPause();
  if (companionUserPaused) {
    showPausedOverlay(video);
    try { video.pause(); } catch {}
    setNudgeStatus("已暂停 · 电脑端也停在这里");
  } else {
    hidePausedOverlay();
    companionLastProgressAt = 0;
    void video.play().catch(() => {
      scheduleCompanionProbe(300);
    });
    setNudgeStatus("继续陪看");
  }
  sendCompanionPlaybackStatus();
  render();
}

async function toggleCompanionMode() {
  if (companionModeActive) {
    stopCompanionPlayback(true);
    setNudgeStatus("已回到 LIVE");
    return;
  }
  if (!state.mediaUrl || !state.companionHlsUrl) {
    setError("陪看模式还没准备好");
    return;
  }

  closeAudioSocket(true);
  closeMediaSocket(true, true);
  closeLiveSocket(false);

  companionModeActive = true;
  companionUserPaused = false;
  companionStreamId = "";
  companionSourceSamples = [];
  companionLastUserMediaInteractionAt = 0;
  companionAiWatchRequested = false;
  if (companionAutoResumeTimer) {
    clearTimeout(companionAutoResumeTimer);
    companionAutoResumeTimer = null;
  }
  companionPhase = "preparing";
  companionStartedAt = Date.now();
  companionVideoStarted = false;
  companionBufferedSeconds = 0;
  mediaSessionBlocked = false;

  const video = $("mediaVideo");
  video.controls = false;
  video.autoplay = true;
  video.playsInline = true;
  video.muted = false;
  video.classList.add("companionPlayback");
  video.src = companionPlaybackWaitUrl();
  video.style.display = "none";
  companionPlaybackArmed = true;
  try { video.load(); } catch {}
  void video.play().catch(() => {
    companionPlaybackArmed = false;
  });

  $("frame").style.display = "none";
  $("liveCanvas").style.display = "none";
  $("empty").style.display = "none";
  $("companionProgressBar").style.width = "4%";

  ensureMediaSocket();
  startCompanionPlaybackStatus();
  updateCompanionPreparingUi();
  setNudgeStatus(
    "陪看准备中 · 正在积攒音画缓存 · 随时可回 LIVE"
  );
  render();
  renderCompanionTimeline();
  scheduleCompanionProbe(250);
}

async function startPreparedCompanionPlayback() {
  if (!companionModeActive) return;
  const video = $("mediaVideo");
  try {
    video.muted = false;
    await video.play();
    companionVideoStarted = !video.paused && !video.ended;
    companionPlaybackArmed = companionVideoStarted || companionPlaybackArmed;
  } catch (error) {
    const detail =
      error && error.name
        ? String(error.name) + (error.message ? ": " + String(error.message) : "")
        : String(error || "play rejected");
    setNudgeStatus("自动起播重试中 · " + detail);
    companionPhase = "ready";
    updateCompanionPreparingUi();
    render();
    scheduleCompanionProbe(900);
  }
}

function sendAudioReady() {
  const socket = audioSocket;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  try {
    socket.send(JSON.stringify({ type: "audio_ready" }));
  } catch {}
}

function sendAudioStatus() {
  const socket = audioSocket;
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  const now =
    audioContext && Number.isFinite(audioContext.currentTime)
      ? audioContext.currentTime
      : 0;
  const gain =
    audioOutputGain && audioOutputGain.gain
      ? Number(audioOutputGain.gain.value)
      : 0;
  try {
    socket.send(JSON.stringify({
      type: "audio_status",
      enabled: audioEnabled === true,
      contextState: audioContext ? String(audioContext.state || "") : "none",
      packetsReceived: audioPacketsReceived,
      scheduledAheadMs: Math.round((audioNextTime - now) * 1000),
      pcmRms: audioLastPcmRms,
      gain: Number.isFinite(gain) ? gain : 0,
      presentationClock: presentationSourceNowMs() !== null,
      liveRenderedCapturedAt,
      liveFrameAgeMs: liveRenderedAtMs ? Math.max(0, Date.now() - liveRenderedAtMs) : -1,
      audioCapturedAt: audioLastCapturedAt,
      syncErrorMs: audioSyncErrorMs
    }));
  } catch {}
}

function startAudioStatusTimer() {
  if (audioStatusTimer) clearInterval(audioStatusTimer);
  audioStatusTimer = setInterval(() => {
    sendAudioStatus();
  }, 1000);
}

function stopAudioStatusTimer() {
  if (!audioStatusTimer) return;
  clearInterval(audioStatusTimer);
  audioStatusTimer = null;
}

function ensureAudioOutputGain() {
  if (!audioContext) return null;
  if (audioOutputGain) return audioOutputGain;
  const gain = audioContext.createGain();
  gain.gain.value = 1;
  gain.connect(audioContext.destination);
  audioOutputGain = gain;
  return gain;
}

function presentationSourceNowMs() {
  if (!liveRenderedCapturedAt || !liveRenderedAtMs) return null;
  const frameAgeMs = Date.now() - liveRenderedAtMs;
  if (
    !Number.isFinite(frameAgeMs) ||
    frameAgeMs < 0 ||
    frameAgeMs > AV_SYNC_MAX_FRAME_AGE_MS
  ) {
    return null;
  }
  return liveRenderedCapturedAt + frameAgeMs;
}

function desiredAudioAheadSeconds(capturedAt) {
  const sourceNow = presentationSourceNowMs();
  if (
    sourceNow === null ||
    !Number.isSafeInteger(capturedAt) ||
    capturedAt <= 0
  ) {
    return null;
  }
  const sourceLeadSeconds = (capturedAt - sourceNow) / 1000;
  return Math.max(
    AV_SYNC_MIN_AHEAD,
    Math.min(
      AV_SYNC_MAX_AHEAD,
      sourceLeadSeconds + AV_SYNC_BASE_AHEAD
    )
  );
}

function resetAudioSchedule(now, crossfade = true, targetAhead = AUDIO_TARGET_AHEAD) {
  if (!audioContext) return;
  const oldGain = audioOutputGain;
  const oldSources = [...audioScheduledSources];
  audioScheduledSources.clear();

  if (oldGain && crossfade) {
    try {
      oldGain.gain.cancelScheduledValues(now);
      oldGain.gain.setValueAtTime(oldGain.gain.value, now);
      oldGain.gain.linearRampToValueAtTime(0, now + 0.012);
    } catch {}
  }

  for (const source of oldSources) {
    try { source.stop(now + (crossfade ? 0.014 : 0)); } catch {}
  }

  if (oldGain) {
    setTimeout(() => {
      try { oldGain.disconnect(); } catch {}
    }, 50);
  }

  const nextGain = audioContext.createGain();
  nextGain.gain.setValueAtTime(crossfade ? 0 : 1, now);
  if (crossfade) {
    nextGain.gain.linearRampToValueAtTime(1, now + 0.014);
  }
  nextGain.connect(audioContext.destination);
  audioOutputGain = nextGain;
  audioNextTime = now + Math.max(
    AV_SYNC_MIN_AHEAD,
    Math.min(AV_SYNC_MAX_AHEAD, targetAhead)
  );
}

function audioSequenceDelta(sequence, previous) {
  if (previous === null) return 1;
  return (sequence - previous + 0x100000000) % 0x100000000;
}

function scheduleAudioPacket(buffer) {
  if (
    !audioEnabled ||
    !audioContext ||
    !(buffer instanceof ArrayBuffer) ||
    buffer.byteLength < 26
  ) {
    sendAudioReady();
    return;
  }

  const view = new DataView(buffer);
  const sequence = view.getUint32(0);
  const sampleRate = view.getUint32(4);
  const channels = view.getUint32(8);
  const frames = view.getUint32(12);
  const capturedAt =
    view.getUint32(16) * 4294967296 + view.getUint32(20);
  const payloadBytes = buffer.byteLength - 24;

  if (
    sampleRate < 8000 ||
    sampleRate > 96000 ||
    channels !== 1 ||
    frames < 1 ||
    !Number.isSafeInteger(capturedAt) ||
    capturedAt <= 0 ||
    payloadBytes !== frames * 2
  ) {
    sendAudioReady();
    return;
  }

  if (audioContext.state !== "running") {
    void audioContext.resume().catch(() => {});
    sendAudioReady();
    return;
  }

  const now = audioContext.currentTime;
  const packetSeconds = frames / sampleRate;
  const delta = audioSequenceDelta(sequence, audioLastSequence);

  // Duplicate or stale packet: never replay it.
  if (delta === 0 || delta > 0x80000000) {
    sendAudioReady();
    return;
  }

  // A small sequence hole becomes silence instead of repeating/overlapping
  // audio. When a presented realtime video clock exists, audio follows that
  // same source capturedAt clock instead of independently chasing wall time.
  const gapPackets = Math.max(0, delta - 1);
  const desiredAhead = desiredAudioAheadSeconds(capturedAt);
  const ahead = audioNextTime - now;

  if (desiredAhead !== null) {
    const desiredStart = now + desiredAhead;
    const syncErrorSeconds =
      Number.isFinite(audioNextTime) ? desiredStart - audioNextTime : 0;
    audioSyncErrorMs = Math.round(syncErrorSeconds * 1000);

    if (
      !Number.isFinite(audioNextTime) ||
      Math.abs(audioSyncErrorMs) > AV_SYNC_HARD_RESET_MS ||
      gapPackets > AUDIO_MAX_SMALL_GAP_PACKETS
    ) {
      resetAudioSchedule(
        now,
        audioScheduledSources.size > 0,
        desiredAhead
      );
      audioSyncErrorMs = 0;
    } else {
      const nudge = Math.max(
        -AV_SYNC_NUDGE_PER_PACKET,
        Math.min(AV_SYNC_NUDGE_PER_PACKET, syncErrorSeconds * 0.18)
      );
      audioNextTime += nudge;
      if (gapPackets > 0) {
        audioNextTime += gapPackets * packetSeconds;
      }
    }
  } else if (
    !Number.isFinite(audioNextTime) ||
    ahead < AUDIO_MIN_AHEAD ||
    ahead > AUDIO_MAX_AHEAD ||
    gapPackets > AUDIO_MAX_SMALL_GAP_PACKETS
  ) {
    audioSyncErrorMs = 0;
    resetAudioSchedule(now, audioScheduledSources.size > 0);
  } else if (gapPackets > 0) {
    audioSyncErrorMs = 0;
    audioNextTime += gapPackets * packetSeconds;
  }

  audioLastSequence = sequence;
  audioLastCapturedAt = capturedAt;

  const pcmView = new DataView(buffer, 24);
  const samples = new Float32Array(frames);
  let sumSquares = 0;
  for (let i = 0; i < frames; i += 1) {
    const value = pcmView.getInt16(i * 2, true);
    const sample = value < 0 ? value / 32768 : value / 32767;
    samples[i] = sample;
    sumSquares += sample * sample;
  }
  audioPacketsReceived += 1;
  audioLastPcmRms = Math.sqrt(sumSquares / Math.max(1, frames));

  const audioBuffer = audioContext.createBuffer(1, frames, sampleRate);
  audioBuffer.copyToChannel(samples, 0);

  const gain = ensureAudioOutputGain();
  if (!gain) {
    sendAudioReady();
    return;
  }

  const source = audioContext.createBufferSource();
  source.buffer = audioBuffer;
  source.connect(gain);
  audioScheduledSources.add(source);
  source.onended = () => {
    audioScheduledSources.delete(source);
    try { source.disconnect(); } catch {}
  };
  source.start(audioNextTime);
  audioNextTime += packetSeconds;

  sendAudioReady();
}

function ensureAudioSocket() {
  if (!audioEnabled || !state.audioUrl) return;
  if (
    audioSocket &&
    audioSocketUrl === state.audioUrl &&
    (audioSocket.readyState === WebSocket.OPEN ||
     audioSocket.readyState === WebSocket.CONNECTING)
  ) {
    return;
  }

  if (audioRetryTimer) {
    clearTimeout(audioRetryTimer);
    audioRetryTimer = null;
  }
  closeAudioSocket(false);

  const socket = new WebSocket(state.audioUrl);
  socket.binaryType = "arraybuffer";
  audioSocket = socket;
  audioSocketUrl = state.audioUrl;

  socket.addEventListener("open", () => {
    if (audioSocket !== socket) return;
    audioRetryCount = 0;
    setNudgeStatus("声音已连接");
    startAudioStatusTimer();
    sendAudioStatus();
    // The server opens with a multi-second credit window. Replenishment is
    // one-for-one after packets are admitted to the short local jitter queue.
    sendAudioReady();
  });

  socket.addEventListener("message", (event) => {
    if (audioSocket !== socket) return;
    if (event.data instanceof ArrayBuffer) {
      scheduleAudioPacket(event.data);
      return;
    }
    if (event.data instanceof Blob) {
      void event.data.arrayBuffer().then((buffer) => {
        if (audioSocket === socket) scheduleAudioPacket(buffer);
      });
    }
  });

  socket.addEventListener("close", (event) => {
    if (audioSocket !== socket) return;
    audioSocket = null;
    audioSocketUrl = "";
    stopAudioStatusTimer();

    if (event && event.code === 1012) {
      audioEnabled = false;
      render();
      return;
    }
    scheduleAudioReconnect();
  });

  socket.addEventListener("error", () => {});
}

function scheduleAudioReconnect() {
  if (!audioEnabled || !state.audioUrl || audioRetryTimer) return;
  audioRetryCount += 1;
  const delay = Math.min(
    5000,
    400 * (2 ** Math.min(audioRetryCount, 4))
  );
  audioRetryTimer = setTimeout(() => {
    audioRetryTimer = null;
    ensureAudioSocket();
  }, delay);
}

function closeAudioSocket(disable = false) {
  if (audioRetryTimer) {
    clearTimeout(audioRetryTimer);
    audioRetryTimer = null;
  }

  const socket = audioSocket;
  audioSocket = null;
  audioSocketUrl = "";
  if (socket) {
    try { socket.close(1000, "audio disabled"); } catch {}
  }

  if (audioContext) {
    const now = audioContext.currentTime;
    for (const source of [...audioScheduledSources]) {
      try { source.stop(now); } catch {}
    }
    audioScheduledSources.clear();
    if (audioOutputGain) {
      try { audioOutputGain.disconnect(); } catch {}
      audioOutputGain = null;
    }
  }
  audioLastSequence = null;
  audioNextTime = 0;
  if (disable) {
    stopAudioStatusTimer();
    releasePlaybackAudioSession();
    audioEnabled = false;
    const ctx = audioContext;
    audioContext = null;
    if (ctx) void ctx.close().catch(() => {});
  }
}

// iOS mutes Web Audio under the ring/silent switch (video elements are
// exempt), so live sound arrived but stayed silent. Ask for a media
// playback session; older WebKit only switches category while an
// <audio> element is playing, hence the silent loop.
function isIosHost() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function silentWavUrl() {
  const frames = 4000;
  const buffer = new ArrayBuffer(44 + frames * 2);
  const view = new DataView(buffer);
  const text = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) view.setUint8(offset + i, value.charCodeAt(i));
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + frames * 2, true);
  text(8, "WAVE");
  text(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, frames * 2, true);
  return URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
}

function claimPlaybackAudioSession() {
  try {
    if (navigator.audioSession) navigator.audioSession.type = "playback";
  } catch {}
  if (!isIosHost()) return;
  try {
    if (!audioSessionKeepAlive) {
      const keepAlive = document.createElement("audio");
      keepAlive.loop = true;
      keepAlive.playsInline = true;
      keepAlive.setAttribute("playsinline", "");
      keepAlive.src = silentWavUrl();
      audioSessionKeepAlive = keepAlive;
    }
    void audioSessionKeepAlive.play().catch(() => {});
  } catch {}
}

function releasePlaybackAudioSession() {
  setAudioSessionType("auto");
  if (!audioSessionKeepAlive) return;
  try { audioSessionKeepAlive.pause(); } catch {}
}

function setAudioSessionType(type) {
  try {
    if (navigator.audioSession) navigator.audioSession.type = type;
  } catch {}
}

// "playback" forbids capture ("AudioSession category is not compatible with
// audio capture"), so hold-to-talk switches to play-and-record while it
// records and hands the session back afterwards.
function claimRecordingAudioSession() {
  setAudioSessionType("play-and-record");
}

function restoreAudioSessionAfterRecording() {
  setAudioSessionType(audioEnabled ? "playback" : "auto");
}

async function toggleAudio() {
  if (audioEnabled) {
    writePref("tongping-live-sound", "0");
    closeAudioSocket(true);
    setNudgeStatus("声音已关闭");
    render();
    return;
  }

  if (!state.audioUrl) {
    setError("声音通道还没准备好");
    return;
  }

  try {
    const AudioContextCtor =
      window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      throw new Error("当前宿主不支持 AudioContext");
    }

    claimPlaybackAudioSession();
    if (!audioContext || audioContext.state === "closed") {
      audioContext = new AudioContextCtor({
        latencyHint: "interactive"
      });
      audioContext.onstatechange = () => {
        sendAudioStatus();
      };
    }
    await audioContext.resume();

    audioEnabled = true;
    writePref("tongping-live-sound", "1");
    audioPacketsReceived = 0;
    audioLastPcmRms = 0;
    audioLastCapturedAt = 0;
    audioSyncErrorMs = 0;
    audioLastSequence = null;
    audioScheduledSources.clear();
    audioOutputGain = null;
    audioNextTime = audioContext.currentTime + AUDIO_TARGET_AHEAD;
    ensureAudioOutputGain();
    setError("");
    setNudgeStatus("正在连接声音…");
    render();
    ensureAudioSocket();
  } catch (error) {
    audioEnabled = false;
    render();
    setError(error && error.message ? error.message : error);
  }
}

function closeLiveSocket(clearImage = true) {
  if (liveRetryTimer) {
    clearTimeout(liveRetryTimer);
    liveRetryTimer = null;
  }
  const socket = liveSocket;
  liveSocket = null;
  liveSocketUrl = "";
  pendingLivePacket = null;
  liveRenderScheduled = false;
  liveNewestCapturedAt = 0;
  liveRenderedCapturedAt = 0;
  liveRenderedAtMs = 0;
  if (clearImage) {
    $("liveCanvas").style.display = "none";
  }
  if (socket) {
    try { socket.close(1000, "view reset"); } catch {}
  }
  if (clearImage && $("frame").dataset.mode === "live") {
    $("frame").removeAttribute("src");
    $("frame").removeAttribute("data-mode");
  }
}

function structured(result) {
  if (!result || typeof result !== "object") return null;
  return result.structuredContent && typeof result.structuredContent === "object"
    ? result.structuredContent
    : null;
}
async function call(name, args) {
  if (!connected) throw new Error("MCP App bridge 尚未连接");
  const result = await app.callServerTool({ name, arguments: args || {} });
  if (result && result.isError) {
    const text = Array.isArray(result.content)
      ? result.content.map((x) => x && x.type === "text" ? x.text : "").filter(Boolean).join(" ")
      : "工具调用失败";
    throw new Error(text || "工具调用失败");
  }
  return structured(result);
}
function actorArgs(extra) {
  state.identity = normalizeIdentity($("identity").value);
  state.profile = normalizeProfile($("profile").value);
  return Object.assign({ identity: state.identity, profile: state.profile }, extra || {});
}

// Names the server gave AIs (their link names), learned from chat messages.
const aiNames = new Map();

function chatDisplayName(role, who) {
  if (role === "user") return userShownName();
  const identity = normalizeIdentity(who || state.identity);
  if (aiNames.has(identity)) return aiNames.get(identity);
  if (!who && state.aiName) return state.aiName;
  // claude.code → Claude·code, gpt.work → GPT·work: who, then which entry.
  const dot = identity.indexOf(".");
  const name = dot > 0 ? identity.slice(0, dot) : identity;
  const entry = dot > 0 ? identity.slice(dot + 1) : "";
  const shown = name === "claude" ? "Claude" : name === "gpt" ? "GPT" : name.charAt(0).toUpperCase() + name.slice(1);
  return entry ? shown + "·" + entry : shown;
}

function appendChatMessage(message) {
  if (!message || typeof message !== "object") return;
  const role =
    message.role === "assistant"
      ? "assistant"
      : message.role === "user"
        ? "user"
        : "";
  const text =
    typeof message.text === "string"
      ? message.text.trim()
      : "";
  if (!role || !text) return;

  const id =
    typeof message.id === "string" && message.id
      ? message.id
      : "local-" +
        Date.now().toString(36) +
        "-" +
        Math.random().toString(36).slice(2, 8);

  if (chatMessageIds.has(id)) {
    const existing = chatMessages.find((item) => item.id === id);
    if (existing && Number.isFinite(Number(message.seq))) {
      existing.seq = Number(message.seq);
    }
    return;
  }

  chatMessageIds.add(id);
  if (role === "assistant" && typeof message.name === "string" && message.name.trim()) {
    aiNames.set(
      typeof message.identity === "string" && message.identity ? normalizeIdentity(message.identity) : normalizeIdentity(state.identity),
      message.name.trim().slice(0, 24),
    );
  }
  chatMessages.push({
    id,
    role,
    identity:
      typeof message.identity === "string" && message.identity
        ? normalizeIdentity(message.identity)
        : normalizeIdentity(state.identity),
    text,
    seq: Number.isFinite(Number(message.seq))
      ? Number(message.seq)
      : 0,
    createdAt:
      typeof message.createdAt === "string"
        ? message.createdAt
        : new Date().toISOString()
  });

  if (chatMessages.length > 200) {
    const removed = chatMessages.splice(
      0,
      chatMessages.length - 200
    );
    for (const item of removed) {
      chatMessageIds.delete(item.id);
    }
  }
}

function renderChat(forceBottom = false) {
  const root = $("chatMessages");
  if (!root) return;

  const nearBottom =
    root.scrollHeight - root.scrollTop - root.clientHeight < 48;
  root.textContent = "";

  // A new card opens clean: history from before it stays in the room (the
  // AIs still read it) and is one tap away, but is folded by default.
  const earlier = chatShowEarlier
    ? []
    : chatMessages.filter((m) => m.seq > 0 && m.seq <= chatEarlierThroughSeq);
  const visible = earlier.length
    ? chatMessages.filter((m) => !(m.seq > 0 && m.seq <= chatEarlierThroughSeq))
    : chatMessages;
  if (earlier.length > 0) {
    const more = document.createElement("button");
    more.type = "button";
    more.className = "chatEarlier";
    more.textContent = "↑ 查看之前的 " + earlier.length + " 条";
    more.addEventListener("click", () => {
      chatShowEarlier = true;
      renderChat(false);
    });
    root.appendChild(more);
  }

  if (visible.length === 0 && !chatPending) {
    const empty = document.createElement("div");
    empty.className = "chatEmpty";
    empty.textContent = "这里会同时显示你和 TA 的消息";
    root.appendChild(empty);
  }

  for (const message of visible) {
    const row = document.createElement("div");
    row.className =
      "chatRow " + message.role +
      (message.role === "assistant" ? " ai-" + message.identity : "");

    const bubble = document.createElement("div");
    bubble.className = "chatBubble";

    const who = document.createElement("span");
    who.className = "chatWho";
    who.textContent = chatDisplayName(message.role, message.identity);

    const body = document.createElement("span");
    body.textContent = message.text;

    bubble.appendChild(who);
    bubble.appendChild(body);
    row.appendChild(bubble);
    root.appendChild(row);
  }

  if (chatPending) {
    const row = document.createElement("div");
    row.className = "chatRow assistant";

    const bubble = document.createElement("div");
    bubble.className = "chatBubble";

    const who = document.createElement("span");
    who.className = "chatWho";
    who.textContent = chatDisplayName("assistant");

    const pending = document.createElement("span");
    pending.className = "chatPendingBubble";
    pending.setAttribute("aria-label", "正在回复");

    for (let i = 0; i < 3; i += 1) {
      const dot = document.createElement("span");
      dot.className = "chatTypingDot";
      pending.appendChild(dot);
    }

    bubble.appendChild(who);
    bubble.appendChild(pending);
    // The mirror into this panel depends on the assistant remembering a
    // tool call; after a while, point to the host conversation instead of
    // leaving the viewer waiting.
    const waited = chatPendingSince > 0 ? Date.now() - chatPendingSince : 0;
    if (waited >= 30000) {
      const hint = document.createElement("span");
      hint.className = "chatPendingHint";
      hint.textContent = chatDisplayName("assistant") + " 可能已经在主对话里回复了，往下滑看看";
      bubble.appendChild(hint);
    } else if (chatPendingSince > 0 && !chatHintTimer) {
      chatHintTimer = setTimeout(() => {
        chatHintTimer = null;
        if (chatPending) renderChat(false);
      }, 30000 - waited + 50);
    }
    row.appendChild(bubble);
    root.appendChild(row);
  }

  $("chatStatus").textContent =
    chatPending ? chatDisplayName("assistant") + " 正在回复…" : "";
  renderChatMembers();

  if (forceBottom || nearBottom) {
    requestAnimationFrame(() => {
      root.scrollTop = root.scrollHeight;
    });
  }
}

function chatEndpoint(extra = {}) {
  if (!state.chatUrl) return "";
  try {
    const url = new URL(state.chatUrl);
    url.searchParams.set(
      "identity",
      normalizeIdentity(state.identity)
    );
    for (const [key, value] of Object.entries(extra)) {
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  } catch {
    return "";
  }
}

async function postChatUser(text, clientId) {
  const url = chatEndpoint();
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        text,
        clientId
      })
    });
  } catch {}
}

async function syncChat() {
  if (!connected || !state.chatUrl) return;

  const url = chatEndpoint({
    after: chatAfterSeq
  });
  if (!url) return;

  try {
    const response = await fetch(url, {
      cache: "no-store"
    });
    if (!response.ok) return;

    const data = await response.json();
    const messages = Array.isArray(data.messages)
      ? data.messages
      : [];

    let sawAssistant = false;
    const hostIdentity = normalizeIdentity(state.identity);

    for (const message of messages) {
      appendChatMessage(message);
      if (
        message &&
        message.role === "assistant" &&
        normalizeIdentity(message.identity || hostIdentity) === hostIdentity
      ) {
        sawAssistant = true;
      }
    }

    if (Number.isSafeInteger(data.clearedThroughSeq)) {
      dropClearedChat(data.clearedThroughSeq);
    }

    if (Array.isArray(data.muted)) {
      const next = data.muted.map((who) => normalizeIdentity(who)).sort().join(",");
      if (next !== [...chatMuted].sort().join(",")) {
        chatMuted.clear();
        for (const who of data.muted) chatMuted.add(normalizeIdentity(who));
        renderChatMembers();
      }
    }

    // First sync of this card: everything already in the room is "earlier".
    if (chatEarlierThroughSeq < 0 && Number.isSafeInteger(data.latestSeq)) {
      chatEarlierThroughSeq = data.latestSeq;
    }

    if (Number.isSafeInteger(data.latestSeq)) {
      chatAfterSeq = Math.max(
        chatAfterSeq,
        data.latestSeq
      );
    }

    if (sawAssistant) {
      chatPending = false;
      chatPendingSince = 0;
    } else if (
      chatPending &&
      chatPendingSince > 0 &&
      Date.now() - chatPendingSince > 120000
    ) {
      chatPending = false;
      chatPendingSince = 0;
    }

    if (messages.length > 0 || sawAssistant) {
      renderChat(true);
    }
  } catch {}
}

function startChatSync() {
  if (chatTimer) {
    clearInterval(chatTimer);
    chatTimer = null;
  }

  if (!connected || !state.chatUrl) return;

  void syncChat();
  chatTimer = setInterval(() => {
    void syncChat();
  }, 1200);
}

function resetChatLane() {
  if (chatTimer) {
    clearInterval(chatTimer);
    chatTimer = null;
  }

  chatAfterSeq = 0;
  chatEarlierThroughSeq = -1;
  chatShowEarlier = false;
  chatPending = false;
  chatPendingSince = 0;
  chatMessages.length = 0;
  chatMessageIds.clear();
  renderChat(true);
}

async function refreshFrame() {
  if (!connected || busy) return;
  busy = true;
  try {
    const data = await call(
      "browser_app_refresh",
      actorArgs({ appUiBuild: state.appUiBuild || "v93" }),
    );
    applyState(data);
    refreshImage();
    setError("");
  } catch (error) {
    setError(error && error.message ? error.message : error);
  } finally {
    busy = false;
  }
}
function checkLiveStall() {
  if (!connected || busy || companionModeActive || mediaModeActive) return;
  const now = Date.now();
  if (now - lastLivePacketAt < 5000 || now - liveStallRefreshAt < 20000) return;
  liveStallRefreshAt = now;
  void refreshFrame();
}

function startPolling() {
  if (stateTimer) clearInterval(stateTimer);
  if (frameTimer) clearInterval(frameTimer);
  stateTimer = null;
  frameTimer = null;

  if (state.externalLogin && state.externalLogin.active) {
    stateTimer = setInterval(() => { void refreshFrame(); }, 2500);
    return;
  }

  // Live mode is already a persistent bidirectional WebSocket. Do not keep
  // poking the host bridge every 20s; some ChatGPT hosts intermittently
  // surface those refresh calls as "Load failed" even while live is healthy.
  // Refresh the long-lived live ticket only occasionally.
  if (state.liveUrl) {
    stateTimer = setInterval(() => { void refreshFrame(); }, 60 * 1000);
    // Live frames stopping is how a local-login handoff shows up here, so a
    // stalled live view checks state instead of waiting out the minute.
    liveStallRefreshAt = Date.now();
    frameTimer = setInterval(checkLiveStall, 2000);
    return;
  }

  // Screenshot fallback still needs periodic refreshes.
  stateTimer = setInterval(() => { void refreshFrame(); }, 20000);
  frameTimer = setInterval(
    refreshImage,
    state.takeover ? 750 : 1800
  );
}
function manualLoginUrl() {
  const fallback = "https://example.com/";
  const raw = String(state.url || "").trim();
  if (!raw) return fallback;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return fallback;
    }
    if (
      parsed.hostname === "accounts.google.com" &&
      parsed.pathname.includes("/signin/rejected")
    ) {
      return fallback;
    }
    return parsed.toString();
  } catch {
    return fallback;
  }
}

async function toggleLocalLogin() {
  const externalActive = Boolean(state.externalLogin && state.externalLogin.active);
  if (!externalActive && !state.externalLoginEnabled) {
    setError("本机登录需要 Windows Worker v28+。");
    return;
  }

  setError("");
  try {
    if (externalActive) {
      setNudgeStatus("正在接回同屏…");
      const data = await call(
        "browser_app_external_login_finish",
        actorArgs()
      );
      applyState(data);
      liveFailed = false;
      liveSuperseded = false;
      liveRetryCount = 0;
      liveImageErrors = 0;
      refreshImage();
      scheduleLiveFrameResync();
      startPolling();
      setNudgeStatus("已接回同屏");
      return;
    }

    setNudgeStatus("正在把登录交给电脑上的正常浏览器…");
    closeMediaSocket(true, true);
    closeLiveSocket();
    closeAudioSocket(true);
    audioEnabled = false;
    const data = await call(
      "browser_app_external_login_start",
      actorArgs({ url: manualLoginUrl() })
    );
    applyState(data);
    setNudgeStatus("去电脑上登录；成功后关闭那个浏览器窗口");
  } catch (error) {
    setError(error && error.message ? error.message : error);
  }
}

function enterRealtimeControlView() {
  closeMediaSocket(true, true);
  mediaModeActive = false;
  liveFailed = false;
  liveSuperseded = false;
  ensureLiveSocket();
}

async function navigate() {
  enterRealtimeControlView();
  const raw = $("address").value.trim();
  if (!raw) return;
  let url = raw;
  if (!/^https?:\\/\\//i.test(url)) url = "https://" + url;
  setError("");
  try {
    const data = await call("browser_app_navigate", actorArgs({ url }));
    applyState(data);
    refreshImage();
    scheduleLiveFrameResync();
    startPolling();
  } catch (error) {
    setError(error && error.message ? error.message : error);
  }
}
async function historyNavigate(direction) {
  enterRealtimeControlView();
  setError("");
  try {
    const data = await call(
      "browser_app_history",
      actorArgs({ direction })
    );
    applyState(data);
    refreshImage();
    scheduleLiveFrameResync();
    startPolling();
  } catch (error) {
    setError(error && error.message ? error.message : error);
  }
}

async function reloadPage() {
  enterRealtimeControlView();
  setError("");
  const button = $("refresh");
  button.disabled = true;
  button.classList.remove("done");
  button.classList.add("working");
  setNudgeStatus("正在刷新页面…");
  try {
    const data = await call("browser_app_reload", actorArgs());
    applyState(data);
    const frame = $("frame");
    if (state.frameUrl) {
      frame.dataset.mode = "snapshot";
    }
    refreshImage();
    scheduleLiveFrameResync();
    const now = new Date();
    const stamp =
      String(now.getHours()).padStart(2, "0") + ":" +
      String(now.getMinutes()).padStart(2, "0") + ":" +
      String(now.getSeconds()).padStart(2, "0");
    setNudgeStatus("已刷新 · " + stamp);
    button.classList.remove("working");
    button.classList.add("done");
    setTimeout(() => {
      button.classList.remove("done");
      button.disabled = false;
    }, 700);
    startPolling();
  } catch (error) {
    button.classList.remove("working", "done");
    button.disabled = false;
    setNudgeStatus("刷新失败");
    setError(error && error.message ? error.message : error);
  }
}

function hideContextMirror() {
  contextMenuOpen = false;
  contextMenuTarget = null;
  contextMenuPoint = null;
  $("contextMirror").classList.remove("on");
  $("contextMirror").replaceChildren();
}

function contextMenuViewportPoint(point) {
  const active = activeViewportElement();
  const frameRect = active.getBoundingClientRect();
  const wrapRect = $("viewportWrap").getBoundingClientRect();
  const width = Number(state.viewport.width || $("frame").naturalWidth || 0);
  const height = Number(state.viewport.height || $("frame").naturalHeight || 0);
  if (!width || !height || !frameRect.width || !frameRect.height) {
    return { x: 8, y: 8 };
  }
  return {
    x: frameRect.left - wrapRect.left + point.x / width * frameRect.width,
    y: frameRect.top - wrapRect.top + point.y / height * frameRect.height
  };
}

function addContextMenuButton(label, action, extraClass = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.dataset.contextAction = action;
  if (extraClass) button.className = extraClass;
  $("contextMirror").appendChild(button);
}

function addContextMenuSeparator() {
  const sep = document.createElement("div");
  sep.className = "sep";
  $("contextMirror").appendChild(sep);
}

function renderContextMirror(point, target) {
  const menu = $("contextMirror");
  menu.replaceChildren();

  addContextMenuButton("← 返回", "back");
  addContextMenuButton("→ 前进", "forward");
  addContextMenuButton("↻ 刷新", "reload");

  const href =
    target && typeof target.href === "string" ? target.href : "";
  if (href) {
    addContextMenuSeparator();
    addContextMenuButton("打开链接", "open-link");
    addContextMenuButton("复制链接地址", "copy-link");
  }

  addContextMenuSeparator();
  addContextMenuButton("取消", "cancel", "muted");

  const pos = contextMenuViewportPoint(point);
  menu.style.left = Math.max(6, pos.x) + "px";
  menu.style.top = Math.max(6, pos.y) + "px";
  menu.classList.add("on");

  // Keep the mirror inside the visible viewport after it is laid out.
  requestAnimationFrame(() => {
    const wrap = $("viewportWrap").getBoundingClientRect();
    const rect = menu.getBoundingClientRect();
    const maxLeft = Math.max(6, wrap.width - rect.width - 6);
    const maxTop = Math.max(6, wrap.height - rect.height - 6);
    menu.style.left = Math.min(Math.max(6, pos.x), maxLeft) + "px";
    menu.style.top = Math.min(Math.max(6, pos.y), maxTop) + "px";
  });
}

async function openContextMirror(point) {
  contextMenuOpen = true;
  contextMenuPoint = { x: point.x, y: point.y };
  contextMenuTarget = null;
  renderContextMirror(point, null);
  setNudgeStatus("右键菜单 · 正在读取目标…");

  try {
    const data = await call(
      "browser_app_context_info",
      actorArgs({ x: point.x, y: point.y })
    );
    const target =
      data && data.target && typeof data.target === "object"
        ? data.target
        : null;
    contextMenuTarget = target;
    if (contextMenuOpen && contextMenuPoint) {
      renderContextMirror(contextMenuPoint, contextMenuTarget);
      setNudgeStatus("右键菜单已打开");
    }
  } catch (error) {
    // Navigation/reload/cancel still remain usable without target metadata.
    setError(error && error.message ? error.message : error);
  }

  // Native Chromium context menu is outside screencast. Once the mirrored
  // menu is ready, dismiss the native shell menu so only the in-card menu
  // remains relevant to the user.
  void key("Escape").catch(() => {});
}

async function copyText(text) {
  if (!text) throw new Error("没有可复制的链接");
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("复制失败");
}

async function requestLiveFrameResync() {
  if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) return false;
  try {
    const result = await sendLiveCommand(
      { type: "resync_frame" },
      1800
    );
    return Boolean(result && result.resynced);
  } catch {
    return false;
  }
}

function scheduleLiveFrameResync() {
  void requestLiveFrameResync();
  setTimeout(() => { void requestLiveFrameResync(); }, 220);
  setTimeout(() => { void requestLiveFrameResync(); }, 850);
}

function sendLiveCommand(payload, timeoutMs = 5000) {
  if (!liveSocket || liveSocket.readyState !== WebSocket.OPEN) {
    return Promise.reject(new Error("实时控制通道未连接"));
  }

  const id = "cmd-" + (++liveCommandSeq);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      liveCommandPending.delete(id);
      reject(new Error("实时控制超时"));
    }, timeoutMs);

    liveCommandPending.set(id, { resolve, reject, timer });

    try {
      liveSocket.send(JSON.stringify({ ...payload, id }));
    } catch (error) {
      clearTimeout(timer);
      liveCommandPending.delete(id);
      reject(error);
    }
  });
}

function releaseLocalPointerCapture() {
  if (trackGesture) {
    try { $("trackpad").releasePointerCapture(trackGesture.id); } catch {}
    trackGesture = null;
  }
  if (leftPointerId !== null) {
    try { $("leftMouse").releasePointerCapture(leftPointerId); } catch {}
    leftPointerId = null;
  }
  if (rightPointerId !== null) {
    try { $("rightMouse").releasePointerCapture(rightPointerId); } catch {}
    rightPointerId = null;
  }
  $("trackpad").classList.remove("active");
  $("trackDot").classList.remove("on");
  $("leftMouse").classList.remove("pressed");
  $("rightMouse").classList.remove("pressed");
}

async function toggleTakeover() {
  const target = !state.takeover;
  if (target && companionModeActive) {
    stopCompanionPlayback(true);
  }
  const previousTakeover = state.takeover;
  const previousInputUrl = state.inputUrl;

  if (!state.controlUrl) {
    try {
      const data = await call(
        "browser_app_takeover",
        actorArgs({ takeover: target })
      );
      applyState(data);
      startPolling();
    } catch (error) {
      setError(error && error.message ? error.message : error);
    }
    return;
  }

  setError("");

  if (!target) {
    const cursor = remoteHeld ? ensureRemoteCursor() : null;

    releaseLocalPointerCapture();
    remoteHeld = false;
    hideContextMirror();
    $("leftMouse").classList.remove("pressed");
    $("rightMouse").classList.remove("pressed");
    $("pointerDot").classList.remove("on");
    setNudgeStatus("已还给模型");

    // Human-visible control changes immediately. Network confirmation runs
    // in the background so a slow worker/MCP round-trip cannot trap the UI.
    state.takeover = false;
    state.inputUrl = "";
    render();
    if (companionModeActive) ensureMediaSocket();

    if (cursor) {
      void postPointer("up", cursor).catch(() => {});
    }

    void (async () => {
      try {
        await sendLiveCommand({ type: "takeover", takeover: false });
        startPolling();
      } catch (error) {
        state.takeover = previousTakeover;
        state.inputUrl = previousInputUrl;
        render();
        setError(error && error.message ? error.message : error);
      }
    })();
    return;
  }

  // Taking control still waits for the signed input URL that the direct
  // pointer channel needs.
  state.takeover = true;
  enterRealtimeControlView();
  render();

  try {
    await sendLiveCommand({ type: "takeover", takeover: true });
    state.takeover = true;
    render();
    startPolling();
  } catch (error) {
    state.takeover = previousTakeover;
    state.inputUrl = previousInputUrl;
    render();
    setError(error && error.message ? error.message : error);
  }
}
async function sendHumanText() {
  if (!state.takeover) {
    setError("先点「我来操作」");
    return;
  }
  const text = $("humanText").value;
  if (!text) return;
  try {
    await call("browser_app_type", actorArgs({ text }));
    // The send arrow submits, like a phone keyboard's send key: typing
    // alone left search boxes and comment fields waiting for ↵.
    await call("browser_app_key", actorArgs({ key: "Enter" }));
    $("humanText").value = "";
    setTimeout(refreshImage, 120);
  } catch (error) {
    setError(error && error.message ? error.message : error);
  }
}
async function key(name) {
  if (!state.takeover) {
    setError("先点「我来操作」");
    return;
  }
  try {
    await call("browser_app_key", actorArgs({ key: name }));
    setTimeout(refreshImage, 120);
  } catch (error) {
    setError(error && error.message ? error.message : error);
  }
}
function renderChatMembers() {
  const box = $("chatMembers");
  if (!box) return;
  const members = new Set(CHAT_MEMBERS);
  members.add(normalizeIdentity(state.identity));
  for (const item of chatMessages) {
    if (item.role === "assistant" && item.identity) members.add(item.identity);
  }
  box.textContent = "";
  for (const who of members) {
    const muted = chatMuted.has(who);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "chatMember ai-" + who + (muted ? " muted" : "");
    const name = document.createElement("span");
    name.className = "chatMemberName";
    name.textContent = chatDisplayName("assistant", who);
    const bell = document.createElement("span");
    bell.className = "chatMemberBell";
    bell.innerHTML = muted ? CHAT_BELL_OFF_SVG : CHAT_BELL_SVG;
    button.appendChild(name);
    button.appendChild(bell);
    button.title = muted ? "解除禁言" : "禁言";
    button.addEventListener("click", () => void setChatMuted(who, !muted));
    box.appendChild(button);
  }
}

const CHAT_BELL_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 21h4"/></svg>';
const CHAT_BELL_OFF_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 2h-14z"/><path d="M10 21h4M4 4l16 16"/></svg>';

let chatClearedThroughSeq = 0;
let chatClearArmTimer = null;

// Drop everything up to the server's clear point (cleared here or on another card).
function dropClearedChat(clearedThroughSeq) {
  if (!(clearedThroughSeq > chatClearedThroughSeq)) return;
  chatClearedThroughSeq = clearedThroughSeq;
  for (let i = chatMessages.length - 1; i >= 0; i -= 1) {
    const item = chatMessages[i];
    if (item.seq <= clearedThroughSeq) {
      chatMessageIds.delete(item.id);
      chatMessages.splice(i, 1);
    }
  }
  chatAfterSeq = Math.max(chatAfterSeq, clearedThroughSeq);
  renderChat(true);
}

function disarmChatClear() {
  const button = $("chatClear");
  if (chatClearArmTimer) {
    clearTimeout(chatClearArmTimer);
    chatClearArmTimer = null;
  }
  if (!button) return;
  button.classList.remove("armed");
  button.textContent = "清空";
}

// First tap arms, a second tap within 3s clears (no browser dialogs in the host).
async function onChatClearClick() {
  const button = $("chatClear");
  if (!button || button.disabled) return;
  if (!button.classList.contains("armed")) {
    button.classList.add("armed");
    button.textContent = "确认清空？";
    chatClearArmTimer = setTimeout(disarmChatClear, 3000);
    return;
  }
  disarmChatClear();
  const url = chatEndpoint();
  if (!url) return;
  button.disabled = true;
  try {
    const response = await fetch(url, {
      method: "POST",
      cache: "no-store",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "clear" })
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !Number.isSafeInteger(data.clearedThroughSeq)) throw new Error("clear failed");
    chatPending = false;
    chatPendingSince = 0;
    // Also drops this card's unsynced local echoes (seq 0).
    dropClearedChat(data.clearedThroughSeq);
  } catch {
    button.textContent = "没清掉，再试";
    chatClearArmTimer = setTimeout(disarmChatClear, 2000);
  } finally {
    button.disabled = false;
  }
}

async function setChatMuted(who, muted) {
  who = normalizeIdentity(who);
  const wasMuted = chatMuted.has(who);
  if (muted) chatMuted.add(who);
  else chatMuted.delete(who);
  renderChatMembers();

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const url = chatEndpoint();
      if (!url) throw new Error("chat unavailable");
      const response = await fetch(url, {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "mute", identity: who, muted })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !Array.isArray(data.muted)) {
        // A long-open card may hold an expired signed chat URL. Refresh all
        // signed lanes once, then retry the exact user choice.
        if (response.status === 403 && attempt === 0) {
          await refreshFrame();
          continue;
        }
        throw new Error("mute sync failed");
      }

      chatMuted.clear();
      for (const identity of data.muted) {
        chatMuted.add(normalizeIdentity(identity));
      }
      renderChatMembers();
      setError("");
      return;
    } catch {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
    }
  }

  // Never leave an optimistic bell state that disagrees with the server.
  if (wasMuted) chatMuted.add(who);
  else chatMuted.delete(who);
  renderChatMembers();
  setError("禁言设置没同步，请再点一次");
}

function chatRelayInstruction() {
  return (
    "。回复正文前先调用 browser_app_chat_push（identity=" +
    state.identity +
    "，profile=" +
    state.profile +
    "，text=你的完整回复），再在主聊天发送相同回复；涉及屏幕时先用 browser_screenshot，用户点了「叫大家看」时先用 browser_look" +
    // The old browser_read relay exists only on the personal server.
    (state.userName
      ? "。若没有 browser_app_chat_push，则用 browser_read 兼容接力：profile=" +
        state.profile +
        "，selector=\\"__tongping_chat_push__::" +
        state.identity +
        "::\\"紧接完整回复，format=\\"text\\"，maxChars=1000"
      : "")
  );
}

function canvasImageBlock(canvas, quality = 0.84) {
  try {
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    const marker = "base64,";
    const at = dataUrl.indexOf(marker);
    if (at < 0) return null;
    const data = dataUrl.slice(at + marker.length);
    if (!data) return null;
    return {
      type: "image",
      data,
      mimeType: "image/jpeg"
    };
  } catch {
    return null;
  }
}

function captureCurrentDisplayedFrame() {
  const video = $("mediaVideo");
  if (
    companionModeActive &&
    video &&
    video.style.display !== "none" &&
    video.readyState >= 2 &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  ) {
    try {
      const scale = Math.min(1, 640 / video.videoWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // iOS draws native-HLS video as an empty picture without throwing.
        const image = canvasLooksBlank(ctx, canvas) ? null : canvasImageBlock(canvas, 0.6);
        if (image) {
          return {
            image,
            source: "companion-presented-frame"
          };
        }
      }
    } catch {}
  }

  const live = $("liveCanvas");
  if (
    live &&
    live.style.display !== "none" &&
    live.width > 0 &&
    live.height > 0
  ) {
    const image = canvasImageBlock(live, 0.6);
    if (image) {
      return {
        image,
        source: "live-presented-frame"
      };
    }
  }

  const frame = $("frame");
  if (
    frame &&
    frame.style.display !== "none" &&
    frame.complete &&
    frame.naturalWidth > 0 &&
    frame.naturalHeight > 0
  ) {
    try {
      const scale = Math.min(1, 960 / frame.naturalWidth);
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(frame.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(frame.naturalHeight * scale));
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
        const image = canvasImageBlock(canvas);
        if (image) {
          return {
            image,
            source: "snapshot-presented-frame"
          };
        }
      }
    } catch {}
  }

  return null;
}

function canvasLooksBlank(ctx, canvas) {
  try {
    const w = canvas.width;
    const h = canvas.height;
    const step = Math.max(1, Math.floor(Math.min(w, h) / 12));
    const data = ctx.getImageData(0, 0, w, h).data;
    let first = -1;
    for (let y = Math.floor(step / 2); y < h; y += step) {
      for (let x = Math.floor(step / 2); x < w; x += step) {
        const i = (y * w + x) * 4;
        if (data[i + 3] === 0) continue;
        const value = data[i] + data[i + 1] + data[i + 2];
        if (first < 0) first = value;
        else if (Math.abs(value - first) > 24) return false;
      }
    }
    return true;
  } catch {
    // A tainted canvas cannot be read back, so it cannot be shared either.
    return true;
  }
}

async function fetchCompanionFrameFallback() {
  try {
    const result = await app.callServerTool({
      name: "browser_companion_context",
      arguments: {
        profile: state.profile,
        frame: "always",
        lookbackSeconds: 0,
        subtitleSeconds: 0,
        audioSeconds: 1
      }
    });
    if (!result || result.isError) return null;
    const content = Array.isArray(result.content) ? result.content : [];
    const image = content.find(
      (item) =>
        item &&
        item.type === "image" &&
        typeof item.data === "string" &&
        item.data.length > 0
    );
    if (!image) return null;
    return {
      image: {
        type: "image",
        data: image.data,
        mimeType: image.mimeType || "image/jpeg"
      },
      source: "companion-buffer-frame"
    };
  } catch {
    return null;
  }
}

async function fetchCurrentFrameFallback() {
  const result = await app.callServerTool({
    name: "browser_screenshot",
    arguments: {
      profile: state.profile,
      fullPage: false
    }
  });

  if (result && result.isError) {
    throw new Error("当前画面截图失败");
  }

  const content = Array.isArray(result && result.content)
    ? result.content
    : [];
  const image = content.find(
    (item) =>
      item &&
      item.type === "image" &&
      typeof item.data === "string" &&
      item.data.length > 0
  );

  if (!image) {
    throw new Error("没有拿到当前画面");
  }

  return {
    image: {
      type: "image",
      data: image.data,
      mimeType:
        typeof image.mimeType === "string"
          ? image.mimeType
          : "image/jpeg"
    },
    source: "browser-screenshot-fallback"
  };
}

const WATCH_COLLECTION_ID_KEY =
  "tongping.watchCollection.id.v1";
const WATCH_COLLECTION_ENABLED_KEY =
  "tongping.watchCollection.enabled.v1";

function safeLocalGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

function randomCollectionId() {
  try {
    if (crypto && typeof crypto.randomUUID === "function") {
      return crypto.randomUUID().replace(/-/g, "");
    }
  } catch {}
  return (
    "wc_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 18) +
    Math.random().toString(36).slice(2, 18)
  );
}

function ensureWatchCollectionId() {
  if (watchCollectionId) return watchCollectionId;
  const stored = safeLocalGet(WATCH_COLLECTION_ID_KEY);
  if (
    stored &&
    /^[A-Za-z0-9_-]{24,96}$/.test(stored)
  ) {
    watchCollectionId = stored;
    return stored;
  }
  watchCollectionId = randomCollectionId();
  safeLocalSet(WATCH_COLLECTION_ID_KEY, watchCollectionId);
  return watchCollectionId;
}

function loadWatchCollectionLocalPrefs() {
  const stored = safeLocalGet(WATCH_COLLECTION_ID_KEY);
  if (
    stored &&
    /^[A-Za-z0-9_-]{24,96}$/.test(stored)
  ) {
    watchCollectionId = stored;
  }
  watchCollectionEnabled =
    safeLocalGet(WATCH_COLLECTION_ENABLED_KEY) === "1";
}

function setTicketToast(text) {
  $("ticketToast").textContent = text || "";
}

function watchCollectionEndpoint(extra = {}, operation = "read") {
  const signedUrl = operation === "write" ? state.watchCollectionWriteUrl : state.watchCollectionUrl;
  if (!signedUrl) return "";
  try {
    const url = new URL(signedUrl);
    for (const [key, value] of Object.entries(extra)) {
      url.searchParams.set(key, String(value));
    }
    return url.toString();
  } catch {
    return "";
  }
}

function ticketAbsoluteImageUrl(pathname) {
  if (!pathname || !state.watchCollectionUrl) return "";
  try {
    return new URL(pathname, state.watchCollectionUrl).toString();
  } catch {
    return "";
  }
}

async function watchCollectionRequest(action, extra = {}) {
  const collectionId =
    extra.collectionId ||
    watchCollectionId ||
    ensureWatchCollectionId();
  const url = watchCollectionEndpoint({}, "write");
  if (!url) throw new Error("观影集服务还没准备好");

  const response = await fetch(url, {
    method: "POST",
    cache: "no-store",
    headers: {
      "content-type": "application/json"
    },
    body: JSON.stringify({
      action,
      collectionId,
      ...extra
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(
      data && data.error
        ? data.error
        : "观影集操作失败"
    );
  }

  watchCollection = data.collection || null;
  watchCollectionLoaded = true;
  if (watchCollection) {
    watchCollectionEnabled = watchCollection.enabled === true;
  }
  renderWatchCollectionState();
  return watchCollection;
}

async function syncWatchCollectionFromServer() {
  loadWatchCollectionLocalPrefs();
  if (
    !watchCollectionId ||
    !state.watchCollectionUrl
  ) {
    renderWatchCollectionState();
    return;
  }

  const url = watchCollectionEndpoint({
    collectionId: watchCollectionId
  });
  if (!url) return;

  try {
    const response = await fetch(url, {
      cache: "no-store"
    });
    if (!response.ok) return;
    const data = await response.json();
    if (!data || !data.ok) return;

    watchCollection = data.collection || null;
    watchCollectionLoaded = true;
    if (watchCollection) {
      watchCollectionEnabled =
        watchCollection.enabled === true;
      safeLocalSet(
        WATCH_COLLECTION_ENABLED_KEY,
        watchCollectionEnabled ? "1" : "0"
      );
    }
    renderWatchCollectionState();
  } catch {}
}

function renderWatchCollectionState() {
  // The hosted server keeps no 观影集 yet: say so instead of a switch that fails.
  const collectionAvailable = Boolean(state.watchCollectionUrl);
  $("collectionSwitch").disabled = !collectionAvailable;
  $("ticketOpenLibrary").disabled = !collectionAvailable;
  if (!collectionAvailable) {
    $("collectionSwitch").classList.remove("on");
    $("collectionSwitch").setAttribute("aria-pressed", "false");
    $("collectionToggleHint").textContent = "内测版暂不支持观影集：票根可以下载保存，还不能收藏。";
    return;
  }
  $("collectionSwitch").classList.toggle(
    "on",
    watchCollectionEnabled
  );
  $("collectionSwitch").setAttribute(
    "aria-pressed",
    watchCollectionEnabled ? "true" : "false"
  );
  $("collectionToggleHint").textContent =
    watchCollectionEnabled
      ? "已开启：新票根会自动收藏。关闭不会删除已有收藏。"
      : "默认关闭。开启后才会保存票根成品与必要信息。";

  const libraryOpen =
    $("ticketLibrary").classList.contains("on");
  if (libraryOpen) renderWatchLibrary();
}

function openTicketOverlay() {
  $("ticketOverlay").classList.add("on");
  $("ticketLibrary").classList.remove("on");
  $("ticketCreateView").style.display = "grid";
  renderWatchCollectionState();
}

function closeTicketOverlay() {
  $("ticketOverlay").classList.remove("on");
  ticketPrivacyPending = false;
  $("ticketPrivacy").classList.remove("on");
}

function showTicketPrivacy() {
  ticketPrivacyPending = true;
  $("ticketPrivacy").classList.add("on");
}

function hideTicketPrivacy() {
  ticketPrivacyPending = false;
  $("ticketPrivacy").classList.remove("on");
}

function platformLabel(urlText) {
  try {
    const host = new URL(urlText).hostname.toLowerCase();
    if (host.includes("douyin.com")) return "抖音";
    if (host.includes("bilibili.com")) return "哔哩哔哩";
    if (host.includes("xiaohongshu.com")) return "小红书";
    if (host.includes("music.163.com")) return "网易云音乐";
    if (host.includes("youtube.com") || host.includes("youtu.be")) return "YouTube";
    return host.replace(/^www./, "") || "网页";
  } catch {
    return "网页";
  }
}

function ticketDateParts(date) {
  try {
    const formatter = new Intl.DateTimeFormat(
      "zh-CN",
      {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false
      }
    );
    return formatter.format(date);
  } catch {
    return date.toISOString().slice(0, 16).replace("T", " ");
  }
}

function loadImageBlock(image) {
  return new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () =>
      reject(new Error("票根画面加载失败"));
    element.src =
      "data:" +
      (image.mimeType || "image/jpeg") +
      ";base64," +
      image.data;
  });
}

function drawImageCover(ctx, image, x, y, width, height) {
  const iw = image.naturalWidth || image.width;
  const ih = image.naturalHeight || image.height;
  if (!iw || !ih) return;
  const scale = Math.max(width / iw, height / ih);
  const sw = width / scale;
  const sh = height / scale;
  const sx = Math.max(0, (iw - sw) / 2);
  const sy = Math.max(0, (ih - sh) / 2);
  ctx.drawImage(
    image,
    sx,
    sy,
    sw,
    sh,
    x,
    y,
    width,
    height
  );
}

function wrapCanvasText(
  ctx,
  text,
  maxWidth,
  maxLines = 4
) {
  const chars = Array.from(String(text || ""));
  const lines = [];
  let line = "";

  for (const char of chars) {
    const next = line + char;
    // Closing punctuation never starts a line: let it hang on this one.
    if (line && "，。、！？：；,.!?:;”’」』）)》】…".indexOf(char) >= 0) {
      line = next;
      continue;
    }
    if (
      line &&
      ctx.measureText(next).width > maxWidth
    ) {
      lines.push(line);
      line = char;
      if (lines.length >= maxLines) break;
    } else {
      line = next;
    }
  }

  if (
    line &&
    lines.length < maxLines
  ) {
    lines.push(line);
  }

  if (
    chars.join("") !== lines.join("") &&
    lines.length > 0
  ) {
    let last = lines[lines.length - 1];
    while (
      last.length > 1 &&
      ctx.measureText(last + "…").width > maxWidth
    ) {
      last = last.slice(0, -1);
    }
    lines[lines.length - 1] = last + "…";
  }

  return lines;
}

const TICKET_PALETTES = {
  candy: { bg: "#fff8fb", ink: "#4a3f48", sub: "#9a8a97", accent: "#d17f9f", accent2: "#b89be0", line: "rgba(74,63,72,.18)" },
  mist: { bg: "#fbf5f3", ink: "#3d3336", sub: "#8e7d80", accent: "#b27f7b", accent2: "#8fa38a", line: "rgba(61,51,54,.18)" },
  sage: { bg: "#f5f7f3", ink: "#2f3833", sub: "#7a867e", accent: "#6e8a7c", accent2: "#7f97a8", line: "rgba(47,56,51,.18)" },
  dusk: { bg: "#2b2830", ink: "#ece4e2", sub: "#a39a9f", accent: "#e0b7b1", accent2: "#9fbfa8", line: "rgba(236,228,226,.22)" },
  night: { bg: "#15161b", ink: "#ede6d8", sub: "#9b958a", accent: "#c9a96e", accent2: "#e8d3a6", line: "rgba(237,230,216,.22)" },
  claude: { bg: "#fbf6ef", ink: "#3d2f28", sub: "#9a8578", accent: "#d97757", accent2: "#c15f3c", line: "rgba(61,47,40,.18)" },
  mint: { bg: "#121415", ink: "#ece8de", sub: "#8e958f", accent: "#8fd3b8", accent2: "#ece8de", line: "rgba(236,232,222,.18)" }
};

function cleanTicketTitle(pageTitle) {
  let title = String(pageTitle || "").trim();
  const dash = title.indexOf(" - ");
  if (dash > 0) title = title.slice(0, dash);
  const hash = title.indexOf(" #");
  if (hash > 0) title = title.slice(0, hash);
  const colon = title.indexOf(" : ");
  if (colon > 0) title = title.slice(0, colon);
  title = title.trim();
  if (title.length < 2 || title.startsWith("抖音精选") || title === "哔哩哔哩") return "";
  return Array.from(title).slice(0, 40).join("");
}

// Human-readable, per-device daily sequence: MB-20260926-001.
function nextTicketNo(date) {
  const day =
    String(date.getFullYear()) +
    String(date.getMonth() + 1).padStart(2, "0") +
    String(date.getDate()).padStart(2, "0");
  const key = "tongping-ticket-seq-" + day;
  let seq = Number(readPref(key) || "0");
  if (!Number.isFinite(seq) || seq < 0) seq = 0;
  // v90: the collection is shared by every card, so continue after the
  // highest number already saved today instead of this sandbox's counter.
  const prefix = "MB-" + day + "-";
  const saved = (watchCollection && Array.isArray(watchCollection.tickets))
    ? watchCollection.tickets
    : [];
  for (const ticket of saved) {
    const id = String((ticket && ticket.id) || "");
    if (!id.startsWith(prefix)) continue;
    const n = Number(id.slice(prefix.length, prefix.length + 3));
    if (Number.isFinite(n) && n > seq) seq = n;
  }
  seq += 1;
  writePref(key, String(seq));
  return "MB-" + day + "-" + String(seq).padStart(3, "0");
}

function ticketDotDate(date) {
  return (
    date.getFullYear() + "." +
    String(date.getMonth() + 1).padStart(2, "0") + "." +
    String(date.getDate()).padStart(2, "0") + " · " +
    String(date.getHours()).padStart(2, "0") + ":" +
    String(date.getMinutes()).padStart(2, "0")
  );
}

function roundedRectPath(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function drawTicketBarcode(ctx, ticketNo, x, y, width, height, color) {
  let hash = 2166136261;
  for (const char of ticketNo) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  ctx.fillStyle = color;
  let cursor = x;
  while (cursor < x + width) {
    hash = Math.imul(hash ^ (hash >>> 13), 2246822507) >>> 0;
    const bar = 2 + (hash % 5);
    const gap = 2 + ((hash >>> 8) % 4);
    if (cursor + bar > x + width) break;
    ctx.fillRect(cursor, y, bar, height);
    cursor += bar + gap;
  }
}

// Deterministic ticket stub (3:1, drawn at 2x): the frame, the session's
// real metadata, an already-played quote and mood when available.
async function buildLocalWatchTicket(captured, context) {
  const source = captured ? await loadImageBlock(captured.image).catch(() => null) : null;
  const palette = TICKET_PALETTES[currentSkin] || TICKET_PALETTES.candy;
  const W = 1800;
  const H = 600;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("无法创建票根画布");

  const info = context || {};
  const platform = platformLabel(state.url);
  const title = cleanTicketTitle(info.pageTitle || state.title) || platform + " · 陪看记录";
  const quote = typeof info.quote === "string" && info.quote ? info.quote : "";
  const mood = typeof info.mood === "string" && info.mood ? info.mood : "";
  const watchedAt = new Date();
  const ticketNo = nextTicketNo(watchedAt);
  const pair = userShownName() + " × " + chatDisplayName("assistant");
  const sans = "-apple-system, BlinkMacSystemFont, 'PingFang SC', sans-serif";
  const serif = "Didot, 'Bodoni 72', 'Songti SC', Georgia, serif";
  const perfX = 1390;

  // Paper with rounded corners and two tear notches on the perforation.
  ctx.save();
  roundedRectPath(ctx, 0, 0, W, H, 40);
  ctx.fillStyle = palette.bg;
  ctx.fill();
  ctx.globalCompositeOperation = "destination-out";
  ctx.beginPath();
  ctx.arc(perfX, 0, 28, 0, Math.PI * 2);
  ctx.arc(perfX, H, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Frame window.
  ctx.save();
  roundedRectPath(ctx, 36, 36, 640, 528, 26);
  ctx.clip();
  if (source) {
    drawImageCover(ctx, source, 36, 36, 640, 528);
  } else {
    const empty = ctx.createLinearGradient(36, 36, 676, 564);
    empty.addColorStop(0, palette.accent);
    empty.addColorStop(1, palette.accent2);
    ctx.fillStyle = empty;
    ctx.fillRect(36, 36, 640, 528);
    ctx.fillStyle = "rgba(255,255,255,.85)";
    ctx.font = "italic 600 64px " + serif;
    ctx.textAlign = "center";
    ctx.fillText("Watched", 356, 290);
    ctx.fillText("together", 356, 360);
    ctx.textAlign = "left";
  }
  ctx.restore();

  // Main information.
  let y = 92;
  ctx.fillStyle = palette.accent;
  ctx.font = "700 22px " + sans;
  ctx.fillText("WATCH MEMORY TICKET · 陪看纪念票根", 724, y);

  y += 62;
  ctx.fillStyle = palette.ink;
  ctx.font = "750 44px " + sans;
  const titleLines = wrapCanvasText(ctx, title, 620, 2);
  titleLines.forEach((line, index) => ctx.fillText(line, 724, y + index * 54));
  y += (titleLines.length - 1) * 54 + 62;

  ctx.fillStyle = palette.accent;
  ctx.font = "italic 600 38px " + serif;
  ctx.fillText(pair, 724, y);

  y += 58;
  ctx.fillStyle = palette.sub;
  ctx.font = "600 18px " + sans;
  ctx.fillText("PLATFORM", 724, y);
  ctx.fillText("WATCHED AT", 924, y);
  ctx.fillStyle = palette.ink;
  ctx.font = "650 26px " + sans;
  ctx.fillText(platform, 724, y + 36);
  ctx.fillText(ticketDotDate(watchedAt), 924, y + 36);
  y += 36;

  if (quote) {
    y += 64;
    ctx.fillStyle = palette.ink;
    ctx.font = "italic 600 30px " + sans;
    const quoteLines = wrapCanvasText(ctx, "“" + quote + "”", 620, 2);
    quoteLines.forEach((line, index) => ctx.fillText(line, 724, y + index * 40));
    y += (quoteLines.length - 1) * 40;
  }
  if (mood) {
    y += 48;
    ctx.fillStyle = palette.sub;
    ctx.font = "600 22px " + sans;
    ctx.fillText("氛围 · " + mood, 724, y);
  }

  // WATCHED TOGETHER stamp.
  ctx.save();
  ctx.translate(1236, 508);
  ctx.rotate(-0.12);
  ctx.strokeStyle = palette.accent;
  ctx.fillStyle = palette.accent;
  ctx.lineWidth = 4;
  roundedRectPath(ctx, -118, -40, 236, 80, 14);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  roundedRectPath(ctx, -108, -30, 216, 60, 10);
  ctx.stroke();
  ctx.font = "800 22px " + sans;
  ctx.textAlign = "center";
  ctx.fillText("WATCHED", 0, -4);
  ctx.fillText("TOGETHER", 0, 22);
  ctx.restore();

  // Perforation.
  ctx.save();
  ctx.setLineDash([12, 12]);
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(perfX, 44);
  ctx.lineTo(perfX, H - 44);
  ctx.stroke();
  ctx.restore();

  // Stub.
  ctx.fillStyle = palette.sub;
  ctx.font = "700 20px " + sans;
  ctx.fillText("ADMIT TWO", 1432, 92);
  ctx.fillStyle = palette.ink;
  ctx.font = "700 30px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(ticketNo, 1432, 150);
  ctx.fillStyle = palette.sub;
  ctx.font = "600 20px " + sans;
  ctx.fillText(ticketDotDate(watchedAt), 1432, 192);
  ctx.fillText(platform, 1432, 226);
  drawTicketBarcode(ctx, ticketNo, 1432, 380, 330, 120, palette.ink);
  ctx.font = "600 16px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(ticketNo.split("-").join(" "), 1432, 532);

  const dataUrl = canvas.toDataURL("image/png");

  // JPEG copy (white behind the notches) for the collection and the AI.
  const flat = document.createElement("canvas");
  flat.width = W;
  flat.height = H;
  const flatCtx = flat.getContext("2d");
  flatCtx.fillStyle = "#ffffff";
  flatCtx.fillRect(0, 0, W, H);
  flatCtx.drawImage(canvas, 0, 0);
  const jpegUrl = flat.toDataURL("image/jpeg", 0.9);
  const marker = "base64,";
  const at = jpegUrl.indexOf(marker);
  if (at < 0) throw new Error("票根导出失败");

  return {
    id: ticketNo,
    ticketNo,
    title,
    platform,
    quote,
    mood,
    url: state.url || "",
    watchedAt: watchedAt.toISOString(),
    imageMimeType: "image/jpeg",
    imageBase64: jpegUrl.slice(at + marker.length),
    dataUrl,
    source: captured ? captured.source : "none"
  };
}

function renderCurrentWatchTicket() {
  if (!currentWatchTicket) {
    $("ticketPreviewWrap").classList.remove("ready");
    $("ticketPreview").removeAttribute("src");
    $("ticketMetaTitle").textContent = "还没有生成";
    $("ticketMetaDetail").textContent =
      watchCollectionEnabled
        ? "生成后会自动收藏到观影集"
        : "不会默认留档";
    return;
  }

  $("ticketPreview").src =
    currentWatchTicket.dataUrl;
  $("ticketPreviewWrap").classList.add("ready");
  $("ticketMetaTitle").textContent =
    currentWatchTicket.ticketNo + " · " + currentWatchTicket.title;
  $("ticketMetaDetail").textContent =
    currentWatchTicket.platform +
    " · " +
    ticketDateParts(
      new Date(currentWatchTicket.watchedAt)
    ) +
    (watchCollectionEnabled
      ? " · 已开启自动收藏"
      : " · 本次默认不留档");
}

async function saveCurrentTicketIfEnabled() {
  if (
    !watchCollectionEnabled ||
    !currentWatchTicket
  ) {
    return false;
  }
  ensureWatchCollectionId();
  await watchCollectionRequest(
    "add",
    {
      ticket: {
        id: currentWatchTicket.id,
        title: currentWatchTicket.title,
        platform: currentWatchTicket.platform,
        url: currentWatchTicket.url,
        watchedAt: currentWatchTicket.watchedAt,
        imageMimeType:
          currentWatchTicket.imageMimeType,
        imageBase64:
          currentWatchTicket.imageBase64
      }
    }
  );
  setTicketToast("已收藏到观影集");
  return true;
}

async function generateWatchTicket() {
  if (watchTicketBusy || !connected) return;
  watchTicketBusy = true;
  render();
  setError("");
  openTicketOverlay();
  setTicketToast("正在取你眼前这一帧…");

  try {
    // Frame first (what they are looking at right now), then the session's
    // context; a missing frame, quote or mood never blocks the ticket.
    let captured = captureCurrentDisplayedFrame();
    if (!captured) {
      captured = await fetchCurrentFrameFallback().catch(() => null);
    }
    const context = await fetchTicketContext();

    currentWatchTicket =
      await buildLocalWatchTicket(captured, context);
    renderCurrentWatchTicket();

    if (watchCollectionEnabled) {
      await saveCurrentTicketIfEnabled();
    }
    // The ticket stays local; nothing is sent to the AI.
    setTicketToast(
      watchCollectionEnabled
        ? "票根已生成，已收进观影集"
        : "票根已生成（没有留档）"
    );
  } catch (error) {
    setTicketToast("");
    setError(
      error && error.message
        ? error.message
        : error
    );
  } finally {
    watchTicketBusy = false;
    render();
  }
}

async function fetchTicketContext() {
  try {
    const data = await call("browser_app_ticket_context", actorArgs());
    if (!data || typeof data !== "object") return null;
    // While companion lags the PC, the page may already be on the next
    // video: if its length disagrees with what is on screen, its title,
    // quote and mood belong to another clip.
    if (
      companionModeActive &&
      companionSourceDuration !== null &&
      typeof data.durationSeconds === "number" &&
      Math.abs(data.durationSeconds - companionSourceDuration) > 1
    ) {
      return { pageTitle: "", quote: null, mood: null };
    }
    return data;
  } catch {
    return null;
  }
}

// The embedded app can neither download nor long-press-save images, so host
// the PNG briefly and open it in the system browser, where it can be saved.
async function downloadCurrentTicket() {
  if (!currentWatchTicket) return;
  const ticket = currentWatchTicket;
  const pngBase64 = ticket.dataUrl.slice(ticket.dataUrl.indexOf("base64,") + 7);
  setTicketToast("正在准备图片…");
  try {
    const data = await call("browser_app_image_link", actorArgs({
      imageBase64: pngBase64,
      mimeType: "image/png",
      name: ticket.ticketNo
    }));
    const url = data && typeof data.url === "string" ? data.url : "";
    if (!url) throw new Error("no link");
    let opened = false;
    if (app && typeof app.openLink === "function") {
      const result = await app.openLink({ url }).catch(() => ({ isError: true }));
      opened = !(result && result.isError);
    }
    setTicketToast(
      opened
        ? "已在浏览器打开，长按图片就能存到相册（链接 30 分钟内有效）"
        : "浏览器没有自动打开，复制这个链接到 Safari：" + url
    );
  } catch {
    setTicketToast("没准备好图片，稍后再点一次");
  }
}

async function enableWatchCollection() {
  ensureWatchCollectionId();
  await watchCollectionRequest("enable");
  watchCollectionEnabled = true;
  safeLocalSet(
    WATCH_COLLECTION_ENABLED_KEY,
    "1"
  );
  hideTicketPrivacy();
  renderWatchCollectionState();
  renderCurrentWatchTicket();
  setTicketToast("观影集已开启");

  if (currentWatchTicket) {
    await saveCurrentTicketIfEnabled();
  }
}

async function disableWatchCollection() {
  if (!watchCollectionId) {
    watchCollectionEnabled = false;
    safeLocalSet(
      WATCH_COLLECTION_ENABLED_KEY,
      "0"
    );
    renderWatchCollectionState();
    return;
  }

  await watchCollectionRequest("disable");
  watchCollectionEnabled = false;
  safeLocalSet(
    WATCH_COLLECTION_ENABLED_KEY,
    "0"
  );
  renderWatchCollectionState();
  renderCurrentWatchTicket();
  setTicketToast(
    "已关闭自动收藏；已有观影集不会被删除"
  );
}

function renderWatchLibrary() {
  const root = $("ticketLibraryList");
  root.textContent = "";

  const tickets =
    watchCollection &&
    Array.isArray(watchCollection.tickets)
      ? watchCollection.tickets
      : [];

  if (tickets.length === 0) {
    const empty = document.createElement("div");
    empty.className = "ticketLibraryEmpty";
    empty.textContent =
      "观影集还是空的。开启收藏后，新票根会自动出现在这里。";
    root.appendChild(empty);
    return;
  }

  for (
    const ticket of [...tickets].reverse()
  ) {
    const row = document.createElement("div");
    row.className = "ticketLibraryItem";

    const image = document.createElement("img");
    image.className = "ticketLibraryThumb";
    image.alt = ticket.title || "观影票根";
    image.src =
      ticketAbsoluteImageUrl(ticket.imageUrl);

    const info = document.createElement("div");
    info.className = "ticketLibraryInfo";

    const title = document.createElement("strong");
    title.textContent =
      ticket.title || "未命名票根";

    const meta = document.createElement("span");
    meta.textContent =
      (ticket.platform || "网页") +
      " · " +
      ticketDateParts(
        new Date(ticket.watchedAt)
      );

    info.appendChild(title);
    info.appendChild(meta);

    const remove = document.createElement("button");
    remove.className = "ticketDelete";
    remove.textContent = "×";
    remove.title = "删除这张票根";
    remove.dataset.ticketId = ticket.id;

    row.appendChild(image);
    row.appendChild(info);
    row.appendChild(remove);
    root.appendChild(row);
  }
}

async function openWatchLibrary() {
  $("ticketCreateView").style.display = "none";
  $("ticketLibrary").classList.add("on");
  $("ticketSheetTitle").textContent = "我的观影集";
  $("ticketSheetSub").textContent =
    watchCollectionEnabled
      ? "收藏模式已开启"
      : "收藏模式已关闭 · 已有内容仍保留";

  if (
    watchCollectionId &&
    state.watchCollectionUrl
  ) {
    await syncWatchCollectionFromServer();
  } else {
    renderWatchLibrary();
  }
}

function closeWatchLibrary() {
  $("ticketLibrary").classList.remove("on");
  $("ticketCreateView").style.display = "grid";
  $("ticketSheetTitle").textContent =
    "观影纪念票根";
  $("ticketSheetSub").textContent =
    "这一场真实看过的画面";
  renderCurrentWatchTicket();
}

async function showCurrentFrameToAi() {
  if (showToAiBusy || !connected) return;

  showToAiBusy = true;
  render();
  setError("");

  // Camera on: 「叫大家看」 shares their (effects-rendered) self instead of the page.
  const cameraShot = cameraOn ? captureCameraFrame(960) : null;
  const text = cameraShot
    ? "👀 叫大家看看我（摄像头画面已分享，用 browser_look 查看）"
    : "👀 叫大家看了一眼（画面已分享，用 browser_look 查看）";
  const clientId =
    "look-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 9);

  try {
    let captured = cameraShot ? { image: cameraShot, source: "camera" } : captureCurrentDisplayedFrame();
    if (!captured && companionModeActive) {
      // Her own frame from the server's 陪看 buffer, at her playback point;
      // the computer's screenshot runs ahead of her and would spoil.
      captured = await fetchCompanionFrameFallback();
    }
    if (!captured) {
      captured = await fetchCurrentFrameFallback();
    }

    appendChatMessage({
      id: clientId,
      role: "user",
      text,
      createdAt: new Date().toISOString()
    });
    chatPending = true;
    chatPendingSince = Date.now();
    renderChat(true);
    void postChatUser(text, clientId);

    // Hosts drop images an app sends; park the frame server-side so the
    // assistant can fetch it with browser_look (tool results do arrive).
    await call("browser_app_look_share", actorArgs({
      imageBase64: captured.image.data,
      mimeType: captured.image.mimeType || "image/jpeg",
      url: cameraShot ? "" : state.url || "",
      mode: cameraShot ? "camera" : companionModeActive ? "companion" : "live"
    }));

    await app.updateModelContext({
      content: [
        {
          type: "text",
          text:
            "同屏群聊；identity=" +
            state.identity +
            "；profile=" +
            state.profile +
            "。用户点了「叫大家看」；先调用 browser_look（profile=" +
            state.profile +
            "）看共享画面" +
            chatRelayInstruction()
        }
      ]
    });

    const result = await app.sendMessage({
      role: "user",
      content: [
        {
          type: "text",
          text:
            "【同屏 · 系统】" + userZhName() + " 按了「叫大家看」。请调用 browser_look（profile=" +
      state.profile + "）看 TA 指着的这一帧，然后调用 browser_app_chat_push 把回应推进群聊，再在自己的聊天里回应。"
        }
      ]
    });

    if (result && result.isError) {
      throw new Error("宿主拒绝发送画面");
    }

    setNudgeStatus("已经叫 " + chatDisplayName("assistant") + " 看了");
  } catch (error) {
    chatPending = false;
    chatPendingSince = 0;
    renderChat(true);
    setError(
      error && error.message
        ? error.message
        : error
    );
  } finally {
    showToAiBusy = false;
    render();
  }
}

// ----- 「让 TA 看看你」: their camera with face effects, AIs look when they want -----
const CAMERA_FX_BASE = ${JSON.stringify(baseOrigin + "/assets/camera-fx/")};
const CAMERA_FX_VERSION = "3";
const CAMERA_UPLOAD_MS = 3000;
const CAMERA_NOTE = "摄像头开着 · TA 想看你时会自己看";
const CAMERA_LOOK_NAMES = [
  ["soft", "美颜"], ["none", "原图"], ["cat", "猫咪"], ["bunny", "兔兔"],
  ["bird", "鸵鸟"], ["frog", "青蛙"], ["hearts", "爱心"], ["stars", "星星"]
];
const CAMERA_EYE_SVG =
  '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.8 12s3.4-5.4 9.2-5.4S21.2 12 21.2 12s-3.4 5.4-9.2 5.4S2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.6"/></svg>';
let cameraOn = false;
let cameraBusy = false;
let cameraUploadTimer = null;
let cameraLook = "soft";
let cameraOpenedAt = 0;
let cameraLastLookAt = "";
let cameraLookedTimer = null;
let cameraFxLoading = null;

function loadCameraScript(name) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CAMERA_FX_BASE + name + ".js?v=" + CAMERA_FX_VERSION;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("特效脚本没加载出来"));
    document.head.appendChild(script);
  });
}

function loadCameraFx() {
  if (window.TongpingCameraFx) return Promise.resolve();
  if (!cameraFxLoading) {
    cameraFxLoading = loadCameraScript("geometry")
      .then(() => loadCameraScript("engine"))
      .catch((error) => {
        cameraFxLoading = null;
        throw error;
      });
  }
  return cameraFxLoading;
}

function renderCameraLooks() {
  const root = $("cameraLooks");
  root.textContent = "";
  for (const [id, label] of CAMERA_LOOK_NAMES) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.classList.toggle("on", id === cameraLook);
    button.addEventListener("click", () => {
      cameraLook = id;
      writePref("tongping-camera-look", id);
      if (window.TongpingCameraFx) window.TongpingCameraFx.setLook(id);
      renderCameraLooks();
    });
    root.appendChild(button);
  }
}

function captureCameraFrame(maxSide) {
  const canvas = $("cameraCanvas");
  if (!cameraOn || !canvas.width || !canvas.height) return null;
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const shot = document.createElement("canvas");
  shot.width = Math.max(1, Math.round(canvas.width * scale));
  shot.height = Math.max(1, Math.round(canvas.height * scale));
  const ctx = shot.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(canvas, 0, 0, shot.width, shot.height);
  return canvasImageBlock(shot, 0.72);
}

function flashCameraLooked(by) {
  const note = $("cameraLooked");
  note.innerHTML = CAMERA_EYE_SVG;
  const text = document.createElement("span");
  text.textContent = chatDisplayName("assistant", by) + " 看了你一眼";
  note.appendChild(text);
  note.classList.add("on");
  if (cameraLookedTimer) clearTimeout(cameraLookedTimer);
  cameraLookedTimer = setTimeout(() => note.classList.remove("on"), 3200);
}

function handleCameraLook(look) {
  if (!look || typeof look.at !== "string" || look.at === cameraLastLookAt) return;
  cameraLastLookAt = look.at;
  // A look from before this camera session is old news.
  if (Date.parse(look.at) < cameraOpenedAt) return;
  flashCameraLooked(look.by);
}

async function uploadCameraFrame() {
  if (!cameraOn) return;
  const shot = captureCameraFrame(480);
  try {
    const result = await call("browser_app_camera_frame", actorArgs({
      active: true,
      imageBase64: shot ? shot.data : "",
      mimeType: "image/jpeg"
    }));
    if (cameraOn) handleCameraLook(result && result.lastLook);
  } catch {}
}

function postCameraNotice(text) {
  const clientId = "camera-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 9);
  appendChatMessage({ id: clientId, role: "user", text, createdAt: new Date().toISOString() });
  renderChat(true);
  void postChatUser(text, clientId);
}

function cameraErrorMessage(error) {
  const name = error && error.name ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "拿不到摄像头：这个 App 不让卡片用，或者还没允许";
  }
  if (name === "NotFoundError") return "没找到摄像头";
  return "摄像头打不开：" + (error && error.message ? error.message : String(error || ""));
}

function renderCameraToggle() {
  $("shell").classList.toggle("cameraOn", cameraOn || cameraBusy);
  $("cameraToggle").classList.toggle("on", cameraOn || cameraBusy);
  $("cameraToggle").title = cameraOn ? "关掉摄像头" : "让 TA 看看你";
  $("cameraToggle").setAttribute("aria-label", cameraOn ? "关掉摄像头" : "让 TA 看看你");
}

async function openCamera() {
  if (cameraBusy || cameraOn) return;
  cameraBusy = true;
  renderCameraToggle();
  renderCameraLooks();
  $("cameraNote").textContent = "正在打开摄像头…";
  if (!screenCollapsed) setScreenCollapsed(true);
  try {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
      throw Object.assign(new Error("这里用不了摄像头"), { name: "NotSupportedError" });
    }
    await loadCameraFx();
    window.TongpingCameraFx.setLook(cameraLook);
    await window.TongpingCameraFx.open({
      video: $("cameraVideo"),
      canvas: $("cameraCanvas"),
      onStatus: (status) => { $("cameraNote").textContent = status || CAMERA_NOTE; }
    });
    cameraOn = true;
    cameraOpenedAt = Date.now();
    cameraLastLookAt = "";
    void uploadCameraFrame();
    cameraUploadTimer = setInterval(() => { void uploadCameraFrame(); }, CAMERA_UPLOAD_MS);
    postCameraNotice("📷 我把摄像头打开啦，想看我的时候自己看");
    if (!chatMuted.has(normalizeIdentity(state.identity))) {
      void app.updateModelContext({
        content: [{
          type: "text",
          text:
            "同屏：用户已打开摄像头；想看时调用 browser_camera_look（identity=" +
            state.identity + "），每次查看都会留下一条提示"
        }]
      }).catch(() => {});
    }
  } catch (error) {
    cameraBusy = false;
    closeCamera(false);
    setError(cameraErrorMessage(error));
  } finally {
    cameraBusy = false;
    renderCameraToggle();
  }
}

function closeCamera(notify = true) {
  const wasOn = cameraOn;
  cameraOn = false;
  if (cameraUploadTimer) {
    clearInterval(cameraUploadTimer);
    cameraUploadTimer = null;
  }
  try { if (window.TongpingCameraFx) window.TongpingCameraFx.close(); } catch {}
  renderCameraToggle();
  if (wasOn) {
    void call("browser_app_camera_frame", actorArgs({ active: false })).catch(() => {});
    if (notify) postCameraNotice("📷 摄像头关啦");
  }
}

// ----- Hold-to-talk: voice note → transcript in the input, never auto-sent -----
const VOICE_NOTE_MAX_MS = 60000;
const VOICE_NOTE_MIN_MS = 500;
const VOICE_CANCEL_SWIPE_PX = 60;
let voiceMode = false;
let voicePressed = false;
let voiceCancelling = false;
let voiceBusy = false;
let voiceStream = null;
let voiceRecorder = null;
let voiceChunks = [];
let voiceStartY = 0;
let voiceStartedAt = 0;
let voiceMaxTimer = null;

function setVoiceMode(on) {
  voiceMode = on === true;
  $("talk").classList.toggle("voice", voiceMode);
  $("voiceToggle").setAttribute("aria-label", voiceMode ? "切换到键盘输入" : "切换到按住说话");
  $("voiceToggle").title = voiceMode ? "键盘输入" : "按住说话";
}

function setHoldLabel(text, cls) {
  const button = $("holdToTalk");
  button.textContent = text;
  button.classList.toggle("recording", cls === "recording");
  button.classList.toggle("cancelling", cls === "cancelling");
  button.classList.toggle("busy", cls === "busy");
}

// Failures must show on the button itself: the error line is often off
// screen, and a silent button reads as "nothing happened".
let voiceFlashTimer = null;
function flashVoiceError(short, detail) {
  if (voiceFlashTimer) clearTimeout(voiceFlashTimer);
  setHoldLabel(short, "cancelling");
  setError(detail);
  voiceFlashTimer = setTimeout(() => {
    voiceFlashTimer = null;
    if (!voicePressed && !voiceBusy) setHoldLabel("按住 说话", "");
  }, 3200);
}

function pickVoiceMimeType() {
  if (typeof MediaRecorder === "undefined") return "";
  const candidates = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus"];
  for (const type of candidates) {
    try { if (MediaRecorder.isTypeSupported(type)) return type; } catch {}
  }
  return "";
}

function releaseVoiceStream() {
  if (voiceMaxTimer) {
    clearTimeout(voiceMaxTimer);
    voiceMaxTimer = null;
  }
  const stream = voiceStream;
  voiceStream = null;
  if (stream) {
    for (const track of stream.getTracks()) {
      try { track.stop(); } catch {}
    }
    restoreAudioSessionAfterRecording();
  }
}

const VOICE_DICTATION_TIP = "可以切回键盘，用输入法上的 🎤 听写";
function voiceErrorShort(error) {
  const name = error && error.name ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") return "这里拿不到麦克风";
  if (name === "NotFoundError") return "没找到麦克风";
  return "录音失败";
}
function voiceErrorMessage(error) {
  const name = error && error.name ? String(error.name) : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "麦克风被拦住了：这个 App 不让卡片用麦克风，或者还没允许。" + VOICE_DICTATION_TIP;
  }
  if (name === "NotFoundError") return "没找到麦克风";
  return "录音失败：" + (error && error.message ? error.message : String(error || ""));
}

async function startVoiceNote(event) {
  if (voiceBusy || voicePressed) return;
  event.preventDefault();
  voicePressed = true;
  voiceCancelling = false;
  voiceStartY = event.clientY;
  try { $("holdToTalk").setPointerCapture(event.pointerId); } catch {}

  if (
    !navigator.mediaDevices ||
    typeof navigator.mediaDevices.getUserMedia !== "function" ||
    typeof MediaRecorder === "undefined"
  ) {
    voicePressed = false;
    flashVoiceError("这里用不了麦克风", "这个 App 里卡片用不了麦克风。" + VOICE_DICTATION_TIP);
    return;
  }

  setHoldLabel("准备中…", "recording");
  claimRecordingAudioSession();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    });
  } catch (error) {
    voicePressed = false;
    restoreAudioSessionAfterRecording();
    flashVoiceError(voiceErrorShort(error), voiceErrorMessage(error));
    return;
  }
  // The permission prompt swallowed the press: keep it simple, ask again.
  if (!voicePressed) {
    for (const track of stream.getTracks()) {
      try { track.stop(); } catch {}
    }
    restoreAudioSessionAfterRecording();
    setHoldLabel("按住 说话", "");
    setNudgeStatus("麦克风可以用了，再按住说话");
    return;
  }

  voiceStream = stream;
  voiceChunks = [];
  const mimeType = pickVoiceMimeType();
  try {
    voiceRecorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 }
    );
  } catch (error) {
    voicePressed = false;
    releaseVoiceStream();
    flashVoiceError(voiceErrorShort(error), voiceErrorMessage(error));
    return;
  }
  voiceRecorder.addEventListener("dataavailable", (e) => {
    if (e.data && e.data.size > 0) voiceChunks.push(e.data);
  });
  voiceRecorder.start();
  voiceStartedAt = Date.now();
  setError("");
  setHoldLabel("松开 结束 · 上滑取消", "recording");
  voiceMaxTimer = setTimeout(() => { void finishVoiceNote(false); }, VOICE_NOTE_MAX_MS);
}

function moveVoiceNote(event) {
  if (!voicePressed || !voiceRecorder) return;
  const cancelling = voiceStartY - event.clientY > VOICE_CANCEL_SWIPE_PX;
  if (cancelling === voiceCancelling) return;
  voiceCancelling = cancelling;
  setHoldLabel(cancelling ? "松开 取消" : "松开 结束 · 上滑取消", cancelling ? "cancelling" : "recording");
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result || "");
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error || new Error("读取录音失败"));
    reader.readAsDataURL(blob);
  });
}

async function finishVoiceNote(cancel) {
  if (!voicePressed) return;
  voicePressed = false;
  const recorder = voiceRecorder;
  voiceRecorder = null;
  if (!recorder) {
    setHoldLabel("按住 说话", "");
    return;
  }
  const duration = Date.now() - voiceStartedAt;
  const stopped = new Promise((resolve) => recorder.addEventListener("stop", resolve, { once: true }));
  try { recorder.stop(); } catch {}
  await stopped;
  releaseVoiceStream();

  if (cancel || voiceCancelling) {
    setHoldLabel("按住 说话", "");
    setNudgeStatus("已取消");
    return;
  }
  if (duration < VOICE_NOTE_MIN_MS) {
    setHoldLabel("按住 说话", "");
    setNudgeStatus("说话时间太短");
    return;
  }

  const blob = new Blob(voiceChunks, { type: recorder.mimeType || voiceChunks[0]?.type || "audio/mp4" });
  voiceChunks = [];
  voiceBusy = true;
  setHoldLabel("识别中…", "busy");
  try {
    const audioBase64 = await blobToBase64(blob);
    const result = await call(
      "browser_app_voice_transcribe",
      actorArgs({ audioBase64, mimeType: blob.type || "audio/mp4" })
    );
    const text = result && typeof result.text === "string" ? result.text.trim() : "";
    if (!text) {
      setNudgeStatus("没听清，再说一次");
      return;
    }
    // Only a clear emotion earns a tag; they can delete it like any typo.
    const tag = result.emotion ? "（" + (result.emoji || "") + result.emotion + "）" : "";
    const input = $("talkText");
    const existing = input.value.trim();
    input.value = (existing ? existing + " " : "") + tag + text;
    setVoiceMode(false);
    setNudgeStatus("转好了，改一改再发");
  } catch (error) {
    voiceBusy = false;
    flashVoiceError("识别失败", error && error.message ? error.message : String(error));
  } finally {
    voiceBusy = false;
    if (!voiceFlashTimer) setHoldLabel("按住 说话", "");
  }
}

async function sendToAi() {
  const input = $("talkText");
  const text = input.value.trim();
  if (!text) return;

  const clientId =
    "user-" +
    Date.now().toString(36) +
    "-" +
    Math.random().toString(36).slice(2, 9);

  appendChatMessage({
    id: clientId,
    role: "user",
    text,
    createdAt: new Date().toISOString()
  });

  input.value = "";
  void postChatUser(text, clientId);

  // The user muted the AI hosting this card: the message stays in the group
  // chat (other AIs can read it) but is not sent to this AI.
  if (chatMuted.has(normalizeIdentity(state.identity))) {
    renderChat(true);
    return;
  }

  chatPending = true;
  chatPendingSince = Date.now();
  renderChat(true);

  try {
    await app.updateModelContext({
      content: [{
        type: "text",
        text:
          "同屏群聊；identity=" +
          state.identity +
          "；profile=" +
          state.profile +
          "；如需其他成员的上下文，先调用 browser_app_room_read（identity=" +
          state.identity +
          "）" +
          chatRelayInstruction()
      }]
    });

    const result = await app.sendMessage({
      role: "user",
      content: [{ type: "text", text }]
    });

    if (result && result.isError) {
      throw new Error("宿主拒绝发送消息");
    }
  } catch (error) {
    chatPending = false;
    chatPendingSince = 0;
    renderChat(true);
    setError(
      error && error.message
        ? error.message
        : error
    );
  }
}

function clearCompanionBufferingCheck() {
  if (!companionBufferingCheckTimer) return;
  clearTimeout(companionBufferingCheckTimer);
  companionBufferingCheckTimer = null;
}

function noteCompanionPlaybackProgress() {
  if (!companionModeActive) return;
  const video = $("mediaVideo");
  const now = Date.now();
  const current = Number(video.currentTime);
  if (
    Number.isFinite(current) &&
    (
      current > companionLastProgressTime + 0.03 ||
      companionLastProgressAt === 0
    )
  ) {
    companionLastProgressTime = current;
    companionLastProgressAt = now;
    void startAiCompanionWatch();
  }

  if (
    companionVideoStarted &&
    !video.paused &&
    !video.ended &&
    companionPhase === "buffering" &&
    now - companionLastProgressAt < 900
  ) {
    companionPhase = "playing";
    $("companionPrep").classList.remove("on");
    render();
  }
  renderCompanionTimeline();
}

function scheduleCompanionBufferingCheck(reason) {
  if (!companionModeActive || !companionVideoStarted || companionUserPaused) return;
  clearCompanionBufferingCheck();
  const video = $("mediaVideo");
  const startTime = Number(video.currentTime);
  const startedAt = Date.now();
  companionBufferingCheckTimer = setTimeout(() => {
    companionBufferingCheckTimer = null;
    if (!companionModeActive || !companionVideoStarted) return;

    const currentTime = Number(video.currentTime);
    const advanced =
      Number.isFinite(startTime) &&
      Number.isFinite(currentTime) &&
      currentTime > startTime + 0.08;
    const recentlyAdvanced =
      companionLastProgressAt > 0 &&
      Date.now() - companionLastProgressAt < 900;

    if (
      advanced ||
      recentlyAdvanced ||
      (!video.paused && video.readyState >= 3 && Date.now() - startedAt < 1800)
    ) {
      companionPhase = "playing";
      $("companionPrep").classList.remove("on");
      render();
      return;
    }

    companionPhase = "buffering";
    sendCompanionPlaybackStatus();
    updateCompanionPreparingUi();
    render();
  }, 1100);
}

for (const eventName of ["pointerdown", "touchstart", "click"]) {
  $("mediaVideo").addEventListener(eventName, () => {
    if (!companionModeActive) return;
    companionLastUserMediaInteractionAt = Date.now();
  }, { passive: true });
}

$("mediaVideo").addEventListener("pause", () => {
  if (!companionModeActive || companionUserPaused) return;
  const video = $("mediaVideo");
  if (
    video.ended ||
    companionSeekPending ||
    companionPhase === "preparing"
  ) {
    return;
  }

  const userPausedRecently =
    Date.now() - companionLastUserMediaInteractionAt < 1800;
  if (userPausedRecently) {
    companionPhase = "ready";
    sendCompanionPlaybackStatus();
    render();
    return;
  }

  if (video.readyState < 3) return;
  if (companionAutoResumeTimer) clearTimeout(companionAutoResumeTimer);
  companionAutoResumeTimer = setTimeout(() => {
    companionAutoResumeTimer = null;
    if (
      !companionModeActive ||
      companionSeekPending ||
      video.ended ||
      !video.paused ||
      video.readyState < 3 ||
      Date.now() - companionLastUserMediaInteractionAt < 1800
    ) {
      return;
    }
    void video.play().then(() => {
      companionVideoStarted = !video.paused && !video.ended;
      companionPlaybackArmed = companionVideoStarted;
      if (companionVideoStarted) {
        companionPhase = "playing";
        noteCompanionPlaybackProgress();
        sendCompanionPlaybackStatus();
        $("companionPrep").classList.remove("on");
        render();
      }
    }).catch(() => {
      companionPhase = "ready";
      sendCompanionPlaybackStatus();
      updateCompanionPreparingUi();
      render();
    });
  }, 300);
});

$("mediaVideo").addEventListener("playing", () => {
  if (!companionModeActive) return;
  clearCompanionBufferingCheck();
  companionVideoStarted = true;
  companionPlaybackArmed = true;
  companionPhase = "playing";
  noteCompanionPlaybackProgress();
  sendCompanionPlaybackStatus();
  $("companionPrep").classList.remove("on");
  $("companionProgressBar").style.width = "100%";
  setNudgeStatus(
    "陪看中 · 音画合一 · 延迟约" +
    companionDelaySeconds +
    "秒"
  );
  render();
});
$("mediaVideo").addEventListener("timeupdate", () => {
  noteCompanionPlaybackProgress();
});
$("mediaVideo").addEventListener("progress", () => {
  noteCompanionPlaybackProgress();
});
$("mediaVideo").addEventListener("waiting", () => {
  scheduleCompanionBufferingCheck("waiting");
});
$("mediaVideo").addEventListener("stalled", () => {
  scheduleCompanionBufferingCheck("stalled");
});
$("mediaVideo").addEventListener("canplay", () => {
  if (!companionModeActive || !companionVideoStarted || companionUserPaused) return;
  noteCompanionPlaybackProgress();
  if (companionPhase === "buffering") {
    void $("mediaVideo").play().catch(() => {
      companionPhase = "ready";
      updateCompanionPreparingUi();
      render();
    });
  }
});
$("mediaVideo").addEventListener("error", () => {
  if (!companionModeActive) return;
  companionVideoStarted = false;
  companionPlaybackArmed = false;
  companionPhase = "preparing";
  clearCompanionBufferingCheck();
  // Preserve the original _playwait URL after a media error. The playlist
  // probe reloads this same source once it has playable segments.
  updateCompanionPreparingUi();
  render();
  scheduleCompanionProbe(1200);
});

$("frame").addEventListener("load", () => {
  if ($("frame").dataset.mode === "live") liveImageErrors = 0;
  updateRemoteCursorOverlay();
});
$("frame").addEventListener("error", () => {
  if ($("frame").dataset.mode !== "live") return;
  liveImageErrors += 1;
  if (liveImageErrors < 3) return;
  liveFailed = true;
  closeLiveSocket(false);
  $("frame").removeAttribute("data-mode");
  refreshImage();
});
$("open").addEventListener("click", navigate);
$("address").addEventListener("keydown", (event) => { if (event.key === "Enter") void navigate(); });
$("back").addEventListener("click", () => { void historyNavigate("back"); });
$("forward").addEventListener("click", () => { void historyNavigate("forward"); });
$("refresh").addEventListener("click", () => { void reloadPage(); });
$("takeover").addEventListener("click", toggleTakeover);
$("localLogin").addEventListener("click", () => { void toggleLocalLogin(); });
$("watchTicket").addEventListener("click", () => {
  void generateWatchTicket();
});
$("ticketClose").addEventListener("click", () => {
  closeTicketOverlay();
});
$("ticketOverlay").addEventListener("click", (event) => {
  if (event.target === $("ticketOverlay")) {
    closeTicketOverlay();
  }
});
$("collectionSwitch").addEventListener("click", () => {
  if (watchCollectionEnabled) {
    void disableWatchCollection().catch((error) => {
      setError(
        error && error.message
          ? error.message
          : error
      );
    });
    return;
  }
  showTicketPrivacy();
});
$("collectionConsent").addEventListener("click", () => {
  void enableWatchCollection().catch((error) => {
    setError(
      error && error.message
        ? error.message
        : error
    );
  });
});
$("collectionConsentCancel").addEventListener("click", () => {
  hideTicketPrivacy();
});
$("ticketDownload").addEventListener("click", () => { void downloadCurrentTicket(); });
$("chatClear").addEventListener("click", () => { void onChatClearClick(); });
$("ticketReframe").addEventListener("click", () => { void generateWatchTicket(); });
$("ticketOpenLibrary").addEventListener("click", () => {
  void openWatchLibrary();
});
$("ticketLibraryBack").addEventListener("click", () => {
  closeWatchLibrary();
});
$("ticketLibraryClear").addEventListener("click", () => {
  const button = $("ticketLibraryClear");
  const now = Date.now();

  if (now > ticketClearConfirmUntil) {
    ticketClearConfirmUntil = now + 3500;
    button.textContent = "再点一次确认";
    setTimeout(() => {
      if (Date.now() > ticketClearConfirmUntil) {
        button.textContent = "清空";
      }
    }, 3700);
    return;
  }

  ticketClearConfirmUntil = 0;
  button.textContent = "清空";
  if (!watchCollectionId) return;

  void watchCollectionRequest("clear")
    .then(() => {
      renderWatchLibrary();
      setTicketToast("观影集已清空");
    })
    .catch((error) => {
      setError(
        error && error.message
          ? error.message
          : error
      );
    });
});
$("ticketLibraryList").addEventListener("click", (event) => {
  const button =
    event.target instanceof Element
      ? event.target.closest("button[data-ticket-id]")
      : null;
  if (!(button instanceof HTMLButtonElement)) return;

  const ticketId = button.dataset.ticketId || "";
  if (!ticketId || !watchCollectionId) return;

  button.disabled = true;
  void watchCollectionRequest(
    "delete",
    { ticketId }
  )
    .then(() => {
      renderWatchLibrary();
      setTicketToast("这张票根已删除");
    })
    .catch((error) => {
      button.disabled = false;
      setError(
        error && error.message
          ? error.message
          : error
      );
    });
});

$("showToAi").addEventListener("click", () => {
  void showCurrentFrameToAi();
});
$("cameraShare").addEventListener("click", async () => {
  const button = $("cameraShare");
  button.classList.add("working");
  try { await showCurrentFrameToAi(); } finally { button.classList.remove("working"); }
});
$("companionSeek").addEventListener("input", () => {
  companionSeekDragging = true;
  renderCompanionTimeline();
});
$("companionSeek").addEventListener("change", () => {
  const target = Number($("companionSeek").value);
  companionSeekDragging = false;
  void seekCompanionToSource(target);
});
$("companionSeek").addEventListener("pointerup", () => {
  companionSeekDragging = false;
});

// ----- v89 chrome: skins, menu, remote drawer, bookmarks -----
const APP_SKINS = [
  ["candy", "奶霜糖果"],
  ["mist", "雾粉"],
  ["sage", "青灰"],
  ["dusk", "雾夜"],
  ["night", "夜场金"],
  ["claude", "Claude 橙"],
  ["mint", "夜薄荷"]
];
// When this card was opened: the server lets only the newest card hold
// live/media sockets (tickets renew, so their expiry cannot rank cards).
var CARD_BORN_AT = CARD_BORN_AT || Date.now();
function withCardStamp(url) {
  const value = String(url || "");
  if (!value) return value;
  // Sockets can open before this block runs (the var is hoisted, unset).
  if (!CARD_BORN_AT) CARD_BORN_AT = Date.now();
  return value + (value.indexOf("?") >= 0 ? "&" : "?") + "card=" + CARD_BORN_AT;
}
var currentSkin = "candy";
const SKIN_SWATCHES = {
  candy: "linear-gradient(135deg,#f2c3d2,#d8ccf1)",
  mist: "linear-gradient(135deg,#d6aea9,#b9c3ae)",
  sage: "linear-gradient(135deg,#a8b8a4,#9fb1bd)",
  dusk: "linear-gradient(135deg,#6b5561,#d8b0ab)",
  night: "linear-gradient(135deg,#0e0f13,#c9a96e)",
  claude: "linear-gradient(135deg,#f6dfc8,#d97757)",
  mint: "linear-gradient(135deg,#111314 55%,#8fd3b8)"
};
var remoteDrawerOpen = false;
var lastRenderedTakeover = false;
var skinToastTimer = null;

function readPref(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writePref(key, value) {
  try { localStorage.setItem(key, value); } catch {}
}

function applySkin(id, announce) {
  const known = APP_SKINS.find((item) => item[0] === id);
  const skin = known ? known[0] : "candy";
  currentSkin = skin;
  document.documentElement.setAttribute("data-skin", skin);
  writePref("tongping-skin", skin);
  const box = $("menuSkins");
  if (box) {
    box.textContent = "";
    for (const item of APP_SKINS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "skinDot" + (item[0] === skin ? " on" : "");
      const swatch = document.createElement("i");
      swatch.style.background = SKIN_SWATCHES[item[0]] || "";
      const name = document.createElement("span");
      name.textContent = item[1];
      button.append(swatch, name);
      button.addEventListener("click", () => applySkin(item[0], true));
      box.appendChild(button);
    }
  }
  if (announce) {
    const toast = $("skinToast");
    const name = (known || APP_SKINS[0])[1];
    toast.textContent = "皮肤 · " + name;
    toast.classList.add("on");
    if (skinToastTimer) clearTimeout(skinToastTimer);
    skinToastTimer = setTimeout(() => toast.classList.remove("on"), 1400);
  }
}

// v90: fold the screen away to just chat; nothing streams while folded.
var screenCollapsed = false;
function applyScreenCollapsed(collapsed) {
  screenCollapsed = Boolean(collapsed);
  $("shell").classList.toggle("screenCollapsed", screenCollapsed);
  if (nowPlayingTimer) {
    clearInterval(nowPlayingTimer);
    nowPlayingTimer = null;
  }
  if (screenCollapsed) {
    renderNowPlaying();
    nowPlayingTimer = setInterval(renderNowPlaying, 1000);
  }
  const button = $("screenToggle");
  button.classList.toggle("on", screenCollapsed);
  button.setAttribute("aria-pressed", String(screenCollapsed));
  button.title = screenCollapsed ? "展开画面" : "收起画面，只聊天（照常播放）";
  button.setAttribute("aria-label", screenCollapsed ? "展开画面" : "收起画面");
  $("screenToggleLabel").textContent = screenCollapsed ? "看画面" : "只聊天";
}
function setScreenCollapsed(collapsed) {
  applyScreenCollapsed(collapsed);
  writePref("tongping-screen-collapsed", screenCollapsed ? "1" : "0");
  // Folding only hides the screen: live, companion playback, its clock and
  // buffer keep going so expanding lands right back in the scene.
  if (!screenCollapsed) {
    requestAnimationFrame(() => {
      refreshImage();
      scheduleLiveFrameResync();
    });
  }
}

var nowPlayingTimer = null;
function renderNowPlaying() {
  if (!screenCollapsed) return;
  const title = cleanTicketTitle(state.title) || state.title || "当前页面";
  $("npTitle").textContent = title;
  if (companionModeActive) {
    const video = $("mediaVideo");
    const pts = currentCompanionSourcePts(video);
    setNowPlayingIcon(companionUserPaused || video.paused ? "pause" : "play");
    $("npTime").textContent =
      formatCompanionTime(pts) +
      (companionSourceDuration !== null ? " / " + formatCompanionTime(companionSourceDuration) : "");
  } else {
    setNowPlayingIcon("live");
    $("npTime").textContent = "实时画面";
  }
}

// Same line-drawn glyphs as the dock buttons, never system emoji.
const NOW_PLAYING_ICONS = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>',
  live: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle class="fill" cx="12" cy="12" r="4.5"/></svg>'
};
function setNowPlayingIcon(kind) {
  const icon = $("npIcon");
  if (icon.dataset.icon === kind) return;
  icon.dataset.icon = kind;
  icon.innerHTML = NOW_PLAYING_ICONS[kind] || NOW_PLAYING_ICONS.live;
}

function setRemoteDrawer(open) {
  remoteDrawerOpen = Boolean(open);
  $("remoteDrawer").classList.toggle("open", remoteDrawerOpen);
  $("drawerToggle").setAttribute("aria-expanded", String(remoteDrawerOpen));
  writePref("tongping-remote-drawer", remoteDrawerOpen ? "1" : "0");
}

function setMenuOpen(open) {
  $("menuSheet").hidden = !open;
  $("menuToggle").setAttribute("aria-expanded", String(Boolean(open)));
}

const BOOKMARK_NAMES = [
  ["douyin.com", "抖音"],
  ["bilibili.com", "B站"],
  ["xiaohongshu.com", "小红书"],
  ["youtube.com", "YouTube"],
  ["iqiyi.com", "爱奇艺"],
  ["v.qq.com", "腾讯视频"],
  ["youku.com", "优酷"]
];
function bookmarkLabel(url) {
  let host = "";
  try { host = new URL(url).hostname; } catch { return String(url).slice(0, 24); }
  if (host.startsWith("www.")) host = host.slice(4);
  const known = BOOKMARK_NAMES.find((item) => host === item[0] || host.endsWith("." + item[0]));
  let label = known ? known[1] : host;
  try {
    const path = new URL(url).pathname;
    if (known && path && path !== "/") label += " · " + path.split("/").filter(Boolean)[0];
  } catch {}
  return label;
}
function loadBookmarks() {
  try {
    const raw = JSON.parse(readPref("tongping-bookmarks") || "null");
    if (Array.isArray(raw)) {
      return raw
        .filter((item) => item && typeof item.url === "string" && /^https?:/.test(item.url))
        .slice(0, 24);
    }
  } catch {}
  return [
    { url: "https://www.douyin.com/jingxuan", title: "抖音 · 精选" },
    { url: "https://www.bilibili.com/", title: "B站" }
  ];
}
var bookmarks = loadBookmarks();
function currentBookmarkUrl() {
  const value = String(state.url || $("address").value || "").trim();
  return /^https?:/.test(value) ? value : "";
}
function renderBookmarks() {
  const box = $("bookmarks");
  box.textContent = "";
  for (const item of bookmarks) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "bookmarkChip";
    chip.title = item.url;
    const label = document.createElement("span");
    label.textContent = item.title || bookmarkLabel(item.url);
    const remove = document.createElement("b");
    remove.textContent = "×";
    remove.setAttribute("aria-label", "删除收藏");
    remove.addEventListener("click", (event) => {
      event.stopPropagation();
      bookmarks = bookmarks.filter((entry) => entry.url !== item.url);
      writePref("tongping-bookmarks", JSON.stringify(bookmarks));
      renderBookmarks();
    });
    chip.append(label, remove);
    chip.addEventListener("click", () => {
      $("address").value = item.url;
      $("open").click();
    });
    box.appendChild(chip);
  }
  const url = currentBookmarkUrl();
  $("bookmarkAdd").classList.toggle("on", Boolean(url) && bookmarks.some((entry) => entry.url === url));
}
function toggleCurrentBookmark() {
  const url = currentBookmarkUrl();
  if (!url) {
    setNudgeStatus("先打开一个网页再收藏");
    return;
  }
  if (bookmarks.some((entry) => entry.url === url)) {
    bookmarks = bookmarks.filter((entry) => entry.url !== url);
  } else {
    bookmarks = [{ url, title: bookmarkLabel(url) }].concat(bookmarks).slice(0, 24);
  }
  writePref("tongping-bookmarks", JSON.stringify(bookmarks));
  renderBookmarks();
}

function renderChromeExtras() {
  // render() can run before this block has initialised (hoisted call).
  if (!Array.isArray(bookmarks) || !$("remoteDrawer")) return;
  const takeover = Boolean(state.takeover);
  if (takeover && !lastRenderedTakeover && !remoteDrawerOpen) setRemoteDrawer(true);
  lastRenderedTakeover = takeover;
  if ($("bookmarks")) {
    const url = currentBookmarkUrl();
    $("bookmarkAdd").classList.toggle("on", Boolean(url) && bookmarks.some((entry) => entry.url === url));
  }
}

applySkin(readPref("tongping-skin") || "candy", false);
applyScreenCollapsed(readPref("tongping-screen-collapsed") === "1");
$("screenToggle").addEventListener("click", () => setScreenCollapsed(!screenCollapsed));
$("npExpand").addEventListener("click", () => setScreenCollapsed(false));
setRemoteDrawer(readPref("tongping-remote-drawer") === "1");
renderBookmarks();
$("skinToggle").addEventListener("click", () => {
  const index = APP_SKINS.findIndex((item) => item[0] === currentSkin);
  applySkin(APP_SKINS[(index + 1) % APP_SKINS.length][0], true);
});
$("menuToggle").addEventListener("click", (event) => {
  event.stopPropagation();
  setMenuOpen($("menuSheet").hidden);
});
document.addEventListener("click", (event) => {
  const sheet = $("menuSheet");
  if (!sheet.hidden && !sheet.contains(event.target) && event.target !== $("menuToggle")) {
    setMenuOpen(false);
  }
});
$("drawerToggle").addEventListener("click", () => setRemoteDrawer(!remoteDrawerOpen));

// Live sound is on by default, but a page may only start audio from a tap:
// the first tap anywhere turns it on unless the viewer switched it off.
function armDefaultLiveSound(event) {
  if (readPref("tongping-live-sound") === "0") {
    document.removeEventListener("pointerdown", armDefaultLiveSound, true);
    return;
  }
  if (event && event.target && $("sound").contains(event.target)) return;
  if (audioEnabled || companionModeActive || !state.audioUrl || !connected) return;
  document.removeEventListener("pointerdown", armDefaultLiveSound, true);
  void toggleAudio();
}
document.addEventListener("pointerdown", armDefaultLiveSound, true);
$("bookmarkAdd").addEventListener("click", () => toggleCurrentBookmark());

$("companion").addEventListener("click", () => { void toggleCompanionMode(); });
$("companionPause").addEventListener("click", () => { toggleCompanionUserPause(); });
$("pausedOverlay").addEventListener("click", () => {
  if (companionUserPaused) toggleCompanionUserPause();
});
$("companionCancel").addEventListener("click", () => {
  if (companionModeActive) {
    stopCompanionPlayback(true);
    setNudgeStatus("已回到 LIVE");
  }
});
$("companionStart").addEventListener("click", () => {
  void startPreparedCompanionPlayback();
});
$("sound").addEventListener("click", () => { void toggleAudio(); });
$("typeText").addEventListener("click", sendHumanText);
$("humanText").addEventListener("keydown", (event) => { if (event.key === "Enter") void sendHumanText(); });
$("enter").addEventListener("click", () => key("Enter"));
$("esc").addEventListener("click", () => key("Escape"));
$("talkSend").addEventListener("click", sendToAi);
$("voiceToggle").addEventListener("click", () => setVoiceMode(!voiceMode));
cameraLook = readPref("tongping-camera-look") || "soft";
$("cameraToggle").addEventListener("click", () => {
  if (cameraOn) closeCamera(true);
  else void openCamera();
});
$("cameraClose").addEventListener("click", () => closeCamera(true));
$("cameraFlip").addEventListener("click", () => {
  if (cameraOn && window.TongpingCameraFx) {
    void window.TongpingCameraFx.flip().catch((error) => setError(cameraErrorMessage(error)));
  }
});
window.addEventListener("pagehide", () => closeCamera(false));
$("holdToTalk").addEventListener("pointerdown", (event) => { void startVoiceNote(event); });
$("holdToTalk").addEventListener("pointermove", moveVoiceNote);
$("holdToTalk").addEventListener("pointerup", () => { void finishVoiceNote(false); });
$("holdToTalk").addEventListener("pointercancel", () => { void finishVoiceNote(true); });
$("holdToTalk").addEventListener("contextmenu", (event) => event.preventDefault());
$("talkText").addEventListener("keydown", (event) => { if (event.key === "Enter") void sendToAi(); });
document.addEventListener("visibilitychange", () => {
  if (
    document.visibilityState === "visible" &&
    audioEnabled &&
    audioContext &&
    audioContext.state === "suspended"
  ) {
    void audioContext.resume().catch(() => {});
  }
});
$("identity").addEventListener("change", () => {
  state.identity = normalizeIdentity($("identity").value);
  void refreshFrame();
});
$("profile").addEventListener("change", () => {
  if (companionModeActive) stopCompanionPlayback(false);
  resetChatLane();
  state.profile = normalizeProfile($("profile").value);
  state.chatUrl = "";
  state.watchCollectionUrl = "";
  state.watchCollectionWriteUrl = "";
  currentWatchTicket = null;
  renderCurrentWatchTicket();
  closeMediaSocket(true, true);
  closeLiveSocket();
  state.frameUrl = "";
  state.liveUrl = "";
  state.mediaUrl = "";
  closeAudioSocket(true);
  state.audioUrl = "";
  state.inputUrl = "";
  state.controlUrl = "";
  state.base64 = "";
  liveFailed = false;
  liveSuperseded = false;
  liveRetryCount = 0;
  liveImageErrors = 0;
  $("frame").removeAttribute("data-mode");
  remoteCursor = null;
  remoteHeld = false;
  trackGesture = null;
  leftPointerId = null;
  rightPointerId = null;
  lastPadTapAt = 0;
  lastPadTapPoint = null;
  moveCommandInFlight = false;
  pendingRemoteMove = null;
  hideContextMirror();
  render();
  void refreshFrame();
});
function activeViewportElement() {
  // Buffered media is never coordinate authority. Controls only read the
  // realtime surface after takeover/navigation has switched lanes.
  return $("liveCanvas").style.display !== "none"
    ? $("liveCanvas")
    : $("frame");
}

function logicalPoint(clientX, clientY) {
  const frame = activeViewportElement();
  const rect = frame.getBoundingClientRect();
  const logicalWidth = Number(
    state.viewport.width || frame.naturalWidth || 0
  );
  const logicalHeight = Number(
    state.viewport.height || frame.naturalHeight || 0
  );
  if (!logicalWidth || !logicalHeight || !rect.width || !rect.height) {
    return null;
  }
  return {
    x: Math.max(
      0,
      Math.min(
        logicalWidth,
        (clientX - rect.left) * logicalWidth / rect.width
      )
    ),
    y: Math.max(
      0,
      Math.min(
        logicalHeight,
        (clientY - rect.top) * logicalHeight / rect.height
      )
    )
  };
}

function showPointer(event) {
  const wrap = $("viewportWrap").getBoundingClientRect();
  $("pointerDot").style.left = (event.clientX - wrap.left) + "px";
  $("pointerDot").style.top = (event.clientY - wrap.top) + "px";
  $("pointerDot").classList.add("on");
}

function hidePointer() {
  $("pointerDot").classList.remove("on");
}

async function postPointer(phase, point, options = {}) {
  await sendLiveCommand({
    type: "pointer",
    phase,
    x: point.x,
    y: point.y,
    button: options.button === "right" ? "right" : "left",
    clickCount: options.clickCount === 2 ? 2 : 1
  }, 9000);
}

async function clickRemote(button = "left", clickCount = 1) {
  const cursor = ensureRemoteCursor();
  const options = {
    button: button === "right" ? "right" : "left",
    clickCount: clickCount === 2 ? 2 : 1
  };

  // Keep taps on the realtime websocket. Send DOWN immediately, keep a short
  // real press interval locally, then send UP without waiting for the DOWN
  // round-trip. The worker serializes pointer commands in order.
  setNudgeStatus(
    (clickCount === 2 ? "双击" : button === "right" ? "右键" : "单击") +
    " · 发送中…"
  );
  const down = postPointer("down", cursor, options);
  await new Promise((resolve) => setTimeout(resolve, 36));
  const up = postPointer("up", cursor, options);
  await Promise.all([down, up]);
  setNudgeStatus(
    (clickCount === 2 ? "双击" : button === "right" ? "右键" : "单击") +
    " · 已发送 · x=" + Math.round(cursor.x) +
    " y=" + Math.round(cursor.y)
  );
}

// The person this card belongs to. The personal server names her; on the
// shared pilot server nobody's name is baked into the card.
function userShownName() { return state.userName || "我"; }
function userAiName() { return state.userName || "the user"; }
function userZhName() { return state.userName || "用户"; }

function setNudgeStatus(text) {
  $("nudgeStatus").textContent = text;
}

function ensureRemoteCursor() {
  if (remoteCursor) return remoteCursor;
  const width = Number(state.viewport.width || 768);
  const height = Number(state.viewport.height || 1024);
  remoteCursor = { x: width / 2, y: height / 2 };
  return remoteCursor;
}

function updateRemoteCursorOverlay() {
  if (!remoteCursor || !state.takeover) {
    $("pointerDot").classList.remove("on");
    return;
  }
  const active = activeViewportElement();
  const frameRect = active.getBoundingClientRect();
  const wrapRect = $("viewportWrap").getBoundingClientRect();
  const width = Number(state.viewport.width || $("frame").naturalWidth || 0);
  const height = Number(state.viewport.height || $("frame").naturalHeight || 0);
  if (!width || !height || !frameRect.width || !frameRect.height) return;
  $("pointerDot").style.left =
    (frameRect.left - wrapRect.left + remoteCursor.x / width * frameRect.width) + "px";
  $("pointerDot").style.top =
    (frameRect.top - wrapRect.top + remoteCursor.y / height * frameRect.height) + "px";
  $("pointerDot").classList.add("on");
}

async function moveRemoteBy(dx, dy) {
  const cursor = ensureRemoteCursor();
  const width = Number(state.viewport.width || 768);
  const height = Number(state.viewport.height || 1024);
  remoteCursor = {
    x: Math.max(0, Math.min(width, cursor.x + dx)),
    y: Math.max(0, Math.min(height, cursor.y + dy))
  };
  updateRemoteCursorOverlay();
  pendingRemoteMove = { x: remoteCursor.x, y: remoteCursor.y };
  void pumpRemoteMove();
  setNudgeStatus(
    (remoteHeld ? "拖拽中 · " : "") +
    "x=" + Math.round(remoteCursor.x) +
    " y=" + Math.round(remoteCursor.y)
  );
}

async function pumpRemoteMove() {
  if (moveCommandInFlight) return;
  moveCommandInFlight = true;
  try {
    while (pendingRemoteMove) {
      const point = pendingRemoteMove;
      pendingRemoteMove = null;
      try {
        await postPointer("move", point);
      } catch (error) {
        setError(error && error.message ? error.message : error);
        // Do not replay stale intermediate moves after a timeout.
        pendingRemoteMove = null;
        break;
      }
    }
  } finally {
    moveCommandInFlight = false;
    if (pendingRemoteMove) void pumpRemoteMove();
  }
}

function noteMouseStatus(prefix = "") {
  const cursor = ensureRemoteCursor();
  setNudgeStatus(
    (prefix ? prefix + " · " : "") +
    "x=" + Math.round(cursor.x) +
    " y=" + Math.round(cursor.y)
  );
}

$("leftMouse").addEventListener("pointerdown", (event) => {
  if (!state.takeover || leftPointerId !== null) return;
  const cursor = ensureRemoteCursor();
  pendingRemoteMove = null;
  leftPointerId = event.pointerId;
  remoteHeld = true;
  $("leftMouse").classList.add("pressed");
  try { $("leftMouse").setPointerCapture(event.pointerId); } catch {}
  noteMouseStatus("左键按住");
  void postPointer("down", cursor, { button: "left", clickCount: 1 })
    .catch((error) => {
      remoteHeld = false;
      $("leftMouse").classList.remove("pressed");
      setError(error && error.message ? error.message : error);
    });
  event.preventDefault();
});

function releaseLeftMouse(event) {
  if (leftPointerId === null || event.pointerId !== leftPointerId) return;
  const cursor = ensureRemoteCursor();
  pendingRemoteMove = null;
  try { $("leftMouse").releasePointerCapture(leftPointerId); } catch {}
  leftPointerId = null;
  remoteHeld = false;
  $("leftMouse").classList.remove("pressed");
  noteMouseStatus("左键");
  void postPointer("up", cursor, { button: "left", clickCount: 1 })
    .catch((error) => setError(error && error.message ? error.message : error));
  event.preventDefault();
}
$("leftMouse").addEventListener("pointerup", releaseLeftMouse);
$("leftMouse").addEventListener("pointercancel", releaseLeftMouse);

$("rightMouse").addEventListener("pointerdown", (event) => {
  if (!state.takeover || rightPointerId !== null) return;
  const cursor = ensureRemoteCursor();
  pendingRemoteMove = null;
  rightPointerId = event.pointerId;
  $("rightMouse").classList.add("pressed");
  try { $("rightMouse").setPointerCapture(event.pointerId); } catch {}
  noteMouseStatus("右键");
  void postPointer("down", cursor, { button: "right", clickCount: 1 })
    .catch((error) => {
      $("rightMouse").classList.remove("pressed");
      setError(error && error.message ? error.message : error);
    });
  event.preventDefault();
});

function releaseRightMouse(event) {
  if (rightPointerId === null || event.pointerId !== rightPointerId) return;
  const cursor = ensureRemoteCursor();
  try { $("rightMouse").releasePointerCapture(rightPointerId); } catch {}
  rightPointerId = null;
  $("rightMouse").classList.remove("pressed");
  void postPointer("up", cursor, { button: "right", clickCount: 1 })
    .then(() => {
      void openContextMirror(cursor);
    })
    .catch((error) => setError(error && error.message ? error.message : error));
  event.preventDefault();
}
$("rightMouse").addEventListener("pointerup", releaseRightMouse);
$("rightMouse").addEventListener("pointercancel", releaseRightMouse);

$("trackpad").addEventListener("pointerdown", (event) => {
  if (!state.takeover || trackGesture) return;
  ensureRemoteCursor();
  trackGesture = {
    id: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    x: event.clientX,
    y: event.clientY,
    startedAt: performance.now(),
    distance: 0,
    dismissMenu: contextMenuOpen
  };
  $("trackpad").classList.add("active");
  $("trackDot").style.left = (event.offsetX || 0) + "px";
  $("trackDot").style.top = (event.offsetY || 0) + "px";
  $("trackDot").classList.add("on");
  try { $("trackpad").setPointerCapture(event.pointerId); } catch {}
  event.preventDefault();
});

$("trackpad").addEventListener("pointermove", (event) => {
  if (!trackGesture || trackGesture.id !== event.pointerId) return;
  const dx = event.clientX - trackGesture.x;
  const dy = event.clientY - trackGesture.y;
  trackGesture.x = event.clientX;
  trackGesture.y = event.clientY;
  trackGesture.distance += Math.hypot(dx, dy);
  if (trackGesture.dismissMenu) {
    event.preventDefault();
    return;
  }
  $("trackDot").style.left = (event.offsetX || 0) + "px";
  $("trackDot").style.top = (event.offsetY || 0) + "px";
  const distance = Math.hypot(dx, dy);
  if (distance > 0.2) {
    const gain = Math.max(3.2, Math.min(6.0, 2.9 + distance * 0.10));
    void moveRemoteBy(dx * gain, dy * gain).catch((error) => {
      setError(error && error.message ? error.message : error);
    });
  }
  event.preventDefault();
});

function endTrackGesture(event) {
  if (!trackGesture || trackGesture.id !== event.pointerId) return;
  const gesture = trackGesture;
  trackGesture = null;
  $("trackpad").classList.remove("active");
  $("trackDot").classList.remove("on");
  try { $("trackpad").releasePointerCapture(event.pointerId); } catch {}

  const elapsed = performance.now() - gesture.startedAt;
  const netDistance = Math.hypot(
    gesture.x - gesture.startX,
    gesture.y - gesture.startY
  );
  // iOS emits tiny pointermove jitter during an otherwise stationary tap.
  // Judge a tap by net displacement instead of accumulated micro-movement.
  const isTap =
    netDistance <= 16 &&
    gesture.distance <= 32 &&
    elapsed <= 560;

  if (
    gesture.dismissMenu &&
    isTap &&
    event.type !== "pointercancel"
  ) {
    hideContextMirror();
    lastPadTapAt = 0;
    lastPadTapPoint = null;
    setNudgeStatus("右键菜单已关闭");
    void key("Escape");
    event.preventDefault();
    return;
  }

  if (isTap && !remoteHeld && event.type !== "pointercancel") {
    const now = performance.now();
    const cursor = ensureRemoteCursor();
    const prior = lastPadTapPoint;
    const nearPrior =
      prior &&
      Math.hypot(cursor.x - prior.x, cursor.y - prior.y) <= 18;
    const isDouble = nearPrior && now - lastPadTapAt <= 340;
    lastPadTapAt = now;
    lastPadTapPoint = { x: cursor.x, y: cursor.y };
    void clickRemote("left", isDouble ? 2 : 1)
      .then(() => noteMouseStatus(isDouble ? "双击" : "单击"))
      .catch((error) => setError(error && error.message ? error.message : error));
    if (isDouble) {
      lastPadTapAt = 0;
      lastPadTapPoint = null;
    }
  } else {
    noteMouseStatus(remoteHeld ? "拖拽中" : "移动");
  }

  event.preventDefault();
}
$("trackpad").addEventListener("pointerup", endTrackGesture);
$("trackpad").addEventListener("pointercancel", endTrackGesture);

$("contextMirror").addEventListener("click", (event) => {
  const button = event.target instanceof Element
    ? event.target.closest("button[data-context-action]")
    : null;
  if (!(button instanceof HTMLButtonElement)) return;

  const action = button.dataset.contextAction || "";
  const href =
    contextMenuTarget && typeof contextMenuTarget.href === "string"
      ? contextMenuTarget.href
      : "";

  hideContextMirror();
  lastPadTapAt = 0;
  lastPadTapPoint = null;

  if (action === "back") {
    void historyNavigate("back");
  } else if (action === "forward") {
    void historyNavigate("forward");
  } else if (action === "reload") {
    void reloadPage();
  } else if (action === "open-link" && href) {
    $("address").value = href;
    void call("browser_app_navigate", actorArgs({ url: href }))
      .then((data) => {
        applyState(data);
        startPolling();
      })
      .catch((error) => setError(error && error.message ? error.message : error));
  } else if (action === "copy-link" && href) {
    void copyText(href)
      .then(() => setNudgeStatus("链接地址已复制"))
      .catch((error) => setError(error && error.message ? error.message : error));
  } else {
    setNudgeStatus("右键菜单已关闭");
  }

  event.preventDefault();
  event.stopPropagation();
});

$("fullscreen").addEventListener("click", async () => {
  try {
    const target = state.displayMode === "fullscreen" ? "inline" : "fullscreen";
    const result = await app.requestDisplayMode({ mode: target });
    state.displayMode = result.mode || target;
    try { applyHostLayout(app.getHostContext && app.getHostContext()); } catch {}
    // v90: the button lives in the menu sheet; get panels out of the way
    // so fullscreen actually shows the picture.
    setMenuOpen(false);
    if (state.displayMode === "fullscreen") setRemoteDrawer(false);
    render();
    requestAnimationFrame(() => {
      refreshImage();
      scheduleLiveFrameResync();
    });
  } catch (error) {
    setError(error && error.message ? error.message : error);
  }
});

app.ontoolresult = (result) => {
  const data = structured(result);
  if (data && data.kind === "tongping") {
    applyState(data);
    void refreshFrame();
    startPolling();
  }
};
function applyHostLayout(ctx) {
  const inset = (ctx && ctx.safeAreaInsets) || {};
  let top = Number(inset.top) || 0;
  let bottom = Number(inset.bottom) || 0;
  let isClaudeHost = false;
  if (state.displayMode === "fullscreen") {
    let hostName = "";
    try {
      const info = app.getHostVersion && app.getHostVersion();
      hostName = String((info && info.name) || "");
    } catch {}
    // Claude's fullscreen draws its close button/title over the top and its
    // composer over the bottom; keep the card clear even without insets.
    isClaudeHost = /claude|anthropic/i.test(hostName);
    if (isClaudeHost) {
      top = Math.max(top, 64);
      bottom = Math.max(bottom, 120);
    }
    // ChatGPT's fullscreen floats its composer over the bottom of the card
    // too, and does not always report it as a safe-area inset.
    const openai = window.openai;
    if (openai || /chatgpt|openai/i.test(hostName)) {
      const openaiInsets = (openai && openai.safeArea && openai.safeArea.insets) || {};
      top = Math.max(top, Number(openaiInsets.top) || 0);
      bottom = Math.max(bottom, Number(openaiInsets.bottom) || 0, 120);
    }
  } else {
    top = 0;
    bottom = 0;
  }
  $("shell").classList.toggle("hostClaude", isClaudeHost);
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--host-top", top + "px");
  rootStyle.setProperty("--host-bottom", bottom + "px");
}

app.onhostcontextchanged = (ctx) => {
  if (ctx && ctx.displayMode) state.displayMode = ctx.displayMode;
  applyHostLayout(ctx || (app.getHostContext && app.getHostContext()));
  if (ctx && ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx && ctx.styles && ctx.styles.variables) applyHostStyleVariables(ctx.styles.variables);
  if (ctx && ctx.styles && ctx.styles.css && ctx.styles.css.fonts) applyHostFonts(ctx.styles.css.fonts);
  if (ctx && ctx.displayMode) {
    state.displayMode = ctx.displayMode;
    render();
    requestAnimationFrame(() => {
      refreshImage();
      scheduleLiveFrameResync();
    });
  }
};

loadWatchCollectionLocalPrefs();
renderWatchCollectionState();
renderCurrentWatchTicket();

try {
  await app.connect();
  connected = true;
  const ctx = app.getHostContext && app.getHostContext();
  if (ctx) {
    if (ctx.theme) applyDocumentTheme(ctx.theme);
    if (ctx.styles && ctx.styles.variables) applyHostStyleVariables(ctx.styles.variables);
    if (ctx.styles && ctx.styles.css && ctx.styles.css.fonts) applyHostFonts(ctx.styles.css.fonts);
    if (ctx.displayMode) state.displayMode = ctx.displayMode;
  }
  applyHostLayout(ctx);
  render();
  startChatSync();
} catch (error) {
  setError("MCP App 连接失败：" + (error && error.message ? error.message : error));
}
</script>
</body>
</html>`;
}
