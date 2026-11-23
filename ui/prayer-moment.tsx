import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import {
  AccessibilityInfo,
  Animated,
  Easing,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useKoinoSelector } from "@/state/koino-store";
import type { GroupImage, PrayerSessionTargetType } from "@/state/types";
import { Avatar } from "@/ui/app-components";
import { BrandWaveMotif } from "@/ui/brand-wave-motif";
import { useAppTranslation } from "@/ui/app-language";
import { brandPalette, colors, fontFamilies, platformShadow } from "@/ui/theme";
import { useTheme } from "@/ui/theme-provider";

const AMEN_REVEAL_DELAY_MS = 1_800;
const ENTER_DURATION_MS = 620;
const EXIT_DURATION_MS = 460;
const AMBIENT_WAVE_INPUT_RANGE = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const AMBIENT_WAVE_PATTERN = [0, 0.707, 1, 0.707, 0, -0.707, -1, -0.707, 0];
const AMBIENT_WAVE_MOTIONS = [
  { duration: 22_400, layerIndex: 0, translateX: -18, translateY: 1.5 },
  { duration: 27_200, layerIndex: 1, translateX: 14, translateY: -2.5 },
  { duration: 24_800, layerIndex: 2, translateX: -22, translateY: 3 },
  { duration: 30_400, layerIndex: 3, translateX: 18, translateY: -3.5 },
] as const;

export type PrayerMomentTarget = {
  targetType: PrayerSessionTargetType;
  targetId: string;
  body: string;
  recipientUserId?: string;
  recipientName?: string;
  recipientImage?: GroupImage;
};

function firstName(name: string, fallback: string) {
  return name.trim().split(/\s+/)[0] || fallback;
}

function initialMotionPreference() {
  if (Platform.OS === "web" && typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return { known: true, reduced: window.matchMedia("(prefers-reduced-motion: reduce)").matches };
  }
  return { known: false, reduced: false };
}

function PrayerHorizonBackground({ dark }: { dark: boolean }) {
  return (
    <View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={StyleSheet.absoluteFillObject}
    >
      <LinearGradient
        colors={dark
          ? ["rgba(232, 164, 92, 0.16)", "rgba(42, 33, 26, 0.42)", "rgba(20, 16, 13, 0.94)", "#14100D"]
          : [
            "rgba(255, 199, 154, 0.5)",
            "rgba(255, 217, 186, 0.22)",
            "rgba(255, 255, 252, 0.8)",
            "rgba(255, 248, 241, 0.99)",
          ]}
        locations={[0, 0.25, 0.49, 1]}
        style={StyleSheet.absoluteFillObject}
      />
      <LinearGradient
        colors={dark
          ? ["rgba(20, 16, 13, 0)", "rgba(232, 164, 92, 0.08)", "rgba(20, 16, 13, 0.2)", "rgba(20, 16, 13, 0)"]
          : [
            "rgba(255, 255, 252, 0)",
            "rgba(255, 238, 222, 0.6)",
            "rgba(255, 255, 252, 0.6)",
            "rgba(255, 199, 154, 0)",
          ]}
        locations={[0, 0.34, 0.58, 1]}
        style={{ height: "28%", left: 0, position: "absolute", right: 0, top: "39%" }}
      />
      <LinearGradient
        colors={dark
          ? ["rgba(232, 164, 92, 0)", "rgba(232, 164, 92, 0.1)", "rgba(232, 164, 92, 0.16)"]
          : [
            "rgba(255, 199, 154, 0)",
            "rgba(255, 199, 154, 0.16)",
            "rgba(255, 217, 186, 0.3)",
          ]}
        locations={[0, 0.47, 1]}
        style={{ bottom: 0, height: "44%", left: 0, position: "absolute", right: 0 }}
      />
    </View>
  );
}

