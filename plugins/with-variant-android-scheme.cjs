const { AndroidConfig, withAndroidManifest } = require('@expo/config-plugins');

// Expo preserves old schemes on incremental prebuilds. Keep each installed app
// from intercepting links intended for the other variant, preserving all others.
module.exports = function withVariantAndroidScheme(config) {
  return withAndroidManifest(config, (result) => {
    const applicationId = result.android?.package;
    const oppositeScheme = applicationId === 'com.akhansson.koinomvp.dev'
      ? 'koino'
      : applicationId === 'com.akhansson.koinomvp' ? 'koino-dev' : null;
    if (oppositeScheme) {
      result.modResults = AndroidConfig.Scheme.removeScheme(oppositeScheme, result.modResults);
    }
    return result;
  });
};
