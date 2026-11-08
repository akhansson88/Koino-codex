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
    export const AccessibilityInfo = { announceForAccessibility: message => { (globalThis.__meJourney.announcements ??= []).push(message); } };
    export const useWindowDimensions = () => ({ width: 390, fontScale: 1 });
    export const View = "View", Text = "Text", ScrollView = "ScrollView", ActivityIndicator = "ActivityIndicator";
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
  "react-native-safe-area-context": "export const useSafeAreaInsets = () => ({ top: 44, bottom: 34 });",
  "@/features/me-bible-plans": 'export const MeBiblePlans = "MeBiblePlans";',
  "@/features/use-bible-book-language": 'export const useBibleBookLanguage = () => globalThis.__meJourney.language;',
  "@/state/koino-store": `
    const harness = globalThis.__meJourney;
    const dispatch = async action => { harness.actions.push(action); await harness.dispatch?.(action); };
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
      SecondaryButton = "SecondaryButton", SectionHeading = "SectionHeading", VerseList = "VerseList",
      FilterChips = "FilterChips", TextInputField = "TextInputField", FullScreenModal = "FullScreenModal";
  `,
  "@/ui/brand-wave-motif": 'export const BrandWaveMotif = "BrandWaveMotif";',
  "@/ui/bible-verse-field": 'export const BibleVerseField = "BibleVerseField";',
  "@/ui/link-preview": 'export const LinkPreview = "LinkPreview";',
  "@/ui/shared-composer": 'export const SharedComposer = "SharedComposer";',
};

