import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { mock } from "node:test";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

const require = createRequire(import.meta.url);
const directory = await mkdtemp(path.join(tmpdir(), "koino-me-journey-"));
const harness = globalThis.__meJourney = { language: "en", params: {}, pushes: [], actions: [], backs: 0 };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
process.env.TZ = "Europe/Stockholm";

const mocks = {
  "react-native": `
    export const Platform = { OS: "ios" };
    export const AppState = { addEventListener(event, callback) {
      globalThis.__meJourney.resume = callback;
      return { remove() { delete globalThis.__meJourney.resume; } };
    } };
    export const View = "View", Text = "Text";
    export function Pressable(props) {
      return <PressableHost {...props}>{typeof props.children === "function" ? props.children({ pressed: false }) : props.children}</PressableHost>;
    }
    const PressableHost = "Pressable";
  `,
  "expo-router": `
    import { useEffect } from "react";
    const harness = globalThis.__meJourney;
    export const useFocusEffect = useEffect;
    export const useLocalSearchParams = () => harness.params;
    export const router = {
      navigate: target => harness.pushes.push(target),
      push: target => harness.pushes.push(target),
      back: () => harness.backs++,
    };
  `,
  "@expo/vector-icons": 'export const Feather = "Feather";',
  "@/features/me-bible-plans": 'export const MeBiblePlans = "MeBiblePlans";',
  "@/features/use-bible-book-language": 'export const useBibleBookLanguage = () => globalThis.__meJourney.language;',
  "@/state/koino-store": `
    const harness = globalThis.__meJourney;
    const dispatch = async action => { harness.actions.push(action); };
    export const useKoinoFields = () => harness.state;
    export const useKoinoActions = () => ({ dispatch });
    export const useKoino = () => ({ state: harness.state, dispatch });
  `,
  "@/ui/app-language": `
    import { translateMessage } from "@/ui/localization";
    export function useAppTranslation() {
      const language = globalThis.__meJourney.language;
      return { language, t: (key, values) => translateMessage(language, key, values) };
    }
  `,
  "@/ui/app-components": `
    export const AppScreen = "AppScreen", BodyText = "BodyText", Card = "Card", BottomSheet = "BottomSheet",
      IconButton = "IconButton", RoomImage = "RoomImage", PrimaryButton = "PrimaryButton",
      SecondaryButton = "SecondaryButton", SectionHeading = "SectionHeading", VerseList = "VerseList";
  `,
  "@/ui/brand-wave-motif": 'export const BrandWaveMotif = "BrandWaveMotif";',
  "@/ui/link-preview": 'export const LinkPreview = "LinkPreview";',
  "@/ui/shared-composer": 'export const SharedComposer = "SharedComposer";',
};

