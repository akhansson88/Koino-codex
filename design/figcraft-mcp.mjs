import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const CLI = path.join(process.env.LOCALAPPDATA, "Programs", "ArtCraft", "FigCraft", "figcraft-cli.exe");
const [, , requestPath, ...flags] = process.argv;
if (!requestPath) throw new Error("Usage: node design/figcraft-mcp.mjs <request.json> [--image-out file.png]");

const request = JSON.parse(fs.readFileSync(requestPath, "utf8"));
const calls = Array.isArray(request) ? request : [request];
const imageOutIndex = flags.indexOf("--image-out");
const imageOut = imageOutIndex >= 0 ? flags[imageOutIndex + 1] : undefined;

const child = spawn(CLI, ["mcp", "--attach", "3999", "--timeout", "300"], {
  stdio: ["pipe", "pipe", "pipe"],
});
let nextId = 1;
const pending = new Map();
let buffer = "";
let stderr = "";

child.stderr.on("data", (data) => { stderr += data.toString(); });
child.stdout.on("data", (data) => {
  buffer += data.toString();
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line.startsWith("{")) continue;
    let message;
    try { message = JSON.parse(line); } catch { continue; }
    if (message.id !== undefined && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    }
  }
});

function send(method, params) {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  });
}

function notify(method, params) {
  child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

async function main() {
  await send("initialize", {
    protocolVersion: "2024-11-05",
    capabilities: {},
    clientInfo: { name: "koino-design", version: "1.0.0" },
  });
  notify("notifications/initialized", {});
  const results = [];
  for (const call of calls) {
    const result = await send("tools/call", { name: call.tool, arguments: call.args ?? {} });
    results.push(result);
    if (imageOut && result?.content) {
      const image = result.content.find((item) => item.type === "image");
      if (image?.data) {
        fs.mkdirSync(path.dirname(imageOut), { recursive: true });
        fs.writeFileSync(imageOut, Buffer.from(image.data, "base64"));
      }
    }
  }
  const printable = results.map((result) => ({
    ...result,
    content: result?.content?.map((item) => item.type === "image" ? { ...item, data: `<${item.data.length} base64 chars>` } : item),
  }));
  console.log(JSON.stringify(printable, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  if (stderr) console.error(stderr);
  process.exitCode = 1;
}).finally(() => {
  child.kill();
});
