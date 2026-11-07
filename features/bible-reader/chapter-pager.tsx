import { forwardRef, memo, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type ReactElement, type RefObject } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { cancelAnimation, ReduceMotion, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import type { BiblePosition } from "@/features/bible-canon";
import { chapterDragProgress, chapterGestureIntent, chapterIndex, chapterSwipeStep, type ChapterStep } from "./chapter-navigation";
import { chapterSelectionHaptic } from "./chapter-haptics";
import type { ChapterPage } from "./chapter-window";

// Clamp the first crossing instead of holding input through a nearly critical
// spring's invisible tail after the page already looks stationary.
const settleSpring = { stiffness: 300, damping: 28, mass: 1, overshootClamping: true, energyThreshold: 0.000001 };

export function useChapterCursor(position: BiblePosition) {
  return useSharedValue(chapterIndex(position));
}

export type ChapterPagerHandle = {
  step: (direction: ChapterStep) => void;
  blockCurrentTouch: () => void;
};

type PagerProps = {
  pages: ChapterPage[];
  currentKey: string;
  cursor: SharedValue<number>;
  width: number;
  layoutKey: string;
  navigationRevision: number;
  reducedMotion: boolean;
  enabled: boolean;
  backgroundColor: string;
  viewportRef: RefObject<View | null>;
  onLayout: (event: LayoutChangeEvent) => void;
  onCommit: (page: ChapterPage) => void;
  onInteractionChange: (active: boolean) => void;
  onLoadError: () => void;
  onRetry: (key: string) => void;
  renderPage: (page: ChapterPage, active: boolean) => ReactElement;
};

type PageRequest = { epoch: number; source: string; target: string; direction: ChapterStep; phase: "waiting" | "animating" | "handoff" };

const PagerCell = memo(function PagerCell({ page, active, cursor, width, reducedMotion, pan, layoutKey, onReady, children }: {
  page: ChapterPage; active: boolean; cursor: SharedValue<number>; width: number; reducedMotion: boolean;
  pan: ReturnType<typeof Gesture.Pan>; layoutKey: string; onReady: (key: string) => void; children: ReactElement;
}) {
  const measured = useRef(false);
  const index = page.index;
  const nativeScroll = useMemo(() => Gesture.Native().requireExternalGestureToFail(pan), [pan]);
  const style = useAnimatedStyle(() => {
    const distance = index - cursor.value;
    return reducedMotion
      ? { opacity: Math.max(0, 1 - Math.abs(distance)), transform: [{ translateX: 0 }] }
      : { opacity: 1, transform: [{ translateX: distance * width }] };
  }, [index, width, reducedMotion]);

  useEffect(() => {
    if (!page.chapter) return;
    const frame = requestAnimationFrame(() => { if (measured.current) onReady(page.key); });
    return () => cancelAnimationFrame(frame);
  }, [page.chapter, page.key, layoutKey, onReady]);

  return <Animated.View
    accessibilityElementsHidden={!active}
    importantForAccessibility={active ? "auto" : "no-hide-descendants"}
    pointerEvents={active ? "auto" : "none"}
    onLayout={({ nativeEvent }) => {
      measured.current = nativeEvent.layout.width > 0 && nativeEvent.layout.height > 0;
      if (measured.current && page.chapter) onReady(page.key);
    }}
    style={[{ position: "absolute", top: 0, bottom: 0, left: 0, right: 0 }, style]}
  >
    <GestureDetector gesture={nativeScroll}>{children}</GestureDetector>
  </Animated.View>;
});

/** Canonical page coordinates keep the incoming native ScrollView in place during handoff. */
export const ChapterPager = forwardRef<ChapterPagerHandle, PagerProps>(function ChapterPager(props, ref) {
  const { pages, currentKey, cursor, width, layoutKey, navigationRevision, reducedMotion, enabled } = props;
  const current = pages.find(page => page.key === currentKey)!;
  const index = current.index;
  const hasPrevious = pages.some(page => page.index === index - 1);
  const hasNext = pages.some(page => page.index === index + 1);
  const latest = useRef(props);
  latest.current = props;
  const epoch = useRef(0);
  const mounted = useRef(true);
  const request = useRef<PageRequest | undefined>(undefined);
  const ready = useRef(new Set<string>());
  const [readyRevision, setReadyRevision] = useState(0);
  const [requestRevision, setRequestRevision] = useState(0);
  const locked = useSharedValue(false);
  const dragging = useSharedValue(false);
  const released = useSharedValue(false);
  const held = useSharedValue(false);
  const touchX = useSharedValue(0);
  const touchY = useSharedValue(0);
  const gestureEpoch = useSharedValue(0);
  const touchEpoch = useSharedValue(0);
  const gestureIndex = useSharedValue(index);
  const previousAvailable = useSharedValue(hasPrevious);
  const nextAvailable = useSharedValue(hasNext);

  const interactionEnded = useCallback((token: number) => {
    if (mounted.current && token === epoch.current) latest.current.onInteractionChange(false);
  }, []);

  const finishStep = useCallback((token: number) => {
    const pending = request.current;
    const latestProps = latest.current;
    if (!mounted.current || !pending || pending.epoch !== token || token !== epoch.current ||
      pending.source !== latestProps.currentKey || pending.phase !== "animating") return;
    const target = latestProps.pages.find(page => page.key === pending.target);
    if (!target?.chapter) return;
    pending.phase = "handoff";
    latestProps.onCommit(target);
    chapterSelectionHaptic();
  }, []);

  const requestStep = useCallback((direction: ChapterStep, token?: number, fromGesture = false) => {
    const p = latest.current;
    if (!mounted.current || !p.enabled || request.current || (token !== undefined && token !== epoch.current) || (!fromGesture && locked.value)) return;
    const source = p.pages.find(page => page.key === p.currentKey)!;
    const target = p.pages.find(page => page.index === source.index + direction);
    if (!target) { locked.value = false; return; }
    locked.value = true;
    request.current = { epoch: epoch.current, source: p.currentKey, target: target.key, direction, phase: "waiting" };
    p.onInteractionChange(true);
    if (target.error) p.onRetry(target.key);
    setRequestRevision(value => value + 1);
  }, [locked]);

  const gestureStarted = useCallback((token: number) => {
    if (mounted.current && token === epoch.current) latest.current.onInteractionChange(true);
  }, []);

  useImperativeHandle(ref, () => ({
    step: direction => requestStep(direction),
    blockCurrentTouch: () => { held.value = true; },
  }), [requestStep, held]);

  useLayoutEffect(() => {
    epoch.current++;
    gestureEpoch.value = epoch.current;
    cancelAnimation(cursor);
    cursor.value = index;
    gestureIndex.value = index;
    previousAvailable.value = hasPrevious;
    nextAvailable.value = hasNext;
    locked.value = false;
    dragging.value = false;
    request.current = undefined;
    latest.current.onInteractionChange(false);
  }, [currentKey, layoutKey, navigationRevision, width, reducedMotion, enabled]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      epoch.current++;
      request.current = undefined;
      cancelAnimation(cursor);
    };
  }, [cursor]);

  const markReady = useCallback((key: string) => {
    if (!mounted.current || ready.current.has(key)) return;
    ready.current.add(key);
    setReadyRevision(value => value + 1);
  }, []);

  useEffect(() => {
    ready.current = new Set([...ready.current].filter(key => pages.some(page => page.key === key)));
    const pending = request.current;
    if (!pending || pending.phase !== "waiting") return;
    const target = pages.find(page => page.key === pending.target);
    if (!target || target.error) {
      request.current = undefined;
      cancelAnimation(cursor);
      cursor.value = index;
      locked.value = false;
      props.onInteractionChange(false);
      if (target?.error) props.onLoadError();
      return;
    }
    if (!target.chapter || !ready.current.has(target.key)) return;
    pending.phase = "animating";
    const token = pending.epoch;
    const destination = target.index;
    if (reducedMotion) {
      cursor.value = withTiming(destination, { duration: 120, reduceMotion: ReduceMotion.Never }, finished => {
        if (finished) scheduleOnRN(finishStep, token);
      });
    } else {
      cursor.value = withSpring(destination, settleSpring, finished => {
        if (finished) scheduleOnRN(finishStep, token);
      });
    }
  }, [pages, readyRevision, requestRevision]);

  const pan = useMemo(() => Gesture.Pan().enabled(enabled).maxPointers(1).manualActivation(true)
    .onTouchesDown((event, manager) => {
      if (locked.value || event.numberOfTouches !== 1) { manager.fail(); return; }
      const touch = event.allTouches[0];
      if (!touch) return;
      touchX.value = touch.absoluteX;
      touchY.value = touch.absoluteY;
      held.value = false;
      released.value = false;
      touchEpoch.value = gestureEpoch.value;
    })
    .onTouchesMove((event, manager) => {
      if (dragging.value) return;
      if (locked.value || held.value || event.numberOfTouches !== 1) { manager.fail(); return; }
      const touch = event.allTouches[0];
      if (!touch) return;
      const intent = chapterGestureIntent(touch.absoluteX - touchX.value, touch.absoluteY - touchY.value);
      if (intent === "vertical") manager.fail();
      else if (intent === "horizontal") manager.activate();
    })
    .onTouchesUp((_event, manager) => { if (!dragging.value) manager.fail(); })
    .onStart(() => {
      dragging.value = true;
      scheduleOnRN(gestureStarted, touchEpoch.value);
    })
    .onUpdate(event => {
      if (touchEpoch.value !== gestureEpoch.value) return;
      cursor.value = gestureIndex.value + chapterDragProgress(event.translationX, width, previousAvailable.value, nextAvailable.value);
    })
    .onEnd((event, success) => {
      released.value = true;
      dragging.value = false;
      if (touchEpoch.value !== gestureEpoch.value) return;
      const step = success ? chapterSwipeStep(event.translationX, event.translationY, event.velocityX, width) : 0;
      const available = step === 1 ? nextAvailable.value : step === -1 ? previousAvailable.value : false;
      locked.value = true;
      const token = touchEpoch.value;
      if (step && available) {
        scheduleOnRN(requestStep, step, token, true);
      } else {
        cursor.value = reducedMotion ? withTiming(gestureIndex.value, { duration: 100 }, finished => {
          if (finished) { locked.value = false; scheduleOnRN(interactionEnded, token); }
        }) : withSpring(gestureIndex.value, settleSpring, finished => {
          if (finished) { locked.value = false; scheduleOnRN(interactionEnded, token); }
        });
      }
    })
    .onFinalize(() => {
      if (dragging.value && !released.value) {
        const token = touchEpoch.value;
        if (token !== gestureEpoch.value) { dragging.value = false; return; }
        cursor.value = reducedMotion ? withTiming(gestureIndex.value, { duration: 100 }) : withSpring(gestureIndex.value, settleSpring);
        locked.value = false;
        scheduleOnRN(interactionEnded, token);
      }
      dragging.value = false;
    }), [enabled, width, reducedMotion, cursor, gestureIndex, previousAvailable, nextAvailable, requestStep, gestureStarted, interactionEnded]);

  return <GestureDetector gesture={pan}>
    <View ref={props.viewportRef} collapsable={false} onLayout={props.onLayout} style={{ flex: 1, overflow: "hidden", backgroundColor: props.backgroundColor }}>
      {pages.map(page => <PagerCell key={page.key} page={page} active={page.key === currentKey} cursor={cursor} width={width}
        reducedMotion={reducedMotion} pan={pan} layoutKey={layoutKey} onReady={markReady}>
        {props.renderPage(page, page.key === currentKey)}
      </PagerCell>)}
    </View>
  </GestureDetector>;
});
