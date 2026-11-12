import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("..", import.meta.url));
const fixture = globalThis.__joinRequestsPanel = {
  language: "en", appState: "active", foregroundListeners: new Set(), calls: [],
  load(userId) {
    return new Promise((resolve, reject) => fixture.calls.push({ userId, resolve, reject }));
  },
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = {
  "react-native": `
    const fixture = globalThis.__joinRequestsPanel;
    export const Platform = { OS: "ios" }, Text = "Text", View = "View";
    export const AppState = {
      get currentState() { return fixture.appState; },
      addEventListener(event, listener) {
        if (event !== "change") throw new Error("Unexpected AppState event");
        fixture.foregroundListeners.add(listener);
        return { remove() { fixture.foregroundListeners.delete(listener); } };
      },
    };
  `,
  "@/state/encryption/session": `
    export const listCommunityJoinRequests = userId => globalThis.__joinRequestsPanel.load(userId);
    export const communityJoinFingerprint = userId => userId + "-fingerprint";
  `,
  "@/ui/app-components": 'export const Card = "Card", BodyText = "BodyText", SecondaryButton = "SecondaryButton";',
  "@/ui/app-language": `
    import { translateMessage } from "@/ui/localization";
    export function useAppTranslation() {
      const { language } = globalThis.__joinRequestsPanel;
      return { language, t: (key, values) => translateMessage(language, key, values) };
    }
  `,
};

const timers = new Map();
const bundle = await build({
  stdin: {
    contents: `
      export { CommunityJoinRequests } from "./features/community/join-requests";
      export { announceJoinRequestChange } from "@/state/community-join-requests";
      export { translateMessage } from "@/ui/localization";
    `,
    resolveDir: root,
  },
  bundle: true, platform: "node", format: "cjs", jsx: "automatic", write: false, external: ["react"],
  plugins: [{ name: "join-request-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, ({ path }) => Object.hasOwn(mocks, path) ? { path, namespace: "mock" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path], resolveDir: root, loader: "tsx" }));
  } }],
});
const module = { exports: {} };
new Function("require", "module", "exports", "setInterval", "clearInterval", bundle.outputFiles[0].text)(
  require, module, module.exports,
  (callback, delay) => {
    const id = Symbol("poll");
    timers.set(id, { callback, delay });
    return id;
  },
  id => timers.delete(id),
);
const { CommunityJoinRequests, announceJoinRequestChange, translateMessage } = module.exports;

let tree;
const panel = (userId, active = true) => React.createElement(CommunityJoinRequests, { userId, active });
const update = (userId, active) => act(() => tree.update(panel(userId, active)));
const render = () => JSON.stringify(tree.toJSON());
const copy = (key, values) => translateMessage(fixture.language, `community.rooms.${key}`, values);
const assertCopy = (key, values) => {
  const message = copy(key, values);
  assert.ok(message && render().includes(message), `Missing ${fixture.language} ${key}`);
};
const resolve = requests => act(async () => { fixture.calls.at(-1).resolve(requests); });
const appState = state => act(() => {
  fixture.appState = state;
  fixture.foregroundListeners.forEach(listener => listener(state));
});
const tick = () => act(() => timers.forEach(({ callback }) => callback()));
const record = (status, inviteHint) => ({ groupId: `room-${status}`, status, inviteHint, updatedAt: Date.UTC(2026, 10, 8, 12) });
const approved = record("approved", "A1");
const rejected = record("rejected");
const closed = record("closed", "C3");
const pending = { ...record("pending", "Q7"), inviteCode: "ABCDQ7" };

