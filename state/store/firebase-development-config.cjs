const production = require("./firebase-production.json");
const approvedStaging = require("./firebase-staging.json");
const productionAndroid = require("../../google-services.json");

const productionApiKeys = new Set([
  production.apiKey,
  ...productionAndroid.client.flatMap(client => client.api_key.map(key => key.current_key)),
]);

const developmentRuntimeVersion = "2.1.0-development";
const developmentIosId = "com.akhansson.koino.dev";
const developmentAndroidId = "com.akhansson.koinomvp.dev";
const developmentScheme = "koino-dev";
const functionsRegion = "europe-west1";

function matchesExactly(candidate, expected) {
  return candidate != null && Object.keys(candidate).length === Object.keys(expected).length &&
    Object.entries(expected).every(([key, value]) => Object.hasOwn(candidate, key) && candidate[key] === value);
}

function requireStagingFirebaseConfig() {
  if (!approvedStaging) {
    throw new Error("KOINO Dev requires a reviewed Firebase staging configuration in state/store/firebase-staging.json.");
  }
  const { projectId, appId, apiKey, authDomain, databaseURL } = approvedStaging;
  const expected = { projectId, appId, apiKey, authDomain, databaseURL, functionsRegion };
  const validProject = typeof projectId === "string" && /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(projectId) &&
    projectId !== production.projectId && !projectId.startsWith("demo-");
  const validAppId = typeof appId === "string" && /^1:[1-9]\d{5,14}:web:[a-f0-9]{16,32}$/.test(appId) &&
    appId.split(":")[1] !== production.messagingSenderId;
  const validKey = typeof apiKey === "string" && /^AIza[\w-]{35}$/.test(apiKey) &&
    !productionApiKeys.has(apiKey);
  if (!validProject || !validAppId || !validKey ||
      authDomain !== projectId + ".firebaseapp.com" ||
      databaseURL !== "https://" + projectId + "-default-rtdb." + functionsRegion + ".firebasedatabase.app" ||
      !matchesExactly(approvedStaging, expected)) {
    throw new Error("KOINO Dev Firebase staging configuration is invalid.");
  }
  return Object.freeze(expected);
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
  validateDevelopmentConfig,
  assertStagingAppOptions,
};
