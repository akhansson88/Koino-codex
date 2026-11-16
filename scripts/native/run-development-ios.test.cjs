const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const nativePath = require('node:path');
const path = nativePath.posix;
const test = require('node:test');
const vm = require('node:vm');

const root = '/checkout';
const device = '00008110-001234560123401E';
const devBundleId = 'com.akhansson.koino.dev';
const devRuntime = '2.1.0-development';
const devScheme = 'koino-dev';
const tempAlias = '/var/folders/fixture/T';
const temp = path.join('/private' + tempAlias, 'koino-ios-dev-test');
const workspace = 'KOINODev.xcworkspace';
const port = 49800;
const lanHost = '192.168.1.16';
const productName = 'KOINODev.app';
const products = path.join('Build', 'Products', 'Debug-iphoneos');
const expectedArtifact = path.join(temp, 'DerivedData', products, productName);
const aliasedProductsDirectory = path.join(tempAlias, path.basename(temp), 'DerivedData', products);
const filename = nativePath.join(__dirname, 'run-development-ios.cjs');
const source = fs.readFileSync(filename, 'utf8');
const expoCli = '/checkout/node_modules/expo/bin/cli';
const config = { extra: { koinoVariant: 'development' } };

async function launch({
  platform = 'darwin',
  args = ['--device', device],
  stagingError,
  generatedError,
  xcodeEnvironment = 'export NODE_BINARY=/usr/bin/node',
  builtError,
  bundleId = devBundleId,
  buildPlatform = 'iphoneos',
  buildVariant = 'development',
  deviceModel = 'iPhone17,1',
  productsDirectory,
  existingArtifact = false,
  resolvedArtifact = expectedArtifact,
  listenerPids = args[0] === '--metro-only' ? ['', '42\n'] : ['42\n'],
  manifestConfig = config,
  manifestRoot = root,
  manifestRuntime = devRuntime,
  manifestDevelopment = true,
  manifestHost = lanHost,
  manifestPort = args[0] === '--metro-only' ? 8082 : port,
} = {}) {
  const calls = [];
  const errors = [];
  const metroOnly = args[0] === '--metro-only';
  const fileContents = new Map([[path.join(root, 'ios', '.xcode.env'), xcodeEnvironment]]);
  let builtArtifact;
  const metro = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, pid: 42 });
  const closeMetro = () => {
    metro.exitCode = 0;
    metro.emit('exit', 0, null);
  };
  metro.kill = () => {
    calls.push({ step: 'stop metro' });
    closeMetro();
  };
  const processState = {
    argv: ['node', filename, ...args],
    env: { APP_VARIANT: 'production', CI: '1', EXPO_PACKAGER_PROXY_URL: 'https://stale.example.test' },
    execPath: '/usr/bin/node',
    platform,
    cwd: () => root,
    on() {},
    once() {},
    removeListener() {},
    stderr: { write: value => errors.push(value) },
    stdout: { write() {} },
  };
  const devices = { result: { devices: [{
    identifier: 'fixture-coredevice',
    hardwareProperties: { udid: device, productType: deviceModel, platform: 'iOS', reality: 'physical' },
    deviceProperties: { name: 'Fixture iPhone', osVersionNumber: '18.2', developerModeStatus: 'enabled' },
    connectionProperties: { pairingState: 'paired', tunnelState: 'connected' },
  }] } };
  const fileSystem = {
    existsSync: filename => filename === builtArtifact || filename.endsWith('.xcworkspace') ||
      fileContents.has(filename) || (existingArtifact && filename === expectedArtifact),
    statSync: () => ({ isDirectory: () => true, isFile: () => true }),
    lstatSync: () => ({ isDirectory: () => true, isFile: () => true }),
    mkdtempSync: () => temp,
    realpathSync: value => {
      if (value === tempAlias) return path.dirname(temp);
      if (value === builtArtifact) return resolvedArtifact;
      return value;
    },
    readFileSync: filename => {
      assert.ok(fileContents.has(filename), 'Unexpected file: ' + filename);
      return fileContents.get(filename);
    },
    rmSync() {},
  };
  const manifest = {
    runtimeVersion: manifestRuntime,
    launchAsset: { url: 'http://' + manifestHost + ':' + manifestPort + '/index.bundle?platform=ios&dev=true' },
    extra: {
      expoClient: manifestConfig,
      expoGo: { developer: { projectRoot: manifestRoot }, packagerOpts: { dev: manifestDevelopment } },
    },
  };
  let derivedData = temp;
  let listenerChecks = 0;
  const sync = (command, argv, options) => {
    const params = Array.from(argv);
    let stdout = '';
    let step;
    if (command.endsWith('/lsof') || command === 'lsof') {
      calls.push({ step: 'metro listener', params, options });
      const stdout = listenerPids[Math.min(listenerChecks++, listenerPids.length - 1)];
      return { status: stdout ? 0 : 1, stdout, stderr: '' };
    }
    if (params.includes('-showBuildSettings')) {
      step = 'settings';
      derivedData = params[params.indexOf('-derivedDataPath') + 1];
      stdout = JSON.stringify([{
        target: 'KOINODev',
        buildSettings: {
          PRODUCT_TYPE: 'com.apple.product-type.application',
          CONFIGURATION: 'Debug',
          APP_VARIANT: buildVariant,
          SDK_NAME: 'iphoneos18.2',
          SUPPORTED_PLATFORMS: 'iphoneos iphonesimulator',
          INFOPLIST_FILE: 'KOINODev/Info.plist',
          PRODUCT_BUNDLE_IDENTIFIER: bundleId,
          PLATFORM_NAME: buildPlatform,
          TARGET_BUILD_DIR: productsDirectory || path.join(derivedData, products),
          FULL_PRODUCT_NAME: productName,
          WRAPPER_EXTENSION: 'app',
        },
      }]);
    } else if (params.includes('list') && params.includes('devices')) {
      step = 'devices';
      fileContents.set(params[params.indexOf('--json-output') + 1], JSON.stringify(devices));
    } else if (params.includes('install')) {
      step = 'install';
      queueMicrotask(closeMetro);
    } else if (params.includes('build')) {
      step = 'build';
      builtArtifact = path.join(derivedData, products, productName);
    } else {
      assert.fail('Unexpected subprocess: ' + command + ' ' + params.join(' '));
    }
    calls.push({ step, params, options });
    return { status: 0, stdout, stderr: '' };
  };
  const fixtureModule = { exports: {} };
  const mocks = {
    'node:fs': fileSystem,
    'node:path': path,
    'node:os': {
      tmpdir: () => tempAlias,
      networkInterfaces: () => ({ en0: [{ address: lanHost, family: 'IPv4', internal: false }] }),
    },
    'node:net': { createServer: () => {
      const server = new EventEmitter();
      server.listen = (...values) => {
        queueMicrotask(values.at(-1));
        return server;
      };
      server.address = () => ({ port });
      server.close = callback => { if (callback) queueMicrotask(callback); return server; };
      return server;
    } },
    'node:timers/promises': { setTimeout: async () => {} },
    '@expo/config-plugins': { IOSConfig: { Paths: {
      getAllXcodeProjectPaths: () => [path.join(root, 'ios', 'KOINODev.xcodeproj')],
      findSchemeNames: () => ['KOINODev'],
    } } },
    'node:child_process': {
      spawnSync: sync,
      execFileSync: (command, argv, options) => sync(command, argv, options).stdout,
      spawn: (command, argv, options) => {
        calls.push({ step: 'start metro', command, params: Array.from(argv), options });
        return metro;
      },
    },
    '../../state/store/firebase-development-config.cjs': {
      developmentIosId: devBundleId, developmentRuntimeVersion: devRuntime, developmentScheme: devScheme,
      requireStagingFirebaseConfig() {
        calls.push({ step: 'staging' });
        if (stagingError) throw new Error(stagingError);
      },
      validateDevelopmentConfig(actual, actualId) {
        assert.equal(actualId, devBundleId);
        if (actual !== config) throw new Error('Unexpected staging manifest.');
        return {};
      },
    },
    './verify-development-ios.cjs': {
      verifyGeneratedIos(projectRoot) {
        assert.equal(projectRoot, root);
        calls.push({ step: 'verify source' });
        if (generatedError) throw new Error(generatedError);
      },
      verifyBuiltIos(artifact) {
        calls.push({ step: 'verify artifact', artifact });
        if (builtError) throw new Error(builtError);
      },
    },
  };
  const fixtureRequire = name => {
    assert.ok(Object.hasOwn(mocks, name), 'Unexpected import: ' + name);
    return mocks[name];
  };
  fixtureRequire.resolve = name => {
    assert.equal(name, 'expo/bin/cli');
    return expoCli;
  };
  fixtureRequire.main = fixtureModule;

  await vm.runInNewContext(source, {
    module: fixtureModule,
    require: fixtureRequire,
    process: processState,
    __dirname: path.join(root, 'scripts', 'native'),
    console: {
      log(message) {
        if (message.startsWith('Open your verified KOINO Dev install')) {
          calls.push({ step: 'metro ready', message });
          if (metroOnly) queueMicrotask(closeMetro);
        }
      },
      error: value => errors.push(value),
    },
    fetch: async (url, options) => {
      assert.equal(url, 'http://127.0.0.1:' + (metroOnly ? 8082 : port) + '/?platform=ios');
      assert.equal(options.redirect, 'error');
      assert.equal(options.headers['expo-platform'], 'ios');
      calls.push({ step: 'manifest' });
      return { ok: true, json: async () => manifest };
    },
    URL,
    AbortSignal,
  });
  return { calls, errors, exitCode: processState.exitCode, derivedData };
}

