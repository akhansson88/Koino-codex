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
import { KoinoLogo } from "@/ui/koino-logo";
import { brandPalette, fontFamilies, platformShadow } from "@/ui/theme";

const AMEN_REVEAL_DELAY_MS = 1_800;
const ENTER_DURATION_MS = 620;
const EXIT_DURATION_MS = 460;

export type PrayerMomentTarget = {
  targetType: PrayerSessionTargetType;
  targetId: string;
  body: string;
  recipientUserId?: string;
  recipientName?: string;
  recipientImage?: GroupImage;
};

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || "någon";
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
  const insets = useSafeAreaInsets();
  const { height, width } = useWindowDimensions();
  const sceneOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(12)).current;
  const amenOpacity = useRef(new Animated.Value(0)).current;
  const wavesTranslateY = useRef(new Animated.Value(0)).current;
  const startedAtRef = useRef(new Date().toISOString());
  const closingRef = useRef(false);
  const [closing, setClosing] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);

  const recipient = useMemo(
    () => state.users.find((user) => user.id === target?.recipientUserId),
    [state.users, target?.recipientUserId],
  );
  const displayName = target?.recipientName?.trim() || recipient?.name?.trim() || "Någon";
  const recipientImage = target?.recipientImage ?? recipient?.image;
  const givenName = firstName(displayName);
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

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });

    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduceMotion);
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
      ]).start(({ finished }) => {
        if (finished) complete();
      });
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
          accessibilityLabel="Lämna bönen"
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
            outlineColor: "transparent",
            outlineWidth: 0,
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

        <View
          style={{
            alignItems: "center",
            alignSelf: "center",
            backgroundColor: "rgba(255, 255, 252, 0.9)",
            borderColor: "rgba(255, 255, 255, 0.82)",
            borderCurve: "continuous",
            borderRadius: compactHeight ? 34 : 42,
            borderWidth: 1,
            height: cardHeight,
            justifyContent: "center",
            left: cardLeft,
            paddingHorizontal: compactHeight ? 18 : 28,
            paddingVertical: compactHeight ? 14 : 24,
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
          <KoinoLogo size={compactHeight ? 42 : 60} />
          <Text
            selectable
            style={{
              color: brandPalette.deepNavy,
              fontFamily: fontFamilies.headingMedium,
              fontSize: compactHeight ? 24 : 30,
              lineHeight: compactHeight ? 30 : 38,
              marginTop: compactHeight ? 6 : 12,
              textAlign: "center",
            }}
          >
            Be för {givenName}
          </Text>
          <BrandWaveMotif
            height={compactHeight ? 12 : 14}
            intensity={3.8}
            opacity={0.96}
            style={{ marginBottom: compactHeight ? 1 : 2, marginTop: compactHeight ? 6 : 12 }}
            variant="accent"
            width={compactHeight ? 54 : 60}
          />
          {requestBody ? (
            <ScrollView
              bounces={false}
              contentContainerStyle={{ flexGrow: 1, justifyContent: "center" }}
              fadingEdgeLength={12}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
              style={{ alignSelf: "stretch", flexShrink: 1 }}
            >
              <Text
                selectable
                style={{
                  color: brandPalette.deepNavy,
                  fontFamily: fontFamilies.bodyRegular,
                  fontSize: compactHeight ? 15 : 18,
                  lineHeight: compactHeight ? 21 : 29,
                  maxWidth: compactHeight ? 224 : 238,
                  alignSelf: "center",
                  textAlign: "center",
                }}
              >
                {requestBody}
              </Text>
            </ScrollView>
          ) : null}
        </View>

        <Animated.View
          pointerEvents="none"
          style={{
            alignItems: "center",
            bottom: buttonBottom + (compactHeight ? 72 : 70),
            left: -86,
            opacity: 0.78,
            position: "absolute",
            right: -86,
            transform: [{ translateY: wavesTranslateY }],
          }}
        >
          <BrandWaveMotif height={compactHeight ? 142 : 180} opacity={0.72} width={Math.max(width + 172, 520)} />
        </Animated.View>

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
          <Ionicons color={brandPalette.lavenderHaze} name="heart-outline" size={compactHeight ? 26 : 30} />
          <Text
            style={{
              color: brandPalette.mutedNavy,
              fontFamily: fontFamilies.bodyRegular,
              fontSize: compactHeight ? 14 : 16,
              lineHeight: compactHeight ? 19 : 22,
              textAlign: "center",
            }}
          >
            Stanna här en stund.
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
            accessibilityHint="Avslutar bönen och återgår till gemenskapen"
            accessibilityLabel="Amen"
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
                Amen
              </Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}