function AmbientPrayerWaves({
  active,
  compactHeight,
  exitTranslateY,
  reducedMotion,
  width,
}: {
  active: boolean;
  compactHeight: boolean;
  exitTranslateY: Animated.Value;
  reducedMotion: boolean;
  width: number;
}) {
  const layerProgress = useRef(AMBIENT_WAVE_MOTIONS.map(() => new Animated.Value(0))).current;
  const waveHeight = compactHeight ? 252 : 338;
  const waveWidth = Math.max(width * 1.55, 720);

  useEffect(() => {
    layerProgress.forEach((value) => {
      value.stopAnimation();
      value.setValue(0);
    });

    if (!active || reducedMotion) return undefined;

    const animations = AMBIENT_WAVE_MOTIONS.map((motion, index) => {
      const progress = layerProgress[index];
      progress.setValue(0);

      return Animated.loop(
        Animated.timing(progress, {
          toValue: 1,
          duration: motion.duration,
          easing: Easing.linear,
          isInteraction: false,
          useNativeDriver: Platform.OS !== "web",
        }),
        { resetBeforeIteration: true },
      );
    });

    animations.forEach((animation) => animation.start());

    return () => {
      animations.forEach((animation) => animation.stop());
      layerProgress.forEach((value) => {
        value.stopAnimation();
        value.setValue(0);
      });
    };
  }, [active, layerProgress, reducedMotion]);

  return (
    <Animated.View
      accessibilityElementsHidden
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      pointerEvents="none"
      style={{
        bottom: 0,
        height: waveHeight,
        left: -Math.max(100, width * 0.275),
        opacity: 0.9,
        position: "absolute",
        right: -Math.max(100, width * 0.275),
        transform: [{ translateY: exitTranslateY }],
      }}
    >
      {AMBIENT_WAVE_MOTIONS.map((motion, index) => {
        const progress = layerProgress[index];
        return (
          <Animated.View
            key={`ambient-wave-${index}`}
            style={{
              ...StyleSheet.absoluteFillObject,
              alignItems: "center",
              justifyContent: "center",
              transform: [
                {
                  translateX: progress.interpolate({
                    inputRange: AMBIENT_WAVE_INPUT_RANGE,
                    outputRange: AMBIENT_WAVE_PATTERN.map((value) => value * motion.translateX),
                  }),
                },
                {
                  translateY: progress.interpolate({
                    inputRange: AMBIENT_WAVE_INPUT_RANGE,
                    outputRange: AMBIENT_WAVE_PATTERN.map((value) => value * motion.translateY),
                  }),
                },
              ],
            }}
          >
            <BrandWaveMotif
              height={waveHeight}
              layerIndices={[motion.layerIndex]}
              opacity={0.94}
              variant="horizon"
              width={waveWidth}
            />
          </Animated.View>
        );
      })}
    </Animated.View>
  );
}

