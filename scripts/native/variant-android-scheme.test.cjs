const assert = require('node:assert/strict');
const test = require('node:test');
const { AndroidConfig } = require('@expo/config-plugins');
const withVariantAndroidScheme = require('../../plugins/with-variant-android-scheme.cjs');

const schemes = ['koino', 'koino-dev', 'exp+koino-mvp', 'another-provider'];
function manifest() {
  return {
    manifest: {
      queries: [{ intent: [{ data: [{ $: { 'android:scheme': 'https' } }] }] }],
      application: [{ activity: [{
        $: { 'android:name': '.MainActivity', 'android:launchMode': 'singleTask' },
        'intent-filter': [{
          action: [{ $: { 'android:name': 'android.intent.action.VIEW' } }],
          category: [{ $: { 'android:name': 'android.intent.category.BROWSABLE' } }],
          data: schemes.map(scheme => ({ $: { 'android:scheme': scheme } })),
        }],
      }] }],
    },
  };
}

async function apply(applicationId, input) {
  const config = withVariantAndroidScheme({ name: 'KOINO', slug: 'koino-mvp', android: { package: applicationId } });
  const result = await config.mods.android.manifest({
    ...config,
    modRequest: { projectRoot: process.cwd(), platform: 'android', modName: 'manifest' },
    modResults: input,
  });
  return result.modResults;
}

test('each app keeps its own scheme and unrelated generated schemes across repeated prebuilds', async () => {
  for (const [applicationId, removed] of [
    ['com.akhansson.koinomvp.dev', 'koino'],
    ['com.akhansson.koinomvp', 'koino-dev'],
  ]) {
    const input = manifest();
    const queries = structuredClone(input.manifest.queries);
    const once = await apply(applicationId, input);
    const twice = await apply(applicationId, once);
    assert.deepEqual(AndroidConfig.Scheme.getSchemesFromManifest(twice), schemes.filter(scheme => scheme !== removed));
    assert.deepEqual(twice.manifest.queries, queries);
  }
});

test('an unrelated application identifier leaves its manifest untouched', async () => {
  const input = manifest();
  const previous = structuredClone(input);
  assert.deepEqual(await apply('com.example.other', input), previous);
});
