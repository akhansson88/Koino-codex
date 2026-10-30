import { parseArgs } from "node:util";
import { bootstrapDemoPolicy, createRelays, validateNetwork } from "./emulator-device-network.mjs";
const { values } = parseArgs({ options: { network: { type: "string" }, listen: { type: "string" }, device: { type: "string", multiple: true }, parent: { type: "string" } } });
const config = { network: values.network, listenAddress: values.listen, deviceAddresses: values.device ?? [] };
validateNetwork(config);
const relay = config.network === "Loopback" ? undefined : await createRelays(config);
let stopping = false;
function stop() { if (stopping) return; stopping = true; relay?.close(); clearInterval(watchdog); }
process.on("SIGINT", () => { stop(); process.exit(0); });
process.on("SIGTERM", () => { stop(); process.exit(0); });
const parent = Number(values.parent);
if (!Number.isSafeInteger(parent) || parent <= 0) throw Error("A launcher parent process is required");
const watchdog = setInterval(() => { try { process.kill(parent, 0); } catch { stop(); process.exit(0); } }, 2000);
try { await bootstrapDemoPolicy(); console.log(config.network === "Loopback" ? "Local-only emulator session ready." : `Private relays ready on ${config.listenAddress}; exactly two phone peers permitted.`); }
catch (error) { console.error(error.message); stop(); process.exit(1); }
