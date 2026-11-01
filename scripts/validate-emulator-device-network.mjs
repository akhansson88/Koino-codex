import assert from "node:assert/strict";
import net from "node:net";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { validateNetwork, createRelays } from "./emulator-device-network.mjs";
const options = process.argv.slice(2);
assert.ok(options.every(option => option === "--validation-only"), "Unexpected networking test option");
const validationOnly = options.includes("--validation-only");
const supplied = { network: "Tailscale", listenAddress: "100.100.67.44", deviceAddresses: ["100.108.62.79", "100.102.137.47"] };
validateNetwork(supplied);

validateNetwork({ network: "Loopback", listenAddress: "127.0.0.1" });
validateNetwork({ network: "Lan", listenAddress: "192.168.0.13", deviceAddresses: ["192.168.0.20", "192.168.0.21"] });
validateNetwork({ network: "Tailscale", listenAddress: "100.90.1.2", deviceAddresses: ["100.90.1.3", "100.90.1.4"] });
for (const config of [
  { network: "Loopback", listenAddress: "0.0.0.0" },
  { network: "Lan", listenAddress: "8.8.8.8", deviceAddresses: ["10.0.0.2", "10.0.0.3"] },
  { network: "Lan", listenAddress: "192.168.0.13", deviceAddresses: ["192.168.0.20", "192.168.0.20"] },
  { network: "Lan", listenAddress: "192.168.0.13", deviceAddresses: ["192.168.0.20"] },
  { network: "Tailscale", listenAddress: "192.168.0.13", deviceAddresses: ["100.90.1.3", "100.90.1.4"] },
  { network: "Lan", listenAddress: "192.168.0.13", deviceAddresses: ["100.90.1.3", "100.90.1.4"] },
]) assert.throws(() => validateNetwork(config));
const config = JSON.parse(readFileSync(new URL("../firebase.emulator-device.json", import.meta.url), "utf8"));
for (const name of ["auth", "database", "functions", "hub", "logging"]) assert.equal(config.emulators[name].host, "127.0.0.1");
assert.equal(config.emulators.ui.enabled, false);
assert.equal(config.functions[0].source, ".codex/koino-emulator-device/functions");
assert.equal(config.database.rules, "firebase.rules.json");
async function relayTest(allowed) {
  let accepted = 0;
  const backend = net.createServer(socket => { accepted++; socket.on("error", () => {}); socket.pipe(socket); });
  await new Promise(resolve => backend.listen(0, "127.0.0.1", resolve));
  const port = backend.address().port;
  const relay = await createRelays({ listenAddress: "127.0.0.2", deviceAddresses: allowed ? ["127.0.0.1"] : ["127.0.0.3"], ports: [port] });
  try {
    const received = await new Promise((resolve, reject) => {
      const socket = net.connect({ host: "127.0.0.2", port, localAddress: "127.0.0.1" });
      const timeout = setTimeout(() => { socket.destroy(); reject(Error("Relay test timed out")); }, 2500);
      socket.on("connect", () => socket.write("websocket-transparent"));
      socket.on("data", data => { clearTimeout(timeout); socket.destroy(); resolve(data.toString()); });
      socket.on("error", error => { if (allowed) reject(error); });
      socket.on("close", () => { clearTimeout(timeout); if (!allowed) resolve(""); });
    });
    assert.equal(received, allowed ? "websocket-transparent" : "");
    assert.equal(accepted, allowed ? 1 : 0, "Denied peers cannot open a backend connection");
  } finally { relay.close(); await new Promise(resolve => backend.close(resolve)); }
}
if (!validationOnly) {
await relayTest(true);
await relayTest(false);
// Firebase SDK discovery uses listen(port) without a host. Its local preload
// must constrain that transient server too, without touching explicit relays.
const preload = fileURLToPath(new URL("./emulator-node-loopback.cjs", import.meta.url));
for (const listen of ["server.listen(0,done)", "server.listen({port:0,host:'0.0.0.0'},done)"]) {
  const code = `const net=require('node:net');const server=net.createServer();function done(){console.log(server.address().address);server.close();}${listen};`;
  const result = spawnSync(process.execPath, ["--require", preload, "-e", code], { encoding: "utf8", timeout: 5000 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), "127.0.0.1");
}
}
const inherited = { ...process.env };
for (const name of ["GCLOUD_PROJECT", "GOOGLE_CLOUD_PROJECT", "GCP_PROJECT", "DATABASE_URL", "FIREBASE_CONFIG", "FIREBASE_AUTH_EMULATOR_HOST", "FIREBASE_DATABASE_EMULATOR_HOST", "FIREBASE_FUNCTIONS_EMULATOR_HOST"]) delete inherited[name];
const run = (args = [], env = inherited) => spawnSync("pwsh", ["-NoProfile", "-File", "scripts/start-emulator-devices.ps1", "-CheckOnly", ...args], { encoding: "utf8", env, timeout: 30000 });
assert.equal(run().status, 0, "Loopback check must pass without starting services");
assert.notEqual(run(["-ProjectId", "koino-codex"]).status, 0);
for (const override of [{ GCLOUD_PROJECT: "koino-codex" }, { GOOGLE_CLOUD_PROJECT: "another-project" }, { GCP_PROJECT: "koino-codex" }, { DATABASE_URL: "https://koino-codex.firebaseio.com" }, { FIREBASE_AUTH_EMULATOR_HOST: "public.example:9099" }, { FIREBASE_DATABASE_EMULATOR_HOST: "192.168.0.13:9001" }, { FIREBASE_FUNCTIONS_EMULATOR_HOST: "0.0.0.0:5001" }, { FIREBASE_CONFIG: JSON.stringify({ projectId: "demo-koino", databaseURL: "https://koino-codex.firebaseio.com" }) }]) assert.notEqual(run([], { ...inherited, ...override }).status, 0);
const firewall = readFileSync(new URL("./configure-emulator-device-firewall.ps1", import.meta.url), "utf8");
const firewallSupport = readFileSync(new URL("./emulator-device-firewall.ps1", import.meta.url), "utf8");
assert.ok(firewallSupport.includes("RemoteAddress=@($DeviceAddress)") && firewallSupport.includes("LocalAddress=$ListenAddress") && firewallSupport.includes("LocalPort=@('5001','9001','9099')") && firewallSupport.includes("InterfaceAlias=$interface.InterfaceAlias"));
for (const source of [firewall, readFileSync(new URL("./start-emulator-devices.ps1", import.meta.url), "utf8")]) assert.ok(source.includes("emulator-device-firewall.ps1") && source.includes("Assert-KoinoEmulatorFirewall"));
// Exercise the actual PowerShell -> Node boundary with no firewall cmdlets or
// interface prerequisites. File arguments + stdin must survive Legacy mode too.
const checker = fileURLToPath(new URL("./validate-emulator-network-input.mjs", import.meta.url));
const check = input => spawnSync(process.execPath, [checker], { input, encoding: "utf8", timeout: 5000 });
assert.equal(check(JSON.stringify(supplied)).status, 0);
assert.equal(check("\uFEFF" + JSON.stringify(supplied)).status, 0);
for (const input of ["", "not JSON", "null", "[]", JSON.stringify({ ...supplied, deviceAddresses: "100.108.62.79" }), JSON.stringify({ ...supplied, unexpected: true }), " ".repeat(16385)]) assert.equal(check(input).status, 1);
const invalid = [
  { ...supplied, listenAddress: "8.8.8.8" },
  { ...supplied, listenAddress: "0.0.0.0" },
  { ...supplied, deviceAddresses: ["8.8.8.8", supplied.deviceAddresses[1]] },
  ...["0.0.0.0", "*", "Any", "LocalSubnet", "100.64.0.0/10", "100.108.62.79/32", "100.108.62.79-100.108.62.90"].map(peer => ({ ...supplied, deviceAddresses: [peer, supplied.deviceAddresses[1]] })),
  { ...supplied, deviceAddresses: [] },
  { ...supplied, deviceAddresses: [supplied.deviceAddresses[0]] },
  { ...supplied, deviceAddresses: [supplied.deviceAddresses[0], supplied.deviceAddresses[0]] },
  { ...supplied, deviceAddresses: [...supplied.deviceAddresses, "100.100.1.1"] },
  { ...supplied, deviceAddresses: [supplied.listenAddress, supplied.deviceAddresses[1]] },
];
for (const value of invalid) assert.equal(check(JSON.stringify(value)).status, 1, JSON.stringify(value));
const psString = value => `'${value.replaceAll("'", "''")}'`;
const scriptPath = fileURLToPath(new URL("./configure-emulator-device-firewall.ps1", import.meta.url));
const startPath = fileURLToPath(new URL("./start-emulator-devices.ps1", import.meta.url));
const stubFirewall = ["Get-NetFirewallRule", "New-NetFirewallRule", "Remove-NetFirewallRule", "Get-NetFirewallProfile", "Get-NetFirewallAddressFilter", "Get-NetFirewallPortFilter"]
  .map(name => `function ${name} { throw 'Validation touched a firewall cmdlet.' }`).join("\n");
