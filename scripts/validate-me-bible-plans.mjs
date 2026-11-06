import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const fixture = globalThis.__meBiblePlans = { language: "en", params: {}, routes: [], plans: [], preferences: new Map(), storageReads: [] };
const mocks = {
  "react-native": 'export const View="View",Text="Text",Pressable="Pressable",ScrollView="ScrollView",Platform={OS:"ios"};',
  "expo-router": `import { useEffect } from "react";
    export const router={push:route=>globalThis.__meBiblePlans.routes.push(route)};
    export const useLocalSearchParams=()=>globalThis.__meBiblePlans.params;
    export function useFocusEffect(callback) { useEffect(callback, [callback]); }
  `,
  "@expo/vector-icons": 'export const Feather="Feather";',
  "@/features/use-bible-book-language": 'export const useBibleBookLanguage=()=>globalThis.__meBiblePlans.language;',
  "@/state/koino-store": `export const useKoino=()=>({state:{biblePlans:globalThis.__meBiblePlans.plans,currentUserId:"member",groups:[]},dispatch:async()=>{}});`,
  "@/state/encryption/local-storage": `export default { getItem: async key => {
    globalThis.__meBiblePlans.storageReads.push(key);
    return globalThis.__meBiblePlans.preferences.get(key) ?? null;
  } };`,
  "@/ui/app-components": `export const AppScreen="AppScreen",BodyText="BodyText",Card="Card",FilterChips="FilterChips",IconButton="IconButton",PrimaryButton="PrimaryButton",SecondaryButton="SecondaryButton",SectionHeading="SectionHeading",TextInputField="TextInputField";`,
  "@/ui/confirm": 'export const confirmAction=()=>{};',
  "@/ui/app-language": `
    import { translateMessage } from "@/ui/localization";
    export function useAppTranslation(){
      const {language}=globalThis.__meBiblePlans;
      return {language,t:(key,values)=>translateMessage(language,key,values)};
    }
  `,
};

const bundle = await build({
  stdin: {
    contents: `
      export { MeBiblePlans } from "./features/me-bible-plans";
      export { HomeScripture } from "./features/home-scripture";
      export { BiblePlansScreen } from "./features/bible-plans-screen";
      export { todayDateKey } from "./features/bible-plans";
      export { addPlanDays } from "./state/bible-plan-schedule";
      export { applyTheme, colors } from "./ui/theme";
    `,
    resolveDir: projectRoot,
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  write: false,
  external: ["react"],
  plugins: [{ name: "me-plan-native-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, ({ path }) => path in mocks ? { path, namespace: "mock" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path], resolveDir: projectRoot }));
  } }],
});
const module = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(require, module, module.exports);
const { MeBiblePlans, HomeScripture, BiblePlansScreen, todayDateKey, addPlanDays, applyTheme, colors } = module.exports;

const today = todayDateKey();
const earlier = addPlanDays(today, -4);
const position = { book: "Genesis", chapter: 1, verse: 1 };
const range = { id: "genesis", start: position, end: position, displayReference: "Genesis 1:1" };
const day = (dayNumber, options) => ({ dayNumber, ranges: [range], ...options });
const plan = (id, options) => ({
  id, userId: "member", title: id, status: "active", source: "personal", startDate: earlier,
  ranges: [range], days: [day(1)], dayCount: 1, createdAt: earlier, updatedAt: earlier, ...options,
});
const catchUp = plan("Most recently updated plan");
const foreign = plan("Other member's plan", { userId: "other", startDate: today });
const scheduled = plan("Reading for today", { source: "group", days: [
  day(1), day(2, { completedAt: earlier }), day(3, { scheduledDate: today }),
] });
const paused = plan("Paused reading", { pausedAt: earlier });
const saved = plan("Saved reading", { status: "saved" });
const completed = plan("Completed reading", { status: "completed", days: [day(1, { completedAt: earlier })] });

let tree;
async function mount(Component, props) {
  await act(async () => {
    tree?.unmount();
    tree = create(React.createElement(Component, props));
  });
  return tree.root;
}

function link(root, label) {
  return root.findAllByType("Pressable").find((item) => item.props.accessibilityRole === "link"
    && item.findByType("Text").props.children === label);
}

function hasText(root, label) {
  return ["Text", "BodyText"].some((type) => root.findAllByType(type).some((item) => item.props.children === label));
}

async function follow(root, label) {
  const action = link(root, label);
  assert.ok(action, `Missing accessible link: ${label}`);
  assert.equal(action.props.style({ pressed: false }).minHeight, 44);
  await act(() => action.props.onPress());
  return fixture.routes.at(-1);
}

async function followHome(label) {
  const action = tree.root.findByType("PrimaryButton");
  assert.equal(action.props.children, label);
  await act(() => action.props.onPress());
  return fixture.routes.at(-1);
}

