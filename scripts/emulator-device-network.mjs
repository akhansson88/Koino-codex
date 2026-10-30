import net from "node:net";
import { createRequire } from "node:module";
const { emulatorConfig } = createRequire(import.meta.url)("../state/store/firebase-emulator-config.cjs");
export const devicePorts = [9099, 9001, 5001];
export function validateNetwork({ network, listenAddress, deviceAddresses = [] }) {
  if (network === "Loopback") {
    if (listenAddress !== "127.0.0.1" || deviceAddresses.length) throw Error("Loopback mode cannot expose device ports");
    return;
  }
  if (!["Tailscale", "Lan"].includes(network)) throw Error("Choose Loopback, Tailscale or Lan");
  for (const host of [listenAddress, ...deviceAddresses]) emulatorConfig({ variant: "emulator", host });
  if (deviceAddresses.length !== 2 || new Set(deviceAddresses).size !== 2 || deviceAddresses.includes(listenAddress)) throw Error("Supply exactly two distinct phone IPv4 addresses");
  const tail = host => { const p = host.split(".").map(Number); return p[0] === 100 && p[1] >= 64 && p[1] <= 127; };
  if ([listenAddress, ...deviceAddresses].some(ip => tail(ip) !== (network === "Tailscale"))) throw Error("Network type and addresses do not match");
}
export async function createRelays({ listenAddress, deviceAddresses, ports = devicePorts }) {
  // No HTTP interpretation: RTDB WebSockets, Auth and callable traffic retain
  // their original bytes. Check the peer BEFORE opening a backend connection.
  const servers = [], sockets = new Set();
  const close = () => { for (const socket of sockets) socket.destroy(); for (const server of servers) server.close(); };
  try {
    for (const port of ports) {
      const server = net.createServer(incoming => {
        const peer = incoming.remoteAddress?.replace(/^::ffff:/, "");
        if (!deviceAddresses.includes(peer)) { incoming.destroy(); return; }
        const target = net.connect({ host: "127.0.0.1", port });
        sockets.add(incoming); sockets.add(target);
        const finish = () => { incoming.destroy(); target.destroy(); sockets.delete(incoming); sockets.delete(target); };
        incoming.on("error", finish); target.on("error", finish);
        incoming.on("close", finish); target.on("close", finish);
        incoming.pipe(target); target.pipe(incoming);
      });
      servers.push(server);
      await new Promise((resolve, reject) => { server.once("error", reject); server.listen({ host: listenAddress, port, exclusive: true }, resolve); });
      server.on("error", error => { console.error("Private relay stopped:", error.message); close(); process.exitCode = 1; });
    }
    return { close };
  } catch (error) { close(); throw error; }
}
export async function bootstrapDemoPolicy() {
  const endpoint = "http://127.0.0.1:9001/e2eePolicy.json?ns=demo-koino-default-rtdb";
  const headers = { authorization: "Bearer owner", "X-Firebase-ETag": "true", "content-type": "application/json" };
  const deadline = Date.now() + 180000;
  while (true) {
    let response;
    try { response = await fetch(endpoint, { headers, signal: AbortSignal.timeout(1500) }); }
    catch (error) { if (Date.now() >= deadline) throw error; await new Promise(resolve => setTimeout(resolve, 300)); continue; }
    if (!response.ok) throw Error("Local RTDB policy could not be read");
    const policy = await response.json();
    if (policy === null) {
      const etag = response.headers.get("etag");
      if (!etag) throw Error("Local policy comparison token missing");
      const written = await fetch(endpoint, { method: "PUT", headers: { ...headers, "if-match": etag }, body: JSON.stringify({ encryptedGroupsOnly: true, historyGeneration: 1, sharedWritesFrozen: false }), signal: AbortSignal.timeout(3000) });
      await written.body?.cancel();
      if (written.status === 412) continue;
      if (!written.ok) throw Error("Local demo policy could not be initialized");
    } else if (!policy.encryptedGroupsOnly || policy.historyGeneration !== 1 || policy.sharedWritesFrozen) {
      throw Error("Existing emulator policy is incompatible; preserve it and start with a fresh local export directory");
    }
    console.log("demo-koino: encrypted-only local policy ready.");
    return;
  }
}
