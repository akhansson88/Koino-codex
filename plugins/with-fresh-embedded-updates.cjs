const { withAppBuildGradle } = require('@expo/config-plugins');

const marker = '// KOINO: fresh embedded update identity';

function freshEmbeddedUpdates(contents) {
  if (contents.includes(marker)) return contents;
  return `${contents.trimEnd()}

${marker}
// SDK 54 tracks the entry-file path, not its source/dependencies, for this task.
// A reused manifest ID lets expo-updates launch an older cached JS bundle after
// reinstalling a locally rebuilt APK. Every release APK needs a fresh identity.
tasks.matching { it.name == "createReleaseUpdatesResources" }.configureEach {
    outputs.upToDateWhen { false }
}
`;
}

module.exports = function withFreshEmbeddedUpdates(config) {
  return withAppBuildGradle(config, result => {
    if (result.modResults.language !== 'groovy') throw new Error('Fresh embedded updates expects the generated Groovy Android build script.');
    result.modResults.contents = freshEmbeddedUpdates(result.modResults.contents);
    return result;
  });
};

module.exports.freshEmbeddedUpdates = freshEmbeddedUpdates;
