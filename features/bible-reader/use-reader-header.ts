import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { AccessibilityInfo, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewProps } from "react-native";
import { cancelAnimation, Easing, useAnimatedReaction, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withDelay, withTiming, type SharedValue } from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { advanceHeaderScroll, boundedReaderOffset, headerScrollState, headerSettleTarget, readerHeaderMotion, readerHeaderOcclusion, type HeaderScrollState } from "./header-scroll";

export type ReaderHeaderMotion = {
  height: SharedValue<number>;
  hidden: SharedValue<number>;
  opacity: SharedValue<number>;
  enabled: SharedValue<boolean>;
  suspended: SharedValue<boolean>;
  reduced: SharedValue<boolean>;
  pageKey: SharedValue<string>;
  scroll: SharedValue<HeaderScrollState>;
};

export function useReaderHeader({ enabled, focused, reducedMotion, pageKey }: {
  enabled: boolean; focused: boolean; reducedMotion: boolean; pageKey: string;
}) {
  const [height, setHeight] = useState<number>(readerHeaderMotion.initialHeight);
  const [hidden, setHidden] = useState(false);
  const [screenReader, setScreenReader] = useState(false);
  const measuredHeight = useSharedValue<number>(readerHeaderMotion.initialHeight);
  const hiddenOffset = useSharedValue(0);
  const opacity = useSharedValue(1);
  const trackingEnabled = useSharedValue(false);
  const suspended = useSharedValue(false);
  const reduced = useSharedValue(reducedMotion);
  const activePageKey = useSharedValue(pageKey);
  const scroll = useSharedValue(headerScrollState());
  const motion: ReaderHeaderMotion = useMemo(() => ({ height: measuredHeight, hidden: hiddenOffset, opacity,
    enabled: trackingEnabled, suspended, reduced, pageKey: activePageKey, scroll,
  }), [measuredHeight, hiddenOffset, opacity, trackingEnabled, suspended, reduced, activePageKey, scroll]);
  const reportHidden = useCallback((value: boolean) => { setHidden(value); }, []);

  const reveal = useCallback(() => {
    cancelAnimation(hiddenOffset);
    cancelAnimation(opacity);
    hiddenOffset.value = 0;
    opacity.value = 1;
    scroll.value = headerScrollState(scroll.value.previousY);
    setHidden(false);
  }, [hiddenOffset, opacity, scroll]);

  const stopTracking = useCallback(() => {
    scroll.value = { ...scroll.value, tracking: false, dragging: false, momentum: false };
  }, [scroll]);

  const suspend = useCallback((value: boolean) => {
    suspended.value = value;
    if (value) stopTracking();
  }, [suspended, stopTracking]);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isScreenReaderEnabled().then(value => { if (active) setScreenReader(value); });
    const subscription = AccessibilityInfo.addEventListener("screenReaderChanged", setScreenReader);
    return () => { active = false; subscription.remove(); };
  }, []);

  useLayoutEffect(() => {
    trackingEnabled.value = enabled && focused && !screenReader;
    activePageKey.value = pageKey;
    reduced.value = reducedMotion;
    stopTracking();
  }, [enabled, focused, screenReader, pageKey, reducedMotion, trackingEnabled, activePageKey, reduced, stopTracking]);

  useLayoutEffect(() => { if (focused) reveal(); }, [focused, reveal]);
  useLayoutEffect(() => { if (screenReader) reveal(); }, [screenReader, reveal]);
  useLayoutEffect(() => { reveal(); }, [reducedMotion, reveal]);

  useAnimatedReaction(
    () => reduced.value ? opacity.value <= 0.01 : hiddenOffset.value >= measuredHeight.value - 0.5,
    (fullyHidden, previous) => { if (fullyHidden !== previous) scheduleOnRN(reportHidden, fullyHidden); },
  );

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: reduced.value ? 0 : -hiddenOffset.value }],
    opacity: reduced.value ? opacity.value : 1,
  }));

  const onLayout = useCallback(({ nativeEvent }: LayoutChangeEvent) => {
    const next = nativeEvent.layout.height;
    if (!Number.isFinite(next) || next <= 0 || Math.abs(measuredHeight.value - next) < 0.01) return;
    const fraction = hiddenOffset.value / measuredHeight.value;
    cancelAnimation(hiddenOffset);
    measuredHeight.value = next;
    hiddenOffset.value = Math.max(0, Math.min(next, fraction * next));
    scroll.value = { ...scroll.value, hidden: hiddenOffset.value };
    setHeight(next);
  }, [measuredHeight, hiddenOffset, scroll]);

  const topOcclusion = useCallback(() => readerHeaderOcclusion(measuredHeight.value, hiddenOffset.value, reduced.value, opacity.value),
    [measuredHeight, hiddenOffset, reduced, opacity]);

  return { height, hidden, motion, style, onLayout, reveal, stopTracking, suspend, topOcclusion };
}

