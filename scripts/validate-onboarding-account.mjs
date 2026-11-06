import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

const require = createRequire(import.meta.url);
const directory = await mkdtemp(path.join(tmpdir(), "koino-onboarding-account-"));
const harness = globalThis.__onboardingAccount = {
  actions: [], listeners: new Set(), storage: new Map(), state: { theme: "light" }, os: "ios",
};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = {
  "react-native": `
    export const Platform = { get OS() { return globalThis.__onboardingAccount.os; } };
    export const View = "View", Text = "Text", TextInput = "TextInput", Pressable = "Pressable";
    export const KeyboardAvoidingView = "KeyboardAvoidingView", ScrollView = "ScrollView";
  `,
  "react-native-safe-area-context": "export const useSafeAreaInsets = () => ({ top: 44, bottom: 34 });",
  "@expo/vector-icons": 'export const Feather = "Feather", Ionicons = "Ionicons";',
  "@/features/startup-performance": "export const markStartupMilestone = () => {};",
  "@/state/encryption/local-storage": `
    const { storage } = globalThis.__onboardingAccount;
    export default {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => { storage.set(key, value); },
    };
  `,
  "@/state/koino-store": `
    import { useSyncExternalStore } from "react";
    const harness = globalThis.__onboardingAccount;
    const subscribe = listener => { harness.listeners.add(listener); return () => harness.listeners.delete(listener); };
    const dispatch = async action => { harness.actions.push(action); await harness.handleAction?.(action); };
    export const useKoinoActions = () => ({ dispatch });
    export const useKoinoFields = () => useSyncExternalStore(subscribe, () => harness.state);
  `,
  "@/state/store/firebase": "export let emulatorMode = false; export const setEmulatorMode = value => { emulatorMode = value; };",
  "@/ui/koino-logo": 'export const KoinoLogo = "KoinoLogo";',
  "@/ui/brand-wave-motif": 'export const BrandWaveMotif = "BrandWaveMotif";',
  "@/ui/app-components": `
    export { Card } from "@/ui/app-components/layout";
    export { PrimaryButton, SecondaryButton } from "@/ui/app-components/controls";
  `,
  "@/ui/app-sheet": 'export const AppSheet = "AppSheet", SheetTextInput = "TextInput";',
  "@/ui/app-components/avatars": 'export const Avatar = "Avatar";',
  "@/ui/full-screen-modal-host": 'export const FullScreenModalHost = "FullScreenModalHost";',
};

const textContent = node => node.children.map(child => typeof child === "string" ? child : textContent(child)).join("");
const updateState = changes => {
  harness.state = { ...harness.state, ...changes };
  for (const listener of harness.listeners) listener();
};

