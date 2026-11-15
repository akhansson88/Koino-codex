const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const script = fs.readFileSync(path.join(__dirname, 'android-development-metro.cjs'), 'utf8');
const launcher = fs.readFileSync(path.join(__dirname, 'tailscale-android.cjs'), 'utf8');
const projectRoot = 'C:/koino-dev';
const packageId = 'com.akhansson.koinomvp.dev';
const origin = 'http://127.0.0.1:8081';
const config = { extra: { koinoVariant: 'development' } };

function manifest() {
  return {
    runtimeVersion: '2.1.0-development',
    extra: {
      expoClient: config,
      expoGo: { developer: { projectRoot }, packagerOpts: { dev: true } },
    },
    launchAsset: { url: origin + '/node_modules/expo-router/entry.bundle?platform=android&dev=true' },
  };
}

function loadMetro({ response = manifest(), listening = [] } = {}) {
  const module = { exports: {} };
  const calls = [];
  const process = Object.assign(new EventEmitter(), { execPath: 'node' });
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, kill() {} });
  const dependencies = {
    'node:net': {
      createConnection({ host, port }) {
        assert.equal(host, '127.0.0.1');
        assert.equal(port, 8081);
        const socket = Object.assign(new EventEmitter(), { setTimeout() {}, destroy() {} });
        const isListening = listening.shift();
        queueMicrotask(() => {
          if (isListening) socket.emit('connect');
          else socket.emit('error', Object.assign(new Error('Not listening'), { code: 'ECONNREFUSED' }));
        });
        return socket;
      },
    },
    'node:child_process': { spawn(command, args, options) { calls.push({ command, args, options }); return child; } },
    'node:timers/promises': { setTimeout: async () => {} },
    '../../state/store/firebase-development-config.cjs': {
      developmentAndroidId: packageId,
      developmentRuntimeVersion: '2.1.0-development',
      developmentScheme: 'koino-dev',
      validateDevelopmentConfig(value, id) { assert.equal(id, packageId); return value === config; },
    },
  };
  vm.runInNewContext(script, {
    module, process, URL, AbortSignal,
    require: Object.assign(name => dependencies[name], { resolve: () => 'expo-cli' }),
    fetch: async (url, options) => {
      assert.equal(url, origin + '/?platform=android');
      assert.equal(options.headers['expo-platform'], 'android');
      assert.equal(options.redirect, 'error');
      return { ok: true, json: async () => response };
    },
  });
  return { metro: module.exports, child, calls };
}

test('checks the Android variant, runtime, project, and exact local bundle route', async () => {
  await loadMetro().metro.verifyAndroidMetro(projectRoot);
  for (const mutate of [
    value => { value.extra.expoClient = {}; },
    value => { value.runtimeVersion = '2.1.0'; },
    value => { value.extra.expoGo.developer.projectRoot = 'C:/other-checkout'; },
    value => { value.extra.expoGo.packagerOpts.dev = false; },
    value => { value.launchAsset.url = 'https://other.example/entry.bundle?platform=android&dev=true'; },
    value => { value.launchAsset.url = origin + '/unreviewed?platform=android&dev=true'; },
    value => { value.launchAsset.url = origin + '/entry.bundle?platform=android&dev=false'; },
    value => { value.launchAsset.url = origin + '/entry.bundle?platform=android&platform=ios&dev=true'; },
  ]) {
    const response = manifest();
    mutate(response);
    await assert.rejects(loadMetro({ response }).metro.verifyAndroidMetro(projectRoot), /KOINO Dev Android manifest/);
  }
});

test('a new local Metro refuses any existing server and forces the Dev environment', async () => {
  const occupied = loadMetro({ listening: [true] });
  await assert.rejects(occupied.metro.withAndroidMetro(projectRoot, {}, assert.fail), /port 8081 is already in use/);
  assert.deepEqual(occupied.calls, []);

  const fresh = loadMetro({ listening: [false, true] });
  let verified = false;
  await fresh.metro.withAndroidMetro(projectRoot, { APP_VARIANT: 'production', NODE_ENV: 'production', CI: '1' }, () => {
    verified = true;
    fresh.child.emit('exit', 0, null);
  });
  assert.ok(verified);
  assert.equal(fresh.calls.length, 1);
  assert.equal(fresh.calls[0].options.env.APP_VARIANT, 'development');
  assert.equal(fresh.calls[0].options.env.NODE_ENV, 'development');
  assert.equal(fresh.calls[0].options.env.CI, undefined);
  assert.equal(fresh.calls[0].options.env.REACT_NATIVE_PACKAGER_HOSTNAME, '127.0.0.1');
  assert.ok(fresh.calls[0].args.includes('--localhost'));
});

async function reconnect(result, metroError) {
  const commands = [];
  await vm.runInNewContext(launcher, {
    __dirname: path.join(projectRoot, 'scripts', 'native'),
    process: { argv: ['node', 'tailscale-android.cjs', 'connect', '--port', '41234'], platform: 'win32', env: {} },
    console: { log() {}, error: message => result.errors.push(message) },
    require: name => {
      if (name === 'node:path') return path;
      if (name === 'node:fs') return {
        realpathSync: value => value, existsSync: () => true, writeFileSync() {},
        readFileSync: () => JSON.stringify({ peerId: 'android-device' }),
      };
      if (name === 'node:child_process') return {
        spawnSync(command, args) {
          commands.push({ command, args });
          if (args[0] === 'status') {
            return { status: 0, stdout: JSON.stringify({ BackendState: 'Running', Peer: {
              phone: { ID: 'android-device', OS: 'android', Online: true, TailscaleIPs: ['100.0.0.2'] },
            } }) };
          }
          return { status: 0, stdout: args.includes('get-state') ? 'device' : '' };
        },
      };
      if (name === './android-development-metro.cjs') return {
        metroPort: 8081,
        metroListening: async () => true,
        verifyAndroidMetro: async () => { if (metroError) throw new Error(metroError); },
        openAndroidDevArgs: loadMetro().metro.openAndroidDevArgs,
      };
      if (name === '../../state/store/firebase-development-config.cjs') return { requireStagingFirebaseConfig() {} };
      throw new Error(`Unexpected module ${name}`);
    },
  });
  return commands;
}

test('a Tailscale reconnect verifies the existing Metro before forwarding or opening the Dev client', async () => {
  const stale = { errors: [] };
  const refused = await reconnect(stale, 'stale Metro');
  assert.match(stale.errors[0], /stale Metro/);
  assert.ok(!refused.some(({ args }) => args.includes('reverse') || args.includes('am')));

  const safe = { errors: [] };
  const accepted = await reconnect(safe);
  assert.deepEqual(safe.errors, []);
  assert.ok(accepted.at(-2).args.includes('reverse'));
  assert.equal(accepted.at(-1).args.at(-1), packageId);
  assert.ok(accepted.at(-1).args.includes('koino-dev://expo-development-client/?url=' + encodeURIComponent(origin)));
});
