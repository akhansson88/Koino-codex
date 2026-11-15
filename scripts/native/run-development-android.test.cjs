const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'run-development-android.cjs'), 'utf8');
const androidConfig = fs.readFileSync(path.join(__dirname, 'android-development-config.cjs'), 'utf8');
const dev = 'com.akhansson.koinomvp.dev';
const main = 'com.akhansson.koinomvp';

const updatesDisabled = "meta-data: name='expo.modules.updates.ENABLED' value='0'";
const appResources = "Package Groups (1)\n spec resource 0x7f100001 com.akhansson.koinomvp.dev:string/app_name: flags=0x00000000\n";

async function verify({
  args = ['--verify-only'],
  stagingError,
  metroError,
  metroChangedError,
  androidUser,
  namespace = dev,
  applicationId = dev,
  rootGoogleServices = false,
  sourceFiles = [],
  sourceResource = '',
  gradlePlugin = '',
  metadataId = dev,
  apkId = dev,
  updates = updatesDisabled,
  resourceTable = appResources,
} = {}) {
  const commands = [];
  const errors = [];
  const reads = [];
  const processState = {
    argv: ['node', 'run-development-android.cjs', ...args],
    env: { ANDROID_HOME: 'C:/test-android-sdk', EXPO_ADB_USER: androidUser },
    execPath: 'node',
    platform: 'win32',
    stderr: { write: value => errors.push(value) },
  };
  const fileSystem = {
    realpathSync: filename => filename,
    existsSync: filename => {
      if (filename.endsWith('autolinking.json')) return false;
      return !filename.endsWith('google-services.json') || rootGoogleServices;
    },
    readdirSync: filename => filename.endsWith('src') ? sourceFiles : ['36.0.0'],
    readFileSync: filename => {
      reads.push(filename);
      if (filename.endsWith('build.gradle')) return `namespace '${namespace}'\n applicationId '${applicationId}'\n${gradlePlugin}`;
      if (filename.endsWith('output-metadata.json')) {
        return JSON.stringify({ applicationId: metadataId, elements: [{ outputFile: 'app-debug.apk' }] });
      }
      if (filename.endsWith('local.properties')) return 'sdk.dir=C:/test-android-sdk';
      if (filename.endsWith('.xml')) return sourceResource;
      throw new Error(`Unexpected file read: ${filename}`);
    },
  };
  const androidConfigModule = { exports: {} };
  vm.runInNewContext(androidConfig, {
    module: androidConfigModule,
    require: name => name === 'node:fs' ? fileSystem : require(name),
  });
  await vm.runInNewContext(source, {
    __dirname,
    process: processState,
    console: { log: () => {}, error: value => errors.push(value) },
    require: Object.assign(name => {
      if (name === './android-development-config.cjs') return androidConfigModule.exports;
      if (name === './android-development-metro.cjs') return {
        metroPort: 8081,
        openAndroidDevArgs: (serial, user) => ['-s', serial, 'shell', 'am', 'start', '--user', user, '-p', dev],
        verifyAndroidMetro: async () => {
          commands.push({ command: 'metro', args: ['recheck'] });
          if (metroChangedError) throw new Error(metroChangedError);
        },
        withAndroidMetro: async (_root, env, callback) => {
          assert.equal(env.APP_VARIANT, 'development');
          assert.equal(env.ANDROID_SERIAL, 'synthetic-serial');
          commands.push({ command: 'metro', args: ['verify'] });
          if (metroError) throw new Error(metroError);
          await callback();
        },
      };
      if (name === 'node:fs') return fileSystem;
      if (name === 'node:path') return path;
      if (name === 'node:child_process') return {
        spawnSync: (command, args) => {
          commands.push({ command, args });
          if (args[0] === 'devices') return { status: 0, stdout: 'synthetic-serial\tdevice\n' };
          if (args[2] === 'shell') return { status: 0, stdout: 'arm64-v8a\n' };
          if (args[1] === 'resources') return { status: 0, stdout: resourceTable };
          return { status: 0, stdout: `package: name='${apkId}' versionCode='21'\n${updates}\n` };
        },
      };
      if (name === '../../state/store/firebase-development-config.cjs') return {
        developmentAndroidId: dev,
        requireStagingFirebaseConfig: () => {
          if (stagingError) throw new Error(stagingError);
        },
      };
      throw new Error(`Unexpected module: ${name}`);
    }, { resolve: () => 'expo-cli' }),
  });
  return { commands, errors, reads, exitCode: processState.exitCode };
}

