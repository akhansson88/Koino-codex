import type { EmulatorConfiguration } from "./firebase-emulator-config.cjs";

export const emulatorExternalNetworkMessage = "External services are unavailable in KOINO Emulator. / Externa tjänster är inte tillgängliga i KOINO Emulator.";
type NetworkRuntime = {
  fetch?: typeof globalThis.fetch;
  XMLHttpRequest?: typeof globalThis.XMLHttpRequest;
  WebSocket?: typeof globalThis.WebSocket;
  __koinoEmulatorNetworkHost?: string;
};

// This is a client destination guard, not an OS firewall. Native networking may
// follow redirects internally; fetch's redirect:error is not honored by every
// React Native transport. Only use the trusted local emulator/relay endpoints.
export function installEmulatorClientNetworkGuard(configuration: EmulatorConfiguration | undefined, runtime: NetworkRuntime = globalThis) {
  if (!configuration) return;
  if (runtime.__koinoEmulatorNetworkHost) {
    if (runtime.__koinoEmulatorNetworkHost !== configuration.host) throw new Error("Restart KOINO Emulator before changing its host.");
    return;
  }
  const ports = new Set([configuration.authPort, configuration.databasePort, configuration.functionsPort].map(String));
  const allowed = (input: unknown, method = "GET", socket = false) => {
    const value = typeof input === "string" ? input : input && typeof input === "object" && "url" in input ? String(input.url) : String(input);
    let url: URL;
    try { url = new URL(value); } catch { throw new Error(emulatorExternalNetworkMessage); }
    if (!socket && ["file:", "content:", "data:"].includes(url.protocol) && ["GET", "HEAD"].includes(method.toUpperCase()) && (url.protocol !== "file:" || !url.hostname || url.hostname === "localhost")) return;
    if (url.protocol !== (socket ? "ws:" : "http:") || url.hostname !== configuration.host || !ports.has(url.port) || url.username || url.password) throw new Error(emulatorExternalNetworkMessage);
  };
  const originalFetch = runtime.fetch;
  if (!originalFetch) throw new Error("KOINO Emulator requires its network guard before startup.");
  runtime.fetch = async (input, init) => {
    const method = init?.method ?? (typeof input === "object" && input && "method" in input ? String(input.method) : "GET");
    allowed(input, method);
    const response = await Reflect.apply(originalFetch, runtime, [input, { ...init, redirect: "error" }]) as Awaited<ReturnType<typeof originalFetch>>;
    if (response.redirected || response.status >= 300 && response.status < 400) throw new Error(emulatorExternalNetworkMessage);
    if (response.url) allowed(response.url, method);
    return response;
  };
  if (runtime.XMLHttpRequest) {
    const originalOpen = runtime.XMLHttpRequest.prototype.open;
    runtime.XMLHttpRequest.prototype.open = new Proxy(originalOpen, {
      apply(target, receiver, args) { allowed(args[1], String(args[0])); return Reflect.apply(target, receiver, args); },
    });
  }
  if (runtime.WebSocket) {
    runtime.WebSocket = new Proxy(runtime.WebSocket, {
      construct(target, args, newTarget) { allowed(args[0], "GET", true); return Reflect.construct(target, args, newTarget); },
    });
  }
  runtime.__koinoEmulatorNetworkHost = configuration.host;
}
