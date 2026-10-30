const { AndroidConfig, withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withEmulatorLocalNetwork(config) {
  if (config.extra?.koinoVariant !== "emulator") throw new Error("Local cleartext networking is restricted to KOINO Emulator.");
  return withAndroidManifest(config, result => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(result.modResults);
    application.$["android:usesCleartextTraffic"] = "true";
    return result;
  });
};
