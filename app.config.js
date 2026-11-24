const {
  assertSupportedAppVariant,
  developmentRuntimeVersion,
  developmentIosId,
  developmentAndroidId,
  developmentScheme,
  requireStagingFirebaseConfig,
} = require("./state/store/firebase-development-config.cjs");

const baseConfig = {
  name: "KOINO",
  slug: "koino-mvp",
  version: "1.0.0",
  platforms: ["ios", "android"],
  orientation: "portrait",
  scheme: "koino",
  icon: "./koino-logo.png",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  splash: {
    backgroundColor: "#FAF6F0",
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
      backgroundColor: "#FAF6F0",
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
    ["expo-calendar", { "calendarPermission": "Allow KOINO to add community events to your calendar." }],
    "expo-font",
    ["expo-sqlite", { enableFTS: true, useSQLCipher: true, withSQLiteVecExtension: true }],
    "expo-secure-store",
    ["react-native-libsodium", {}],
    "./plugins/with-ios-app-switcher-privacy.cjs",
    "./plugins/with-variant-android-scheme.cjs",
    "./plugins/with-fresh-embedded-updates.cjs",
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
assertSupportedAppVariant(variant);
const isDevelopment = variant === "development";
const staging = isDevelopment ? requireStagingFirebaseConfig() : undefined;

module.exports = {
  ...baseConfig,
  name: isDevelopment ? "KOINO Dev" : baseConfig.name,
  scheme: isDevelopment ? developmentScheme : baseConfig.scheme,
  runtimeVersion: isDevelopment ? developmentRuntimeVersion : baseConfig.runtimeVersion,
  updates: isDevelopment ? { enabled: false } : baseConfig.updates,
  extra: {
    ...baseConfig.extra,
    koinoVariant: variant,
    ...(staging ? { koinoFirebase: staging } : {}),
  },
  ios: {
    ...baseConfig.ios,
    bundleIdentifier: isDevelopment ? developmentIosId : baseConfig.ios.bundleIdentifier,
    infoPlist: isDevelopment ? {
      ...baseConfig.ios.infoPlist,
      NSLocalNetworkUsageDescription: "KOINO Dev connects to Metro on your local network.",
      NSAppTransportSecurity: {
        ...baseConfig.ios.infoPlist.NSAppTransportSecurity,
        NSAllowsLocalNetworking: true,
      },
    } : baseConfig.ios.infoPlist,
  },
  android: {
    ...baseConfig.android,
    package: isDevelopment ? developmentAndroidId : baseConfig.android.package,
    googleServicesFile: isDevelopment ? undefined : baseConfig.android.googleServicesFile,
  },
};
