import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Temporary local debugger: no emulator restart, code replacement, root write,
// heap dump, raw payload logging, or durable private artifacts. CDP events are
// never dumped. Only an explicit boolean/count allowlist may reach stdout.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const liveRoot = path.join(root, ".codex", "koino-emulator-device", "functions");
const encryptionFile = path.join(liveRoot, "lib", "encryption.js");
const adminFile = path.join(liveRoot, "lib", "firebase-admin.js");
const source = readFileSync(encryptionFile, "utf8");
const resolverStart = source.indexOf('case "resolveInvite":');
assert.ok(resolverStart >= 0, "Expected local resolver source");
const stopOffset = source.indexOf("if (!invite)", resolverStart);
assert.ok(stopOffset > resolverStart && stopOffset < source.indexOf('case "requestJoin":', resolverStart));
const breakpointLine = source.slice(0, stopOffset).split(/\r?\n/).length - 1;
const args = process.argv.slice(2);
let pids, seconds = 120, displayedStdin = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--pids") pids = args[++i]?.split(",").map(Number);
  else if (args[i] === "--timeout") seconds = Number(args[++i]);
  else if (args[i] === "--displayed-codes-stdin") displayedStdin = true;
  else throw new Error("Unsupported diagnostic argument");
}
assert.ok(Number.isInteger(seconds) && seconds >= 1 && seconds <= 180);
const powershell = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
if (!pids) {
  // Select only warm workers belonging to the CLI listening on the exact phone
  // backend's loopback Functions port; never attach to isolated test workers.
  const command = "$endpoint = @(Get-NetTCPConnection -State Listen -LocalAddress '127.0.0.1' -LocalPort 5001 -ErrorAction Stop); if ($endpoint.Count -ne 1) { throw 'Expected one local Functions listener' }; @(Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -eq $endpoint[0].OwningProcess -and $_.CommandLine -match 'functionsEmulatorRuntime' } | Select-Object -ExpandProperty ProcessId) | ConvertTo-Json -Compress";
  const raw = execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"], timeout: 10000 }).trim();
  const found = raw ? JSON.parse(raw) : [];
  pids = Array.isArray(found) ? found : [found];
}
assert.ok(pids?.length && pids.length <= 4 && pids.every(n => Number.isSafeInteger(n) && n > 0), "Expected one to four warm local Functions workers; make one phone retry first if needed");
assert.equal(new Set(pids).size, pids.length);
const ports = [9229, ...pids.map((_, i) => 9230 + i)];
function listeners() {
  const command = `@((Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -in @(${ports.join(",")}) } | Select-Object LocalAddress,LocalPort,OwningProcess)) | ConvertTo-Json -Compress`;
  const text = execFileSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", command], { encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"], timeout: 5000 }).trim();
  const rows = text ? JSON.parse(text) : [];
  return Array.isArray(rows) ? rows : [rows];
}
function assertBound(port, pid) {
  const rows = listeners().filter(r => r.LocalPort === port);
  assert.ok(rows.length && rows.every(r => r.LocalAddress === "127.0.0.1" && r.OwningProcess === pid), "Inspector binding verification failed");
}
assert.equal(listeners().length, 0, "Diagnostic ports must be unused before attachment");
const normalize = value => {
  if (value.startsWith("file:")) value = fileURLToPath(value);
  return value.replaceAll("\\", "/").toLowerCase();
};
const expectedScript = normalize(encryptionFile);
const expectedAdmin = normalize(adminFile);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function routingIndex() {
  const response = await fetch("http://127.0.0.1:9001/encryptedData/inviteCodes.json?ns=demo-koino-default-rtdb", {
    headers: { authorization: "Bearer owner" }, redirect: "error", signal: AbortSignal.timeout(1500),
  });
  assert.ok(response.ok, "Local routing metadata read failed");
  const index = await response.json();
  assert.ok(index && typeof index === "object");
  for (const [code, record] of Object.entries(index)) {
    assert.ok(/^[A-Za-z0-9_-]{1,160}$/.test(code) && typeof record?.groupId === "string");
  }
  return index;
}
const initialIndex = await routingIndex();
assert.ok(Object.keys(initialIndex).length, "Expected an existing test invitation");
let displayedCodes = [];
if (displayedStdin) {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    assert.ok(input.length <= 2048, "Displayed-code input exceeds the diagnostic limit");
  }
  let value;
  try { value = JSON.parse(input); } catch { throw new Error("Expected two masked displayed codes as JSON on stdin"); }
  assert.ok(Array.isArray(value?.codes) && value.codes.length === 2 && value.codes.every(code => typeof code === "string" && /^[A-Z0-9]{6}$/.test(code)), "Expected two current six-character uppercase displayed codes");
  displayedCodes = value.codes;
  process.stdout.write(`${JSON.stringify({ stage: "displayed_code_probe", displayedCodeCount: displayedCodes.length, distinctDisplayedCodeCount: new Set(displayedCodes).size, exactIndexMatches: displayedCodes.map(code => Object.hasOwn(initialIndex, code)) })}\n`);
}
class CDP {
  constructor(socket) {
    this.socket = socket; this.nextId = 0; this.pending = new Map(); this.handlers = new Map();
    socket.addEventListener("message", event => {
      let message;
      try { message = JSON.parse(String(event.data)); } catch { return; }
      if (message.id) {
        const job = this.pending.get(message.id); if (!job) return;
        this.pending.delete(message.id); clearTimeout(job.timer);
        if (message.error) job.reject(new Error("Inspector command rejected")); else job.resolve(message.result);
      } else this.handlers.get(message.method)?.(message.params);
    });
    socket.addEventListener("close", () => {
      for (const job of this.pending.values()) { clearTimeout(job.timer); job.reject(new Error("Inspector connection closed")); }
      this.pending.clear();
    });
  }
  call(method, params = {}, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const id = ++this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error("Inspector command timed out")); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression, extra = {}) {
    const result = await this.call("Runtime.evaluate", { expression, returnByValue: true, timeout: 2500, ...extra });
    assert.ok(!result.exceptionDetails, "Read-only runtime probe failed");
    return result.result?.value;
  }
}
async function connect(port) {
  const until = Date.now() + 4000;
  while (Date.now() < until) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`, { redirect: "error", signal: AbortSignal.timeout(600) });
      const targets = await response.json();
      assert.ok(response.ok && Array.isArray(targets) && targets.length === 1);
      const url = new URL(targets[0].webSocketDebuggerUrl);
      assert.ok(url.protocol === "ws:" && url.hostname === "127.0.0.1" && Number(url.port) === port);
      const socket = new WebSocket(url);
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => { socket.close(); reject(new Error("Inspector socket timed out")); }, 1000);
        socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
        socket.addEventListener("error", () => { clearTimeout(timer); socket.close(); reject(new Error("Inspector socket failed")); }, { once: true });
      });
      return new CDP(socket);
    } catch { await sleep(100); }
  }
  throw new Error("Inspector connection unavailable");
}
function identityExpression(pid) {
  return `({sameProcess:process.pid===${pid},demoProject:process.env.GCLOUD_PROJECT==='demo-koino',explicitMode:process.env.KOINO_EMULATOR_TEST_MODE==='1',functionsEmulator:process.env.FUNCTIONS_EMULATOR==='true',localDatabase:process.env.FIREBASE_DATABASE_EMULATOR_HOST==='127.0.0.1:9001'})`;
}
async function verify(cdp, pid) {
  const identity = await cdp.evaluate(identityExpression(pid));
  assert.ok(identity && Object.values(identity).every(v => v === true), "Inspector target identity rejected");
}
const states = [];
let finished = false, resolveCapture, failure = false, stage = "preflight", handlerPromises = new Set();
const capture = new Promise(resolve => { resolveCapture = resolve; });
const onSignal = () => { finished = true; resolveCapture(false); };
process.on("SIGINT", onSignal);
process.on("SIGTERM", onSignal);
const output = value => process.stdout.write(`${JSON.stringify(value)}\n`);
async function inspectPaused(state, event) {
  state.paused = true;
  try {
    if (finished) return;
    const frame = event.callFrames.find(f => normalize(f.url || state.scriptUrls.get(f.location.scriptId) || "") === expectedScript && f.location.lineNumber >= breakpointLine - 1 && f.location.lineNumber <= breakpointLine + 1);
    if (!frame) return;
    const index = await routingIndex();
    if (finished) return;
    const keys = Object.keys(index);
    const comparisons = target => keys.map(key => `(${target}===${JSON.stringify(key)})`).join("||") || "false";
    const groups = keys.map(key => `(code===${JSON.stringify(key)}&&invite?.groupId===${JSON.stringify(index[key].groupId)})`).join("||") || "false";
    // Raw values appear only in this in-memory CDP expression, never stdout/files.
    const displayedMatches = displayedCodes.map(value => `code===${JSON.stringify(value)}`).join(",");
    const expression = `({matchesDisplayedCodes:[${displayedMatches}],receivedIsString:typeof code==='string',receivedLength:typeof code==='string'?code.length:0,payloadUnchanged:data.code===code,alreadyNormalized:typeof code==='string'&&code===code.trim().toUpperCase(),exactIndexMatch:${comparisons("code")},normalizedIndexMatch:${comparisons("code.trim().toUpperCase()")},sdkInviteFound:invite!==null&&invite!==undefined,sdkInviteMatchesIndexGroup:!!invite&&(${groups})})`;
    const result = await state.cdp.call("Debugger.evaluateOnCallFrame", { callFrameId: frame.callFrameId, expression, returnByValue: true, throwOnSideEffect: true }, 2500);
    assert.ok(!result.exceptionDetails, "Pure same-request comparison unavailable");
    const values = result.result?.value;
    const allowed = ["receivedIsString", "receivedLength", "payloadUnchanged", "alreadyNormalized", "exactIndexMatch", "normalizedIndexMatch", "sdkInviteFound", "sdkInviteMatchesIndexGroup"];
    assert.ok(values && Object.keys(values).length === allowed.length + 1 && allowed.every(k => typeof values[k] === (k === "receivedLength" ? "number" : "boolean")) && Array.isArray(values.matchesDisplayedCodes) && values.matchesDisplayedCodes.length === displayedCodes.length && values.matchesDisplayedCodes.every(v => typeof v === "boolean"), "Comparison output rejected");
    output({ stage: "captured", indexEntryCount: keys.length, ...values });
    finished = true; resolveCapture(true);
  } catch {
    failure = true; finished = true;
    output({ stage: "capture_failed", captured: false }); resolveCapture(false);
  } finally {
    await state.cdp.call("Debugger.resume", {}, 1000).catch(() => {});
    state.paused = false;
  }
}
async function cleanup(state) {
  let cdp = state.cdp;
  try {
    if (!cdp || cdp.socket.readyState !== WebSocket.OPEN) {
      for (const port of [state.port, 9229].filter(Boolean)) {
        try { assertBound(port, state.pid); cdp = await connect(port); await verify(cdp, state.pid); break; } catch {}
      }
    }
    if (cdp?.socket.readyState === WebSocket.OPEN) {
      if (state.breakpoint) await cdp.call("Debugger.removeBreakpoint", { breakpointId: state.breakpoint }, 1000).catch(() => {});
      if (state.paused) await cdp.call("Debugger.resume", {}, 1000).catch(() => {});
      await cdp.call("Debugger.disable", {}, 1000).catch(() => {});
      // _debugEnd is the installed Node24 inspector.close function. Schedule it
      // after acknowledgement so the controller does not wait on its own socket.
      await cdp.evaluate(`setImmediate(() => { process.debugPort = ${state.originalDebugPort ?? 9229}; process._debugEnd(); }); true`).catch(() => {});
      await sleep(150); cdp.socket.close();
    }
  } catch { failure = true; }
}
try {
  for (let i = 0; i < pids.length && !finished; i++) {
    stage = "attach";
    assert.equal(listeners().filter(r => r.LocalPort === 9229).length, 0);
    const state = { pid: pids[i], port: null, cdp: null, breakpoint: null, paused: false, scriptUrls: new Map() };
    states.push(state);
    process._debugProcess(state.pid);
    state.cdp = await connect(9229); assertBound(9229, state.pid); await verify(state.cdp, state.pid);
    state.originalDebugPort = await state.cdp.evaluate("process.debugPort");
    assert.ok(Number.isInteger(state.originalDebugPort) && state.originalDebugPort > 0 && state.originalDebugPort <= 65535);
    const port = 9230 + i; state.port = port;
    // A separate port permits simultaneous observation of multiple warm workers.
    await state.cdp.evaluate(`setImmediate(()=>{const inspector=process.mainModule.require('node:inspector');inspector.close();inspector.open(${port},'127.0.0.1',false)});true`);
    await sleep(100);
    state.cdp = await connect(port); assertBound(port, state.pid); await verify(state.cdp, state.pid);
    stage = "runtime_probe";
    const key = Object.keys(initialIndex)[0];
    const probeExpression = `(async()=>{const modules=process.mainModule.require('node:module')._cache;const key=Object.keys(modules).find(k=>k.replaceAll('\\\\','/').toLowerCase()===${JSON.stringify(expectedAdmin)});if(!key)throw Error('Expected cached module missing');const cached=modules[key];const app=cached.exports.adminApp;const database=cached.require('firebase-admin/database').getDatabase(app);const snapshot=await database.ref('encryptedData/inviteCodes/'+${JSON.stringify(key)}).get();return{demoProject:app.options.projectId==='demo-koino',namespaceMatches:database._delegate._repoInternal.repoInfo_.namespace==='demo-koino-default-rtdb',knownIndexEntryFound:snapshot.exists()}})()`;
    const probe = await state.cdp.evaluate(probeExpression, { awaitPromise: true });
    assert.ok(probe && Object.keys(probe).length === 3 && Object.values(probe).every(v => typeof v === "boolean"));
    output({ stage: "worker_probe", ...probe });
    state.cdp.handlers.set("Debugger.scriptParsed", event => { state.scriptUrls.set(event.scriptId, event.url); });
    state.cdp.handlers.set("Debugger.paused", event => {
      const job = inspectPaused(state, event);
      handlerPromises.add(job);
      job.finally(() => handlerPromises.delete(job));
    });
    stage = "breakpoint";
    await state.cdp.call("Debugger.enable");
    const script = [...state.scriptUrls].find(([, url]) => normalize(url) === expectedScript);
    assert.ok(script, "Expected cached resolver script missing");
    const breakpoint = await state.cdp.call("Debugger.setBreakpoint", { location: { scriptId: script[0], lineNumber: breakpointLine, columnNumber: 0 }, condition: "payload.operation === 'resolveInvite'" });
    state.breakpoint = breakpoint.breakpointId;
  }
  if (!finished) {
    stage = "waiting";
    output({ stage: "ready", observedWorkerCount: states.length, timeoutSeconds: seconds });
    process.stdout.write("Ready for one physical-device Join retry. Only safe comparison metadata will be printed.\n");
    const timer = setTimeout(() => { finished = true; resolveCapture(false); }, seconds * 1000);
    const captured = await capture; clearTimeout(timer);
    if (!captured && !failure) output({ stage: "timeout", captured: false });
  }
} catch {
  failure = true; finished = true;
  output({ stage, inspectionFailed: true });
} finally {
  finished = true;
  await Promise.allSettled([...handlerPromises]);
  for (const state of states.reverse()) await cleanup(state);
  let remaining;
  for (let attempt = 0; attempt < 4; attempt++) {
    remaining = listeners(); if (!remaining.length) break; await sleep(150);
  }
  const closed = remaining.length === 0;
  output({ stage: "cleanup", inspectorPortsClosed: closed });
  if (!closed) failure = true;
}
process.removeListener("SIGINT", onSignal);
process.removeListener("SIGTERM", onSignal);
process.exitCode = failure ? 1 : 0;