const psRun = (body, mode = "Legacy") => spawnSync("pwsh", ["-NoProfile", "-Command", `
$ErrorActionPreference = 'Stop'
$PSNativeCommandArgumentPassing = ${psString(mode)}
${stubFirewall}
try {
${body}
if (-not $?) { exit 1 }
exit 0
} catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
`], { encoding: "utf8", env: inherited, timeout: 30000 });
const firewallInvocation = value => `& ${psString(scriptPath)} -Network ${psString(value.network)} -ListenAddress ${psString(value.listenAddress)} -DeviceAddress @(${value.deviceAddresses.map(psString).join(",")}) -ValidateOnly`;
for (const mode of ["Legacy", "Standard", "Windows"]) {
  const result = psRun(firewallInvocation(supplied), mode);
  assert.equal(result.status, 0, `${mode}: ${result.stderr}`);
  assert.match(result.stdout, /Windows Firewall was not read or changed/);
  const startup = psRun(`& ${psString(startPath)} -CheckOnly`, mode);
  assert.equal(startup.status, 0, `${mode}: ${startup.stderr}`);
}
for (const value of [invalid[0], invalid[1], invalid[2], invalid.find(value => value.deviceAddresses.includes("100.64.0.0/10")), { ...supplied, deviceAddresses: [supplied.deviceAddresses[0], supplied.deviceAddresses[0]] }]) {
  const result = psRun(firewallInvocation(value));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing a non-private host or broad peer allowance/);
  assert.ok(!result.stderr.includes("Validation touched a firewall cmdlet"));
}
const conflicting = psRun(firewallInvocation(supplied) + " -Remove");
assert.equal(conflicting.status, 1);
assert.match(conflicting.stderr, /ValidateOnly cannot be combined with Remove/);
for (const source of [firewall, readFileSync(new URL("./start-emulator-devices.ps1", import.meta.url), "utf8")]) {
  assert.ok(source.includes("Join-Path $PSScriptRoot 'validate-emulator-network-input.mjs'"));
  assert.ok(!source.includes("--input-type=module -e"), "PowerShell must never marshal inline JavaScript");
}
assert.ok(firewall.indexOf("if ($ValidateOnly)") < firewall.indexOf("WindowsIdentity"));
assert.ok(firewall.indexOf("if ($ValidateOnly)") < firewall.indexOf(". (Join-Path $PSScriptRoot 'emulator-device-firewall.ps1')"));
console.log(validationOnly
  ? "Validation-only networking passed: supplied Tailscale addresses, strict IP/peer rejection, malformed stdin, and real PowerShell Legacy/Standard/Windows calls; no listeners or firewall access."
  : "Emulator networking passed: private input/PowerShell validation, real TCP allow/deny, loopback-only binds, production configuration refusal and opt-in firewall scope.");
