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
const harness = globalThis.__onboardingJourney = { actions: [], choices: [], completions: [], language: "en", theme: "light" };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = {
  "react-native": `
    export const Platform = { OS: "ios" };
    export const View = "View", Text = "Text", TextInput = "TextInput", Pressable = "Pressable";
    export const ScrollView = "ScrollView";
  `,
  "@expo/vector-icons": 'export const Feather = "Feather";',
  "@/features/onboarding-screen": 'export const OnboardingPage = "Page";',
  "@/features/community/join-requests": 'export const CommunityJoinFingerprint = "CommunityJoinFingerprint";',
  "@/state/koino-store": `
    const harness = globalThis.__onboardingJourney;
    const dispatch = async action => { harness.actions.push(action); await harness.handleAction?.(action); };
    export const useKoinoActions = () => ({ dispatch });
    export const useKoinoFields = () => ({ theme: harness.theme });
  `,
  "@/ui/onboarding-progress": `
    const harness = globalThis.__onboardingJourney;
    const chooseJourney = async (uid, choice) => { harness.choices.push({ uid, choice }); await harness.handleChoice?.(uid, choice); };
    const complete = async uid => { harness.completions.push(uid); await harness.handleCompletion?.(uid); };
    export const useOnboardingProgress = () => ({ chooseJourney, complete });
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
      contents: `
        export { OnboardingJourney } from "./features/onboarding-journey";
        export { OnboardingGuide } from "./features/onboarding-guide";
        export { applyTheme, themes } from "./ui/theme";
      `,
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

  const { OnboardingJourney, OnboardingGuide, applyTheme, themes } = require(outfile);
  const mount = (userId, { language = "en", theme = "light", journey } = {}) => act(async () => {
    tree?.unmount();
    Object.assign(harness, {
      language, theme, handleAction: undefined, handleChoice: undefined, handleCompletion: undefined,
      actions: [], choices: [], completions: [],
    });
    applyTheme(theme);
    tree = create(journey ? React.createElement(OnboardingGuide, { userId, journey }) : React.createElement(OnboardingJourney, { userId }));
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
  const text = () => tree.root.findAllByType("Text").map(node => node.props.children);
  const headline = () => tree.root.findAllByType("Text").find(node => node.props.accessibilityRole === "header");
  const alerts = () => tree.root.findAllByType("Text").filter(node => node.props.accessibilityRole === "alert").map(node => node.props.children).join("\n");

  await mount("private-account");
  assert.equal(headline().props.children, "How would you like to begin?");
  await tap("Start privately");
  assert.deepEqual(harness.choices, [{ uid: "private-account", choice: "private" }]);
  assert.deepEqual(harness.actions, [], "Private onboarding requires no community mutation or group ID");

  await mount("invitee");
  await tap("Join a community");
  assert.equal(field().props.accessibilityLabel, "Community code");
  assert.equal(button("Request access").props.accessibilityState.disabled, true);
  await enter("do-not-send");
  await tap("Cancel");
  assert.deepEqual(harness.actions, []);
  assert.deepEqual(harness.choices, []);
  await tap("Join a community");
  assert.equal(field().props.value, "", "Cancelling clears the invite draft");
  await enter("bad-code");
  harness.handleAction = () => { throw Object.assign(new Error("Internal details"), { code: "functions/not-found" }); };
  await tap("Request access");
  assert.match(alerts(), /No community exists for that invite code/);
  assert.equal(field().props.value, "BAD-CODE");
  assert.deepEqual(harness.choices, [], "A failed request leaves onboarding open");
  await enter("room123");
  let completeRequest;
  harness.handleAction = (action) => new Promise(resolve => {
    completeRequest = () => { action.report({ groupId: "requested-room", status: "pending" }); resolve(); };
  });
  await act(() => {
    field().props.onSubmitEditing();
    field().props.onSubmitEditing();
  });
  assert.equal(button("Cancel").props.disabled, true);
  assert.equal(harness.actions.length, 2, "The failed request and one retry were submitted");
  const { report, ...request } = harness.actions.at(-1);
  assert.equal(typeof report, "function");
  assert.deepEqual(request, { type: "joinGroup", inviteCode: "ROOM123", expectedUserId: "invitee" });
  harness.handleChoice = () => { throw new Error("Local progress unavailable"); };
  await act(async () => completeRequest());
  assert.equal(headline().props.children, "Access request sent");
  const joinChoice = { uid: "invitee", choice: "join" };
  assert.deepEqual(harness.choices, [joinChoice], "Owner approval need not finish before entering the guide");
  assert.match(alerts(), /save your progress/);
  harness.handleChoice = undefined;
  await tap("Continue");
  assert.deepEqual(harness.choices, [joinChoice, joinChoice]);
  assert.equal(harness.actions.length, 2, "A local progress retry does not resend the accepted request");

  await mount("previous-applicant");
  await tap("Join a community");
  await enter("room123");
  await tap("Request access");
  assert.match(alerts(), /couldn’t send/i, "An unconfirmed request cannot advance");
  assert.deepEqual(harness.choices, []);
  harness.handleAction = (action) => action.report({ groupId: "requested-room", status: "rejected" });
  await tap("Request access");
  assert.match(alerts(), /declined/);
  assert.equal(field().props.value, "ROOM123");
  assert.deepEqual(harness.choices, [], "A declined receipt cannot advance as a pending request");
  harness.handleAction = (action) => action.report({ groupId: "requested-room", status: "approved" });
  await tap("Request access");
  assert.deepEqual(harness.choices, [{ uid: "previous-applicant", choice: "joinApproved" }]);
  assert.equal(headline().props.children, "Access approved.");

  await mount("owner");
  await tap("Create a community");
  assert.equal(field().props.accessibilityLabel, "Community name");
  await enter("   ");
  assert.equal(button("Create a community").props.disabled, true);
  await enter("Our community");
  harness.handleChoice = () => { throw new Error("Local progress unavailable"); };
  await tap("Create a community");
  assert.deepEqual(harness.actions, [{ type: "createGroup", name: "Our community", expectedUserId: "owner" }]);
  const createChoice = { uid: "owner", choice: "create" };
  assert.deepEqual(harness.choices, [createChoice]);
  assert.equal(headline().props.children, "Community created.");
  assert.match(alerts(), /save your progress/);
  harness.handleChoice = undefined;
  await tap("Continue");
  assert.equal(harness.actions.length, 1, "A progress retry does not recreate a community");
  assert.deepEqual(harness.choices, [createChoice, createChoice]);

  await mount("swedish-account", { language: "sv", theme: "dark" });
  assert.equal(headline().props.children, "Hur vill du börja?");
  assert.equal(headline().props.style.at(-1).color, themes.dark.ink);
  button("Börja privat");
  button("Skapa en gemenskap");
  await tap("Gå med i en gemenskap");
  assert.match(field().props.accessibilityLabel, /kod/i);
  await tap("Logga ut");
  assert.deepEqual(harness.actions, [{ type: "signOut", expectedUserId: "swedish-account" }]);

  await mount("reader", { journey: "private" });
  const guide = tree.root.findAllByType("View").find(node => node.props.role === "list");
  assert.ok(guide, "First-use guidance is grouped for accessibility");
  const topics = guide.findAllByType("View").filter(node => node.props.role === "listitem");
  assert.deepEqual(topics.map(item => item.findAllByType("Text")[0].props.children), ["Scripture", "Prayer", "Me", "Community"]);
  assert.doesNotMatch(text().join(" "), /check-in|access request sent|community created/i);
  assert.deepEqual(harness.completions, [], "Showing the guide does not complete onboarding");
  let failCompletion;
  harness.handleCompletion = () => new Promise((_, reject) => { failCompletion = reject; });
  await act(() => {
    const goHome = button("Go to Home").props.onPress;
    goHome();
    goHome();
  });
  assert.deepEqual(harness.completions, ["reader"], "Double taps cannot race completion writes");
  assert.equal(button("Sign out").props.disabled, true);
  await act(async () => { failCompletion(new Error("Local progress unavailable")); });
  assert.match(alerts(), /save your progress/);
  harness.handleCompletion = undefined;
  await tap("Go to Home");
  assert.deepEqual(harness.completions, ["reader", "reader"]);

  await mount("invitee", { journey: "join" });
  assert.ok(text().includes("Access request sent"));
  assert.match(text().join(" "), /approve your request/);
  assert.equal(tree.root.findAllByType("CommunityJoinFingerprint").length, 1);
  await tap("Go to Home");
  assert.deepEqual(harness.completions, ["invitee"]);

  await mount("swedish-owner", { language: "sv", theme: "dark", journey: "create" });
  assert.equal(headline().props.children, "Några sätt att börja");
  assert.equal(headline().props.style.at(-1).color, themes.dark.ink);
  for (const title of ["Bibelläsning", "Bön", "Jag", "Gemenskap"]) assert.ok(text().includes(title));
  assert.match(text().join(" "), /Din gemenskap är redo/);
  button("Gå till Hem");
  await tap("Logga ut");
  assert.deepEqual(harness.actions, [{ type: "signOut", expectedUserId: "swedish-owner" }]);

  console.log("Onboarding journey and guide regression passed: private entry, cancelled and failed joins, approval and creation receipts, progress retries, scoped actions, accessible first-use guidance, and Swedish in Night theme.");
} finally {
  if (tree) await act(() => tree.unmount());
  await rm(directory, { recursive: true, force: true });
}
