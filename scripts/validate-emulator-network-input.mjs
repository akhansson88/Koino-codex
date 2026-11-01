import { validateNetwork } from "./emulator-device-network.mjs";

process.stdin.setEncoding("utf8");
try {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 16384) throw Error("Network configuration is too large");
  }
  let configuration;
  try { configuration = JSON.parse(input.replace(/^\uFEFF/, "")); }
  catch { throw Error("Expected a JSON network configuration on stdin"); }
  const fields = ["network", "listenAddress", "deviceAddresses"];
  if (!configuration || Array.isArray(configuration) || typeof configuration !== "object"
    || Object.keys(configuration).some(key => !fields.includes(key))
    || typeof configuration.network !== "string" || typeof configuration.listenAddress !== "string"
    || !Array.isArray(configuration.deviceAddresses)
    || configuration.deviceAddresses.some(address => typeof address !== "string")) {
    throw Error("Expected network, listenAddress and an explicit deviceAddresses array");
  }
  validateNetwork(configuration);
  console.log("Emulator network input validated.");
} catch (error) {
  console.error(`Invalid emulator network input: ${error.message}`);
  process.exitCode = 1;
}
