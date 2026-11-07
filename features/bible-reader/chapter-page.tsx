import { useLayoutEffect, useRef, type RefObject } from "react";
import { ScrollView, View, type ScrollViewProps, type ViewStyle } from "react-native";

export function ChapterPageScrollView({ active, activeScrollRef, onOrigin, contentStyle, children, ...props }: ScrollViewProps & {
  active: boolean;
  activeScrollRef: RefObject<ScrollView | null>;
  onOrigin: (y: number) => void;
  contentStyle: ViewStyle;
}) {
  const localRef = useRef<ScrollView>(null);
  const origin = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const node = localRef.current;
    if (active) {
      activeScrollRef.current = node;
      if (origin.current !== undefined) onOrigin(origin.current);
    } else node?.scrollTo({ y: 0, animated: false });
    return () => { if (activeScrollRef.current === node) activeScrollRef.current = null; };
  }, [active, activeScrollRef, onOrigin]);

  return <ScrollView {...props} ref={localRef} scrollEnabled={active}>
    <View testID={active ? "bible-reader-content" : undefined} onLayout={({ nativeEvent }) => {
      origin.current = nativeEvent.layout.y;
      if (active) onOrigin(origin.current);
    }} style={contentStyle}>{children}</View>
  </ScrollView>;
}