const steps = result => result.calls.map(call => call.step);

test('refuses unsupported platforms and missing device selection before subprocesses', async () => {
  for (const options of [
    { platform: 'win32' },
    { args: [] },
    { args: ['--device', '--help'] },
    { args: ['--metro-only', '--build-only'] },
  ]) {
    const result = await launch(options);
    assert.equal(result.exitCode, 1);
    assert.ok(!result.calls.some(call => call.params));
  }
});

test('refuses missing, invalid or production staging configuration before native or Metro work', async () => {
  for (const stagingError of [
    'A reviewed Firebase staging configuration is required.',
    'Firebase staging configuration is invalid.',
    'Firebase staging configuration references production.',
  ]) {
    const result = await launch({ stagingError });
    assert.equal(result.exitCode, 1);
    assert.match(result.errors.join('\n'), /staging configuration/);
    assert.deepEqual(steps(result), ['staging']);
  }
});

test('refuses stale generated native source or non-Dev effective settings before compiling', async () => {
  for (const [options, reason] of [
    [{ generatedError: 'Xcode source references production.' }, /source references production/],
    [{ bundleId: 'com.akhansson.koino' }, /Effective Xcode settings/],
    [{ buildPlatform: 'iphonesimulator' }, /Effective Xcode settings/],
    [{ buildVariant: 'production' }, /Effective Xcode settings/],
    [{ xcodeEnvironment: 'export APP_VARIANT=production' }, /APP_VARIANT setting/],
    [{ productsDirectory: '/stale/DerivedData' }, /isolated DerivedData/],
    [{ deviceModel: 'iPad17,1' }, /physical iPhone/],
  ]) {
    const result = await launch(options);
    assert.equal(result.exitCode, 1);
    assert.match(result.errors.join('\n'), reason);
    assert.ok(!steps(result).includes('build'));
    assert.ok(!steps(result).includes('install'));
  }
});