test('refuses a stale main namespace or application ID before inspecting an APK', async () => {
  for (const values of [{ namespace: main }, { applicationId: main }]) {
    const result = await verify(values);
    assert.equal(result.exitCode, 1);
    assert.equal(result.commands.length, 0);
    assert.match(result.errors[0], /Refusing installation/);
  }
});

test('refuses stale output metadata and a main APK disguised by development metadata', async () => {
  const metadata = await verify({ metadataId: main });
  assert.equal(metadata.exitCode, 1);
  assert.equal(metadata.commands.length, 0);
  const apk = await verify({ apkId: main });
  assert.equal(apk.exitCode, 1);
  assert.equal(apk.commands.length, 1);
  assert.deepEqual(Array.from(apk.commands[0].args).slice(0, 2), ['dump', '--include-meta-data']);
  assert.match(apk.errors[0], /APK package is com\.akhansson\.koinomvp,/);
});

test('verification succeeds only when project, metadata, and compiled APK identify development', async () => {
  const result = await verify();
  assert.equal(result.exitCode, undefined);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.commands.map(command => Array.from(command.args).slice(0, -1)), [
    ['dump', '--include-meta-data', 'badging'],
    ['dump', 'resources'],
  ]);
  assert.match(result.commands[0].command, /aapt\.exe$/);
});

test('missing staging blocks all launcher modes before reading native files or starting a subprocess', async () => {
  for (const args of [[], ['--verify-only'], ['--metro-only']]) {
    const result = await verify({ args, stagingError: 'KOINO Dev staging configuration is missing.' });
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.reads, []);
    assert.deepEqual(result.commands, []);
    assert.match(result.errors[0], /staging configuration is missing/);
  }
});

test('rejects stale Google Services files, plugin, and source resources in the generated project', async () => {
  for (const stale of [
    { rootGoogleServices: true },
    { sourceFiles: [path.join('debug', 'google-services.json')] },
    { gradlePlugin: "apply plugin: 'com.google.gms.google-services'" },
    {
      sourceFiles: [path.join('main', 'res', 'values', 'strings.xml')],
      sourceResource: '<resources><string name="google_app_id">stale</string></resources>',
    },
  ]) {
    for (const args of [[], ['--verify-only']]) {
      const result = await verify({ ...stale, args });
      assert.equal(result.exitCode, 1);
      assert.deepEqual(result.commands, []);
      assert.match(result.errors[0], /contains native Google Services configuration/);
    }
  }
});

test('rejects stale native Expo Updates metadata before building', async () => {
  const sourceFiles = [path.join('main', 'AndroidManifest.xml')];
  for (const tag of [
    '<meta-data android:name="expo.modules.updates.ENABLED" android:value="true"/>',
    '<meta-data android:value="https://updates.example.invalid" android:name="expo.modules.updates.EXPO_UPDATE_URL"/>',
    '<meta-data android:name="expo.modules.updates.ENABLED" android:resource="@bool/updates"/>',
  ]) {
    const result = await verify({ args: [], sourceFiles, sourceResource: tag });
    assert.equal(result.exitCode, 1);
    assert.deepEqual(result.commands, []);
    assert.match(result.errors[0], /contains remote Expo Updates configuration/);
  }
  const safe = await verify({
    sourceFiles,
    sourceResource: '<meta-data android:name="expo.modules.updates.ENABLED" android:value="false"/>',
  });
  assert.equal(safe.exitCode, undefined);
});