try {
  let me = await mount(MeBiblePlans, { plans: [foreign, paused, catchUp, scheduled, saved, completed], userId: "member" });
  assert.ok(hasText(me, "Reading for today"));
  assert.ok(hasText(me, "Day 3 of 3 · 33% complete"));
  assert.ok(!hasText(me, foreign.title));
  assert.ok(!hasText(me, catchUp.title));
  let route = await follow(me, "Continue");
  assert.equal(route.pathname, "/(tabs)/bible");
  assert.equal(route.params.planId, scheduled.id);
  assert.equal(route.params.planDay, "3");
  assert.match(route.params.planJump, /^\d+$/);

  const withoutToday = plan("Today has no passage", { days: [day(1), day(2, { scheduledDate: today, ranges: [] })] });
  me = await mount(MeBiblePlans, { plans: [withoutToday], userId: "member" });
  assert.ok(hasText(me, "Day 1 of 2 · 0% complete"));
  assert.equal((await follow(me, "Continue")).params.planDay, "1");

  me = await mount(MeBiblePlans, { plans: [paused], userId: "member" });
  assert.ok(hasText(me, "Paused · 0% complete"));
  assert.equal(link(me, "Continue"), undefined);
  route = await follow(me, "View plans");
  assert.deepEqual(route, { pathname: "/bible-plans", params: { tab: "active" } });

  for (const [fallback, label] of [[saved, "View saved plans"], [completed, "View completed plans"]]) {
    fixture.plans = [foreign, fallback];
    me = await mount(MeBiblePlans, { plans: fixture.plans, userId: "member" });
    assert.equal(link(me, "Continue"), undefined);
    route = await follow(me, label);
    assert.equal(route.pathname, "/bible-plans");
    fixture.params = route.params;
    const plans = await mount(BiblePlansScreen);
    assert.equal(plans.findByType("FilterChips").props.value, fallback.status);
    assert.ok(hasText(plans, fallback.title));
    assert.ok(!hasText(plans, foreign.title));
  }

  me = await mount(MeBiblePlans, { plans: [foreign], userId: undefined });
  assert.ok(hasText(me, "No reading plan yet."));
  assert.equal(link(me, "Continue"), undefined);
  route = await follow(me, "Explore plans");
  assert.equal(route.params.tab, "active");
  fixture.params = {};
  fixture.plans = [catchUp];
  const plans = await mount(BiblePlansScreen);
  assert.equal(plans.findByType("FilterChips").props.value, "active");
  const nextUnread = plans.findAllByType("SecondaryButton").find((item) => item.props.children === "Next unread");
  await act(() => nextUnread.props.onPress());
  assert.equal(fixture.routes.at(-1).params.planId, catchUp.id);

  fixture.language = "sv";
  applyTheme("dark");
  me = await mount(MeBiblePlans, { plans: [scheduled], userId: "member" });
  assert.ok(hasText(me, "Dag 3 av 3 · 33 % klart"));
  assert.ok(link(me, "Fortsätt"));
  const title = me.findAllByType("Text").find((item) => item.props.children === scheduled.title);
  assert.equal(title.props.style.at(-1).color, colors.ink);

  const homeProps = { date: today, plans: [foreign, paused, catchUp, scheduled, saved, completed], userId: "member" };
  let home = await mount(HomeScripture, homeProps);
  assert.ok(hasText(home, "Första Moseboken 1:1"));
  assert.ok(hasText(home, scheduled.title));
  assert.ok(!hasText(home, foreign.title));
  assert.deepEqual(fixture.storageReads, [], "an active plan takes precedence over stored reader history");
  route = await followHome("Fortsätt med läsplanen");
  assert.equal(route.pathname, "/(tabs)/bible");
  assert.equal(route.params.planId, scheduled.id);
  assert.equal(route.params.planDay, "3");

  fixture.language = "en";
  applyTheme("light");
  await act(async () => tree.update(React.createElement(HomeScripture, homeProps)));
  const homeTitle = tree.root.findAllByType("Text").find((item) => item.props.children === "Genesis 1:1");
  assert.equal(homeTitle.props.style.at(-1).color, colors.ink);
  assert.equal(tree.root.findByType("Card").props.style.backgroundColor, colors.elevated);

  const fallbackProps = { ...homeProps, plans: [foreign, paused, saved, completed, plan("Empty plan", { days: [day(1, { ranges: [] })] })] };
  home = await mount(HomeScripture, fallbackProps);
  assert.equal(await followHome("Open the Bible"), "/(tabs)/bible");
  assert.ok(!hasText(home, "Genesis 1:1"));

  const preferenceKey = "koino.bibleReader.member";
  const starter = { book: "Philippians", chapter: 4, verse: 4 };
  const readerPreference = (entries, index) => JSON.stringify({ bibleVersionId: "kjv", history: { entries, index } });
  for (const unreliable of ["{", readerPreference([starter], 0), readerPreference([starter, position], 2)]) {
    fixture.preferences.set(preferenceKey, unreliable);
    await mount(HomeScripture, fallbackProps);
    assert.equal(await followHome("Open the Bible"), "/(tabs)/bible");
  }

  const savedPosition = readerPreference([starter, position], 1);
  fixture.preferences.set(preferenceKey, savedPosition);
  await mount(HomeScripture, fallbackProps);
  assert.equal(await followHome("Continue reading"), "/(tabs)/bible");
  assert.ok(!hasText(tree.root, "Genesis 1:1"), "reader reconciliation owns the resumed passage");

  await act(async () => tree.update(React.createElement(HomeScripture, { ...fallbackProps, userId: "third-user" })));
  assert.equal(await followHome("Open the Bible"), "/(tabs)/bible");
  assert.equal(fixture.storageReads.at(-1), "koino.bibleReader.third-user");

  let finishRead;
  fixture.preferences.set(preferenceKey, new Promise((resolve) => { finishRead = resolve; }));
  await mount(HomeScripture, fallbackProps);
  await act(async () => tree.update(React.createElement(HomeScripture, { ...fallbackProps, userId: "third-user" })));
  await act(async () => finishRead(savedPosition));
  assert.equal(await followHome("Open the Bible"), "/(tabs)/bible");
} finally {
  await act(() => tree?.unmount());
  delete globalThis.__meBiblePlans;
}

console.log("Me and Home Bible checks passed: ownership, schedule priority, Continue, paused and fallback states, account switching, existing navigation, Swedish and dark theme.");
