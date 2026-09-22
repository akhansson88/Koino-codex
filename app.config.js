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
    buildNumber: "3",
    infoPlist: {
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoadsInWebContent: true,
      },
      ITSAppUsesNonExemptEncryption: false,
    },
    bundleIdentifier: "com.akhansson.koino",
  },
  android: {
    googleServicesFile: "./google-services.json",
    adaptiveIcon: {
      foregroundImage: "./koino-logo.png",
      backgroundColor: "#F7EFE4",
    },
    package: "com.akhansson.koinomvp",
    versionCode: 4,
    permissions: ["android.permission.RECORD_AUDIO", "android.permission.POST_NOTIFICATIONS"],
  },
  plugins: [
    "expo-router",
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
    ["expo-sqlite", { enableFTS: true }],
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
  runtimeVersion: "1.1.0",
  updates: {
    url: "https://u.expo.dev/587506fb-be73-46b3-a680-0207aadeb2cf",
  },
};

const isDevelopment = process.env.APP_VARIANT === "development";

module.exports = {
  ...baseConfig,
  name: isDevelopment ? "KOINO Dev" : baseConfig.name,
  scheme: isDevelopment ? "koino-dev" : baseConfig.scheme,
  android: {
    ...baseConfig.android,
    package: isDevelopment
      ? "com.akhansson.koinomvp.dev"
      : baseConfig.android.package,
    googleServicesFile: isDevelopment
      ? "./google-services.dev.json"
      : baseConfig.android.googleServicesFile,
  },
};