test('refuses an unsafe compiled artifact or an unverified Metro before installing', async () => {
  const badManifest = /expected KOINO Dev iOS manifest/;
  for (const [options, reason] of [
    [{ builtError: 'The built app contains stale production metadata.' }, /stale production metadata/],
    [{ manifestConfig: { extra: { koinoVariant: 'production' } } }, /Unexpected staging manifest/],
    [{ manifestRoot: '/stale/checkout' }, badManifest],
    [{ manifestRuntime: '2.1.0' }, badManifest],
    [{ manifestDevelopment: false }, badManifest],
    [{ manifestHost: '203.0.113.9' }, badManifest],
    [{ manifestPort: 8081 }, badManifest],
    [{ listenerPids: ['73\n'] }, /port is held by an unverified process/],
    [{ listenerPids: ['42\n', '73\n'] }, /port is held by an unverified process/],
  ]) {
    const result = await launch(options);
    assert.equal(result.exitCode, 1);
    assert.match(result.errors.join('\n'), reason);
    assert.ok(steps(result).includes('build'));
    assert.ok(!steps(result).includes('install'));
  }
});

test('builds with isolated settings, verifies the exact artifact and starts Dev Metro before installing on the selected iPhone', async () => {
  const result = await launch();
  assert.equal(result.exitCode, undefined, result.errors.join('\n'));
  assert.ok(steps(result).indexOf('staging') < steps(result).indexOf('verify source'));
  assert.ok(steps(result).indexOf('verify source') < steps(result).indexOf('build'));
  assert.ok(steps(result).indexOf('settings') < steps(result).indexOf('build'));
  assert.ok(steps(result).indexOf('build') < steps(result).indexOf('verify artifact'));
  assert.ok(steps(result).indexOf('verify artifact') < steps(result).indexOf('install'));
  assert.ok(steps(result).indexOf('manifest') < steps(result).indexOf('install'));
  const settings = result.calls.find(call => call.step === 'settings');
  const build = result.calls.find(call => call.step === 'build');
  assert.equal(path.isAbsolute(result.derivedData), true);
  assert.ok(settings.params.includes(result.derivedData) && build.params.includes(result.derivedData));
  assert.ok(build.params.includes(path.join(root, 'ios', workspace)));
  assert.ok(build.params.includes('Debug'));
  assert.ok(build.params.some(value => value === 'id=' + device || value.endsWith(',id=' + device)));
  assert.ok(build.params.includes('APP_VARIANT=development'));
  assert.ok(!build.params.includes('-allowProvisioningUpdates'));
  const artifact = result.calls.find(call => call.step === 'verify artifact').artifact;
  assert.ok(artifact.startsWith(result.derivedData + '/'));
  const metro = result.calls.find(call => call.step === 'start metro');
  assert.ok(metro.params.includes('--dev-client'));
  assert.ok(metro.params.includes(devScheme));
  assert.ok(metro.params.includes('--lan'));
  assert.ok(metro.params.includes(String(port)));
  assert.equal(Object.hasOwn(metro.options.env, 'CI'), false);
  assert.equal(metro.options.env.REACT_NATIVE_PACKAGER_HOSTNAME, lanHost);
  const install = result.calls.find(call => call.step === 'install');
  assert.equal(install.params.at(-1), artifact);
  assert.ok(install.params.includes(device));
  for (const call of result.calls.filter(call => call.params && call.step !== 'metro listener')) {
    assert.equal(call.options.env.APP_VARIANT, 'development', call.step);
  }
});