let tree;
try {
  const outfile = path.join(directory, "screens.cjs");
  await build({
    stdin: {
      contents: 'export { JournalScreen } from "./features/journal-screen"; export { JournalDetailScreen } from "./features/journal-detail-screen";',
      resolveDir: process.cwd(),
      loader: "tsx",
    },
    outfile, jsx: "automatic", bundle: true, format: "cjs", platform: "node",
    plugins: [{ name: "native-mocks", setup(builder) {
      builder.onResolve({ filter: /.*/ }, ({ path: name }) => {
        if (mocks[name]) return { path: name, namespace: "mock" };
        if (name === "react" || name.startsWith("react/")) return { path: require.resolve(name), external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path: name }) => ({ contents: mocks[name], loader: "tsx", resolveDir: process.cwd() }));
    } }],
  });
  const { JournalScreen, JournalDetailScreen } = require(outfile);
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date("2026-11-05T22:59:59Z") });

  const entry = (id, createdAt, extra = {}) => ({
    id, createdAt, updatedAt: createdAt, userId: "member", body: id, source: "manual", ...extra,
  });
  const yesterday = entry("yesterday", "2026-11-04T22:59:59Z", { updatedAt: "2026-11-05T22:59:58Z" });
  const checkIn = entry("check-in", "2026-11-05T19:00:00Z", { source: "private_check_in", journalType: "reflection", entryKind: "reflection", heartMood: "grateful" });
  const prayer = entry("prayer", "2026-11-05T20:00:00Z", { journalType: "reflection", entryKind: "prayer_request", isPrivate: false, title: "A prayer" });
  const scripture = entry("scripture", "2026-11-05T21:00:00Z", { journalType: "scripture_note", passage: { reference: "John 4:23" } });
  const outsider = entry("other-member", "2026-11-05T22:00:00Z", { userId: "other" });
  const todaysReflection = entry("today-reflection", "2026-11-04T23:00:00Z", { entryKind: "reflection" });
  const baseState = { biblePlans: [], checkIns: [], groups: [], privateCheckIns: [], currentUserId: "member", journalEntries: [outsider, yesterday, prayer, checkIn, scripture] };

  const update = async (Screen = JournalScreen) => act(() => tree.update(React.createElement(Screen)));
  const rendered = () => JSON.stringify(tree.toJSON());
  const buttons = () => tree.root.findAllByType("Pressable");
  const press = (button) => act(() => button.props.onPress());
  const prompt = () => buttons().find((button) => /Take a moment to reflect|You reflected today/.test(button.props.accessibilityLabel ?? ""));
  const previews = () => buttons().filter((button) => button.props.accessibilityHint === "Opens the complete journal entry.");
  const composer = () => tree.root.findByType("SharedComposer").props;
  const seeAll = () => buttons().find((button) => button.props.accessibilityHint === "Opens your journal history.");

  harness.state = baseState;
  await act(() => { tree = create(React.createElement(JournalScreen)); });
  assert.equal(tree.root.findAllByType("BrandWaveMotif").length, 1);
  assert.deepEqual(previews().map((node) => node.props.accessibilityLabel.split(" from")[0]), ["Open Scripture", "Open Prayer", "Open Check-in"]);
  assert.match(previews()[0].props.accessibilityLabel, /John 4:23/);
  assert.match(previews()[1].props.accessibilityLabel, /A prayer.*copy was shared/);
  assert.doesNotMatch(rendered(), /other-member|yesterday/);
  await press(previews()[0]);
  assert.deepEqual(harness.pushes.at(-1), { pathname: "/me/[id]", params: { id: "scripture" } });

  assert.match(prompt().props.accessibilityLabel, /^Take a moment/);
  await press(prompt());
  assert.equal(composer().visible, true);
  assert.equal(composer().entryVisibility, "private");
  assert.equal(composer().kind, "reflection");
  await act(() => composer().onBody("A private reflection"));
  await act(() => composer().onSubmit());
  assert.deepEqual(harness.actions.at(-1), { type: "createJournalEntry", journalType: "reflection", entryKind: "reflection", body: "A private reflection", title: "", verse: undefined, verses: [], shareWithGroup: false });
  assert.equal(composer().visible, false);

  harness.state = { ...baseState, journalEntries: [...baseState.journalEntries, todaysReflection] };
  await update();
  assert.match(prompt().props.accessibilityLabel, /^You reflected today/);
  await press(prompt());
  assert.deepEqual(harness.pushes.at(-1), { pathname: "/me/[id]", params: { id: "today-reflection" } });
  assert.equal(composer().visible, false);

  await press(seeAll());
  assert.equal(harness.pushes.at(-1), "/me/history", "See all opens the journal history route");

  await act(() => mock.timers.tick(1_000));
  assert.match(prompt().props.accessibilityLabel, /^Take a moment/, "Reset at local midnight even though UTC is still November 5");
  mock.timers.setTime(Date.parse("2026-11-05T10:00:00Z"));
  await act(() => harness.resume("active"));
  assert.match(prompt().props.accessibilityLabel, /^You reflected today/, "Refresh the date on returning to the app");

  harness.params = { newEntry: "today-action" };
  await update();
  assert.equal(composer().visible, true, "The existing new-entry deep link still opens on a completed day");
  assert.equal(composer().entryVisibility, "private");
  await act(() => composer().onClose());
  await update();
  assert.equal(composer().visible, false, "An already handled route parameter does not reopen the composer");

  harness.state = { ...baseState, currentUserId: undefined };
  harness.language = "sv";
  await update();
  assert.match(rendered(), /Din resa börjar här/);
  assert.match(rendered(), /Ta en stund för reflektion/);
  assert.doesNotMatch(rendered(), /A prayer|John 4:23|other-member/);

  harness.language = "en";
  harness.state = { ...baseState, journalEntries: [...baseState.journalEntries, todaysReflection] };
  harness.params = { id: outsider.id };
  await update(JournalDetailScreen);
  assert.match(rendered(), /no longer available/);
  harness.params = { id: prayer.id };
  await update(JournalDetailScreen);
  assert.match(rendered(), /A copy was shared with a community/);
  assert.doesNotMatch(rendered(), /Only you can see this/);
  harness.params = { id: todaysReflection.id };
  await update(JournalDetailScreen);
  assert.match(rendered(), /Only you can see this/);
  await press(tree.root.findAllByType("SecondaryButton").find((button) => button.props.children === "Edit"));
  await act(() => composer().onKind("prayer_request"));
  await act(() => composer().onSubmit());
  assert.equal(harness.actions.at(-1).type, "updateJournalEntry");
  assert.equal(harness.actions.at(-1).id, todaysReflection.id);
  assert.equal(harness.actions.at(-1).journalType, "prayer");
  assert.equal(harness.actions.at(-1).sharedPostId, undefined);

  console.log("Me Journey and Reflect Today passed: ownership, chronology, previews, accessibility labels, navigation, local midnight, private composer, sharing presentation, and edits.");
} finally {
  if (tree) await act(() => tree.unmount());
  mock.timers.reset();
  await rm(directory, { recursive: true, force: true });
}
