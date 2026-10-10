import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mergeOcrCue, normalizeOcrText, pickSubtitleText } from "../src/subtitle-ocr.js";
import type { RawSubtitleCue } from "../src/media-context.js";

test("OCR text drops the spaces Windows puts between CJK characters", () => {
  assert.equal(normalizeOcrText("直 到 最 近 ， 门 正 在 重 新 打 开"), "直到最近，门正在重新打开");
  assert.equal(normalizeOcrText("Until  recently"), "Until recently");
});

test("only the centred subtitle survives; badges, @authors and hashtags are dropped", () => {
  const lines = [
    { text: "作 者 声 明 ： 内 容 由 AI 生 成", left: 10, right: 300, top: 0, bottom: 20 },
    { text: "@ 白 袋 子", left: 400, right: 560, top: 0, bottom: 20 },
    { text: "直 到 最 近", left: 380, right: 580, top: 40, bottom: 80 },
    { text: "02:09 / 07:23", left: 420, right: 540, top: 90, bottom: 100 },
  ];
  assert.equal(pickSubtitleText(lines, 960), "直到最近");
});

test("a line that stays on screen extends one cue; a new line starts another", () => {
  const cues: RawSubtitleCue[] = [];
  mergeOcrCue(cues, "直到最近", 10);
  mergeOcrCue(cues, "直到最近", 11.5);
  mergeOcrCue(cues, "门正在重新打开", 13);
  mergeOcrCue(cues, "", 14);
  assert.deepEqual(cues.map((cue) => [cue.startTime, cue.endTime, cue.text]), [
    [10, 11.5, "直到最近"],
    [13, 13, "门正在重新打开"],
  ]);
});

test("OCR runs only with companion capture and feeds the gated subtitle lane", () => {
  const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");
  assert.match(manager, /if \(keepSourcePlaying\) this\.startSubtitleOcr\(normalized\);/);
  assert.match(manager, /async stopLiveMedia\(profile: string\): Promise<void> \{\n    const normalized = normalizeProfile\(profile\);\n    this\.stopSubtitleOcr\(normalized\);/);
  assert.match(manager, /gateSubtitleCues\(ocrLoop\.cues, chosen\.currentTime, lookbackSeconds, maxCues\)/);
  assert.match(manager, /"ocr-burned-in"/);
});

test("the OCR crop is drawn from the video frame in-page, never a flashing CDP screenshot", () => {
  const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");
  const loop = manager.slice(manager.indexOf("  private startSubtitleOcr("), manager.indexOf("  private stopSubtitleOcr("));
  assert.ok(!loop.includes("page.screenshot("));
  assert.match(loop, /ctx\.drawImage\(best, sx, sy, sw, sh, 0, 0, canvas\.width, canvas\.height\)/);
});

test("misread badges without real words are not dialogue", () => {
  assert.equal(pickSubtitleText([{ text: "00 黔", left: 400, right: 560, top: 0, bottom: 20 }], 960), "");
  assert.equal(pickSubtitleText([{ text: "Until recently", left: 400, right: 560, top: 0, bottom: 20 }], 960), "Until recently");
});
