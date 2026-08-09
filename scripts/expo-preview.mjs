import { spawn, spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const portIndex = args.indexOf("--port");
const port = portIndex >= 0 && args[portIndex + 1] ? args[portIndex + 1] : "4173";
const expo = path.join(projectRoot, "node_modules", ".bin", "expo");
const generated = spawnSync(process.execPath, [path.join(projectRoot, "scripts", "generate-bible-data.mjs")], {
  cwd: projectRoot,
  env: process.env,
  stdio: "inherit",
});
if (generated.status !== 0) process.exit(generated.status ?? 1);
const child = spawn(expo, ["start", "--web", "--lan", "--port", port], {
  cwd: projectRoot,
  env: { ...process.env, EXPO_NO_TELEMETRY: "1" },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 1);
});