test('rejects a Dev APK with enabled or missing OTA metadata or an update URL', async () => {
  for (const updates of [
    '',
    "meta-data: name='expo.modules.updates.ENABLED' value='-1'",
    updatesDisabled + "\nmeta-data: name='expo.modules.updates.EXPO_UPDATE_URL' value='https://updates.example.invalid'",
  ]) {
    const result = await verify({ updates });
    assert.equal(result.exitCode, 1);
    assert.equal(result.commands.length, 1);
    assert.match(result.errors[0], /must disable Expo Updates and have no update URL/);
  }
});

test('rejects Firebase resource names in a Dev APK regardless of value and requires readable resource output', async () => {
  for (const name of ['google_app_id', 'gcm_defaultSenderId', 'firebase_database_url', 'google_api_key', 'google_storage_bucket', 'project_id']) {
    const resourceTable = appResources + ` spec resource 0x7f100002 com.akhansson.koinomvp.dev:string/${name}: flags=0x00000000\n`;
    const result = await verify({ resourceTable });
    assert.equal(result.exitCode, 1);
    assert.equal(result.commands.length, 2);
    assert.match(result.errors[0], /contains native Firebase resource/);
    assert.ok(result.errors[0].endsWith(name + '.'));
  }
  const result = await verify({ resourceTable: '' });
  assert.equal(result.exitCode, 1);
  assert.match(result.errors[0], /could not verify the Dev APK resource table/);
});

test('build mode verifies compiled resources and Metro before installing or launching the APK', async () => {
  const resourceTable = appResources + ' spec resource 0x7f100002 com.akhansson.koinomvp.dev:string/google_app_id: flags=0x00000000\n';
  const stale = await verify({ args: [], resourceTable });
  assert.equal(stale.exitCode, 1);
  assert.match(stale.errors[0], /contains native Firebase resource google_app_id/);
  assert.deepEqual(Array.from(stale.commands.at(-1).args).slice(0, 2), ['dump', 'resources']);
  assert.ok(!stale.commands.some(({ command, args }) => command === 'metro' || args.includes('install') || args.includes('reverse')));

  const safe = await verify({ args: [] });
  assert.equal(safe.exitCode, undefined);
  assert.deepEqual(safe.commands.slice(-5).map(({ args }) => args[0] === '-s' ? args[2] : args[0]), [
    'verify', 'install', 'recheck', 'reverse', 'shell',
  ]);
  assert.deepEqual(Array.from(safe.commands.at(-4).args).slice(3, 7), ['-r', '-d', '--user', '0']);
  assert.equal(safe.commands.at(-1).args.at(-1), dev);
});

test('an explicit Android profile is used for both installation and launch', async () => {
  const result = await verify({ args: [], androidUser: '12' });
  assert.equal(result.exitCode, undefined);
  assert.equal(result.commands.at(-4).args[6], '12');
  assert.equal(result.commands.at(-1).args[6], '12');
});

test('an unverified Metro blocks forwarding, installation, and launch in both modes', async () => {
  for (const args of [[], ['--metro-only']]) {
    const result = await verify({ args, metroError: 'refusing stale Metro' });
    assert.equal(result.exitCode, 1);
    assert.match(result.errors[0], /refusing stale Metro/);
    assert.ok(!result.commands.some(({ args }) => args.includes('install') || args.includes('reverse') || args.includes('am')));
  }
});

test('a server change during install blocks USB forwarding and app launch', async () => {
  const result = await verify({ args: [], metroChangedError: 'Metro changed during install' });
  assert.equal(result.exitCode, 1);
  assert.match(result.errors[0], /Metro changed during install/);
  assert.ok(!result.commands.some(({ args }) => args.includes('reverse') || args.includes('am')));
});

test('Metro-only mode forwards the selected device without touching native builds', async () => {
  const result = await verify({ args: ['--metro-only', '--device', 'synthetic-serial'] });
  assert.equal(result.exitCode, undefined);
  assert.deepEqual(result.reads, []);
  assert.deepEqual(result.commands.map(({ args }) => args[0] === '-s' ? args[2] : args[0]), ['devices', 'verify', 'reverse']);
});
