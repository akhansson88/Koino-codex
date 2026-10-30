// Shared by Expo config, the native client and the local emulator launcher.
// No Node APIs: this module is also bundled by Metro.
function emulatorConfig({ variant, host } = {}) {
  if (variant !== undefined && !["production", "development", "emulator"].includes(variant)) throw new Error("Unknown KOINO app variant; refusing to select a live backend.");
  if (variant !== "emulator") return undefined;
  if (typeof host !== "string" || !/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(host)) {
    throw new Error("KOINO Emulator requires EXPO_PUBLIC_KOINO_EMULATOR_HOST as a private numeric IPv4 address.");
  }
  const octets = host.split(".").map(Number);
  const [a, b] = octets;
  const privateAddress = a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
  if (octets.some(value => value > 255) || !privateAddress) {
    throw new Error("KOINO Emulator host must be an RFC1918 or Tailscale private IPv4 address; public addresses, loopback and hostnames are forbidden.");
  }
  return Object.freeze({ enabled: true, host, projectId: "demo-koino", authPort: 9099, databasePort: 9001, functionsPort: 5001, functionsRegion: "europe-west1" });
}
function emulatorConfigFromExpo(config) {
  const extra = config?.extra;
  if (extra?.koinoVariant !== undefined && !["production", "development", "emulator"].includes(extra.koinoVariant)) throw new Error("Unknown KOINO app variant; refusing to select a live backend.");
  const marked = extra?.koinoVariant === "emulator";
  const emulatorIdentity = config?.name === "KOINO Emulator" || config?.ios?.bundleIdentifier === "com.akhansson.koino.emulator" || config?.android?.package === "com.akhansson.koinomvp.emulator";
  if (!marked) {
    if (emulatorIdentity || extra?.koinoEmulator !== undefined) throw new Error("KOINO Emulator configuration is missing its explicit emulator mode.");
    return undefined;
  }
  const selected = emulatorConfig({ variant: "emulator", host: extra?.koinoEmulator?.host });
  if (!extra?.koinoEmulator?.enabled || config?.runtimeVersion !== "2.1.0-emulator" || config?.updates?.enabled !== false) {
    throw new Error("KOINO Emulator must use its dedicated runtime with remote updates disabled.");
  }
  for (const [key, value] of Object.entries(selected)) {
    if (extra.koinoEmulator[key] !== value) throw new Error("KOINO Emulator endpoint configuration is invalid.");
  }
  return selected;
}
module.exports = { emulatorConfig, emulatorConfigFromExpo };
