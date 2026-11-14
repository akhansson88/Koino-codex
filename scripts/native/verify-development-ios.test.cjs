const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const tar = require('tar');
const plist = require('@expo/plist').default;
const { developmentIosId, developmentRuntimeVersion, developmentScheme } = require('../../state/store/firebase-development-config.cjs');
const { verifyGeneratedIos } = require('./verify-development-ios.cjs');

const metroAccess = {
  NSAppTransportSecurity: { NSAllowsLocalNetworking: true },
  NSLocalNetworkUsageDescription: 'KOINO Dev connects to Metro on your local network.',
};
const safeUpdates = { EXUpdatesEnabled: false, EXUpdatesRuntimeVersion: developmentRuntimeVersion };
const safeUrlTypes = [
  { CFBundleURLSchemes: [developmentScheme, developmentIosId] },
  { CFBundleURLSchemes: ['exp+koino-mvp'] },
];
const mainIosId = 'com.akhansson.koino';
const embeddedConfigPath = 'EXConstants.bundle/app.config';
const stagingConfig = {
  projectId: 'koino-staging-fixture',
  appId: '1:1234567890:web:1234567890abcdef',
  apiKey: 'AIza' + 'Z'.repeat(35),
  authDomain: 'koino-staging-fixture.firebaseapp.com',
  databaseURL: 'https://koino-staging-fixture-default-rtdb.europe-west1.firebasedatabase.app',
  functionsRegion: 'europe-west1',
};
const templateFiles = [
  'ios/HelloWorld.xcodeproj/project.pbxproj',
  'ios/HelloWorld/Supporting/Expo.plist',
  'ios/HelloWorld/Info.plist',
  'ios/HelloWorld/AppDelegate.swift',
];
const template = (async () => {
  const source = new Map();
  const tarball = path.join(path.dirname(require.resolve('expo/package.json')), 'template.tgz');
  await tar.t({ file: tarball, onReadEntry(entry) {
    const filename = entry.path.replace(/^package\//, '');
    if (!templateFiles.includes(filename)) return;
    const chunks = [];
    entry.on('data', chunk => chunks.push(chunk));
    entry.on('end', () => source.set(filename, Buffer.concat(chunks).toString('utf8')));
  } });
  assert.equal(source.size, templateFiles.length);
  return source;
})();

function fixtureDirectory(t) {
  const temp = fs.realpathSync(os.tmpdir());
  const fixture = fs.mkdtempSync(path.join(temp, 'koino-ios-verification-'));
  t.after(() => {
    const resolved = fs.realpathSync(fixture);
    assert.equal(path.dirname(resolved), temp);
    assert.ok(path.basename(resolved).startsWith('koino-ios-verification-'));
    fs.rmSync(resolved, { recursive: true });
  });
  return fixture;
}

function write(project, relativeFilename, contents) {
  const filename = path.join(project, relativeFilename);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, contents);
}

async function generatedFixture(t) {
  const project = fixtureDirectory(t);
  for (const [filename, source] of await template) {
    write(project, filename, source.replaceAll('org.name.HelloWorld', developmentIosId));
  }
  const infoPlist = plist.parse((await template).get(templateFiles[2]));
  write(project, templateFiles[2], plist.build({ ...infoPlist, ...metroAccess, CFBundleURLTypes: safeUrlTypes }));
  write(project, templateFiles[1], plist.build(safeUpdates));
  return project;
}

test('verifies generated Xcode settings and Expo plists without building', async t => {
  const project = await generatedFixture(t);
  assert.doesNotThrow(() => verifyGeneratedIos(project));
  const projectFile = path.join(project, templateFiles[0]);
  const original = fs.readFileSync(projectFile, 'utf8');
  fs.writeFileSync(projectFile, original.replace(developmentIosId, mainIosId));
  assert.throws(() => verifyGeneratedIos(project), /Xcode (Debug|Release) bundle ID/);

  fs.writeFileSync(projectFile, original);
  write(project, templateFiles[2], plist.build({ CFBundleIdentifier: mainIosId }));
  assert.throws(() => verifyGeneratedIos(project), /generated Info.plist bundle ID/);
});

