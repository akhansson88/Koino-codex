import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

const require = createRequire(import.meta.url);
const directory = await mkdtemp(path.join(tmpdir(), "koino-onboarding-journey-"));
const harness = globalThis.__onboardingJourney = { actions: [], advances: [], language: "en", theme: "light" };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = {
  "react-native": `
    export const Platform = { OS: "ios" };
    export const View = "View", Text = "Text", TextInput = "TextInput", Pressable = "Pressable";
    export const ScrollView = "ScrollView";
  `,
  "@expo/vector-icons": 'export const Feather = "Feather";',
  "@/features/onboarding-screen": 'export const OnboardingPage = "Page";',
  "@/state/koino-store": `
    const harness = globalThis.__onboardingJourney;
    const dispatch = async action => { harness.actions.push(action); await harness.handleAction?.(action); };
    export const useKoinoActions = () => ({ dispatch });
    export const useKoinoFields = () => ({ theme: harness.theme });
  `,
  "@/ui/onboarding-progress": `
    const harness = globalThis.__onboardingJourney;
    const advance = async uid => { harness.advances.push(uid); await harness.handleAdvance?.(uid); };
    export const useOnboardingProgress = () => ({ advance });
  `,
  "@/ui/app-components": `
    export const Card = "Card";
    export { PrimaryButton, SecondaryButton } from "@/ui/app-components/controls";
  `,
  "@/ui/app-sheet": 'export const SheetTextInput = "TextInput";',
  "@/ui/app-language": `
    import { translateMessage } from "@/ui/localization";
    export const useAppTranslation = () => ({
      t: (key, values) => translateMessage(globalThis.__onboardingJourney.language, key, values),
    });
  `,
};

let tree;
try {
  const outfile = path.join(directory, "journey.cjs");
  await build({
    stdin: {
      contents: 'export { OnboardingJourney } from "./features/onboarding-journey"; export { applyTheme, themes } from "./ui/theme";',
      resolveDir: process.cwd(), loader: "tsx",
    },
    outfile, jsx: "automatic", bundle: true, format: "cjs", platform: "node",
    plugins: [{ name: "journey-mocks", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: name }) => {
        if (Object.hasOwn(mocks, name)) return { path: name, namespace: "mock" };
        if (name === "react" || name.startsWith("react/")) return { path: require.resolve(name), external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({ contents: mocks[name], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });

  const { OnboardingJourney, applyTheme, themes } = require(outfile);
  const mount = (userId, language = "en", theme = "light") => act(async () => {
    tree?.unmount();
    Object.assign(harness, { language, theme, handleAction: undefined, handleAdvance: undefined, actions: [], advances: [] });
    applyTheme(theme);
    tree = create(React.createElement(OnboardingJourney, { userId }));
  });
  const button = label => {
    const control = tree.root.findAllByType("Pressable").find(node => node.props.accessibilityLabel === label);
    assert.ok(control, `Missing accessible ${label} button`);
    assert.equal(control.props.accessibilityRole, "button");
    return control;
  };
  const tap = label => act(async () => {
    const control = button(label);
    assert.notEqual(control.props.disabled, true, `${label} should be enabled`);
    void control.props.onPress();
  });
  const field = () => tree.root.findByType("TextInput");
  const enter = value => act(() => field().props.onChangeText(value));
  const headline = () => tree.root.findAllByType("Text").find(node => node.props.accessibilityRole === "header");
  const alerts = () => tree.root.findAllByType("Text").filter(node => node.props.accessibilityRole === "alert").map(node => node.props.children).join("\n");

  await mount("private-account");
  assert.equal(headline().props.children, "How would you like to begin?");
  await tap("Start privately");
  assert.deepEqual(harness.advances, ["private-account"]);
  assert.deepEqual(harness.actions, [], "Private onboarding requires no community mutation or group ID");

  await mount("invitee");
  await tap("Join a community");
  assert.equal(field().props.accessibilityLabel, "Community code");
  assert.equal(button("Request access").props.accessibilityState.disabled, true);
  await enter("do-not-send");
  await tap("Cancel");
  assert.deepEqual(harness.actions, []);
  assert.deepEqual(harness.advances, []);
  await tap("Join a community");
  assert.equal(field().props.value, "", "Cancelling clears the invite draft");
  await enter("bad-code");
  harness.handleAction = () => { throw Object.assign(new Error("Internal details"), { code: "functions/not-found" }); };
  await tap("Request access");
  assert.match(alerts(), /No community exists for that invite code/);
  assert.equal(field().props.value, "BAD-CODE");
  assert.deepEqual(harness.advances, [], "A failed request leaves onboarding open");
  await enter("room123");
  let completeRequest;
  harness.handleAction = () => new Promise(resolve => { completeRequest = resolve; });
  await act(() => {
    field().props.onSubmitEditing();
    field().props.onSubmitEditing();
  });
  assert.equal(button("Cancel").props.disabled, true);
  assert.equal(harness.actions.length, 2, "The failed request and one retry were submitted");
  assert.deepEqual(harness.actions.at(-1), { type: "joinGroup", inviteCode: "ROOM123", expectedUserId: "invitee" });
  await act(async () => completeRequest());
  assert.equal(headline().props.children, "Access request sent");
  assert.deepEqual(harness.advances, [], "The receipt explains approval before continuing");
  await tap("Continue");
  assert.deepEqual(harness.advances, ["invitee"], "Continuing does not need membership to be approved yet");

  await mount("owner");
  await tap("Create a community");
  assert.equal(field().props.accessibilityLabel, "Community name");
  await enter("   ");
  assert.equal(button("Create a community").props.disabled, true);
  await enter("Our community");
  harness.handleAdvance = () => { throw new Error("Local progress unavailable"); };
  await tap("Create a community");
  assert.deepEqual(harness.actions, [{ type: "createGroup", name: "Our community", expectedUserId: "owner" }]);
  assert.deepEqual(harness.advances, ["owner"]);
  assert.equal(headline().props.children, "Community created.");
  assert.match(alerts(), /save your progress/);
  harness.handleAdvance = undefined;
  await tap("Continue");
  assert.equal(harness.actions.length, 1, "A progress retry does not recreate a community");
  assert.deepEqual(harness.advances, ["owner", "owner"]);

  await mount("swedish-account", "sv", "dark");
  assert.equal(headline().props.children, "Hur vill du börja?");
  assert.equal(headline().props.style.at(-1).color, themes.dark.ink);
  button("Börja privat");
  button("Skapa en gemenskap");
  await tap("Gå med i en gemenskap");
  assert.match(field().props.accessibilityLabel, /kod/i);
  await tap("Logga ut");
  assert.deepEqual(harness.actions, [{ type: "signOut", expectedUserId: "swedish-account" }]);

  console.log("Onboarding journey regression passed: group-less private entry, cancelled and failed joins, approval receipt, creation retry, scoped actions, and Swedish in Night theme.");
} finally {
  if (tree) await act(() => tree.unmount());
  await rm(directory, { recursive: true, force: true });
}
