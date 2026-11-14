const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { execFileSync, spawn, spawnSync } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const { IOSConfig } = require('@expo/config-plugins');
const {
  developmentIosId, developmentRuntimeVersion, developmentScheme,
  requireStagingFirebaseConfig, validateDevelopmentConfig,
} = require('../../state/store/firebase-development-config.cjs');
const { verifyGeneratedIos, verifyBuiltIos } = require('./verify-development-ios.cjs');

const xcrun = '/usr/bin/xcrun';

function isInside(directory, filename) {
  const relative = path.relative(directory, filename);
  return relative !== '' && relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

function nativeProject(root) {
  verifyGeneratedIos(root);
  const ios = path.join(root, 'ios');
  const projects = IOSConfig.Paths.getAllXcodeProjectPaths(root).filter(project => path.dirname(project) === ios);
  const schemes = IOSConfig.Paths.findSchemeNames(root);
  if (projects.length !== 1 || schemes.length !== 1) {
    throw new Error('Expected one generated iOS Xcode project and one shared scheme. Use a clean Dev checkout.');
  }
  const workspace = projects[0].replace(/\.xcodeproj$/, '.xcworkspace');
  if (workspace === projects[0] || !fs.existsSync(workspace) || !fs.statSync(workspace).isDirectory()) {
    throw new Error('The Dev Xcode workspace is missing. Run CocoaPods setup for the generated Dev project.');
  }
  for (const name of ['.xcode.env', '.xcode.env.local']) {
    const file = path.join(ios, name);
    if (fs.existsSync(file) && /^[^#\r\n]*\bAPP_VARIANT\b/m.test(fs.readFileSync(file, 'utf8'))) {
      throw new Error('Remove the APP_VARIANT setting from ios/' + name + '. The launcher supplies the Dev variant.');
    }
  }
  return { workspace, scheme: schemes[0] };
}

function verifyPhone(udid, scratch, options) {
  const output = path.join(scratch, 'devices.json');
  execFileSync(xcrun, ['devicectl', 'list', 'devices', '--json-output', output, '--timeout', '5'], options);
  const devices = JSON.parse(fs.readFileSync(output, 'utf8')).result?.devices;
  const matches = Array.isArray(devices)
    ? devices.filter(device => device.hardwareProperties?.udid?.toUpperCase() === udid.toUpperCase())
    : [];
  const [phone] = matches;
  const hardware = phone?.hardwareProperties;
  const connection = phone?.connectionProperties;
  const properties = phone?.deviceProperties;
  if (matches.length !== 1 || hardware.platform !== 'iOS' || !/^iPhone\d+,\d+$/.test(hardware.productType ?? '') ||
      (hardware.reality && hardware.reality !== 'physical') || connection?.transportType === 'sameMachine' ||
      connection?.pairingState !== 'paired' || connection.tunnelState === 'unavailable' ||
      !(parseInt(properties?.osVersionNumber, 10) >= 17) || properties?.developerModeStatus === 'disabled') {
    throw new Error('Select a paired physical iPhone running iOS 17 or later, with Developer Mode enabled.');
  }
  return hardware.udid;
}

function appFromBuildSettings(output, derivedData) {
  const rows = JSON.parse(output);
  const apps = Array.isArray(rows) ? rows.filter(row => row.buildSettings?.WRAPPER_EXTENSION === 'app') : [];
  const settings = apps[0]?.buildSettings;
  if (apps.length !== 1 || settings.PRODUCT_BUNDLE_IDENTIFIER !== developmentIosId ||
      settings.CONFIGURATION !== 'Debug' || settings.PLATFORM_NAME !== 'iphoneos' ||
      settings.APP_VARIANT !== 'development') {
    throw new Error('Effective Xcode settings must identify one KOINO Dev iPhone Debug app.');
  }
  const { TARGET_BUILD_DIR: directory, FULL_PRODUCT_NAME: name } = settings;
  if (typeof directory !== 'string' || !path.isAbsolute(directory) ||
      typeof name !== 'string' || path.basename(name) !== name || path.extname(name) !== '.app') {
    throw new Error('Xcode did not report a valid .app output path.');
  }
  const artifact = path.join(directory, name);
  if (!isInside(derivedData, artifact) || fs.existsSync(artifact)) {
    throw new Error('Xcode must build a new .app inside the isolated DerivedData directory.');
  }
  return artifact;
}

function run(args, options) {
  const result = spawnSync(xcrun, args, { ...options, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(args[0] + ' failed (' + (result.status ?? result.signal) + ').');
}

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, () => {
      const { port } = server.address();
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function ownsMetroPort(child, port) {
  const listener = spawnSync('/usr/sbin/lsof', ['-nP', '-iTCP:' + port, '-sTCP:LISTEN', '-t'], { encoding: 'utf8' });
  if (listener.error) throw listener.error;
  if (listener.status === 1 && !listener.stdout.trim() && !listener.stderr.trim()) return false;
  const pids = new Set(listener.stdout.trim().split(/\s+/));
  if (listener.status !== 0 || pids.size !== 1 || !pids.has(String(child.pid))) {
    throw new Error('Metro port is held by an unverified process.');
  }
  return true;
}

async function verifyMetro(child, port, lanHost, root, hasStopped) {
  for (let attempt = 0; attempt < 60; attempt++) {
    if (hasStopped()) throw new Error('Dev Metro stopped before verification.');
    if (ownsMetroPort(child, port)) {
      const response = await fetch('http://127.0.0.1:' + port + '/?platform=ios', {
        headers: { accept: 'application/json', 'expo-platform': 'ios' },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('Dev Metro manifest request failed (HTTP ' + response.status + ').');
      const manifest = await response.json();
      const launchAsset = new URL(manifest?.launchAsset?.url ?? '', 'http://127.0.0.1');
      if (!validateDevelopmentConfig(manifest?.extra?.expoClient, developmentIosId) ||
          manifest.runtimeVersion !== developmentRuntimeVersion ||
          manifest.extra?.expoGo?.developer?.projectRoot !== root ||
          manifest.extra?.expoGo?.packagerOpts?.dev !== true ||
          launchAsset.origin !== 'http://' + lanHost + ':' + port || launchAsset.username || launchAsset.password ||
          launchAsset.searchParams.get('platform') !== 'ios' || launchAsset.searchParams.get('dev') !== 'true' ||
          hasStopped() || !ownsMetroPort(child, port)) {
        throw new Error('Metro did not serve the expected KOINO Dev iOS manifest.');
      }
      return;
    }
    await delay(500);
  }
  throw new Error('Timed out waiting for the new KOINO Dev Metro process.');
}

async function installWithMetro(udid, artifact, root, options) {
  const interfaces = os.networkInterfaces();
  const lan = [interfaces.en0 ?? [], ...Object.values(interfaces)].flat()
    .find(address => address.family === 'IPv4' && !address.internal && !address.address.startsWith('169.254.'));
  if (!lan) throw new Error('Connect the Mac and iPhone to a reachable local IPv4 network.');
  const port = await availablePort();
  const env = {
    ...options.env, CI: '1', EXPO_OFFLINE: '1', EXPO_NO_DOTENV: '1',
    EXPO_PACKAGER_PROXY_URL: '', REACT_NATIVE_PACKAGER_HOSTNAME: lan.address,
  };
  const child = spawn(process.execPath, [
    require.resolve('expo/bin/cli'), 'start', '--dev-client', '--lan', '--scheme', developmentScheme, '--port', String(port),
  ], { ...options, env, stdio: 'inherit' });
  let result;
  const completed = new Promise(resolve => {
    child.once('error', error => { result = { error }; resolve(); });
    child.once('exit', (code, signal) => { result = { code, signal }; resolve(); });
  });
  let stopping = false;
  const stop = () => {
    stopping = true;
    if (!result) child.kill();
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    const hasStopped = () => stopping || result !== undefined || child.exitCode !== null || child.signalCode !== null;
    await verifyMetro(child, port, lan.address, root, hasStopped);
    if (hasStopped()) throw new Error('Dev Metro stopped before installation.');
    run(['devicectl', 'device', 'install', 'app', '--device', udid, artifact], options);
    console.log('Open KOINO Dev on the selected iPhone and enter http://' + lan.address + ':' + port + ' in the Dev Client.');
    await completed;
    if (result.error) throw result.error;
    if (!stopping && result.code !== 0) throw new Error('Dev Metro exited (' + (result.code ?? result.signal) + ').');
  } finally {
    if (!result && !stopping) stop();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

async function main() {
  const [flag, requestedDevice, mode, ...extra] = process.argv.slice(2);
  if (process.platform !== 'darwin') throw new Error('KOINO iOS Dev requires macOS with Xcode.');
  if (flag !== '--device' || !/^(?:[a-f0-9]{8}-[a-f0-9]{16}|[a-f0-9]{40})$/i.test(requestedDevice ?? '') ||
      (mode !== undefined && mode !== '--build-only') || extra.length) {
    throw new Error('Usage: npm run ios:dev -- --device <iPhone UDID> [--build-only]');
  }

  requireStagingFirebaseConfig();
  const root = fs.realpathSync(path.resolve(__dirname, '../..'));
  const { workspace, scheme } = nativeProject(root);
  const scratch = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'koino-ios-dev-'));
  const derivedData = path.join(scratch, 'DerivedData');
  const options = {
    cwd: root, encoding: 'utf8',
    env: {
      ...process.env, APP_VARIANT: 'development', NODE_ENV: 'development', EXPO_NO_DOTENV: '1',
      RCT_NO_LAUNCH_PACKAGER: 'true', SKIP_BUNDLING: '1',
    },
  };
  let keepArtifact = false;
  try {
    const udid = verifyPhone(requestedDevice, scratch, options);
    const build = [
      'xcodebuild', '-workspace', workspace, '-scheme', scheme, '-configuration', 'Debug',
      '-destination', 'id=' + udid, '-derivedDataPath', derivedData, 'APP_VARIANT=development',
    ];
    const artifact = appFromBuildSettings(
      execFileSync(xcrun, [...build, '-showBuildSettings', '-json'], { ...options, maxBuffer: 8 * 1024 * 1024 }),
      derivedData,
    );
    run([...build, 'build'], options);
    const realArtifact = fs.realpathSync(artifact);
    if (realArtifact !== artifact || !isInside(derivedData, realArtifact)) {
      throw new Error('The built .app does not resolve to the verified DerivedData output path.');
    }
    verifyBuiltIos(realArtifact);
    console.log('Verified iOS Dev artifact: ' + realArtifact);
    if (mode === '--build-only') {
      keepArtifact = true;
      return;
    }
    await installWithMetro(udid, realArtifact, root, options);
  } finally {
    if (!keepArtifact) fs.rmSync(scratch, { recursive: true, force: true });
  }
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
