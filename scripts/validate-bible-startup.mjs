import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import React from "react";
import { act, create } from "react-test-renderer";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const projectRoot = path.resolve(import.meta.dirname, "..");
const temporaryDirectory = await mkdtemp(path.join(tmpdir(), "koino-bible-startup-"));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const lifecycle = globalThis.__bibleStartup = { retains: 0, releases: 0, initializations: 0, opens: 0, closes: 0 };
const mocks = {
  "react-native": `export const View = "View", Text = "Text", ActivityIndicator = "ActivityIndicator";`,
  "@/ui/theme": `export const colors = { cream: "cream", olive: "olive", ink: "ink" };`,
  "@/features/startup-performance": `export const markStartupMilestone = () => {};`,
  "@/features/bible-database": `
    export const initializeBibleDatabase = async () => { globalThis.__bibleStartup.initializations++; };
    export const retainBibleDatabase = () => { globalThis.__bibleStartup.retains++; };
    export const releaseBibleDatabase = () => { globalThis.__bibleStartup.releases++; };
  `,
  "expo-sqlite": `
    import { useEffect, useState } from "react";
    const database = {};
    export const useSQLiteContext = () => database;
    export function SQLiteProvider({ children, onInit, onError }) {
      const [ready, setReady] = useState(false);
      useEffect(() => {
        globalThis.__bibleStartup.opens++;
        globalThis.__bibleStartup.finishLoading = async () => { await onInit(database); setReady(true); };
        globalThis.__bibleStartup.failLoading = error => onError(error);
        return () => { globalThis.__bibleStartup.closes++; };
      }, [onInit, onError]);
      return ready ? children : null;
    }
  `,
};

let renderer;
try {
  const bundlePath = path.join(temporaryDirectory, "bible-startup.cjs");
  await build({
    entryPoints: [path.join(projectRoot, "features/bible-database-provider.tsx")],
    bundle: true, format: "cjs", platform: "node", outfile: bundlePath,
    jsx: "automatic", tsconfig: path.join(projectRoot, "tsconfig.json"),
    plugins: [{
      name: "native-test-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path: name }) => {
          if (name in mocks) return { path: name, namespace: "mock" };
          if (name.endsWith("koino-bible-v2.db")) return { path: name, namespace: "asset" };
          if (name === "react" || name.startsWith("react/")) return { path: require.resolve(name), external: true };
        });
        builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({ contents: mocks[name], loader: "jsx" }));
        builder.onLoad({ filter: /.*/, namespace: "asset" }, () => ({ contents: "module.exports = 1;", loader: "js" }));
      },
    }],
  });
  const { BibleDatabaseProvider, BibleDatabaseBoundary } = require(bundlePath);
  const screen = showBible => React.createElement(BibleDatabaseProvider, null,
    React.createElement("Home"),
    showBible ? React.createElement(BibleDatabaseBoundary, null, React.createElement("Bible")) : null,
  );

  await act(async () => { renderer = create(screen(false)); });
  assert.equal(renderer.root.findAllByType("Home").length, 1);
  assert.equal(lifecycle.opens, 0, "Starting Home must never import or open the Bible asset");
  assert.equal(lifecycle.finishLoading, undefined);
  await act(async () => { renderer.update(screen(true)); });
  assert.equal(lifecycle.opens, 1, "Opening a Bible surface should request the database once");
  assert.equal(renderer.root.findAllByType("Home").length, 1, "Home must render before the Bible asset is available");
  assert.equal(renderer.root.findAllByType("Bible").length, 0, "Bible queries must wait for initialization");
  assert.equal(renderer.root.findAllByType("ActivityIndicator").length, 1, "Only the Bible surface should show loading");
  await act(async () => { renderer.update(screen(false)); });
  assert.equal(lifecycle.closes, 0, "Cancelling a cold picker must retain its pending database request");
  await act(async () => { renderer.update(screen(true)); });
  await act(async () => { await lifecycle.finishLoading(); });
  assert.equal(renderer.root.findAllByType("Bible").length, 1);
  assert.equal(lifecycle.initializations, 1);
  assert.equal(lifecycle.opens, 1);
  assert.equal(lifecycle.retains, 1);

  await act(async () => { renderer.update(screen(false)); });
  assert.equal(lifecycle.releases, 0, "Dismissing a Bible surface must preserve active database queries");
  assert.equal(lifecycle.closes, 0);
  await act(async () => { renderer.update(screen(true)); });
  assert.equal(renderer.root.findAllByType("Bible").length, 1, "A warm Bible surface should open immediately");
  assert.equal(lifecycle.initializations, 1);
  await act(async () => { renderer.unmount(); });
  renderer = undefined;
  assert.equal(lifecycle.releases, 1);
  assert.equal(lifecycle.closes, 1);

  await act(async () => { renderer = create(screen(true)); });
  await act(async () => { lifecycle.failLoading(new Error("Bible asset unavailable")); });
  assert.equal(renderer.root.findAllByType("Home").length, 1, "A Bible import failure must not take down Home");
  assert.equal(renderer.root.findByType("Text").props.children, "Bible asset unavailable");
  console.log("Bible startup validation passed: no asset work on Home, lazy request, cold cancellation, warm navigation, retained connection, and isolated import failure.");
} finally {
  if (renderer) await act(async () => { renderer.unmount(); });
  delete globalThis.__bibleStartup;
  const resolved = path.resolve(temporaryDirectory);
  assert.ok(resolved.startsWith(path.resolve(tmpdir()) + path.sep));
  await rm(resolved, { recursive: true, force: true });
}
