#!/usr/bin/env node
/**
 * Server-side signup-guard admin for KOINO.
 *
 * Uses the Firebase CLI login already on this machine, so no service-account
 * file has to be stored in the repository. Run from the repo root:
 *
 *   node scripts/signup-admin.mjs config
 *   node scripts/signup-admin.mjs enforce true
 *   node scripts/signup-admin.mjs limit ipHour 10
 *   node scripts/signup-admin.mjs block --type ip --value 203.0.113.7 --hours 24 --reason "signup farm"
 *   node scripts/signup-admin.mjs unblock --type ip --value 203.0.113.7
 *   node scripts/signup-admin.mjs list
 *   node scripts/signup-admin.mjs stats --hours 24
 */
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const project = process.env.GOOGLE_CLOUD_PROJECT || "koino-codex";
const databaseUrl = process.env.KOINO_DATABASE_URL || "https://koino-codex-default-rtdb.europe-west1.firebasedatabase.app";
const configPath = join(homedir(), ".config", "configstore", "firebase-tools.json");

function accessToken() {
  if (process.env.FIREBASE_ACCESS_TOKEN) return process.env.FIREBASE_ACCESS_TOKEN;
  try {
    const config = JSON.parse(readFileSync(configPath, "utf8"));
    const token = config?.tokens?.access_token;
    if (typeof token === "string" && token.length > 0) return token;
  } catch {
    // Fall through to the actionable error below.
  }
  throw new Error("No Firebase CLI login found. Run `firebase login` first, or set FIREBASE_ACCESS_TOKEN.");
}

async function read(path) {
  const response = await fetch(`${databaseUrl}/${path}.json?access_token=${encodeURIComponent(accessToken())}`);
  if (!response.ok) throw new Error(`Read ${path} failed: HTTP ${response.status}`);
  return response.json();
}

async function write(path, value) {
  const response = await fetch(`${databaseUrl}/${path}.json?access_token=${encodeURIComponent(accessToken())}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(value),
  });
  if (!response.ok) throw new Error(`Write ${path} failed: HTTP ${response.status}`);
}

async function remove(path) {
  const response = await fetch(`${databaseUrl}/${path}.json?access_token=${encodeURIComponent(accessToken())}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Delete ${path} failed: HTTP ${response.status}`);
}

async function pepper() {
  const value = await read("signupGuard/secret/pepper");
  if (typeof value !== "string" || value.length < 32) throw new Error("Signup guard pepper is missing.");
  return value;
}

function normalizeValue(type, value) {
  if (type === "email") {
    const trimmed = value.trim().toLowerCase();
    const at = trimmed.lastIndexOf("@");
    if (at <= 0) return trimmed;
    let local = trimmed.slice(0, at);
    let domain = trimmed.slice(at + 1);
    if (domain === "googlemail.com") domain = "gmail.com";
    const plus = local.indexOf("+");
    if (plus > 0) local = local.slice(0, plus);
    if (domain === "gmail.com") local = local.replace(/\./g, "");
    return `${local}@${domain}`;
  }
  if (type === "domain") return value.trim().toLowerCase();
  return value.trim();
}

async function hash(value) {
  return createHmac("sha256", await pepper()).update(value).digest("hex");
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    type: { type: "string" },
    value: { type: "string" },
    hours: { type: "string", default: "24" },
    reason: { type: "string", default: "manual block" },
  },
});

const [command, ...rest] = positionals;

if (command === "config") {
  print(await read("signupGuard/config"));
} else if (command === "enforce") {
  const enabled = rest[0] === "true";
  const config = (await read("signupGuard/config")) ?? {};
  config.enforce = enabled;
  await write("signupGuard/config", config);
  console.log(`enforce=${enabled}`);
} else if (command === "limit") {
  const [key, raw] = rest;
  if (!key || !raw) throw new Error("Usage: limit <name> <number>");
  const config = (await read("signupGuard/config")) ?? {};
  config.limits = { ...(config.limits ?? {}), [key]: Number(raw) };
  await write("signupGuard/config", config);
  console.log(`${key}=${config.limits[key]}`);
} else if (command === "block") {
  const type = values.type;
  const value = values.value;
  if (!type || !value) throw new Error("Usage: block --type ip|subnet|email|domain --value <value> [--hours 24] [--reason ...]");
  if (!["ip", "subnet", "email", "domain"].includes(type)) throw new Error("Unknown block type.");
  const hours = Math.max(1, Number(values.hours) || 24);
  const valueHash = await hash(normalizeValue(type, value));
  await write(`signupGuard/blocklist/${type}_${valueHash}`, {
    type,
    valueHash,
    reason: values.reason,
    createdAt: Date.now(),
    expiresAt: Date.now() + hours * 60 * 60 * 1000,
    createdBy: "signup-admin.mjs",
  });
  console.log(`blocked ${type} for ${hours}h`);
} else if (command === "unblock") {
  const type = values.type;
  const value = values.value;
  if (!type || !value) throw new Error("Usage: unblock --type ip|subnet|email|domain --value <value>");
  await remove(`signupGuard/blocklist/${type}_${await hash(normalizeValue(type, value))}`);
  console.log(`unblocked ${type}`);
} else if (command === "list") {
  const blocklist = (await read("signupGuard/blocklist")) ?? {};
  print(Object.entries(blocklist).map(([key, entry]) => ({
    key,
    type: entry?.type,
    reason: entry?.reason,
    expiresAt: entry?.expiresAt ? new Date(entry.expiresAt).toISOString() : "never",
  })));
} else if (command === "stats") {
  const hours = Math.max(1, Number(values.hours) || 24);
  const since = Date.now() - hours * 60 * 60 * 1000;
  const events = (await read("signupGuard/events")) ?? {};
  const recent = Object.values(events).filter((entry) => typeof entry?.createdAt === "number" && entry.createdAt >= since);
  const by = (field) => recent.reduce((result, entry) => {
    const key = String(entry?.[field] ?? "unknown");
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
  print({ hours, total: recent.length, decision: by("decision"), reason: by("reason"), bucket: by("bucket") });
} else {
  console.log("Commands: config | enforce <true|false> | limit <name> <number> | block | unblock | list | stats");
}
