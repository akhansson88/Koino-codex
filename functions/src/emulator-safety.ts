import { Socket } from "node:net";
import { HttpsError } from "firebase-functions/v2/https";

export const EMULATOR_PROJECT_ID = "demo-koino";
export const EMULATOR_DATABASE_URL = "https://demo-koino-default-rtdb.firebaseio.com";
export type EmulatorTestConfiguration = { projectId: typeof EMULATOR_PROJECT_ID; databaseURL: typeof EMULATOR_DATABASE_URL; authHost: string; databaseHost: string };

type Environment = Record<string, string | undefined>;
const fail = (message: string): never => { throw new Error(`Unsafe KOINO emulator configuration: ${message}`); };
const loopback = (hostname: string) => ["127.0.0.1", "localhost", "[::1]"].includes(hostname);
function emulatorHost(value: string | undefined, name: string): string {
  if (!value || /[\s/\\?#@]/.test(value)) return fail(`${name} must be a loopback host:port.`);
  let parsed: URL;
  try { parsed = new URL(`http://${value}`); } catch { return fail(`${name} must be a loopback host:port.`); }
  if (!loopback(parsed.hostname) || !parsed.port || parsed.username || parsed.password || parsed.pathname !== "/") return fail(`${name} must be a loopback host:port.`);
  return value;
}
export function assertDemoFirebaseOptions(options: { projectId?: string; databaseURL?: string }, databaseHost?: string) {
  const localUrl = databaseHost ? `http://${databaseHost}/?ns=demo-koino-default-rtdb` : undefined;
  if (options.projectId !== EMULATOR_PROJECT_ID || options.databaseURL !== EMULATOR_DATABASE_URL && (!localUrl || options.databaseURL !== localUrl)) fail("Firebase must use only the demo-koino project and database namespace.");
}
// Pure validation: importing this module never installs guards or reads credentials.
export function emulatorTestConfiguration(env: Environment = process.env): EmulatorTestConfiguration | undefined {
  if (env.KOINO_EMULATOR_TEST_MODE === undefined) return undefined;
  if (env.KOINO_EMULATOR_TEST_MODE !== "1" || env.FUNCTIONS_EMULATOR !== "true") return fail("test mode requires KOINO_EMULATOR_TEST_MODE=1 and FUNCTIONS_EMULATOR=true.");
  if (env.GCLOUD_PROJECT !== EMULATOR_PROJECT_ID || env.GOOGLE_CLOUD_PROJECT !== undefined && env.GOOGLE_CLOUD_PROJECT !== EMULATOR_PROJECT_ID || env.GCP_PROJECT && env.GCP_PROJECT !== EMULATOR_PROJECT_ID) return fail("all project identifiers must be demo-koino.");
  for (const name of ["GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_TOKEN", "KOINO_SUPABASE_SERVICE_KEY", "STRIPE_SECRET_KEY"]) if (env[name]) fail(`${name} must be absent; emulator tests never use real credentials.`);
  let options: { projectId?: string; databaseURL?: string };
  try { options = JSON.parse(env.FIREBASE_CONFIG ?? "null"); } catch { return fail("FIREBASE_CONFIG must be explicit demo-koino JSON."); }
  if (!options || typeof options !== "object") return fail("FIREBASE_CONFIG must be explicit demo-koino JSON.");
  const authHost = emulatorHost(env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_AUTH_EMULATOR_HOST");
  const databaseHost = emulatorHost(env.FIREBASE_DATABASE_EMULATOR_HOST, "FIREBASE_DATABASE_EMULATOR_HOST");
  assertDemoFirebaseOptions(options, databaseHost);
  return { projectId: EMULATOR_PROJECT_ID, databaseURL: EMULATOR_DATABASE_URL, authHost, databaseHost };
}
export function requireEmulatorTestConfiguration(env: Environment = process.env): EmulatorTestConfiguration {
  return emulatorTestConfiguration(env) ?? fail("the emulator-only entry point requires explicit test mode.");
}
export function guardedEmulatorFetch(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.protocol !== "http:" || !loopback(url.hostname) || url.username || url.password) fail("external network requests are disabled in emulator test mode.");
    // An allowed local response must not redirect this privileged process online.
    return fetchImpl(input, { ...init, redirect: "error" });
  };
}
// Node TCP transports (including Admin SDK HTTP/WebSocket/gRPC) reach this
// socket boundary. Never resolve a caller-supplied hostname outside loopback.
export function loopbackSocketArguments(args: unknown[]): unknown[] {
  const connection = Array.isArray(args[0]) ? args[0] as unknown[] : args;
  const options = connection[0];
  const numericHost = (host: unknown) => {
    if (host === "localhost" || host === undefined) return "127.0.0.1";
    if (host === "127.0.0.1" || host === "::1" || host === "[::1]") return host === "[::1]" ? "::1" : host;
    return fail("external sockets are disabled in emulator test mode.");
  };
  if (options && typeof options === "object") {
    const target = options as { path?: unknown; host?: unknown; port?: unknown };
    if (target.path !== undefined || !Number.isInteger(Number(target.port)) || Number(target.port) < 1 || Number(target.port) > 65535) return fail("only loopback TCP sockets are allowed in emulator test mode.");
    connection[0] = { ...target, host: numericHost(target.host) };
  } else if (typeof options === "number" && Number.isInteger(options) && options > 0 && options <= 65535) {
    if (typeof connection[1] === "string") connection[1] = numericHost(connection[1]);
    else connection.splice(1, 0, numericHost(undefined));
  } else return fail("only loopback TCP sockets are allowed in emulator test mode.");
  return args;
}
export function installEmulatorNetworkGuards(): () => void {
  requireEmulatorTestConfiguration();
  const previousFetch = globalThis.fetch;
  const previousConnect = Socket.prototype.connect;
  globalThis.fetch = guardedEmulatorFetch(previousFetch.bind(globalThis));
  Socket.prototype.connect = function (this: Socket, ...args: unknown[]) {
    return (previousConnect as (...values: unknown[]) => Socket).apply(this, loopbackSocketArguments(args));
  } as typeof Socket.prototype.connect;
  return () => { globalThis.fetch = previousFetch; Socket.prototype.connect = previousConnect; };
}
const allowedOperations = new Set(["setup", "recover", "requestDevice", "approveDevice", "backup", "revokeDevice", "createGroup", "resolveInvite", "requestJoin", "groupChange", "beginMigration", "readLegacyArchive", "deleteLegacyBatch", "finishMigration", "leaveGroup", "deleteGroup", "removeCommunityContent"]);
export function assertEmulatorOperationAllowed(operation: string) {
  if (emulatorTestConfiguration() && !allowedOperations.has(operation)) throw new HttpsError("failed-precondition", `${operation} is disabled in emulator test mode.`);
}
export function assertExternalStorageAllowed() {
  if (emulatorTestConfiguration()) throw new HttpsError("failed-precondition", "External image storage is disabled in emulator test mode.");
}

const admissionErrorMessages = new Set([
  "No encrypted community uses that invite code.", "No community uses that invite code.",
  "Invalid encrypted request.", "Unlock this device before continuing.",
  "This encrypted operation is not authorized.", "Sign in first.",
  "Community maintenance is in progress. Try again shortly.",
  "This request was already processed. Reload its result.",
]);
// Existing phone binaries can report a rejected admission without publishing
// invite values, identity/device IDs, names, payloads, tokens or key material.
export async function withEmulatorAdmissionDiagnostics<T>(operation: unknown, action: () => Promise<T>): Promise<T> {
  if (!emulatorTestConfiguration() || !["resolveInvite", "requestJoin"].includes(String(operation))) return action();
  const metadata = { operation: operation as string };
  console.info("KOINO emulator admission", { ...metadata, stage: "start" });
  try {
    const result = await action();
    console.info("KOINO emulator admission", { ...metadata, stage: "success" });
    return result;
  } catch (error) {
    console.warn("KOINO emulator admission", {
      ...metadata, stage: "failure",
      code: error instanceof HttpsError ? error.code : "internal",
      message: error instanceof HttpsError && admissionErrorMessages.has(error.message) ? error.message : "Admission failed; private error details omitted.",
    });
    throw error;
  }
}