test('build-only stops after validating the fresh artifact, without Metro or installation', async () => {
  const result = await launch({ args: ['--device', device, '--build-only'] });
  assert.equal(result.exitCode, undefined, result.errors.join('\n'));
  assert.ok(steps(result).includes('verify artifact'));
  assert.ok(!steps(result).includes('start metro'));
  assert.ok(!steps(result).includes('install'));
});

test('metro-only serves a verified staging manifest on the same port without building or installing', async () => {
  const result = await launch({ args: ['--metro-only'], generatedError: 'No generated workspace' });
  assert.equal(result.exitCode, undefined, result.errors.join('\n'));
  assert.deepEqual(steps(result), [
    'staging', 'metro listener', 'start metro', 'metro listener', 'manifest', 'metro listener', 'metro ready',
  ]);
  const metro = result.calls.find(call => call.step === 'start metro');
  assert.equal(metro.params.at(-1), '8082');
  assert.equal(metro.options.env.APP_VARIANT, 'development');
  assert.equal(metro.options.env.EXPO_OFFLINE, '1');
  assert.equal(metro.options.env.EXPO_NO_DOTENV, '1');
  assert.equal(Object.hasOwn(metro.options.env, 'CI'), false);
  assert.match(result.calls.at(-1).message, /http:\/\/192\.168\.1\.16:8082/);
});

test('metro-only refuses an occupied port before spawning Expo', async () => {
  const result = await launch({ args: ['--metro-only'], listenerPids: ['73\n'] });
  assert.equal(result.exitCode, 1);
  assert.match(result.errors.join('\n'), /Metro port 8082 is already in use/);
  assert.deepEqual(steps(result), ['staging', 'metro listener']);
});

test('metro-only refuses invalid staging configuration or an unverified server before printing the connection URL', async () => {
  for (const [options, reason] of [
    [{ stagingError: 'Invalid staging configuration' }, /staging configuration/],
    [{ listenerPids: ['', '73\n'] }, /port is held by an unverified process/],
    [{ listenerPids: ['', '42\n', '73\n'] }, /port is held by an unverified process/],
    [{ manifestConfig: { extra: { koinoVariant: 'production' } } }, /Unexpected staging manifest/],
    [{ manifestPort: 8081 }, /expected KOINO Dev iOS manifest/],
  ]) {
    const result = await launch({ args: ['--metro-only'], ...options });
    assert.equal(result.exitCode, 1);
    assert.match(result.errors.join('\n'), reason);
    assert.ok(!steps(result).includes('metro ready'));
  }
});

test('accepts the macOS /var alias for the isolated temporary directory', async () => {
  const result = await launch({ productsDirectory: aliasedProductsDirectory });
  assert.equal(result.exitCode, undefined, result.errors.join('\n'));
  assert.equal(result.calls.find(call => call.step === 'verify artifact').artifact, expectedArtifact);
  assert.equal(result.calls.find(call => call.step === 'install').params.at(-1), expectedArtifact);
});

test('rejects a pre-existing app reported through the temporary directory alias before building', async () => {
  const result = await launch({ productsDirectory: aliasedProductsDirectory, existingArtifact: true });
  assert.equal(result.exitCode, 1);
  assert.match(result.errors.join('\n'), /must build a new \.app inside the isolated DerivedData directory/);
  assert.ok(!steps(result).includes('build'));
});

test('rejects an app that resolves to a different path within DerivedData after building', async () => {
  const result = await launch({
    productsDirectory: aliasedProductsDirectory,
    resolvedArtifact: path.join(temp, 'DerivedData', 'unexpected', productName),
  });
  assert.equal(result.exitCode, 1);
  assert.match(result.errors.join('\n'), /does not resolve to the verified DerivedData output path/);
  assert.ok(steps(result).includes('build'));
  assert.ok(!steps(result).includes('verify artifact'));
  assert.ok(!steps(result).includes('install'));
});
