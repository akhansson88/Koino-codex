import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
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

import { useKoino } from "@/state/koino-store";
import type { GroupImage, PrayerSessionTargetType } from "@/state/types";
import { Avatar } from "@/ui/app-components";
import { BrandWaveMotif } from "@/ui/brand-wave-motif";
import { useAppTranslation } from "@/ui/app-language";
import { brandPalette, fontFamilies, platformShadow } from "@/ui/theme";

const AMEN_REVEAL_DELAY_MS = 1_800;
const ENTER_DURATION_MS = 620;
const EXIT_DURATION_MS = 460;
const AMBIENT_WAVE_INPUT_RANGE = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
const AMBIENT_WAVE_PATTERN = [0, 0.707, 1, 0.707, 0, -0.707, -1, -0.707, 0];
const AMBIENT_WAVE_MOTIONS = [
  { duration: 11_000, layerIndices: [0, 3, 6], translateX: 3, translateY: 0.75 },
  { duration: 13_500, layerIndices: [1, 4, 7], translateX: -4, translateY: -1 },
  { duration: 15_500, layerIndices: [2, 5], translateX: 5, translateY: 1.5 },
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

function AmbientPrayerWaves({
  active,
  bottom,
  compactHeight,
  exitTranslateY,
  reducedMotion,
  width,
}: {
  active: boolean;
  bottom: number;
  compactHeight: boolean;
  exitTranslateY: Animated.Value;
  reducedMotion: boolean;
  width: number;
}) {
  const layerProgress = useRef(AMBIENT_WAVE_MOTIONS.map(() => new Animated.Value(0))).current;
  const waveHeight = compactHeight ? 142 : 180;
  const waveWidth = Math.max(width + 172, 520);

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
        bottom,
        height: waveHeight,
        left: -86,
        opacity: 0.78,
        position: "absolute",
        right: -86,
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
            <BrandWaveMotif height={waveHeight} layerIndices={motion.layerIndices} opacity={0.72} width={waveWidth} />
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
  const { state } = useKoino();
  const { t } = useAppTranslation();
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
    () => state.users.find((user) => user.id === target?.recipientUserId),
    [state.users, target?.recipientUserId],
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
      <StatusBar backgroundColor="transparent" style="dark" translucent />
      <Animated.View
        accessibilityViewIsModal
        style={{
          backgroundColor: brandPalette.warmCanvas,
          flex: 1,
          opacity: sceneOpacity,
          transform: [{ translateY: contentTranslateY }],
        }}
      >
        <LinearGradient
          colors={[
            "rgba(255, 199, 154, 0.44)",
            "rgba(255, 199, 154, 0.12)",
            "rgba(250, 248, 244, 0.99)",
            "rgba(243, 172, 200, 0.23)",
            "rgba(200, 188, 231, 0.26)",
            "rgba(142, 220, 218, 0.14)",
          ]}
          locations={[0, 0.24, 0.38, 0.64, 0.84, 1]}
          style={StyleSheet.absoluteFillObject}
        />
        <Pressable
          accessibilityLabel={t("community.prayerMoment.leave")}
          accessibilityRole="button"
          disabled={closing}
          hitSlop={10}
          onPress={closeMoment}
          style={({ pressed }) => ({
            alignItems: "center",
            backgroundColor: "rgba(255, 255, 252, 0.42)",
            borderColor: "rgba(11, 18, 32, 0.08)",
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
          <Ionicons color={brandPalette.deepNavy} name="chevron-back" size={25} />
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
              color: brandPalette.deepNavy,
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
            backgroundColor: "rgba(255, 255, 252, 0.9)",
            borderColor: "rgba(255, 255, 255, 0.82)",
            borderCurve: "continuous",
            borderRadius: compactHeight ? 34 : 42,
            borderWidth: 1,
            height: cardHeight,
            left: cardLeft,
            position: "absolute",
            top: cardTop,
            width: cardWidth,
            ...platformShadow({
              boxShadow: "0 18px 48px rgba(39, 50, 71, 0.08)",
              elevation: 4,
              offset: { width: 0, height: 16 },
              opacity: 0.08,
              radius: 28,
            }),
          }}
        >
          <Text
            selectable
            style={{
              color: brandPalette.deepNavy,
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
                color: brandPalette.deepNavy,
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

        <AmbientPrayerWaves
          active={Boolean(target)}
          bottom={buttonBottom + (compactHeight ? 72 : 70)}
          compactHeight={compactHeight}
          exitTranslateY={wavesTranslateY}
          reducedMotion={!motionPreferenceKnown || reduceMotion}
          width={width}
        />

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
            <Ionicons color={brandPalette.lavenderHaze} name="heart-outline" size={compactHeight ? 26 : 30} />
          </View>
          <Text
            style={{
              color: brandPalette.mutedNavy,
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
              colors={["rgba(255, 255, 252, 0.98)", "rgba(255, 238, 222, 0.98)"]}
              end={{ x: 1, y: 1 }}
              start={{ x: 0, y: 0 }}
              style={{
                alignItems: "center",
                borderColor: "rgba(255, 255, 255, 0.82)",
                borderRadius: 999,
                borderWidth: 1,
                flexDirection: "row",
                gap: 13,
                height: compactHeight ? 58 : 66,
                justifyContent: "center",
                paddingHorizontal: 24,
              }}
            >
              <Ionicons color={brandPalette.deepNavy} name="heart-outline" size={compactHeight ? 23 : 26} />
              <Text
                style={{
                  color: brandPalette.deepNavy,
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
