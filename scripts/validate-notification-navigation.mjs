import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";

const directory = await mkdtemp(path.join(process.cwd(), "node_modules", "koino-notification-navigation-"));
try {
  const outfile = path.join(directory, "navigation.cjs");
  await build({ entryPoints: ["ui/notification-navigation.ts"], bundle: true, platform: "node", format: "cjs", outfile });
  const require = createRequire(import.meta.url);
  const { navigateThenMarkRead } = require(outfile);
  const events = [];
  let nextFrame;
  globalThis.requestAnimationFrame = (callback) => { nextFrame = callback; return 1; };
  navigateThenMarkRead(() => events.push("navigate"), () => {
    events.push("write");
    return new Promise(() => {});
  }, () => events.push("error"));
  assert.deepEqual(events, ["navigate"], "local navigation must start without waiting for Firebase");
  nextFrame();
  assert.deepEqual(events, ["navigate", "write"]);
  console.log("Notification navigation passed.");
} finally {
  delete globalThis.requestAnimationFrame;
  await rm(directory, { recursive: true, force: true });
}