export function PrayerMoment({
  target,
  onClose,
  onFinish,
}: {
  target?: PrayerMomentTarget;
  onClose: () => void;
  onFinish: (status: "completed" | "skipped", startedAt: string, completedAt: string) => void;
}) {
  const users = useKoinoSelector((state) => state.users);
  const { t } = useAppTranslation();
  const { scheme } = useTheme();
  const dark = scheme === "dark";
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const sceneOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(12)).current;
  const amenOpacity = useRef(new Animated.Value(0)).current;
  const wavesTranslateY = useRef(new Animated.Value(0)).current;
  const startedAtRef = useRef(new Date().toISOString());
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const [cardContentHeight, setCardContentHeight] = useState(0);
  const [cardViewportHeight, setCardViewportHeight] = useState(0);
  const [{ known: motionPreferenceKnown, reduced: reduceMotion }, setMotionPreference] = useState(initialMotionPreference);

  const recipient = useMemo(
    () => users.find((user) => user.id === target?.recipientUserId),
    [users, target?.recipientUserId],
  );
  const someone = t("community.prayerMoment.someone");
  const displayName = target?.recipientName?.trim() || recipient?.name?.trim() || someone;
  const recipientImage = target?.recipientImage ?? recipient?.image;
  const givenName = firstName(displayName, someone);
  const requestBody = target?.body?.trim() || "";

  const compactHeight = height < 720;
  const avatarSize = compactHeight ? 72 : Math.min(94, Math.max(84, width * 0.235));
  const personTop = Math.max(insets.top + (compactHeight ? 42 : 54), height * (compactHeight ? 0.145 : 0.14));
  const cardTop = Math.max(personTop + avatarSize + (compactHeight ? 54 : 56), height * 0.31);
  const cardHeight = requestBody
    ? compactHeight
      ? Math.min(230, height * 0.35)
      : Math.min(320, height * 0.38)
    : compactHeight
      ? Math.min(198, height * 0.32)
      : 246;
  const buttonBottom = Math.max(insets.bottom + 6, 38);
  const cardWidth = Math.min(width - 58, 420);
  const cardLeft = (width - cardWidth) / 2;
  const buttonWidth = Math.min(width - 112, 360);
  const buttonLeft = (width - buttonWidth) / 2;
  const prayerContentOverflows = cardContentHeight > cardViewportHeight + 1;

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) {
        setMotionPreference({ known: true, reduced: enabled });
      }
    });

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", (enabled) => {
      setMotionPreference({ known: true, reduced: enabled });
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!target) {
      sceneOpacity.setValue(0);
      contentTranslateY.setValue(12);
      amenOpacity.setValue(0);
      wavesTranslateY.setValue(0);
      setCardContentHeight(0);
      setCardViewportHeight(0);
      closingRef.current = false;
      setClosing(false);
      return undefined;
    }

    startedAtRef.current = new Date().toISOString();
    closingRef.current = false;
    setClosing(false);
    sceneOpacity.stopAnimation();
    contentTranslateY.stopAnimation();
    amenOpacity.stopAnimation();
    wavesTranslateY.stopAnimation();
    sceneOpacity.setValue(reduceMotion ? 1 : 0);
    contentTranslateY.setValue(reduceMotion ? 0 : 12);
    amenOpacity.setValue(reduceMotion ? 1 : 0);
    wavesTranslateY.setValue(0);

    if (!reduceMotion) {
      Animated.parallel([
        Animated.timing(sceneOpacity, {
          toValue: 1,
          duration: ENTER_DURATION_MS,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateY, {
          toValue: 0,
          duration: ENTER_DURATION_MS,
          easing: Easing.bezier(0.22, 1, 0.36, 1),
          useNativeDriver: true,
        }),
      ]).start();
    }

    const revealTimer = reduceMotion
      ? undefined
      : setTimeout(() => {
          Animated.timing(amenOpacity, {
            toValue: 1,
            duration: 520,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }).start();
        }, AMEN_REVEAL_DELAY_MS);

    return () => {
      if (revealTimer) clearTimeout(revealTimer);
      sceneOpacity.stopAnimation();
      contentTranslateY.stopAnimation();
      amenOpacity.stopAnimation();
      wavesTranslateY.stopAnimation();
    };
  }, [amenOpacity, contentTranslateY, reduceMotion, sceneOpacity, target, wavesTranslateY]);

  const leave = useCallback(
    (complete: () => void) => {
      if (closingRef.current) return;
      closingRef.current = true;
      setClosing(true);

      if (reduceMotion) {
        complete();
        return;
      }

      Animated.parallel([
        Animated.timing(sceneOpacity, {
          toValue: 0,
          duration: EXIT_DURATION_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(contentTranslateY, {
          toValue: 7,
          duration: EXIT_DURATION_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(wavesTranslateY, {
          toValue: 12,
          duration: EXIT_DURATION_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]).start(() => complete());
    },
    [contentTranslateY, reduceMotion, sceneOpacity, wavesTranslateY],
  );

  const closeMoment = useCallback(() => leave(onClose), [leave, onClose]);

  const completeMoment = useCallback(() => {
    const completedAt = new Date().toISOString();
    if (Platform.OS !== "web") {
      void Haptics.selectionAsync().catch(() => undefined);
    }
    leave(() => onFinish("completed", startedAtRef.current, completedAt));
  }, [leave, onFinish]);

  return (
    <Modal
      animationType="none"
      hardwareAccelerated
      navigationBarTranslucent
      onRequestClose={closeMoment}
      presentationStyle="overFullScreen"
      statusBarTranslucent
      transparent
      visible={Boolean(target)}
    >
      <StatusBar backgroundColor="transparent" style={dark ? "light" : "dark"} translucent />
      <Animated.View
        accessibilityViewIsModal
        style={{
          backgroundColor: colors.background,
          flex: 1,
          opacity: sceneOpacity,
          transform: [{ translateY: contentTranslateY }],
        }}
      >
        <PrayerHorizonBackground dark={dark} />
        <AmbientPrayerWaves
          active={Boolean(target)}
          compactHeight={compactHeight}
          exitTranslateY={wavesTranslateY}
          reducedMotion={!motionPreferenceKnown || reduceMotion}
          width={width}
        />
        <Pressable
          accessibilityLabel={t("community.prayerMoment.leave")}
          accessibilityRole="button"
          disabled={closing}
          hitSlop={10}
          onPress={closeMoment}
          style={({ pressed }) => ({
            alignItems: "center",
            backgroundColor: dark ? colors.surface : "rgba(255, 255, 252, 0.42)",
            borderColor: dark ? colors.line : "rgba(11, 18, 32, 0.08)",
            borderRadius: 22,
            borderWidth: 1,
            height: 44,
            justifyContent: "center",
            left: 12,
            opacity: pressed ? 0.45 : 0.68,
            position: "absolute",
            top: insets.top + 6,
            width: 44,
            zIndex: 4,
          })}
        >
          <Feather color={colors.ink} name="chevron-left" size={25} />
        </Pressable>

        <View
          style={{
            alignItems: "center",
            gap: compactHeight ? 7 : 10,
            left: 24,
            position: "absolute",
            right: 24,
            top: personTop,
          }}
        >
          <Avatar image={recipientImage} name={displayName} size={avatarSize} tone="orange" />
          <Text
            numberOfLines={1}
            style={{
              color: colors.ink,
              fontFamily: fontFamilies.headingRegular,
              fontSize: compactHeight ? 19 : 22,
              lineHeight: compactHeight ? 24 : 29,
              maxWidth: width - 64,
              textAlign: "center",
            }}
          >
            {displayName}
          </Text>
        </View>

        <ScrollView
          bounces={prayerContentOverflows}
          contentContainerStyle={{
            alignItems: "center",
            flexGrow: 1,
            justifyContent: prayerContentOverflows ? "flex-start" : "center",
            paddingBottom: prayerContentOverflows ? (compactHeight ? 26 : 34) : compactHeight ? 14 : 24,
            paddingHorizontal: compactHeight ? 18 : 28,
            paddingTop: compactHeight ? 14 : 24,
          }}
          fadingEdgeLength={prayerContentOverflows ? 12 : 0}
          nestedScrollEnabled
          onContentSizeChange={(_contentWidth, contentHeight) => setCardContentHeight(contentHeight)}
          onLayout={(event) => setCardViewportHeight(event.nativeEvent.layout.height)}
          scrollEnabled={prayerContentOverflows}
          showsVerticalScrollIndicator={false}
          style={{
            alignSelf: "center",
            backgroundColor: dark ? colors.surface : "rgba(255, 255, 252, 0.9)",
            borderColor: dark ? colors.line : "rgba(255, 255, 255, 0.82)",
            borderCurve: "continuous",
            borderRadius: compactHeight ? 34 : 42,
            borderWidth: 1,
            height: cardHeight,
            left: cardLeft,
            position: "absolute",
            top: cardTop,
            width: cardWidth,
            ...(dark ? {} : platformShadow({
              boxShadow: "0 18px 48px rgba(39, 50, 71, 0.08)",
              elevation: 4,
              offset: { width: 0, height: 16 },
              opacity: 0.08,
              radius: 28,
            })),
          }}
        >
          <Text
            selectable
            style={{
              color: colors.ink,
              fontFamily: fontFamilies.headingMedium,
              fontSize: compactHeight ? 24 : 30,
              lineHeight: compactHeight ? 30 : 38,
              textAlign: "center",
            }}
          >
            {t("community.prayerMoment.prayForPerson", { name: givenName })}
          </Text>
          <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
            <BrandWaveMotif
              height={compactHeight ? 12 : 14}
              intensity={3.8}
              opacity={0.96}
              style={{ marginBottom: compactHeight ? 1 : 2, marginTop: compactHeight ? 6 : 12 }}
              variant="accent"
              width={compactHeight ? 54 : 60}
            />
          </View>
          {requestBody ? (
            <Text
              selectable
              style={{
                alignSelf: "center",
                color: colors.ink,
                fontFamily: fontFamilies.bodyRegular,
                fontSize: compactHeight ? 15 : 18,
                lineHeight: compactHeight ? 21 : 29,
                maxWidth: compactHeight ? 224 : 238,
                textAlign: "center",
              }}
            >
              {requestBody}
            </Text>
          ) : null}
        </ScrollView>

        <View
          style={{
            alignItems: "center",
            bottom: buttonBottom + (compactHeight ? 78 : 92),
            gap: compactHeight ? 6 : 8,
            left: 24,
            position: "absolute",
            right: 24,
          }}
        >
          <View accessibilityElementsHidden accessible={false} importantForAccessibility="no-hide-descendants">
            <Feather color={dark ? colors.accentWarm : "#C96A2E"} name="heart" size={compactHeight ? 26 : 30} />
          </View>
          <Text
            style={{
              color: colors.muted,
              fontFamily: fontFamilies.bodyRegular,
              fontSize: compactHeight ? 14 : 16,
              lineHeight: compactHeight ? 19 : 22,
              textAlign: "center",
            }}
          >
            {t("community.prayerMoment.pause")}
          </Text>
        </View>

        <Animated.View
          style={{
            alignSelf: "center",
            bottom: buttonBottom,
            left: buttonLeft,
            opacity: amenOpacity,
            position: "absolute",
            width: buttonWidth,
          }}
        >
          <Pressable
            accessibilityHint={t("community.prayerMoment.amenHint")}
            accessibilityLabel={t("community.prayerMoment.amen")}
            accessibilityRole="button"
            disabled={closing}
            onPress={completeMoment}
            style={({ pressed }) => ({
              borderCurve: "continuous",
              borderRadius: 999,
              opacity: pressed ? 0.86 : 1,
              overflow: "hidden",
              ...platformShadow({
                boxShadow: "0 15px 30px rgba(39, 50, 71, 0.18)",
                elevation: 7,
                offset: { width: 0, height: 12 },
                opacity: 0.17,
                radius: 22,
              }),
            })}
          >
            <LinearGradient
              colors={dark ? ["#E8A45C", "#F0B878"] : ["rgba(255, 255, 252, 0.98)", "rgba(255, 238, 222, 0.98)"]}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={{
                alignItems: "center",
                borderColor: dark ? "#E8A45C" : "rgba(255, 255, 255, 0.82)",
                borderRadius: 999,
                borderWidth: 1,
                flexDirection: "row",
                gap: 13,
                height: compactHeight ? 58 : 66,
                justifyContent: "center",
                paddingHorizontal: 24,
              }}
            >
              <Feather color={dark ? colors.onAccent : brandPalette.deepNavy} name="heart" size={compactHeight ? 23 : 26} />
              <Text
                style={{
                  color: dark ? colors.onAccent : brandPalette.deepNavy,
                  fontFamily: fontFamilies.headingMedium,
                  fontSize: compactHeight ? 19 : 22,
                  lineHeight: compactHeight ? 24 : 28,
                }}
              >
                {t("community.prayerMoment.amen")}
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