try {
  await act(() => { tree = create(panel("reader")); });
  assert.deepEqual(fixture.calls.map(({ userId }) => userId), ["reader"]);
  assertCopy("requestsTitle");
  assertCopy("requestsLoading");
  assert.equal(tree.root.findAllByType("Text").some(node => node.props.accessibilityRole === "header"), true);
  await act(async () => { fixture.calls[0].reject(new Error("Synthetic transport failure")); });
  assertCopy("requestsError");
  const error = tree.root.findAllByType("BodyText").find(node => node.props.accessibilityRole === "alert");
  assert.equal(error?.props.accessibilityLiveRegion, "polite");
  const retry = tree.root.findByType("SecondaryButton");
  assert.equal(retry.props.children, copy("requestsRefresh"));
  await act(() => retry.props.onPress());
  assert.deepEqual(fixture.calls.map(({ userId }) => userId), ["reader", "reader"]);
  await resolve([pending, approved, rejected, closed]);
  assert.ok(!render().includes(copy("requestsError")), "A successful retry clears the alert");

  for (const language of ["en", "sv"]) {
    fixture.language = language;
    await update("reader");
    for (const key of ["requestPending", "requestApproved", "requestRejected", "requestClosed", "requestPendingBody", "requestFingerprint"]) assertCopy(key);
    assertCopy("requestInviteHint", { hint: "Q7" });
    assert.ok(!render().includes(pending.inviteCode), "The panel displays only the two-character hint");
    const fingerprint = tree.root.findAllByType("Text").find(node => node.props.children === "reader-fingerprint");
    assert.equal(fingerprint?.props.selectable, true);
  }

  await act(() => announceJoinRequestChange("someone-else"));
  assert.equal(fixture.calls.length, 2, "Other accounts' events never refresh this panel");
  await act(() => announceJoinRequestChange("reader"));
  assert.equal(fixture.calls.length, 3, "Same-account events refresh the active panel");
  assert.deepEqual([...timers.values()].map(({ delay }) => delay), [15_000]);
  await tick();
  assert.equal(fixture.calls.length, 3, "Polling never overlaps an in-flight request");
  await resolve([approved, rejected, closed]);
  assert.ok(!render().includes("reader-fingerprint") && !render().includes(copy("requestFingerprint")), "Resolved requests do not expose the fingerprint");
  await tick();
  assert.equal(fixture.calls.length, 3, "Settled requests do not keep polling");

  await appState("background");
  await appState("active");
  assert.equal(fixture.calls.length, 4, "Foregrounding refreshes the active panel");
  await resolve([pending]);
  await appState("background");
  await tick();
  assert.equal(fixture.calls.length, 4, "Background polling does not refresh a pending request");
  await appState("active");
  await resolve([pending]);
  await tick();
  const stale = fixture.calls.at(-1);
  assert.equal(fixture.calls.length, 6, "The visible panel polls pending requests while active");
  await update("replacement");
  assert.equal(fixture.calls.at(-1).userId, "replacement");
  assertCopy("requestsLoading");
  assert.ok(!render().includes(copy("requestPending")), "Replacement accounts do not inherit the previous snapshot");
  await resolve([approved]);
  await act(async () => { stale.resolve([pending]); });
  assertCopy("requestApproved");
  assert.ok(!render().includes(copy("requestPending")) && !render().includes("fingerprint"), "The previous account's late result is ignored");

  await act(() => announceJoinRequestChange("replacement"));
  const hiddenRequest = fixture.calls.at(-1);
  const callCount = fixture.calls.length;
  await update("replacement", false);
  assert.equal(tree.toJSON(), null);
  assert.equal(timers.size, 0, "Hiding cancels polling");
  assert.equal(fixture.foregroundListeners.size, 0, "Hiding removes the AppState listener");
  await act(() => announceJoinRequestChange("replacement"));
  await appState("active");
  await tick();
  assert.equal(fixture.calls.length, callCount, "Hidden panels do not refresh");
  await act(async () => { hiddenRequest.resolve([pending]); });
  await update("replacement");
  assert.equal(fixture.calls.length, callCount + 1, "Reopening refreshes the panel");
  assert.ok(!render().includes(copy("requestPending")), "A response received while hidden is discarded");
  await resolve([]);
  assertCopy("requestsEmpty");

  console.log("Community access requests UI passed: localized status and invite hints, error and retry, pending fingerprint, events and foreground polling, account isolation, and hidden cleanup.");
} finally {
  if (tree) await act(() => tree.unmount());
  delete globalThis.__joinRequestsPanel;
}