test('rejects stale generated Firebase files and Xcode references', async t => {
  const project = await generatedFixture(t);
  const stalePlist = 'ios/HelloWorld/GoogleService-Info.plist';
  write(project, stalePlist, '<plist/>');
  assert.throws(() => verifyGeneratedIos(project), /native GoogleService-Info.plist is present/);
  fs.unlinkSync(path.join(project, stalePlist));

  fs.appendFileSync(path.join(project, templateFiles[0]), '\n/* stale reference GoogleService-Info.plist */\n');
  assert.throws(() => verifyGeneratedIos(project), /Xcode project references/);
});

test('rejects stale URL schemes in the generated native project', async t => {
  const project = await generatedFixture(t);
  const infoPlist = plist.parse(fs.readFileSync(path.join(project, templateFiles[2]), 'utf8'));
  for (const schemes of [['koino'], [developmentScheme, 'Koino-Emulator'], [developmentScheme, mainIosId]]) {
    write(project, templateFiles[2], plist.build({ ...infoPlist, CFBundleURLTypes: [{ CFBundleURLSchemes: schemes }] }));
    assert.throws(() => verifyGeneratedIos(project), /generated Info.plist must register koino-dev/);
  }
});

const rejectedUpdates = [
  { ...safeUpdates, EXUpdatesEnabled: true },
  { ...safeUpdates, EXUpdatesEnabled: 'false' },
  { EXUpdatesRuntimeVersion: developmentRuntimeVersion },
  { ...safeUpdates, EXUpdatesURL: 'https://updates.example.invalid' },
  { ...safeUpdates, EXUpdatesRuntimeVersion: '2.1.0' },
];

test('rejects stale, partial or production Expo Updates metadata in generated source', async t => {
  const project = await generatedFixture(t);
  for (const config of rejectedUpdates) {
    write(project, templateFiles[1], plist.build(config));
    assert.throws(() => verifyGeneratedIos(project), /generated Expo.plist must disable Expo Updates/);
  }
});

function loadStagingValidator(staging) {
  const filename = require.resolve('../../state/store/firebase-development-config.cjs');
  const fromConfig = require('node:module').createRequire(filename);
  const fixtureModule = { exports: {} };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), {
    module: fixtureModule,
    require: name => name === './firebase-staging.json' ? staging : fromConfig(name),
  });
  return fixtureModule.exports;
}

function loadArtifactVerifier(readPlist, staging = stagingConfig) {
  const filename = path.join(__dirname, 'verify-development-ios.cjs');
  const source = fs.readFileSync(filename, 'utf8');
  const fixtureModule = { exports: {} };
  vm.runInNewContext(source, {
    module: fixtureModule,
    require(name) {
      if (name === '../../state/store/firebase-development-config.cjs') return loadStagingValidator(staging);
      if (name !== 'node:child_process') return require(name);
      return {
        execFileSync: (command, args) => {
          assert.equal(command, '/usr/bin/plutil');
          assert.deepEqual(Array.from(args).slice(0, -1), ['-convert', 'json', '-o', '-']);
          return JSON.stringify(readPlist(args.at(-1)));
        },
      };
    },
  });
  return fixtureModule.exports.verifyBuiltIos;
}

function compiledFixture(t) {
  const bundle = path.join(fixtureDirectory(t), 'KOINO Dev.app');
  const appConfig = {
    scheme: developmentScheme,
    ios: { bundleIdentifier: developmentIosId },
    android: { package: 'com.akhansson.koinomvp.dev' },
    runtimeVersion: developmentRuntimeVersion,
    updates: { enabled: false },
    extra: { koinoVariant: 'development', koinoFirebase: stagingConfig },
  };
  write(bundle, embeddedConfigPath, JSON.stringify(appConfig));
  const infoPlist = {
    CFBundleIdentifier: developmentIosId,
    CFBundleURLTypes: safeUrlTypes,
    ...metroAccess,
  };
  return { bundle, infoPlist, appConfig };
}