type ScrollCallbacks = {
  onScroll?: ScrollViewProps["onScroll"];
  onBeginDrag?: ScrollViewProps["onScrollBeginDrag"];
  onEndDrag?: ScrollViewProps["onScrollEndDrag"];
  onMomentumBegin?: ScrollViewProps["onMomentumScrollBegin"];
  onMomentumEnd?: ScrollViewProps["onMomentumScrollEnd"];
};

/** The native worklet owns motion; existing reader callbacks still run on React Native. */
export function useReaderHeaderScroll(motion: ReaderHeaderMotion, active: boolean, pageKey: string,
  { onScroll, onBeginDrag, onEndDrag, onMomentumBegin, onMomentumEnd }: ScrollCallbacks) {
  const forwardEvent = useCallback((kind: keyof ScrollCallbacks, event: NativeScrollEvent) => {
    const callback = { onScroll, onBeginDrag, onEndDrag, onMomentumBegin, onMomentumEnd }[kind];
    callback?.({ nativeEvent: event } as NativeSyntheticEvent<NativeScrollEvent>);
  }, [onScroll, onBeginDrag, onEndDrag, onMomentumBegin, onMomentumEnd]);

  function settle(delay = 0) {
    "worklet";
    const state = motion.scroll.value;
    if (!state.tracking) return;
    const target = headerSettleTarget(state, motion.height.value);
    const complete = (finished?: boolean) => {
      "worklet";
      if (finished) motion.scroll.value = { ...motion.scroll.value, hidden: target, tracking: false, dragging: false, momentum: false };
    };
    if (motion.reduced.value) {
      motion.hidden.value = target;
      motion.opacity.value = withDelay(delay, withTiming(target === 0 ? 1 : 0,
        { duration: readerHeaderMotion.fadeDuration }, complete));
    } else {
      motion.hidden.value = withDelay(delay, withTiming(target,
        { duration: readerHeaderMotion.settleDuration, easing: Easing.bezier(0.16, 1, 0.3, 1) }, complete));
    }
  }

  return useAnimatedScrollHandler({
    onBeginDrag: event => {
      if (!active || motion.pageKey.value !== pageKey) return;
      if (motion.enabled.value && !motion.suspended.value) {
        cancelAnimation(motion.hidden);
        cancelAnimation(motion.opacity);
        const y = boundedReaderOffset(event.contentOffset.y, event.contentSize.height, event.layoutMeasurement.height);
        motion.scroll.value = { ...headerScrollState(y, motion.hidden.value), tracking: true, dragging: true };
      }
      scheduleOnRN(forwardEvent, "onBeginDrag", event);
    },
    onScroll: event => {
      if (!active || motion.pageKey.value !== pageKey) return;
      if (motion.enabled.value && !motion.suspended.value && motion.scroll.value.tracking) {
        const previous = motion.scroll.value;
        const next = advanceHeaderScroll(previous, event.contentOffset.y, event.contentSize.height, event.layoutMeasurement.height, motion.height.value);
        motion.scroll.value = next;
        motion.hidden.value = next.hidden;
        if (motion.reduced.value && next.intent !== previous.intent) {
          motion.opacity.value = withTiming(next.intent > 0 ? 0 : 1, { duration: readerHeaderMotion.fadeDuration });
        }
        if (!next.dragging && !next.momentum) settle(readerHeaderMotion.momentumGrace);
      }
      scheduleOnRN(forwardEvent, "onScroll", event);
    },
    onEndDrag: event => {
      if (!active || motion.pageKey.value !== pageKey) return;
      motion.scroll.value = { ...motion.scroll.value, dragging: false };
      settle(readerHeaderMotion.momentumGrace);
      scheduleOnRN(forwardEvent, "onEndDrag", event);
    },
    onMomentumBegin: event => {
      if (!active || motion.pageKey.value !== pageKey) return;
      if (motion.scroll.value.tracking) {
        cancelAnimation(motion.hidden);
        cancelAnimation(motion.opacity);
        motion.scroll.value = { ...motion.scroll.value, hidden: motion.hidden.value, momentum: true };
        if (motion.reduced.value && motion.scroll.value.intent !== 0) {
          motion.opacity.value = withTiming(motion.scroll.value.intent > 0 ? 0 : 1, { duration: readerHeaderMotion.fadeDuration });
        }
      }
      scheduleOnRN(forwardEvent, "onMomentumBegin", event);
    },
    onMomentumEnd: event => {
      if (!active || motion.pageKey.value !== pageKey) return;
      motion.scroll.value = { ...motion.scroll.value, momentum: false };
      settle();
      scheduleOnRN(forwardEvent, "onMomentumEnd", event);
    },
  }, [active, pageKey, motion, forwardEvent]);
}
