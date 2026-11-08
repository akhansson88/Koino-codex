import { useLayoutEffect, useRef, type ComponentRef, type RefObject } from "react";
import { ScrollView, View, type ScrollViewProps, type ViewStyle } from "react-native";
import Animated from "react-native-reanimated";
import { useReaderHeaderScroll, type ReaderHeaderMotion } from "./use-reader-header";

export function ChapterPageScrollView({ active, pageKey, headerMotion, activeScrollRef, onOrigin, contentStyle, children,
  onScroll, onScrollBeginDrag, onScrollEndDrag, onMomentumScrollBegin, onMomentumScrollEnd, ...props }: ScrollViewProps & {
  active: boolean;
  pageKey: string;
  headerMotion: ReaderHeaderMotion;
  activeScrollRef: RefObject<ScrollView | null>;
  onOrigin: (y: number) => void;
  contentStyle: ViewStyle;
}) {
  const localRef = useRef<ComponentRef<typeof Animated.ScrollView>>(null);
  const origin = useRef<number | undefined>(undefined);
  const scrollHandler = useReaderHeaderScroll(headerMotion, active, pageKey, {
    onScroll, onBeginDrag: onScrollBeginDrag, onEndDrag: onScrollEndDrag,
    onMomentumBegin: onMomentumScrollBegin, onMomentumEnd: onMomentumScrollEnd,
  });
  useLayoutEffect(() => {
    const node = localRef.current;
    if (active) {
      activeScrollRef.current = node;
      if (origin.current !== undefined) onOrigin(origin.current);
    } else node?.scrollTo({ y: 0, animated: false });
    return () => { if (activeScrollRef.current === node) activeScrollRef.current = null; };
  }, [active, activeScrollRef, onOrigin]);

  return <Animated.ScrollView {...props} ref={localRef} scrollEnabled={active} onScroll={scrollHandler}>
    <View testID={active ? "bible-reader-content" : undefined} onLayout={({ nativeEvent }) => {
      origin.current = nativeEvent.layout.y;
      if (active) onOrigin(origin.current);
    }} style={contentStyle}>{children}</View>
  </Animated.ScrollView>;
}
