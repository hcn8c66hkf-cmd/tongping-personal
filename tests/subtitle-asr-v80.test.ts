import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pcm16Rms, pcm16ToWav } from "../src/subtitle-asr.js";

test("PCM is wrapped as a 16 kHz mono WAV and silence is measurable", () => {
  const pcm = Buffer.alloc(32000);
  const wav = pcm16ToWav(pcm, 16000);
  assert.equal(wav.toString("ascii", 0, 4), "RIFF");
  assert.equal(wav.readUInt32LE(24), 16000);
  assert.equal(wav.readUInt16LE(22), 1);
  assert.equal(wav.length, 44 + 32000);
  assert.equal(pcm16Rms(pcm), 0);
  const loud = Buffer.alloc(4);
  loud.writeInt16LE(1000, 0);
  loud.writeInt16LE(-1000, 2);
  assert.equal(Math.round(pcm16Rms(loud)), 1000);
});

test("speech cues share the OCR lane and its timestamp gate", () => {
  const manager = fs.readFileSync(new URL("../src/browser-manager.ts", import.meta.url), "utf8");
  assert.match(manager, /gateSubtitleCues\(asrState\.cues, chosen\.currentTime, lookbackSeconds, maxCues\)/);
  assert.match(manager, /if \(state\.busy \|\| pcm16Rms\(clip\) < 250\) return;/);
  assert.match(manager, /"asr-speech"/);
  // The tap feeds a muted gain node so the helper page never plays audio.
  assert.match(manager, /mute\.gain\.value = 0;/);
});