test('checks the built .app identifier, disabled updates, and native Firebase resources', t => {
  const { bundle, infoPlist } = compiledFixture(t);
  let expoPlist = safeUpdates;
  const verifyBuiltIos = loadArtifactVerifier(filename => path.basename(filename) === 'Info.plist' ? infoPlist : expoPlist);
  assert.doesNotThrow(() => verifyBuiltIos(bundle));

  infoPlist.CFBundleIdentifier = mainIosId;
  assert.throws(() => verifyBuiltIos(bundle), /built Info.plist bundle ID/);
  infoPlist.CFBundleIdentifier = developmentIosId;
  infoPlist.NSAppTransportSecurity = { NSAllowsLocalNetworking: false };
  assert.throws(() => verifyBuiltIos(bundle), /must allow local Metro networking/);
  infoPlist.NSAppTransportSecurity = { NSAllowsLocalNetworking: true, NSAllowsArbitraryLoads: true };
  assert.throws(() => verifyBuiltIos(bundle), /without enabling arbitrary loads/);
  Object.assign(infoPlist, metroAccess);
  for (const config of rejectedUpdates) {
    expoPlist = config;
    assert.throws(() => verifyBuiltIos(bundle), /built Expo.plist must disable Expo Updates/);
  }
  assert.throws(() => loadArtifactVerifier(() => { throw new Error(); })(bundle), /could not read.*with macOS plutil/);

  write(bundle, 'Resources/en.lproj/GoogleService-Info.plist', '<plist/>');
  assert.throws(() => verifyBuiltIos(bundle), /native GoogleService-Info.plist is present/);
});

test('refuses absent Dev URL schemes and case-insensitive Production or Emulator schemes', t => {
  const { bundle, infoPlist } = compiledFixture(t);
  const verifyBuiltIos = loadArtifactVerifier(filename => path.basename(filename) === 'Info.plist' ? infoPlist : safeUpdates);
  for (const schemes of [[], [developmentIosId], ...['KOINO', 'Koino-Emulator', mainIosId, mainIosId + '.emulator'].map(scheme => [developmentScheme, scheme])]) {
    infoPlist.CFBundleURLTypes = [{ CFBundleURLSchemes: schemes }];
    assert.throws(() => verifyBuiltIos(bundle), /built Info.plist must register koino-dev/);
  }
});

test('refuses stale, mixed, or missing embedded Expo configuration even with Dev native plists', t => {
  const { bundle, infoPlist, appConfig } = compiledFixture(t);
  const readPlist = filename => path.basename(filename) === 'Info.plist' ? infoPlist : safeUpdates;
  const verifyBuiltIos = loadArtifactVerifier(readPlist);
  assert.throws(() => loadArtifactVerifier(readPlist, null)(bundle), /requires a reviewed Firebase staging configuration/);
  for (const invalid of [
    { ...appConfig, extra: { koinoVariant: 'production' } },
    { ...appConfig, extra: { koinoVariant: 'development', koinoFirebase: { ...stagingConfig, projectId: 'koino-codex' } } },
    { ...appConfig, updates: { enabled: false, url: 'https://u.expo.dev/production' } },
    { ...appConfig, ios: { bundleIdentifier: mainIosId } },
    { ...appConfig, scheme: 'koino-emulator' },
  ]) {
    write(bundle, embeddedConfigPath, JSON.stringify(invalid));
    assert.throws(() => verifyBuiltIos(bundle), /KOINO Dev (requires matching native and bundle configuration|Firebase configuration does not match)/);
  }
  write(bundle, embeddedConfigPath, '{');
  assert.throws(() => verifyBuiltIos(bundle), /could not read embedded Expo configuration/);
  fs.unlinkSync(path.join(bundle, embeddedConfigPath));
  assert.throws(() => verifyBuiltIos(bundle), /could not read embedded Expo configuration/);
});
