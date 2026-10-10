import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { DelayedCompanionHls } from "../src/delayed-companion-hls.js";

test("delayed companion playlist publishes the whole window, starts the player `delay` behind, and rewrites signed fMP4 URLs", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tongping-hls-"));
  const profile = "gpt-self";
  const dir = path.join(root, profile);
  await mkdir(dir, { recursive: true });
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    "#EXT-X-TARGETDURATION:2",
    "#EXT-X-MEDIA-SEQUENCE:1",
    '#EXT-X-MAP:URI="init.mp4"',
  ];
  for (let i = 1; i <= 8; i += 1) {
    lines.push("#EXTINF:2.000,");
    lines.push("seg_" + String(i).padStart(6, "0") + ".m4s");
  }
  await writeFile(path.join(dir, "index.m3u8"), lines.join("\n") + "\n");
  await writeFile(path.join(dir, "init.mp4"), Buffer.from("init"));

  const hls = new DelayedCompanionHls(root);
  const playlist = await hls.playlist(
    profile,
    8,
    "profile=gpt-self&exp=123&sig=abc",
  );
  assert.ok(playlist);
  assert.match(playlist, /companion-file\?profile=gpt-self&exp=123&sig=abc&name=init\.mp4/);
  assert.match(playlist, /seg_000004\.m4s/);
  // The newest media is published so the phone can buffer ahead of its
  // playhead; the player is asked to start `delay` seconds behind the edge.
  assert.match(playlist, /seg_000008\.m4s/);
  assert.match(playlist, /#EXT-X-START:TIME-OFFSET=-8,PRECISE=YES/);
  // Until the window holds delay + 4s there is nothing to start from.
  const tooShort = path.join(root, "short");
  await mkdir(tooShort, { recursive: true });
  await writeFile(
    path.join(tooShort, "index.m3u8"),
    lines.slice(0, 5 + 2 * 5).join("\n") + "\n",
  );
  assert.equal(await hls.playlist("short", 8, "profile=short&exp=1&sig=x"), null);

  const init = await hls.file(profile, "init.mp4");
  assert.equal(init?.toString(), "init");
  assert.equal(await hls.file(profile, "../secret"), null);
  await rm(root, { recursive: true, force: true });
});

test("generated fMP4 playlist points to its actual initialization file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "tongping-hls-generation-"));
  const profile = "gpt-self";
  const dir = path.join(root, profile);
  await mkdir(dir, { recursive: true });
  const initName = "init_media-generation-abc.mp4";
  const lines = [
    "#EXTM3U",
    "#EXT-X-VERSION:7",
    "#EXT-X-TARGETDURATION:2",
    "#EXT-X-MEDIA-SEQUENCE:123",
    '#EXT-X-MAP:URI="' + initName + '"',
  ];
  for (let i = 123; i <= 130; i++) {
    lines.push("#EXTINF:2.000,");
    lines.push("seg_media-generation-abc_" + i + ".m4s");
  }
  await writeFile(path.join(dir, "index.m3u8"), lines.join("\n") + "\n");
  await writeFile(path.join(dir, initName), Buffer.from("generated-init"));
  const hls = new DelayedCompanionHls(root);
  try {
    const playlist = await hls.playlist(profile, 8, "profile=gpt-self&exp=123&sig=abc");
    assert.ok(playlist);
    const mapUri = playlist.match(/#EXT-X-MAP:URI="([^"]+)"/)?.[1];
    assert.ok(mapUri);
    const name = new URL(mapUri, "https://example.test").searchParams.get("name");
    assert.equal(name, initName);
    assert.equal((await hls.file(profile, name!))?.toString(), "generated-init");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
