import { Feather } from "@expo/vector-icons";
import { PropsWithChildren, useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleProp, StyleSheet, Text, TextProps, TextStyle, View } from "react-native";
import { useAppTranslation } from "@/ui/app-language";
import { useOpenExternalLink } from "@/ui/in-app-browser";
import { hasVisibleLinkText, visibleLinkParts } from "@/ui/link-utils";
import { colors, typography } from "@/ui/theme";

export function SectionHeading({ children, muted }: PropsWithChildren<{ muted?: boolean }>) {
  return (
    <Text style={[muted ? typography.sectionLabel : typography.title, { color: muted ? colors.muted : colors.ink }]}>
      {children}
    </Text>
  );
}

export function BodyText({
  children,
  hiddenUrl,
  muted = false,
  style,
  ...props
}: PropsWithChildren<TextProps & { hiddenUrl?: string; muted?: boolean; style?: StyleProp<TextStyle> }>) {
  const openExternalLink = useOpenExternalLink();
  const visibleParts = typeof children === "string" ? visibleLinkParts(children, hiddenUrl) : undefined;
  if (typeof children === "string" && hiddenUrl && !visibleParts?.some((part) => /\S/.test(part.text))) return null;

  const content =
    visibleParts
      ? visibleParts.map((part, index) =>
          part.url ? (
            <Text
              accessibilityRole="link"
              key={`${part.url}-${index}`}
              onPress={(event) => {
                event.stopPropagation();
                openExternalLink(part.url ?? "");
              }}
              style={[typography.bodyMedium, { color: muted ? colors.olive : colors.textMuted, textDecorationLine: "underline" }]}
            >
              {part.text}
            </Text>
          ) : (
            part.text
          ),
        )
      : children;

  return (
    <Text {...props} style={[typography.body, { color: muted ? colors.muted : colors.ink }, style]}>
      {content}
    </Text>
  );
}

export function ExpandableBodyText({
  actionMinHeight = 28,
  children,
  collapsedLines = 3,
  hiddenUrl,
  muted = false,
  style,
}: PropsWithChildren<{ actionMinHeight?: number; collapsedLines?: number; hiddenUrl?: string; muted?: boolean; style?: StyleProp<TextStyle> }>) {
  const { t } = useAppTranslation();
  const flattenedStyle = StyleSheet.flatten(style);
  const collapsedLineHeight = typeof flattenedStyle?.lineHeight === "number" ? flattenedStyle.lineHeight : 22;
  const collapsedHeight = collapsedLines * collapsedLineHeight;
  const heightAnimation = useRef(new Animated.Value(collapsedHeight)).current;
  const hasMeasuredRef = useRef(false);
  const fullHeightRef = useRef(0);
  const [expanded, setExpanded] = useState(false);
  const [fullHeight, setFullHeight] = useState(0);
  const hasMeasured = fullHeight > 0;
  const canExpand = fullHeight > collapsedHeight + 1;
  const visibleHeight = canExpand ? (expanded ? fullHeight : collapsedHeight) : fullHeight || collapsedHeight;

  useEffect(() => {
    hasMeasuredRef.current = false;
    fullHeightRef.current = 0;
    setFullHeight(0);
    setExpanded(false);
    heightAnimation.setValue(collapsedHeight);
  }, [children, collapsedHeight, hiddenUrl, heightAnimation]);

  useEffect(() => {
    if (!fullHeight) return;
    if (!hasMeasuredRef.current) {
      hasMeasuredRef.current = true;
      heightAnimation.setValue(visibleHeight);
      return;
    }
    Animated.timing(heightAnimation, {
      duration: 220,
      toValue: visibleHeight,
      useNativeDriver: false,
    }).start();
  }, [fullHeight, heightAnimation, visibleHeight]);

  if (typeof children === "string" && hiddenUrl && !hasVisibleLinkText(children, hiddenUrl)) return null;

  return (
    <View style={{ gap: 6 }}>
      <Animated.View style={[{ overflow: "hidden" }, hasMeasured ? { height: heightAnimation } : null]}>
        <BodyText hiddenUrl={hiddenUrl} muted={muted} numberOfLines={hasMeasured ? undefined : collapsedLines} style={style}>
          {children}
        </BodyText>
      </Animated.View>
      <BodyText
        accessibilityElementsHidden
        hiddenUrl={hiddenUrl}
        importantForAccessibility="no-hide-descendants"
        muted={muted}
        onLayout={(event) => {
          const nextHeight = event.nativeEvent.layout.height;
          if (Math.abs(fullHeightRef.current - nextHeight) < 1) return;
          fullHeightRef.current = nextHeight;
          setFullHeight(nextHeight);
        }}
        style={[style, { left: 0, opacity: 0, pointerEvents: "none", position: "absolute", right: 0, zIndex: -1 }]}
      >
        {children}
      </BodyText>
      {canExpand ? (
        <Pressable
          accessibilityLabel={t(expanded ? "shared.expand.showLess" : "shared.expand.showMore")}
          accessibilityRole="button"
          onPress={(event) => {
            event.stopPropagation();
            setExpanded((current) => !current);
          }}
          style={{ alignItems: "center", alignSelf: "flex-start", flexDirection: "row", gap: 5, minHeight: actionMinHeight }}
        >
          <Text style={[typography.label, { color: muted ? colors.muted : colors.olive }]}>
            {t(expanded ? "shared.expand.showLess" : "shared.expand.showMore")}
          </Text>
          <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
            <Feather name={expanded ? "chevron-up" : "chevron-down"} size={15} color={muted ? colors.muted : colors.olive} />
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}
