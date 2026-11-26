import assert from "node:assert/strict";
import { buildSync } from "esbuild";

const bundle = buildSync({
  entryPoints: ["state/audio.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  external: ["@/state/types"],
  alias: { "@/state/types": "./state/types.ts" },
});
const model = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const {
  AUDIO_JOURNAL_MAX_MS,
  AUDIO_MAX_BYTES,
  AUDIO_PEAK_COUNT,
  AUDIO_PRAYER_MAX_MS,
  AUDIO_REPLY_MAX_MS,
  audioPathFor,
  audioScopeForPath,
  displayableAudio,
  formatAudioDuration,
  heightsFromPeaks,
  isAudioClip,
  isAudioClipId,
  isAudioPath,
  levelFromMetering,
  neutralPeaks,
  newAudioClipId,
  peaksFromLevels,
  smoothLevel,
} = model;

assert.equal(AUDIO_PRAYER_MAX_MS, 180_000);
assert.equal(AUDIO_REPLY_MAX_MS, 60_000);
assert.equal(AUDIO_JOURNAL_MAX_MS, 300_000);
assert.equal(AUDIO_MAX_BYTES, 1_572_864);

// Metering: -55 dB is silence, 0 dB is full scale, and missing metering is silence.
assert.equal(levelFromMetering(undefined), 0);
assert.equal(levelFromMetering(-80), 0);
assert.equal(levelFromMetering(-55), 0);
assert.equal(levelFromMetering(0), 1);
const half = levelFromMetering(-27.5);
assert.ok(half > 0.5 && half < 0.8, `half level was ${half}`);

// Release is slower than attack so the bars do not flicker.
const rising = smoothLevel(0, 1);
const falling = smoothLevel(1, 0);
assert.ok(rising > 0.5);
assert.ok(falling > 0.8);

// Peaks: one byte per bar, 96 lowercase hex characters.
const levels = Array.from({ length: 480 }, (_, index) => (index % 10) / 10);
const peaks = peaksFromLevels(levels);
assert.equal(peaks.length, AUDIO_PEAK_COUNT * 2);
assert.match(peaks, /^[a-f0-9]{96}$/);
assert.equal(peaksFromLevels([]).length, 96);
assert.equal(neutralPeaks(), "0".repeat(96));
const heights = heightsFromPeaks(peaks);
assert.equal(heights.length, 48);
assert.ok(heights.every((value) => value >= 0 && value <= 1));
assert.equal(heightsFromPeaks(undefined), undefined);
assert.equal(heightsFromPeaks("zz"), undefined);

assert.equal(formatAudioDuration(0), "0:00");
assert.equal(formatAudioDuration(59_000), "0:59");
assert.equal(formatAudioDuration(60_000), "1:00");
assert.equal(formatAudioDuration(180_000), "3:00");
assert.equal(formatAudioDuration(-1), "0:00");

const clipId = newAudioClipId();
assert.match(clipId, /^clip_[a-z0-9]{6,40}$/);
assert.equal(isAudioClipId(clipId), true);
assert.equal(isAudioClipId("clip_ABC"), false);
assert.equal(audioPathFor("user", "uid_1", clipId), `audio/users/uid_1/${clipId}.m4a`);
assert.equal(audioPathFor("group", "group_1", clipId), `audio/groups/group_1/${clipId}.m4a`);
assert.equal(audioScopeForPath(`audio/users/uid_1/${clipId}.m4a`), "user");
assert.equal(audioScopeForPath(`audio/groups/group_1/${clipId}.m4a`), "group");
assert.equal(isAudioPath(`audio/users/uid_1/${clipId}.m4a`), true);
assert.equal(isAudioPath(`audio/users/../${clipId}.m4a`), false);
assert.equal(isAudioPath(`audio/users/uid_1/${clipId}.mp3`), false);

const clip = {
  id: clipId,
  path: `audio/users/uid_1/${clipId}.m4a`,
  durationMs: 12_000,
  bytes: 48_000,
  mime: "audio/mp4",
  peaks,
  createdAt: new Date().toISOString(),
};
assert.equal(isAudioClip(clip), true);
assert.deepEqual(displayableAudio(clip), clip);
assert.equal(displayableAudio({ ...clip, path: "audio/users/other/x.m4a" }), undefined);
assert.equal(displayableAudio({ ...clip, durationMs: 0 }), undefined);
assert.equal(displayableAudio({ ...clip, bytes: AUDIO_MAX_BYTES + 1 }), undefined);
assert.equal(displayableAudio({ ...clip, peaks: "00" }), undefined);
assert.equal(displayableAudio(null), undefined);

console.log("audio: ok");
