const assert = require('node:assert/strict');
const test = require('node:test');
const withFreshEmbeddedUpdates = require('../../plugins/with-fresh-embedded-updates.cjs');

test('release APK builds regenerate embedded update identities across incremental prebuilds', async () => {
  const config = withFreshEmbeddedUpdates({ name: 'KOINO', slug: 'koino-mvp' });
  const run = contents => config.mods.android.appBuildGradle({
    ...config,
    modRequest: { projectRoot: process.cwd(), platform: 'android', modName: 'appBuildGradle' },
    modResults: { language: 'groovy', contents },
  });
  const original = 'plugins { id "com.android.application" }\n';
  const once = (await run(original)).modResults.contents;
  const twice = (await run(once)).modResults.contents;
  assert.equal(twice, once, 'Repeated prebuilds must not duplicate the task configuration');
  assert.ok(once.startsWith(original.trimEnd()));
  assert.match(once, /tasks\.matching \{ it\.name == "createReleaseUpdatesResources" \}\.configureEach \{\s+outputs\.upToDateWhen \{ false \}/);
  assert.ok(!once.includes('createDebugUpdatesResources'), 'Debug builds continue to use Metro without regenerating release resources');
});
