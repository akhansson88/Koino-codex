// Local-only source: no production entry point, dotenv files or credentials.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'functions');
const destination = path.join(root, '.codex/koino-emulator-device/functions');
if (!destination.startsWith(root + path.sep)) throw Error('Unsafe emulator source path');
fs.mkdirSync(destination, { recursive: true });
fs.cpSync(path.join(source, 'lib'), path.join(destination, 'lib'), { recursive: true });
const original = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
const local = { name: 'koino-local-emulator-only', private: true, version: original.version, main: 'lib/emulator-index.js', engines: original.engines, dependencies: original.dependencies };
fs.writeFileSync(path.join(destination, 'package.json'), JSON.stringify(local, null, 2) + '\n');
// Discovery does not inherit arbitrary parent variables. This generated file has
// one non-secret flag; no user dotenv or .secret.local is copied.
fs.copyFileSync(path.join(root, 'scripts/emulator-node-loopback.cjs'), path.join(destination, 'emulator-node-loopback.cjs'));
fs.writeFileSync(path.join(destination, '.env.local'), 'KOINO_EMULATOR_TEST_MODE=1\nNODE_OPTIONS=--require=./emulator-node-loopback.cjs\n');
fs.copyFileSync(path.join(source, 'package-lock.json'), path.join(destination, 'package-lock.json'));
const modules = path.join(destination, 'node_modules');
if (!fs.existsSync(modules)) fs.symlinkSync(path.join(source, 'node_modules'), modules, process.platform === 'win32' ? 'junction' : 'dir');
if (!fs.existsSync(path.join(destination, local.main))) throw Error('Build Functions before preparing emulator source');
console.log('Prepared demo-only Functions source (payments, production secrets and schedules excluded).');
