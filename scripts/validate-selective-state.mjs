import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

const directory = await mkdtemp(path.join(process.cwd(), "node_modules", "koino-selective-state-"));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
try {
  const outfile = path.join(directory, "store.cjs");
  await build({ entryPoints: ["state/selective-store.ts"], bundle: true, platform: "node", format: "cjs", packages: "external", outfile });
  const require = createRequire(import.meta.url);
  const { createSnapshotStore, useSelectedSnapshot } = require(outfile);
  const store = createSnapshotStore({ theme: "light", posts: [] });
  const renders = { theme: 0, posts: 0 };
  function Theme() {
    renders.theme += 1;
    return React.createElement("Theme", { value: useSelectedSnapshot(store, (state) => state.theme) });
  }
  function Posts() {
    renders.posts += 1;
    return React.createElement("Posts", { value: useSelectedSnapshot(store, (state) => state.posts) });
  }
  let tree;
  await act(async () => { tree = create(React.createElement(React.Fragment, null, React.createElement(Theme), React.createElement(Posts))); });
  assert.deepEqual(renders, { theme: 1, posts: 1 });
  await act(async () => store.publish({ theme: "light", posts: [1] }));
  assert.deepEqual(renders, { theme: 1, posts: 2 }, "unrelated updates must not rerender theme consumers");
  await act(async () => store.publish({ theme: "dark", posts: store.getSnapshot().posts }));
  assert.deepEqual(renders, { theme: 2, posts: 2 }, "unchanged posts must retain their snapshot");
  await act(async () => tree.unmount());
  await act(async () => store.publish({ theme: "light", posts: [] }));
  assert.deepEqual(renders, { theme: 2, posts: 2 }, "unmounted consumers must unsubscribe");
  console.log("Selective state subscriptions passed.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
