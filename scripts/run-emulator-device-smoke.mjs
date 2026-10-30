import "./firebase-emulator-guard.mjs";
import { bootstrapDemoPolicy, createRelays } from "./emulator-device-network.mjs";
await bootstrapDemoPolicy();
// Exercise the same TCP relay used by phones, without exposing any LAN port.
const relay = await createRelays({ listenAddress: "127.0.0.2", deviceAddresses: ["127.0.0.1"] });
try { await import("./validate-community-moderation-callable.mjs"); }
finally { relay.close(); }
// Firebase client libraries retain background timers in standalone Node suites.
process.exit(0);
