import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const fixture = globalThis.__meBiblePlans = {
  language: "en",
  params: {},
  routes: [],
  plans: [],
  preferences: new Map(),
  storageReads: [],
  actions: [],
};
const mocks = {
  "react-native": `export const View="View",Text="Text",Pressable="Pressable",ScrollView="ScrollView",FlatList="FlatList",Image="Image",Platform={OS:"ios"},StyleSheet={flatten:(value)=>value};`,
  "expo-router": `import { useEffect } from "react";
    export const router={push:route=>globalThis.__meBiblePlans.routes.push(route)};
    export const useLocalSearchParams=()=>globalThis.__meBiblePlans.params;
    export function useFocusEffect(callback) { useEffect(callback, [callback]); }
  `,
  "expo-linear-gradient": `export const LinearGradient="LinearGradient";`,
  "react-native-svg": `const Svg="Svg"; export const Circle="Circle"; export default Svg;`,
  "react-native-safe-area-context": `export const useSafeAreaInsets=()=>({top:0,bottom:0,left:0,right:0});`,
  "@expo/vector-icons": `export const Feather="Feather";`,
  "@/features/use-bible-book-language": `export const useBibleBookLanguage=()=>globalThis.__meBiblePlans.language;`,
  "@/features/bible-plan-images": `export const biblePlanCover=()=>({});`,
  "@/state/koino-store": `export const useKoino=()=>({
    state:{biblePlans:globalThis.__meBiblePlans.plans,currentUserId:"member",currentGroupId:"group",groups:[],users:[]},
    dispatch:async (action)=>{ globalThis.__meBiblePlans.actions.push(action); },
  });
  export const useKoinoActions=()=>({dispatch:async (action)=>{ globalThis.__meBiblePlans.actions.push(action); }});`,
  "@/state/encryption/local-storage": `export default { getItem: async key => {
    globalThis.__meBiblePlans.storageReads.push(key);
    return globalThis.__meBiblePlans.preferences.get(key) ?? null;
  } };`,
  "@/ui/app-components": `import React from "react";
    export const AppScreen="AppScreen",BodyText="BodyText",Card="Card",FilterChips="FilterChips",IconButton="IconButton",PrimaryButton="PrimaryButton",SecondaryButton="SecondaryButton",SectionHeading="SectionHeading",TextInputField="TextInputField",Avatar="Avatar";
    export const BottomSheet=({visible,children})=>visible?React.createElement(React.Fragment,null,React.createElement("Text",null,"SHEET_VISIBLE"),children):null;
    export const FullScreenModal=({visible,children})=>visible?React.createElement("FullScreenModal",null,children):null;
  `,
  "@/ui/sheet-menu": `export const SheetMenuGroup="SheetMenuGroup",SheetMenuItem="SheetMenuItem";`,
  "@/ui/confirm": `export const confirmAction=({onConfirm})=>onConfirm?.();`,
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
      export { PlanPassagePicker } from "./features/bible-plan-passage-picker";
      export { todayDateKey } from "./features/bible-plans";
      export { addPlanDays } from "./state/bible-plan-schedule";
      export { colors } from "./ui/theme";
    `,
    resolveDir: projectRoot,
  },
  bundle: true,
  platform: "node",
  format: "cjs",
  jsx: "automatic",
  write: false,
  external: ["react"],
  loader: { ".png": "dataurl" },
  plugins: [{ name: "me-plan-native-boundaries", setup(builder) {
    builder.onResolve({ filter: /.*/ }, ({ path }) => path in mocks ? { path, namespace: "mock" } : undefined);
    builder.onLoad({ filter: /.*/, namespace: "mock" }, ({ path }) => ({ contents: mocks[path], resolveDir: projectRoot }));
  } }],
});
const module = { exports: {} };
new Function("require", "module", "exports", bundle.outputFiles[0].text)(require, module, module.exports);
const { MeBiblePlans, HomeScripture, BiblePlansScreen, PlanPassagePicker, todayDateKey, addPlanDays, colors } = module.exports;

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
const completed = plan("Completed reading", { status: "completed", days: [day(1, { completedAt: earlier })] });

let tree;
async function mount(Component, props) {
  await act(async () => {
    tree?.unmount();
    tree = create(React.createElement(Component, props));
  });
  return tree.root;
}

function hasText(root, label) {
  return ["Text", "BodyText", "SectionHeading"].some((type) => root.findAllByType(type).some((item) => item.props.children === label));
}

function button(root, label) {
  return root.findAllByType("PrimaryButton").find((item) => item.props.children === label);
}

async function follow(root, label) {
  const action = button(root, label);
  assert.ok(action, `Missing primary action: ${label}`);
  await act(() => action.props.onPress());
  return fixture.routes.at(-1);
}

try {
  fixture.language = "en";
  fixture.params = {};
  fixture.actions = [];

  let me = await mount(MeBiblePlans, { plans: [foreign, paused, catchUp, scheduled, completed], userId: "member" });
  assert.ok(hasText(me, "Reading for today"), "Me card prefers today's reading");
  assert.ok(hasText(me, "Day 3 of 3"), "Me card shows the day of the plan");
  assert.ok(!hasText(me, foreign.title), "Me card ignores another member's plan");
  let route = await follow(me, "Continue");
  assert.equal(route.pathname, "/(tabs)/bible");
  assert.equal(route.params.planId, scheduled.id);
  assert.equal(route.params.planDay, "3");

  me = await mount(MeBiblePlans, { plans: [foreign], userId: "member" });
  assert.ok(hasText(me, "No reading plan yet."));
  route = await follow(me, "Explore plans");
  assert.equal(route.pathname, "/bible-plans");
  assert.equal(route.params.tab, "library");

  const homeProps = { date: today, plans: [foreign, paused, catchUp, scheduled, completed], userId: "member" };
  let home = await mount(HomeScripture, homeProps);
  assert.ok(hasText(home, "Genesis 1:1"), "Home shows today's passage");
  assert.ok(hasText(home, scheduled.title), "Home shows the plan title");
  assert.ok(!hasText(home, foreign.title), "Home ignores another member's plan");
  route = await follow(home, "Continue reading");
  assert.equal(route.pathname, "/(tabs)/bible");
  assert.equal(route.params.planId, scheduled.id);
  assert.equal(route.params.planDay, "3");

  home = await mount(HomeScripture, { ...homeProps, plans: [foreign, completed] });
  assert.ok(hasText(home, "Find your rhythm in Scripture"));
  route = await follow(home, "Open the Bible");
  assert.equal(route, "/(tabs)/bible");

  fixture.params = { tab: "library" };
  let plans = await mount(BiblePlansScreen);
  assert.ok(hasText(plans, "Plan library"), "Library tab renders");
  assert.ok(hasText(plans, "The whole Bible in one year"), "Library includes the flagship plan");
  assert.ok(hasText(plans, "The Psalms in 30 days"), "Library includes the Psalms plan");

  const search = plans.findAllByType("TextInputField").find((item) => item.props.placeholder === "Search plans…");
  assert.ok(search, "Library has a search field");
  await act(() => search.props.onChangeText("psalms"));
  assert.ok(hasText(plans, "The Psalms in 30 days"), "Search keeps matching plans");
  assert.ok(!hasText(plans, "The whole Bible in one year"), "Search filters the library");

  const templateRow = plans.findAllByType("Pressable").find((item) => item.props.accessibilityLabel === "The Psalms in 30 days");
  assert.ok(templateRow, "Plan row is accessible");
  await act(() => templateRow.props.onPress());
  const start = plans.findAllByType("PrimaryButton").find((item) => item.props.children === "Start this plan");
  assert.ok(start, "Template sheet offers a one-tap start");
  await act(() => start.props.onPress());
  const created = fixture.actions.find((action) => action.type === "createBiblePlan");
  assert.ok(created, "Starting a template dispatches createBiblePlan");
  assert.equal(created.templateId, "psalms-30");
  assert.equal(created.dayCount, 30);
  assert.equal(created.coverKey, "psalms-30");
  assert.equal(created.days.length, 30);

  fixture.params = { tab: "mine" };
  fixture.plans = [catchUp];
  plans = await mount(BiblePlansScreen);
  assert.ok(hasText(plans, catchUp.title), "My plans lists owned plans");
  const more = plans.findAllByType("Pressable").find((item) =>
    typeof item.props.accessibilityLabel === "string" && item.props.accessibilityLabel.startsWith("More actions for"),
  );
  assert.ok(more, "Plan card has an accessible overflow action");
  await act(() => more.props.onPress());
  assert.ok(hasText(plans, "SHEET_VISIBLE"), "Overflow sheet opens");
  const restart = plans.findAllByType("SheetMenuItem").find((item) => item.props.title === "Start over");
  assert.ok(restart, "Overflow sheet offers restart");
  await act(async () => { restart.props.onPress(); });
  assert.ok(fixture.actions.some((action) => action.type === "restartBiblePlan"), "Restart dispatches the store action");

  let selectedRange;
  const picker = await mount(PlanPassagePicker, {
    visible: true,
    onClose() {},
    onSelect(range) { selectedRange = range; },
  });
  const genesis = picker.findAllByType("Pressable").find((item) => item.props.accessibilityLabel === "Genesis");
  assert.ok(genesis, "Passage picker lists books");
  await act(() => genesis.props.onPress());
  const chapter1 = picker.findAllByType("Pressable").find((item) => item.props.accessibilityLabel === "1");
  const chapter3 = picker.findAllByType("Pressable").find((item) => item.props.accessibilityLabel === "3");
  assert.ok(chapter1 && chapter3, "Passage picker shows the chapter grid");
  await act(() => chapter3.props.onPress());
  const done = picker.findAllByType("PrimaryButton").find((item) => item.props.children === "Done");
  assert.ok(done, "Passage picker offers Done");
  await act(() => done.props.onPress());
  assert.ok(selectedRange, "Passage picker returns a range");
  assert.equal(selectedRange.displayReference, "Genesis 1:1-3:24");
  assert.equal(selectedRange.start.chapter, 1);
  assert.equal(selectedRange.end.chapter, 3);

  fixture.language = "sv";
  fixture.params = {};
  fixture.plans = [scheduled];
  me = await mount(MeBiblePlans, { plans: [scheduled], userId: "member" });
  assert.ok(hasText(me, "Dag 3 av 3"), "Swedish day label");
  assert.ok(button(me, "Fortsätt"), "Swedish continue action");
  home = await mount(HomeScripture, { date: today, plans: [scheduled], userId: "member" });
  assert.ok(hasText(home, "Första Moseboken 1:1"), "Swedish book name");
  assert.ok(button(home, "Fortsätt läsa"), "Swedish plan action");
  const title = home.findAllByType("Text").find((item) => item.props.children === scheduled.title);
  assert.ok(title, "Swedish plan title is rendered");
  assert.equal(title.props.style.at(-1).color, "#FFFFFF");
} finally {
  await act(() => tree?.unmount());
  delete globalThis.__meBiblePlans;
}

console.log("Home and Me Bible plan checks passed: ownership, today priority, empty states, library, search, one-tap template start, and Swedish.");
