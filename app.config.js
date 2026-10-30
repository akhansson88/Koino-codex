const { emulatorConfig } = require("./state/store/firebase-emulator-config.cjs");

const baseConfig = {
  name: "KOINO",
  slug: "koino-mvp",
  version: "1.0.0",
  platforms: ["ios", "android"],
  orientation: "portrait",
  scheme: "koino",
  icon: "./koino-logo.png",
  userInterfaceStyle: "light",
  newArchEnabled: true,
  splash: {
    backgroundColor: "#F7EFE4",
  },
  ios: {
    supportsTablet: false,
    buildNumber: "4",
    infoPlist: {
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoadsInWebContent: true,
      },
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ["audio"],
    },
    bundleIdentifier: "com.akhansson.koino",
  },
  android: {
    allowBackup: false,
    googleServicesFile: "./google-services.json",
    adaptiveIcon: {
      foregroundImage: "./koino-logo.png",
      backgroundColor: "#F7EFE4",
    },
    package: "com.akhansson.koinomvp",
    versionCode: 21,
    permissions: ["android.permission.RECORD_AUDIO", "android.permission.POST_NOTIFICATIONS"],
  },
  plugins: [
    "expo-router",
    ["expo-audio", { microphonePermission: false, recordAudioAndroid: false }],
    "expo-asset",
    [
      "expo-image-picker",
      {
        photosPermission:
          "Allow KOINO to choose a community image from your photo library.",
      },
    ],
    "expo-web-browser",
    "expo-notifications",
    "expo-font",
    ["expo-sqlite", { enableFTS: true, useSQLCipher: true, withSQLiteVecExtension: true }],
    "expo-secure-store",
    ["react-native-libsodium", {}],
    "./plugins/with-variant-android-scheme.cjs",
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "587506fb-be73-46b3-a680-0207aadeb2cf",
    },
  },
  // A concrete runtime version works in both generated native projects and EAS.
  runtimeVersion: "2.1.0",
  updates: {
    url: "https://u.expo.dev/587506fb-be73-46b3-a680-0207aadeb2cf",
  },
};

const variant = process.env.APP_VARIANT || "production";
const isDevelopment = variant === "development";
const emulator = emulatorConfig({ variant, host: process.env.EXPO_PUBLIC_KOINO_EMULATOR_HOST });

module.exports = {
  ...baseConfig,
  name: emulator ? "KOINO Emulator" : isDevelopment ? "KOINO Dev" : baseConfig.name,
  scheme: emulator ? "koino-emulator" : isDevelopment ? "koino-dev" : baseConfig.scheme,
  runtimeVersion: emulator ? "2.1.0-emulator" : baseConfig.runtimeVersion,
  updates: emulator ? { enabled: false } : baseConfig.updates,
  extra: { ...baseConfig.extra, koinoVariant: variant, ...(emulator ? { koinoEmulator: emulator } : {}) },
  plugins: [...baseConfig.plugins, ...(emulator ? ["./plugins/with-emulator-local-network.cjs"] : [])],
  ios: {
    ...baseConfig.ios,
    bundleIdentifier: emulator ? "com.akhansson.koino.emulator" : isDevelopment ? "com.akhansson.koino.dev" : baseConfig.ios.bundleIdentifier,
    infoPlist: emulator ? {
      ...baseConfig.ios.infoPlist,
      NSLocalNetworkUsageDescription: "KOINO Emulator connects only to your local Firebase test environment. / KOINO Emulator ansluter till din lokala Firebase-testmiljö.",
      NSAppTransportSecurity: {
        NSAllowsLocalNetworking: true,
        NSExceptionDomains: { [emulator.host]: { NSExceptionAllowsInsecureHTTPLoads: true, NSIncludesSubdomains: false } },
      },
    } : baseConfig.ios.infoPlist,
  },
  android: {
    ...baseConfig.android,
    package: emulator ? "com.akhansson.koinomvp.emulator" : isDevelopment ? "com.akhansson.koinomvp.dev" : baseConfig.android.package,
    googleServicesFile: emulator ? undefined : isDevelopment ? "./google-services.dev.json" : baseConfig.android.googleServicesFile,
  },
};