let tree;
try {
  const outfile = path.join(directory, "screens.cjs");
  await build({
    stdin: {
      contents: `
        export { JournalScreen } from "./features/journal-screen";
        export { JournalDetailScreen } from "./features/journal-detail-screen";
        export { SharedComposer as RealSharedComposer } from "./ui/shared-composer";
      `,
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
  const { JournalScreen, JournalDetailScreen, RealSharedComposer } = require(outfile);
  mock.timers.enable({ apis: ["Date", "setTimeout"], now: new Date("2026-11-05T22:59:59Z") });

  const entry = (id, createdAt, extra = {}) => ({
    id, createdAt, updatedAt: createdAt, userId: "member", body: id, source: "manual", ...extra,
  });
  const yesterday = entry("yesterday", "2026-11-04T22:59:59Z", { updatedAt: "2026-11-05T22:59:58Z" });
  const checkIn = entry("check-in", "2026-11-05T19:00:00Z", { source: "private_check_in", journalType: "reflection", entryKind: "reflection", heartMood: "grateful" });
  const prayer = entry("prayer", "2026-11-05T20:00:00Z", { journalType: "reflection", entryKind: "prayer_request", isPrivate: false, sharedPostId: "original-post", title: "A prayer" });
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
  assert.equal(composer().communityAudienceAvailable, false, "Solo drafts offer a private destination only");
  assert.equal(composer().kind, "reflection");
  await act(() => composer().onVisibility("room"));
  assert.equal(composer().entryVisibility, "private", "A solo draft cannot select a missing community");
  await act(() => composer().onBody("A private reflection"));
  await act(() => composer().onSubmit());
  assert.deepEqual(harness.actions.at(-1), { type: "createJournalEntry", journalType: "reflection", entryKind: "reflection", body: "A private reflection", title: "", verse: undefined, verses: [], shareWithGroup: false, journalScope: { userId: "member" } });
  assert.equal(composer().visible, false);
  assert.match(rendered(), /Saved privately in your journal/);

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
  assert.equal(composer().visible, true, "The Home reflection route opens without a community, even on a completed day");
  assert.equal(composer().entryVisibility, "private");
  await act(() => composer().onBody("A solo reflection from Home"));
  await act(() => composer().onSubmit());
  assert.equal(harness.actions.at(-1).type, "createJournalEntry");
  assert.equal(harness.actions.at(-1).body, "A solo reflection from Home");
  assert.equal(harness.actions.at(-1).shareWithGroup, false);
  assert.deepEqual(harness.actions.at(-1).journalScope, { userId: "member" });
  await update();
  assert.equal(composer().visible, false, "An already handled route parameter does not reopen the composer");

  const rooms = [{ id: "room-a", name: "First community" }, { id: "room-b", name: "Second community" }];
  harness.state = { ...baseState, groups: rooms, currentGroupId: "room-a" };
  harness.params = { newEntry: "unverified-room" };
  await update();
  assert.equal(composer().communityAudienceAvailable, false, "A cached room cannot enable sharing without verified membership");
  harness.state = { ...harness.state, journalShareGroupId: "room-a" };
  await update();
  assert.equal(composer().communityAudienceAvailable, true);
  assert.equal(composer().entryVisibility, "private", "Verification enables choice without auto-selecting sharing");
  await act(() => composer().onBody("Keep this draft"));
  await act(() => composer().onVisibility("room"));
  assert.equal(composer().entryVisibility, "room");
  assert.equal(composer().roomName, "First community");
  const originalShare = composer().onSubmit;
  const chooseOriginalRoom = composer().onVisibility;
  let rejectSave;
  harness.dispatch = () => new Promise((_, reject) => { rejectSave = reject; });
  let submission;
  const attemptsBeforeShare = harness.actions.length;
  await act(() => { submission = originalShare(); void originalShare(); composer().onClose(); });
  assert.equal(harness.actions.length, attemptsBeforeShare + 1, "One pending submission per draft");
  assert.deepEqual(harness.actions.at(-1).journalScope, { userId: "member", groupId: "room-a" });
  assert.equal(harness.actions.at(-1).shareWithGroup, true);
  assert.equal(composer().visible, true, "The draft remains visible while awaiting acknowledgement");
  assert.equal(composer().submission.inFlight, true);
  assert.equal(composer().submissionFeedback, "me.journey.composer.saving");
  assert.doesNotMatch(rendered(), /Saved in your journal and shared/);
  await act(async () => { rejectSave(new Error("Unknown acknowledgement")); await submission; });
  assert.equal(composer().body, "Keep this draft");
  assert.equal(composer().entryVisibility, "room");
  assert.equal(composer().submissionFeedback, "me.journey.composer.shareUnconfirmed");

  harness.state = { ...harness.state, currentGroupId: "room-b", journalShareGroupId: "room-b" };
  await update();
  assert.equal(composer().entryVisibility, "private", "Switching rooms withdraws the previous sharing selection");
  assert.equal(composer().submissionFeedback, "me.journey.composer.communityChanged");
  assert.equal(composer().body, "Keep this draft");
  await act(async () => { await originalShare(); chooseOriginalRoom("room"); });
  assert.equal(harness.actions.length, attemptsBeforeShare + 1, "A stale Share action cannot save privately or publish to the new room");
  assert.equal(composer().entryVisibility, "private");
  await act(() => composer().onVisibility("room"));
  harness.dispatch = undefined;
  await act(async () => { await composer().onSubmit(); });
  assert.deepEqual(harness.actions.at(-1).journalScope, { userId: "member", groupId: "room-b" });
  assert.equal(composer().visible, false);
  assert.match(rendered(), /Saved in your journal and shared with Second community/);

  harness.state = { ...baseState, groups: [{ ...rooms[0], migrationPending: true }], journalShareGroupId: "room-a" };
  harness.params = { newEntry: "private-retry" };
  await update();
  assert.equal(composer().communityAudienceAvailable, false, "A migration-pending room stays unavailable");
  await act(() => composer().onBody("Private retry"));
  harness.dispatch = () => { throw new Error("Private save failed"); };
  await act(async () => { await composer().onSubmit(); });
  assert.equal(composer().visible, true);
  assert.equal(composer().body, "Private retry");
  assert.equal(composer().submissionFeedback, "me.journey.composer.saveFailed");
  assert.doesNotMatch(rendered(), /Saved privately in your journal/);
  harness.dispatch = undefined;

  harness.params = { newEntry: "another-home-reflection" };
  await update();
  await act(() => composer().onBody("Previous account draft"));
  const oldSubmit = composer().onSubmit;
  harness.params = {};
  harness.state = { ...baseState, currentUserId: "another-reader" };
  await update();
  assert.equal(composer().visible, false, "Account replacement closes the Home reflection composer");
  assert.equal(composer().body, "", "Account replacement clears the previous account's draft");
  const attemptsBeforeReplacement = harness.actions.length;
  await act(async () => { await oldSubmit(); });
  assert.equal(harness.actions.length, attemptsBeforeReplacement, "A stale journal callback cannot write for another account");

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
  await press(tree.root.findAllByType("SecondaryButton").find((button) => button.props.children === "Edit"));
  assert.equal(composer().communityAudienceAvailable, false, "Editing cannot change the audience of the existing shared copy");
  assert.equal(composer().entryVisibility, "room");
  assert.equal(composer().roomName, undefined, "A historical copy is not attributed to the active community");
  await act(() => composer().onVisibility("private"));
  assert.equal(composer().entryVisibility, "room");
  await act(() => composer().onBody("Edit only the journal copy"));
  harness.dispatch = () => { throw new Error("Edit save failed"); };
  await act(async () => { await composer().onSubmit(); });
  assert.equal(composer().body, "Edit only the journal copy");
  assert.equal(composer().submissionFeedback, "me.journey.composer.saveFailed");
  harness.dispatch = undefined;
  await act(async () => { await composer().onSubmit(); });
  assert.equal(harness.actions.at(-1).sharedPostId, "original-post");
  assert.deepEqual(harness.actions.at(-1).journalScope, { userId: "member" });
  assert.match(rendered(), /Changes saved in your journal/);
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
  assert.deepEqual(harness.actions.at(-1).journalScope, { userId: "member" });

  const noop = () => {};
  const modal = {
    visible: true, context: "journal", kind: "reflection", entryVisibility: "private", communityAudienceAvailable: false,
    title: "", body: "Keep my writing", verses: [], onKind: noop, onVisibility: noop,
    onTitle: noop, onBody: noop, onVerses: noop, onClose: noop, onSubmit: noop,
  };
  await act(() => tree.update(React.createElement(RealSharedComposer, modal)));
  const audienceChips = () => tree.root.findAllByType("FilterChips").find(node => node.props.options.some(option => option.value === "room"));
  assert.equal(audienceChips(), undefined);
  assert.match(rendered(), /Only you can see this/);
  assert.doesNotMatch(rendered(), /audience of a saved check-in/);
  await act(() => tree.update(React.createElement(RealSharedComposer, { ...modal, entryVisibility: "room" })));
  assert.equal(tree.root.findByType("PrimaryButton").props.disabled, true, "A stale unavailable sharing destination cannot submit");
  await act(() => tree.update(React.createElement(RealSharedComposer, { ...modal, communityAudienceAvailable: true, roomName: "First community" })));
  assert.ok(audienceChips(), "A ready room shows the explicit audience choice in the real composer");
  harness.language = "sv";
  await act(() => tree.update(React.createElement(RealSharedComposer, {
    ...modal, submission: { status: "failure", inFlight: false }, submissionFeedback: "me.journey.composer.shareUnconfirmed",
  })));
  assert.match(rendered(), /Vi kunde inte bekräfta om din anteckning delades/);
  assert.equal(harness.announcements.at(-1), "Vi kunde inte bekräfta om din anteckning delades. Ditt utkast finns kvar.");
  await act(() => tree.update(React.createElement(RealSharedComposer, { ...modal, editing: true, entryVisibility: "room", roomName: "Unrelated room" })));
  assert.equal(audienceChips(), undefined);
  assert.doesNotMatch(rendered(), /Unrelated room/);

  console.log("Me Journey and Reflect Today passed: scoped destinations, confirmed saves, preserved drafts, fixed edit audience, real composer options, accessibility, chronology and navigation.");
} finally {
  if (tree) await act(() => tree.unmount());
  mock.timers.reset();
  await rm(directory, { recursive: true, force: true });
}