let tree;
try {
  const outfile = path.join(directory, "screen.cjs");
  await build({
    stdin: {
      contents: `
        export { OnboardingScreen } from "./features/onboarding-screen";
        export { AppLanguageProvider } from "./ui/app-language";
        export { applyTheme, themes } from "./ui/theme";
        export { setEmulatorMode } from "@/state/store/firebase";
      `,
      resolveDir: process.cwd(), loader: "tsx",
    },
    outfile, jsx: "automatic", bundle: true, format: "cjs", platform: "node",
    plugins: [{ name: "native-mocks", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: name }) => {
        if (Object.hasOwn(mocks, name)) return { path: name, namespace: "mock" };
        if (name === "react" || name.startsWith("react/")) return { path: require.resolve(name), external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({ contents: mocks[name], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });

  const { OnboardingScreen, AppLanguageProvider, applyTheme, themes, setEmulatorMode } = require(outfile);
  const mount = () => act(async () => {
    tree = create(React.createElement(AppLanguageProvider, null, React.createElement(OnboardingScreen)));
  });
  const controls = () => tree.root.findAllByType("Pressable");
  const button = label => {
    const control = controls().find(node => node.props.accessibilityLabel === label || textContent(node) === label);
    assert.ok(control, `Missing ${label} button`);
    assert.equal(control.props.accessibilityRole, "button");
    return control;
  };
  const inputs = () => tree.root.findAllByType("TextInput");
  const input = label => {
    const field = inputs().find(node => node.props.accessibilityLabel === label);
    assert.ok(field, `Missing accessible ${label} field`);
    return field;
  };
  const enter = (label, value) => act(() => input(label).props.onChangeText(value));
  const tap = label => act(() => {
    const control = button(label);
    assert.notEqual(control.props.disabled, true, `${label} should be enabled`);
    void control.props.onPress();
  });
  const screenText = () => tree.root.findAllByType("Text").map(textContent).join("\n");
  const alerts = () => tree.root.findAll(node => node.props.accessibilityRole === "alert" && typeof node.type === "string").map(textContent).join("\n");
  const hostStyle = node => Object.assign({}, ...[node.props.style].flat(Infinity).filter(value => value && typeof value === "object"));
  const assertTheme = theme => {
    assert.ok(tree.root.findAll(node => typeof node.type === "string").some(node => hostStyle(node).backgroundColor === themes[theme].cream));
  };

  await mount();
  assert.equal(inputs().length, 0, "Welcome offers separate account entry points");
  assert.ok(tree.root.findAllByType("Text").some(node => node.props.accessibilityRole === "header"));
  assert.equal(button("English").props.accessibilityState.selected, true);
  button("Create account");
  button("Sign in");
  assertTheme("light");

  await tap("Sign in");
  assert.equal(inputs().length, 2);
  assert.equal(button("Sign in").props.accessibilityState.disabled, true);
  assert.equal(input("Email").props.autoCapitalize, "none");
  assert.equal(input("Password").props.secureTextEntry, true);
  await tap("Show password");
  assert.equal(input("Password").props.secureTextEntry, false);
  await tap("Hide password");
  assert.equal(input("Password").props.secureTextEntry, true);
  await enter("Email", "not-an-email");
  await tap("Forgot my password");
  assert.equal(harness.actions.length, 0, "Malformed reset input must stay local");
  assert.match(screenText(), /enter.*email/i);
  await enter("Email", "person@example.test");
  await tap("Forgot my password");
  assert.deepEqual(harness.actions.at(-1), { type: "requestPasswordReset", email: "person@example.test" });
  assert.match(screenText(), /reset link.*sent|sent.*reset link/i);

  await enter("Password", "short");
  assert.equal(button("Sign in").props.disabled, true);
  await enter("Password", "correct horse");
  let failSignIn;
  harness.handleAction = () => new Promise((_, reject) => { failSignIn = reject; });
  await act(() => {
    const submit = input("Password").props.onSubmitEditing;
    assert.equal(typeof submit, "function", "The keyboard can submit sign-in");
    const event = { nativeEvent: { text: "correct horse" } };
    void submit(event);
    void submit(event);
  });
  assert.deepEqual(harness.actions.filter(action => action.type === "signIn"), [
    { type: "signIn", email: "person@example.test", password: "correct horse" },
  ], "Keyboard repeats should submit once while authentication is in flight");
  await act(() => {
    failSignIn(Object.assign(new Error("Sensitive Firebase diagnostic"), { code: "auth/invalid-credential" }));
  });
  assert.ok(alerts(), "Sign-in failures are announced");
  assert.doesNotMatch(alerts(), /Sensitive Firebase diagnostic/);

  await tap("Back to welcome");
  await tap("Create account");
  assert.equal(inputs().length, 3);
  assert.equal(input("Password").props.value, "", "Returning to welcome clears the previous password");
  assert.equal(input("Password").props.secureTextEntry, true);
  assert.doesNotMatch(screenText(), /Forgot my password|reset link.*sent/i);
  await enter("Email", "person@example.test");
  await enter("Password", "another password");
  await enter("Your name", "A");
  assert.equal(button("Create account").props.disabled, true);
  await enter("Your name", "Anna");
  harness.handleAction = undefined;
  await tap("Create account");
  assert.deepEqual(harness.actions.at(-1), {
    type: "signUp", name: "Anna", email: "person@example.test", password: "another password",
  });

  await tap("Back to welcome");
  await tap("Svenska");
  assert.equal(button("Svenska").props.accessibilityState.selected, true);
  assert.equal(harness.storage.get("koino.language"), "sv");
  await act(() => tree.unmount());
  harness.os = "android";
  applyTheme("dark");
  updateState({ theme: "dark" });
  await mount();
  assertTheme("dark");
  await tap("Logga in");
  assert.equal(input("Lösenord").props.secureTextEntry, true);
  await tap("Visa lösenord");
  assert.equal(input("Lösenord").props.secureTextEntry, false);
  await tap("Dölj lösenord");
  assert.equal(input("Lösenord").props.secureTextEntry, true);
  assert.equal(hostStyle(input("Lösenord")).color, themes.dark.ink);
  assert.equal(tree.root.findByType("ScrollView").props.keyboardShouldPersistTaps, "handled");
  setEmulatorMode(true);
  await enter("E-post", "person@example.test");
  const actionsBeforeReset = harness.actions.length;
  await tap("Jag har glömt mitt lösenord");
  assert.match(alerts(), /avstängd i emulatorn/);
  assert.equal(harness.actions.length, actionsBeforeReset, "Emulator UI must never request a reset email");
  await act(() => tree.unmount());
  tree = undefined;
  console.log("Onboarding account regression passed: separate accessible forms, validation, reset, submit locking, localized feedback, language persistence, and both themes.");
} finally {
  if (tree) await act(() => tree.unmount());
  await rm(directory, { recursive: true, force: true });
}
