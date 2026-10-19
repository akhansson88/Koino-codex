// Reconcile Expo's variant with generated Android files before installing anything.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '../..');
const android = path.join(root, 'android');
const expectedId = 'com.akhansson.koinomvp.dev';
const env = {
  ...process.env,
  APP_VARIANT: 'development',
  REACT_NATIVE_PACKAGER_HOSTNAME: '127.0.0.1',
};

function run(command, args, options = {}) {
  const { capture = false, ...rest } = options;
  const result = spawnSync(command, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: capture ? 'pipe' : 'inherit',
    ...rest,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    if (capture) process.stderr.write(result.stderr || result.stdout || '');
    throw new Error(`${path.basename(command)} failed (${result.status}).`);
  }
  return result.stdout || '';
}

function sdkPath() {
  const localProperties = path.join(android, 'local.properties');
  const configured = fs.existsSync(localProperties)
    ? fs.readFileSync(localProperties, 'utf8').match(/^sdk\.dir=(.+)$/m)?.[1].trim()
    : null;
  const value = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
    || configured?.replace(/\\([\\: ])/g, '$1');
  if (!value || !fs.existsSync(value)) throw new Error('Set ANDROID_HOME to the installed Android SDK.');
  return value;
}

function verifyGeneratedProject() {
  const gradle = fs.readFileSync(path.join(android, 'app/build.gradle'), 'utf8');
  for (const key of ['namespace', 'applicationId']) {
    const value = gradle.match(new RegExp(`^\\s*${key}\\s*(?:=\\s*)?["']([^"']+)["']`, 'm'))?.[1];
    if (value !== expectedId) throw new Error(`Refusing installation: Android ${key} is ${value}, expected ${expectedId}.`);
  }
}

function refreshVariantAutolinking() {
  // RN's cache fingerprints package files, not app.config.js or build.gradle.
  // Invalidate only its generated JSON when switching the app's native package.
  const cache = path.join(android, 'build/generated/autolinking/autolinking.json');
  if (fs.existsSync(cache)) {
    const cachedId = JSON.parse(fs.readFileSync(cache, 'utf8')).project?.android?.packageName;
    if (cachedId !== expectedId) fs.unlinkSync(cache);
  }
}

function verifyApk(sdk) {
  const directory = path.join(android, 'app/build/outputs/apk/debug');
  const metadata = JSON.parse(fs.readFileSync(path.join(directory, 'output-metadata.json'), 'utf8'));
  if (metadata.applicationId !== expectedId || metadata.elements?.length !== 1) {
    throw new Error(`Refusing installation: APK output metadata does not identify ${expectedId}.`);
  }
  const apk = path.resolve(directory, metadata.elements[0].outputFile);
  if (path.dirname(apk) !== directory || !fs.existsSync(apk)) throw new Error('Invalid debug APK output path.');
  const versions = fs.readdirSync(path.join(sdk, 'build-tools'))
    .filter(value => /^\d+(?:\.\d+)*$/.test(value))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const aapt = versions.map(value => path.join(sdk, 'build-tools', value, process.platform === 'win32' ? 'aapt.exe' : 'aapt'))
    .find(value => fs.existsSync(value));
  if (!aapt) throw new Error('Android SDK build tools must include aapt to verify the APK before installation.');
  const actualId = run(aapt, ['dump', 'badging', apk], { capture: true }).match(/^package: name='([^']+)'/m)?.[1];
  if (actualId !== expectedId) throw new Error(`Refusing installation: APK package is ${actualId}, expected ${expectedId}.`);
  console.log(`Verified generated project, output metadata, and APK package: ${expectedId}`);
  return apk;
}

function main() {
  const args = process.argv.slice(2);
  const verifyOnly = args.length === 1 && args[0] === '--verify-only';
  const serialArgument = args.length === 2 && args[0] === '--device' ? args[1] : null;
  if (args.length && !verifyOnly && !serialArgument) {
    throw new Error('Usage: npm run android:dev -- [--device <adb-serial> | --verify-only]');
  }
  if (verifyOnly) {
    verifyGeneratedProject();
    verifyApk(sdkPath());
    return;
  }

  const expo = require.resolve('expo/bin/cli');
  run(process.execPath, [expo, 'prebuild', '--platform', 'android', '--no-install']);
  verifyGeneratedProject();
  refreshVariantAutolinking();
  const sdk = sdkPath();
  const adb = path.join(sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  const devices = run(adb, ['devices'], { capture: true }).split(/\r?\n/)
    .map(line => line.match(/^(\S+)\s+device$/)?.[1]).filter(Boolean);
  const serial = serialArgument || (devices.length === 1 ? devices[0] : null);
  if (!serial || !devices.includes(serial)) {
    throw new Error('Connect one authorized Android device, or select it with --device <adb-serial>.');
  }
  const supported = new Set(['arm64-v8a', 'armeabi-v7a', 'x86_64', 'x86']);
  const abi = run(adb, ['-s', serial, 'shell', 'getprop', 'ro.product.cpu.abi'], { capture: true }).trim();
  if (!supported.has(abi)) throw new Error(`Unsupported Android device architecture: ${abi}`);
  const gradleArgs = [':app:assembleDebug', `-PreactNativeArchitectures=${abi}`, '--max-workers=2', '--console=plain'];
  if (process.platform === 'win32') {
    // Only fixed arguments and an allowlisted ABI enter this Windows batch command.
    run(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `gradlew.bat ${gradleArgs.join(' ')}`], { cwd: android });
  } else {
    run(path.join(android, 'gradlew'), gradleArgs, { cwd: android });
  }
  const apk = verifyApk(sdk);
  run(adb, ['-s', serial, 'reverse', 'tcp:8081', 'tcp:8081']);
  run(process.execPath, [expo, 'run:android', '--binary', apk, '--app-id', expectedId, '--device', serial]);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
