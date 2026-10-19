const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'run-development-android.cjs'), 'utf8');
const dev = 'com.akhansson.koinomvp.dev';
const main = 'com.akhansson.koinomvp';

function verify({ namespace = dev, applicationId = dev, metadataId = dev, apkId = dev } = {}) {
  const commands = [];
  const errors = [];
  const processState = {
    argv: ['node', 'run-development-android.cjs', '--verify-only'],
    env: { ANDROID_HOME: 'C:/test-android-sdk' },
    platform: 'win32',
    stderr: { write: value => errors.push(value) },
  };
  const fileSystem = {
    existsSync: () => true,
    readdirSync: () => ['36.0.0'],
    readFileSync: filename => {
      if (filename.endsWith('build.gradle')) return `namespace '${namespace}'\n applicationId '${applicationId}'`;
      if (filename.endsWith('output-metadata.json')) {
        return JSON.stringify({ applicationId: metadataId, elements: [{ outputFile: 'app-debug.apk' }] });
      }
      if (filename.endsWith('local.properties')) return 'sdk.dir=C:/test-android-sdk';
      throw new Error(`Unexpected file read: ${filename}`);
    },
  };
  vm.runInNewContext(source, {
    __dirname,
    process: processState,
    console: { log: () => {}, error: value => errors.push(value) },
    require: name => {
      if (name === 'node:fs') return fileSystem;
      if (name === 'node:path') return path;
      if (name === 'node:child_process') return {
        spawnSync: (command, args) => {
          commands.push({ command, args });
          return { status: 0, stdout: `package: name='${apkId}' versionCode='21'\n` };
        },
      };
      throw new Error(`Unexpected module: ${name}`);
    },
  });
  return { commands, errors, exitCode: processState.exitCode };
}

test('refuses a stale main namespace or application ID before inspecting an APK', () => {
  for (const values of [{ namespace: main }, { applicationId: main }]) {
    const result = verify(values);
    assert.equal(result.exitCode, 1);
    assert.equal(result.commands.length, 0);
    assert.match(result.errors[0], /Refusing installation/);
  }
});

test('refuses stale output metadata and a main APK disguised by development metadata', () => {
  const metadata = verify({ metadataId: main });
  assert.equal(metadata.exitCode, 1);
  assert.equal(metadata.commands.length, 0);
  const apk = verify({ apkId: main });
  assert.equal(apk.exitCode, 1);
  assert.equal(apk.commands.length, 1);
  assert.deepEqual(Array.from(apk.commands[0].args).slice(0, 2), ['dump', 'badging']);
  assert.match(apk.errors[0], /APK package is com\.akhansson\.koinomvp,/);
});

test('verification succeeds only when project, metadata, and compiled APK identify development', () => {
  const result = verify();
  assert.equal(result.exitCode, undefined);
  assert.deepEqual(result.errors, []);
  assert.equal(result.commands.length, 1);
  assert.match(result.commands[0].command, /aapt\.exe$/);
});
