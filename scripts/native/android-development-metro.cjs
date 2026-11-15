const net = require('node:net');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const {
  developmentAndroidId, developmentRuntimeVersion, developmentScheme, validateDevelopmentConfig,
} = require('../../state/store/firebase-development-config.cjs');

const metroPort = 8081;
const metroHost = '127.0.0.1';
const metroOrigin = `http://${metroHost}:${metroPort}`;

function metroListening() {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: metroHost, port: metroPort });
    socket.setTimeout(1500, () => socket.destroy(new Error('Timed out probing the Android Metro port.')));
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', error => {
      if (error.code === 'ECONNREFUSED') resolve(false);
      else reject(error);
    });
  });
}

async function verifyAndroidMetro(root) {
  const response = await fetch(metroOrigin + '/?platform=android', {
    headers: { accept: 'application/json', 'expo-platform': 'android' },
    redirect: 'error',
    // Expo resolves the runtime and assets before answering on a cold start.
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok) throw new Error('Android Metro manifest request failed (HTTP ' + response.status + ').');
  const manifest = await response.json();
  const launchAsset = new URL(manifest?.launchAsset?.url ?? '', metroOrigin);
  if (!validateDevelopmentConfig(manifest?.extra?.expoClient, developmentAndroidId) ||
      manifest.runtimeVersion !== developmentRuntimeVersion ||
      manifest.extra?.expoGo?.developer?.projectRoot !== root ||
      manifest.extra?.expoGo?.packagerOpts?.dev !== true ||
      launchAsset.origin !== metroOrigin || launchAsset.username || launchAsset.password || launchAsset.hash ||
      !launchAsset.pathname.endsWith('.bundle') || launchAsset.searchParams.getAll('platform').join(',') !== 'android' ||
      launchAsset.searchParams.getAll('dev').join(',') !== 'true') {
    throw new Error('The running Metro server does not serve this checkout’s KOINO Dev Android manifest.');
  }
}

function openAndroidDevArgs(serial, androidUser) {
  const url = `${developmentScheme}://expo-development-client/?url=${encodeURIComponent(metroOrigin)}`;
  const profile = androidUser === undefined ? [] : ['--user', androidUser];
  return ['-s', serial, 'shell', 'am', 'start', '-W', ...profile, '-a', 'android.intent.action.VIEW', '-d', url, '-p', developmentAndroidId];
}

async function withAndroidMetro(root, env, afterVerification) {
  if (await metroListening()) {
    throw new Error('Android Metro port 8081 is already in use. Close that server before starting KOINO Dev.');
  }
  const metroEnv = {
    ...env, APP_VARIANT: 'development', NODE_ENV: 'development', EXPO_NO_DOTENV: '1', EXPO_OFFLINE: '1',
    EXPO_PACKAGER_PROXY_URL: '', REACT_NATIVE_PACKAGER_HOSTNAME: metroHost,
  };
  // Expo disables reloads in CI, including when the caller exported CI locally.
  delete metroEnv.CI;
  const child = spawn(process.execPath, [
    require.resolve('expo/bin/cli'), 'start', '--dev-client', '--localhost', '--scheme', developmentScheme, '--port', String(metroPort),
  ], {
    cwd: root,
    env: metroEnv,
    stdio: 'inherit',
  });
  let result;
  const completed = new Promise(resolve => {
    child.once('error', error => { result = { error }; resolve(); });
    child.once('exit', (code, signal) => { result = { code, signal }; resolve(); });
  });
  let stopping = false;
  function stop() {
    stopping = true;
    if (!result) child.kill();
  }
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  try {
    const stopped = () => stopping || result !== undefined || child.exitCode !== null || child.signalCode !== null;
    for (let attempt = 0; attempt < 120; attempt++) {
      if (result?.error) throw result.error;
      if (stopped()) throw new Error('Android Dev Metro stopped before verification.');
      if (await metroListening()) {
        await verifyAndroidMetro(root);
        if (stopped()) throw new Error('Android Dev Metro stopped before the device was ready.');
        await afterVerification();
        await completed;
        if (result.error) throw result.error;
        if (!stopping && result.code !== 0) throw new Error('Android Dev Metro exited (' + (result.code ?? result.signal) + ').');
        return;
      }
      await delay(500);
    }
    throw new Error('Timed out waiting for the new KOINO Dev Android Metro process.');
  } finally {
    if (!result && !stopping) stop();
    process.removeListener('SIGINT', stop);
    process.removeListener('SIGTERM', stop);
  }
}

module.exports = { metroPort, metroListening, openAndroidDevArgs, verifyAndroidMetro, withAndroidMetro };
