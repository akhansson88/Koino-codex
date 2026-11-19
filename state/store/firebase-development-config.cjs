const approvedStaging = require("./firebase-staging.json");

const developmentRuntimeVersion = "2.1.0-development";
const developmentIosId = "com.akhansson.koino.dev";
const developmentAndroidId = "com.akhansson.koinomvp.dev";
const developmentScheme = "koino-dev";
const retiredEmulatorIds = new Set(["com.akhansson.koino.emulator", "com.akhansson.koinomvp.emulator"]);

function retiredEmulatorError() {
  return new Error("The KOINO Emulator app variant has been retired.");
}

function assertSupportedAppVariant(variant) {
  if (variant === "emulator") throw retiredEmulatorError();
  if (variant !== undefined && variant !== "production" && variant !== "development") {
    throw new Error("Unknown KOINO app variant; refusing to select a live backend.");
  }
}

function assertSupportedAppConfig(config, nativeApplicationId) {
  const scheme = config?.scheme;
  if (retiredEmulatorIds.has(nativeApplicationId) ||
      retiredEmulatorIds.has(config?.ios?.bundleIdentifier) || retiredEmulatorIds.has(config?.android?.package) ||
      config?.extra?.koinoEmulator !== undefined || config?.name === "KOINO Emulator" ||
      config?.runtimeVersion === "2.1.0-emulator" || [scheme].flat().includes("koino-emulator")) {
    throw retiredEmulatorError();
  }
  assertSupportedAppVariant(config?.extra?.koinoVariant);
}

// Firebase Auth selects the project by this public Web API key, so pin it
// independently of the editable configuration, along with the app and URLs.
const expectedStaging = Object.freeze({
  projectId: "koino-staging",
  appId: "1:449587720664:web:3106e8239e899e193882ad",
  apiKey: "AIzaSyCEXLygFuzYAKbykMJ_9mdkuIaSNcr08Ak",
  authDomain: "koino-staging.firebaseapp.com",
  databaseURL: "https://koino-staging-default-rtdb.europe-west1.firebasedatabase.app",
  functionsRegion: "europe-west1",
});

function matchesExactly(candidate, expected) {
  return candidate != null && Object.keys(candidate).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => Object.hasOwn(candidate, key) && candidate[key] === value);
}

function requireStagingFirebaseConfig() {
  if (!approvedStaging) {
    throw new Error("KOINO Dev requires a reviewed Firebase staging configuration in state/store/firebase-staging.json.");
  }
  if (!matchesExactly(approvedStaging, expectedStaging)) {
    throw new Error("KOINO Dev Firebase staging configuration is invalid.");
  }
  return expectedStaging;
}

function validateDevelopmentConfig(config, nativeApplicationId) {
  const extra = config?.extra;
  const nativeDev = nativeApplicationId === developmentIosId || nativeApplicationId === developmentAndroidId;
  const bundleClaimsDev = extra?.koinoVariant === "development" || extra?.koinoFirebase !== undefined ||
    config?.ios?.bundleIdentifier === developmentIosId || config?.android?.package === developmentAndroidId ||
    config?.scheme === developmentScheme || config?.name === "KOINO Dev" || config?.runtimeVersion === developmentRuntimeVersion;
  if (!nativeDev && !bundleClaimsDev) return undefined;

  if (!nativeDev || extra?.koinoVariant !== "development" ||
      config.ios?.bundleIdentifier !== developmentIosId || config.android?.package !== developmentAndroidId ||
      config.scheme !== developmentScheme || extra.koinoEmulator !== undefined ||
      config.runtimeVersion !== developmentRuntimeVersion || config.updates?.enabled !== false ||
      config.updates.url !== undefined || config.android.googleServicesFile !== undefined ||
      config.ios.googleServicesFile !== undefined) {
    throw new Error("KOINO Dev requires matching native and bundle configuration with remote updates disabled.");
  }
  const approved = requireStagingFirebaseConfig();
  if (!matchesExactly(extra.koinoFirebase, approved)) {
    throw new Error("KOINO Dev Firebase configuration does not match the approved staging project.");
  }
  return approved;
}

function assertStagingAppOptions(expected, actual) {
  if (!matchesExactly(actual, expected)) {
    throw new Error("KOINO Dev found an initialized Firebase app with different options. Restart the app.");
  }
}

module.exports = {
  developmentRuntimeVersion,
  developmentIosId,
  developmentAndroidId,
  developmentScheme,
  requireStagingFirebaseConfig,
  assertSupportedAppVariant,
  assertSupportedAppConfig,
  validateDevelopmentConfig,
  assertStagingAppOptions,
};
