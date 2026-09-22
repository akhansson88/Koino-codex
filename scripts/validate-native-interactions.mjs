import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { build } from "esbuild";
import React from "react";
import { act, create } from "react-test-renderer";

const require = createRequire(import.meta.url);
const directory = await mkdtemp(path.join(tmpdir(), "koino-interactions-"));
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.__interaction = { os: "android", haptics: 0, closes: 0, snaps: 0, frames: [] };
globalThis.requestAnimationFrame = callback => { globalThis.__interaction.frames.push(callback); return globalThis.__interaction.frames.length; };
globalThis.cancelAnimationFrame = () => {};
const flushFrames = () => { for (const callback of globalThis.__interaction.frames.splice(0)) callback(); };
const mocks = {
  "react-native": `
    export const Platform = { get OS() { return globalThis.__interaction.os; } };
    export const Pressable = "Pressable", Text = "Text", View = "View", Modal = "Modal", ScrollView = "ScrollView", TextInput = "TextInput";
    export const StyleSheet = { absoluteFill: {} };
    export const AccessibilityInfo = { setAccessibilityFocus() {} };
    export const findNodeHandle = () => 1;
    export const useWindowDimensions = () => ({ height: 800, width: 390 });
  `,
  "expo-haptics": `export const selectionAsync = async () => { globalThis.__interaction.haptics++; };`,
  "react-native-safe-area-context": `export const useSafeAreaInsets = () => ({ top: 44, bottom: 34 });`,
  "react-native-gesture-handler": `export const GestureHandlerRootView = "GestureRoot";`,
  "react-native-reanimated": `export const ReduceMotion = { Always: "always", System: "system" };`,
  "@expo/vector-icons": `export const Feather = "Feather";`,
  "@/ui/theme": `export const colors = { paper: "white", ink: "black", danger: "red" }, radius = { xxl: 24 }, typography = {};`,
  "@/ui/app-language": `export const useAppTranslation = () => ({ t: key => key });`,
  "@gorhom/bottom-sheet": `
    import React, { forwardRef, useImperativeHandle } from "react";
    export default forwardRef(function Sheet(props, ref) {
      useImperativeHandle(ref, () => ({ close() { globalThis.__interaction.closes++; }, snapToIndex() { globalThis.__interaction.snaps++; } }));
      return <SheetMock {...props}>{props.children}</SheetMock>;
    });
    const SheetMock = "Sheet";
    export const BottomSheetBackdrop = "Backdrop", BottomSheetFlatList = "SheetList", BottomSheetScrollView = "SheetScroll", BottomSheetTextInput = "SheetInput", BottomSheetView = "SheetView";
  `,
};

try {
  const outfile = path.join(directory, "components.cjs");
  await build({ stdin: { contents: 'export { NativePressable } from "./ui/native-pressable"; export { AppSheet } from "./ui/app-sheet";', resolveDir: process.cwd(), loader: "tsx" }, outfile, jsx: "automatic", bundle: true, format: "cjs", platform: "node",
    plugins: [{ name: "interaction-mocks", setup(builder) {
      builder.onResolve({ filter: /.*/ }, args => {
        if (mocks[args.path]) return { path: args.path, namespace: "mock" };
        if (args.path === "react" || args.path.startsWith("react/")) return { path: require.resolve(args.path), external: true };
      });
      builder.onLoad({ filter: /.*/, namespace: "mock" }, args => ({ contents: mocks[args.path], loader: "tsx" }));
    } }],
  });
  const { NativePressable, AppSheet } = require(outfile);
  let taps = 0, holds = 0, tree;
  const event = (x = 0, y = 0) => ({ nativeEvent: { pageX: x, pageY: y } });
  await act(() => { tree = create(React.createElement(NativePressable, { onPress: () => taps++, onLongPress: () => holds++ })); });
  let press = tree.root.findByType("Pressable").props;
  press.onPressIn(event()); press.onPress(event());
  assert.equal(taps, 1);
  press.onPressIn(event()); press.onLongPress(event()); press.onLongPress(event()); press.onPress(event());
  assert.equal(holds, 1); assert.equal(taps, 1); assert.equal(globalThis.__interaction.haptics, 1);
  press.onPressIn(event()); press.onTouchMove(event(0, 30)); press.onLongPress(event()); press.onPress(event());
  assert.equal(holds, 1); assert.equal(taps, 1, "scrolling must not activate a verse");
  press.onAccessibilityAction({ nativeEvent: { actionName: "longpress" } });
  assert.equal(holds, 2);
  globalThis.__interaction.os = "web";
  await act(() => tree.update(React.createElement(NativePressable, { onLongPress: () => holds++ })));
  press = tree.root.findByType("Pressable").props;
  let prevented = false;
  press.onContextMenu({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true); assert.equal(holds, 3); assert.equal(globalThis.__interaction.haptics, 2);
  await act(() => tree.unmount());

  for (const os of ["android", "ios"]) {
    globalThis.__interaction.os = os;
    const order = [];
    const ref = React.createRef();
    const props = { ref, visible: true, title: "Actions", onClose: () => order.push("close"), onDismiss: () => order.push("dismiss") };
    await act(() => { tree = create(React.createElement(AppSheet, props)); });
    ref.current.dismiss(() => order.push("next"));
    ref.current.dismiss(() => order.push("duplicate"));
    assert.deepEqual(order, [], "callbacks wait for animation completion");
    await act(() => tree.root.findByType("Sheet").props.onClose());
    assert.deepEqual(order, [], "callbacks also wait for the native modal to leave");
    await act(() => { if (os === "ios") tree.root.findByType("Modal").props.onDismiss(); else flushFrames(); });
    assert.deepEqual(order, ["close", "dismiss", "next"]);
    await act(() => tree.root.findByType("Modal").props.onDismiss());
    assert.deepEqual(order, ["close", "dismiss", "next"], "completion is exactly once");
    await act(() => tree.update(React.createElement(AppSheet, { ...props, visible: false })));
    await act(() => tree.update(React.createElement(AppSheet, { ...props, dismissible: false })));
    const before = globalThis.__interaction.closes;
    ref.current.dismiss(); tree.root.findByType("Modal").props.onRequestClose();
    assert.equal(globalThis.__interaction.closes, before, "busy sheets cannot dismiss");
    assert.equal(tree.root.findByType("Sheet").props.enablePanDownToClose, false);
    await act(() => tree.update(React.createElement(AppSheet, { ...props, visible: false })));
    await act(() => tree.root.findByType("Sheet").props.onClose());
    await act(() => { if (os === "ios") tree.root.findByType("Modal").props.onDismiss(); else flushFrames(); });
    assert.deepEqual(order, ["close", "dismiss", "next", "dismiss"], "controlled close does not duplicate onClose");
    await act(() => tree.unmount());
  }
  console.log("Native interactions passed: tap/hold, movement cancellation, haptics, accessibility/right-click, dismissal ordering, locking, reopen, controlled close.");
} finally {
  await rm(directory, { recursive: true, force: true });
}
