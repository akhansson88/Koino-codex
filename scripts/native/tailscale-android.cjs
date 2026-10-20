// Connect only to a known Android peer in the current private tailnet.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const configPath = path.join(root, '.codex/tailscale-android.local.json');
const args = process.argv.slice(2);
const mode = args.shift() || 'connect';
const portIndex = args.indexOf('--port');
const portOverride = portIndex >= 0 ? Number(args[portIndex + 1]) : null;
if (!['connect', 'start', 'logs'].includes(mode) ||
    (args.length && !(args.length === 2 && portIndex === 0 && Number.isInteger(portOverride) && portOverride > 0 && portOverride <= 65535))) {
  console.error('Usage: node scripts/native/tailscale-android.cjs [connect|start|logs] [--port <wireless-debugging-port>]');
  process.exit(1);
}
function run(command, parameters, optional = false) {
  const result = spawnSync(command, parameters, { cwd: root, encoding: 'utf8', timeout: 20000 });
  if (!optional && (result.error || result.status !== 0)) {
    throw new Error(result.error?.message || result.stderr || result.stdout || `${command} failed`);
  }
  return result.stdout || '';
}
function launch(serial) {
  run('adb', ['-s', serial, 'shell', 'am', 'start', '-a', 'android.intent.action.VIEW', '-d',
    'koino-dev://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A8081', '-p', 'com.akhansson.koinomvp.dev']);
}
async function metroRunning() {
  try {
    const response = await fetch('http://127.0.0.1:8081/status', { signal: AbortSignal.timeout(1500) });
    return (await response.text()).includes('packager-status:running');
  } catch { return false; }
}
async function main() {
  if (!fs.existsSync(configPath)) throw new Error('Missing .codex/tailscale-android.local.json; see README Tailscale setup.');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const installed = 'C:\\Program Files\\Tailscale\\tailscale.exe';
  const tailscale = process.platform === 'win32' && fs.existsSync(installed) ? installed : 'tailscale';
  const status = JSON.parse(run(tailscale, ['status', '--json']));
  if (status.BackendState !== 'Running') throw new Error('Connect Tailscale on this computer first.');
  const peer = Object.values(status.Peer || {}).find(p => p.ID === config.peerId && p.OS === 'android');
  if (!peer?.Online) throw new Error('The configured Android peer is offline. Open Tailscale on the phone and connect.');
  const ip = peer.TailscaleIPs.find(value => /^100\./.test(value));
  if (!ip) throw new Error('The Android peer has no Tailscale IPv4 address.');
  const candidates = [];
  if (portOverride) candidates.push(portOverride);
  else {
    // Discovery is only a port hint; all actual ADB connections use the tailnet IP.
    const mdns = run('adb', ['mdns', 'services'], true);
    for (const line of mdns.split(/\r?\n/)) {
      if (line.includes(`adb-${config.usbSerial}-`) && line.includes('_adb-tls-connect._tcp')) {
        const port = Number(line.match(/:(\d+)\s*$/)?.[1]);
        if (port) candidates.push(port);
      }
    }
    candidates.push(config.port);
  }
  let serial;
  for (const port of [...new Set(candidates)].filter(p => Number.isInteger(p) && p > 0 && p <= 65535)) {
    const target = `${ip}:${port}`;
    console.log(run('adb', ['connect', target], true).trim());
    if (run('adb', ['-s', target, 'get-state'], true).trim() === 'device') {
      serial = target;
      config.port = port;
      fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
      break;
    }
  }
  if (!serial) throw new Error('Enable Wireless debugging on the phone. Read its IP address and port, then retry with --port <port>. If pairing was revoked, pair this computer again.');
  run('adb', ['-s', serial, 'reverse', 'tcp:8081', 'tcp:8081']);
  console.log(`KOINO Android debugger: ${serial}; Metro forwarded to this computer on port 8081.`);
  if (mode === 'logs') {
    const child = spawn('adb', ['-s', serial, 'logcat', '*:S', 'ReactNative:V', 'ReactNativeJS:V', 'AndroidRuntime:E', 'Expo:V'], { stdio: 'inherit' });
    child.on('error', error => { console.error(error.message); process.exitCode = 1; });
    child.on('exit', code => { process.exitCode = code || 0; });
    return;
  }
  if (await metroRunning()) { launch(serial); return; }
  if (mode !== 'start') { console.log('Run npm run start:tailscale to start Metro.'); return; }
  const child = spawn(process.execPath, [require.resolve('expo/bin/cli'), 'start', '--dev-client', '--localhost', '--port', '8081'], {
    cwd: root, stdio: 'inherit', env: { ...process.env, APP_VARIANT: 'development', ANDROID_SERIAL: serial, REACT_NATIVE_PACKAGER_HOSTNAME: '127.0.0.1' },
  });
  const poll = setInterval(async () => {
    if (await metroRunning()) { clearInterval(poll); try { launch(serial); } catch (error) { console.error(error.message); } }
  }, 2000);
  const deadline = setTimeout(() => clearInterval(poll), 120000);
  child.on('exit', code => { clearInterval(poll); clearTimeout(deadline); process.exitCode = code || 0; });
  child.on('error', error => { clearInterval(poll); clearTimeout(deadline); console.error(error.message); process.exitCode = 1; });
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
