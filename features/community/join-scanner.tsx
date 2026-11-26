import { Feather } from "@expo/vector-icons";
import { requireOptionalNativeModule } from "expo-modules-core";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { parseJoinPayload } from "@/state/join-qr";
import { BodyText, Card, PrimaryButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";

type CameraModule = typeof import("expo-camera");

let cached: CameraModule | null | undefined;

/**
 * expo-camera is native. A binary without it (the current production runtime
 * 2.1.0) must never even evaluate the module's JavaScript, so the native module
 * is probed first and the JS is required only when the binary really has it.
 */
function nativeCameraAvailable() {
  try {
    return Boolean(requireOptionalNativeModule("ExpoCamera"));
  } catch {
    return false;
  }
}

export function loadCameraModule(): CameraModule | null {
  if (cached !== undefined) return cached;
  if (!nativeCameraAvailable()) {
    cached = null;
    return cached;
  }
  try {
    cached = require("expo-camera") as CameraModule;
  } catch {
    cached = null;
  }
  return cached;
}

export function cameraScannerAvailable() {
  const module = loadCameraModule();
  return Boolean(module?.CameraView && module?.useCameraPermissions);
}

export function JoinScanner({ onCode }: { onCode: (code: string) => void }) {
  const module = loadCameraModule();
  if (!module?.CameraView || !module.useCameraPermissions) return <CameraFallback />;
  return <CameraScanner module={module} onCode={onCode} />;
}

function CameraScanner({ module, onCode }: { module: CameraModule; onCode: (code: string) => void }) {
  const { t } = useAppTranslation();
  const [permission, requestPermission] = module.useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    handled.current = false;
  }, []);

  async function ask() {
    if (requesting) return;
    setRequesting(true);
    try {
      await requestPermission();
    } finally {
      setRequesting(false);
    }
  }

  function scanned(result: { data?: string }) {
    if (handled.current) return;
    const code = parseJoinPayload(result.data);
    if (!code) return;
    handled.current = true;
    onCode(code);
  }

  if (!permission) {
    return (
      <Card style={{ alignItems: "center" }}>
        <BodyText muted>{t("community.join.cameraStarting")}</BodyText>
      </Card>
    );
  }

  if (!permission.granted) {
    return (
      <Card style={{ alignItems: "center", gap: 12 }}>
        <View style={{ alignItems: "center", backgroundColor: shadcn.secondary, borderRadius: 999, height: 52, justifyContent: "center", width: 52 }}>
          <Feather color={colors.muted} name="camera-off" size={23} />
        </View>
        <Text accessibilityRole="header" style={[typography.cardTitle, { color: colors.ink, textAlign: "center" }]}>
          {t("community.join.cameraTitle")}
        </Text>
        <BodyText muted>{t("community.join.cameraPermission")}</BodyText>
        <BodyText muted>{t("community.join.cameraDenied")}</BodyText>
        <PrimaryButton disabled={requesting || !permission.canAskAgain} icon="camera" loading={requesting} onPress={() => void ask()}>
          {t("community.join.cameraAllow")}
        </PrimaryButton>
        {!permission.canAskAgain ? (
          <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>{t("community.join.cameraSettings")}</Text>
        ) : null}
      </Card>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={{ backgroundColor: "#000", borderRadius: radius.xl, overflow: "hidden" }}>
        <module.CameraView
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          enableTorch={torch}
          facing="back"
          onBarcodeScanned={scanned}
          style={{ height: 320, width: "100%" }}
        />
      </View>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 10 }}>
        <Pressable
          accessibilityLabel={t("community.join.torch")}
          accessibilityRole="switch"
          accessibilityState={{ checked: torch }}
          onPress={() => setTorch((value) => !value)}
          style={{
            alignItems: "center",
            backgroundColor: torch ? shadcn.primary : shadcn.secondary,
            borderColor: shadcn.border,
            borderRadius: radius.md,
            borderWidth: 1,
            flexDirection: "row",
            gap: 8,
            minHeight: 42,
            paddingHorizontal: 14,
          }}
        >
          <Feather color={torch ? shadcn.primaryForeground : colors.ink} name="zap" size={17} />
          <Text style={[typography.label, { color: torch ? shadcn.primaryForeground : colors.ink }]}>{t("community.join.torch")}</Text>
        </Pressable>
        <Text style={[typography.caption, { color: colors.muted, flex: 1 }]}>{t("community.join.scanHint")}</Text>
      </View>
    </View>
  );
}

function CameraFallback() {
  const { t } = useAppTranslation();
  return (
    <Card style={{ alignItems: "center", gap: 10 }}>
      <View style={{ alignItems: "center", backgroundColor: shadcn.secondary, borderRadius: 999, height: 52, justifyContent: "center", width: 52 }}>
        <Feather color={colors.muted} name="camera-off" size={23} />
      </View>
      <BodyText muted>{t("community.join.cameraUnavailable")}</BodyText>
    </Card>
  );
}
