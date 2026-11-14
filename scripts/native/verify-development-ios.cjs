const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { IOSConfig } = require('@expo/config-plugins');
const plist = require('@expo/plist').default;
const { developmentIosId, developmentRuntimeVersion, developmentScheme, validateDevelopmentConfig } = require('../../state/store/firebase-development-config.cjs');

const excludedSourceDirectories = new Set(['Pods', 'build', 'Carthage', 'vendor', 'node_modules']);
const googleServicesPlist = /^GoogleService-Info(?:[-_.].+)?\.plist$/i;
const otherKoinoSchemes = new Set(['koino', 'koino-emulator', 'com.akhansson.koino', 'com.akhansson.koino.emulator']);

function reject(message) {
  throw new Error('Refusing iOS Dev configuration: ' + message);
}

function verifyBundleId(bundleId, location) {
  if (bundleId !== developmentIosId) {
    reject(location + ' must identify ' + developmentIosId + '.');
  }
}

function verifyUpdates(config, location) {
  if (!config || config.EXUpdatesEnabled !== false ||
      Object.hasOwn(config, 'EXUpdatesURL') || config.EXUpdatesRuntimeVersion !== developmentRuntimeVersion) {
    reject(location + ' must disable Expo Updates, omit the update URL, and use the Dev runtime.');
  }
}

function verifyNoGoogleServicesPlist(directory, excludedDirectories = new Set()) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (googleServicesPlist.test(entry.name)) {
      reject('native GoogleService-Info.plist is present in ' + directory + '.');
    }
    if (entry.isDirectory() && !excludedDirectories.has(entry.name)) {
      verifyNoGoogleServicesPlist(path.join(directory, entry.name), excludedDirectories);
    }
  }
}

function verifyGeneratedIos(projectRoot) {
  const iosDirectory = path.join(projectRoot, 'ios');
  if (!fs.existsSync(iosDirectory)) reject('no generated iOS project was found.');
  verifyNoGoogleServicesPlist(iosDirectory, excludedSourceDirectories);
  const projectFile = IOSConfig.Paths.getPBXProjectPath(projectRoot);
  if (/GoogleService-Info(?:[-_.][\w.-]+)?\.plist/i.test(fs.readFileSync(projectFile, 'utf8'))) {
    reject('the Xcode project references a native GoogleService-Info.plist.');
  }

  for (const buildConfiguration of ['Debug', 'Release']) {
    const bundleId = IOSConfig.BundleIdentifier.getBundleIdentifierFromPbxproj(projectRoot, { buildConfiguration });
    verifyBundleId(bundleId, 'Xcode ' + buildConfiguration + ' bundle ID');
  }
  const infoPlist = plist.parse(fs.readFileSync(IOSConfig.Paths.getInfoPlistPath(projectRoot), 'utf8'));
  if (infoPlist?.CFBundleIdentifier !== '$(PRODUCT_BUNDLE_IDENTIFIER)') {
    verifyBundleId(infoPlist?.CFBundleIdentifier, 'generated Info.plist bundle ID');
  }
  verifySchemes(infoPlist, 'generated Info.plist');
  verifyMetroAccess(infoPlist, 'generated Info.plist');
  const expoPlist = plist.parse(fs.readFileSync(IOSConfig.Paths.getExpoPlistPath(projectRoot), 'utf8'));
  verifyUpdates(expoPlist, 'generated Expo.plist');
}

function readBuiltPlist(filename) {
  try {
    return JSON.parse(execFileSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', filename], {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }));
  } catch {
    reject('could not read ' + filename + ' with macOS plutil.');
  }
}

function verifySchemes(infoPlist, location) {
  const schemes = IOSConfig.Scheme.getSchemesFromPlist(infoPlist);
  if (!schemes.includes(developmentScheme) ||
      schemes.some(scheme => typeof scheme !== 'string' || otherKoinoSchemes.has(scheme.toLowerCase()))) {
    reject(location + ' must register ' + developmentScheme + ' and omit production and Emulator URL schemes.');
  }
}

function verifyMetroAccess(infoPlist, location) {
  const ats = infoPlist?.NSAppTransportSecurity;
  if (ats?.NSAllowsLocalNetworking !== true || ats.NSAllowsArbitraryLoads === true ||
      !infoPlist.NSLocalNetworkUsageDescription?.trim()) {
    reject(location + ' must allow local Metro networking without enabling arbitrary loads.');
  }
}

function verifyEmbeddedConfig(appDirectory, bundleId) {
  const resources = path.join(appDirectory, 'EXConstants.bundle');
  const filename = path.join(resources, 'app.config');
  let config;
  try {
    if (!fs.lstatSync(resources).isDirectory() || !fs.lstatSync(filename).isFile()) {
      throw new Error('Invalid embedded configuration path.');
    }
    config = JSON.parse(fs.readFileSync(filename, 'utf8'));
  } catch {
    reject('could not read embedded Expo configuration at EXConstants.bundle/app.config.');
  }
  if (!validateDevelopmentConfig(config, bundleId)) reject('embedded Expo configuration must identify KOINO Dev.');
}

function verifyBuiltIos(appDirectory) {
  if (path.extname(appDirectory) !== '.app' || !fs.lstatSync(appDirectory).isDirectory()) {
    reject('supply the path to the built .app directory.');
  }
  verifyNoGoogleServicesPlist(appDirectory);
  const infoPlist = readBuiltPlist(path.join(appDirectory, 'Info.plist'));
  verifyBundleId(infoPlist?.CFBundleIdentifier, 'built Info.plist bundle ID');
  verifySchemes(infoPlist, 'built Info.plist');
  verifyMetroAccess(infoPlist, 'built Info.plist');
  verifyUpdates(readBuiltPlist(path.join(appDirectory, 'Expo.plist')), 'built Expo.plist');
  verifyEmbeddedConfig(appDirectory, infoPlist.CFBundleIdentifier);
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.length && !(args.length === 2 && args[0] === '--app')) {
      throw new Error('Usage: node scripts/native/verify-development-ios.cjs [--app <path-to-.app>]');
    }
    verifyGeneratedIos(path.resolve(__dirname, '../..'));
    if (args.length) verifyBuiltIos(path.resolve(args[1]));
    console.log(args.length
      ? 'Verified generated iOS Dev source, .app identity and URL schemes, embedded Expo configuration, Expo Updates, and absence of native Firebase configuration.'
      : 'Verified generated iOS Dev source. Verify the built .app before installation.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { verifyGeneratedIos, verifyBuiltIos };
