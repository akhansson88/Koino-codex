import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSync } from "esbuild";

const bundle = buildSync({
  entryPoints: ["state/presence-model.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
});
const model = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const {
  PRESENCE_INACTIVE_WINDOW_MS,
  PRESENCE_ONLINE_WINDOW_MS,
  derivePresence,
  deriveUserPresence,
  presenceCounts,
} = model;

const now = Date.UTC(2026, 10, 24, 10, 0, 0);
const minutesAgo = (minutes) => now - minutes * 60_000;
const record = (sessions) => ({ sessions: Object.fromEntries(sessions.map((session, index) => [`device-${index}`, session])) });

assert.equal(PRESENCE_ONLINE_WINDOW_MS, 2 * 60_000);
assert.equal(PRESENCE_INACTIVE_WINDOW_MS, 30 * 60_000);

// A fresh online heartbeat is online.
assert.deepEqual(
  deriveUserPresence(record([{ state: "online", at: minutesAgo(0.5) }]), now),
  { status: "online", lastSeen: minutesAgo(0.5) },
);

// Online but no heartbeat for 10 minutes is inactive, and keeps last seen.
assert.deepEqual(
  deriveUserPresence(record([{ state: "online", at: minutesAgo(10) }]), now),
  { status: "inactive", lastSeen: minutesAgo(10) },
);

// Backgrounding the app marks the member inactive immediately.
assert.deepEqual(
  deriveUserPresence(record([{ state: "away", at: minutesAgo(3) }]), now),
  { status: "inactive", lastSeen: minutesAgo(3) },
);

// A closed session older than the inactive window is offline.
assert.deepEqual(
  deriveUserPresence(record([{ state: "offline", at: minutesAgo(125) }]), now),
  { status: "offline", lastSeen: minutesAgo(125) },
);

// No session at all is offline and never seen.
assert.deepEqual(deriveUserPresence({}, now), { status: "offline" });
assert.deepEqual(deriveUserPresence(null, now), { status: "offline" });

// One live device wins even when another was last seen hours ago.
assert.deepEqual(
  deriveUserPresence(
    record([
      { state: "offline", at: minutesAgo(300) },
      { state: "online", at: minutesAgo(1) },
    ]),
    now,
  ),
  { status: "online", lastSeen: minutesAgo(1) },
);

// lastSeen is the newest session stamp, even for hidden sessions.
assert.deepEqual(
  deriveUserPresence(record([{ state: "hidden", at: minutesAgo(4) }]), now),
  { status: "hidden", lastSeen: minutesAgo(4) },
);

// A future clock stamp is clamped to now instead of showing a negative age.
assert.deepEqual(
  deriveUserPresence(record([{ state: "online", at: now + 60 * 60_000 }]), now),
  { status: "online", lastSeen: now },
);

// Malformed sessions are ignored instead of crashing the list.
assert.deepEqual(deriveUserPresence({ sessions: { broken: { state: "online", at: "soon" } } }, now), { status: "offline" });

const presence = derivePresence(
  {
    online: record([{ state: "online", at: minutesAgo(1) }]),
    inactive: record([{ state: "away", at: minutesAgo(8) }]),
    offline: record([{ state: "offline", at: minutesAgo(120) }]),
  },
  now,
);
assert.deepEqual(Object.keys(presence).sort(), ["inactive", "offline", "online"]);
assert.deepEqual(presenceCounts(presence, ["online", "inactive", "offline", "missing"]), {
  online: 1,
  inactive: 1,
  offline: 2,
  hidden: 0,
});

const rules = JSON.parse(readFileSync("firebase.rules.json", "utf8")).rules;
assert.ok(rules.presence?.$groupId?.[".read"], "presence must be readable by community members");
assert.ok(rules.presence.$groupId.$uid?.[".write"], "presence must be writable by its member");
assert.ok(rules.presence.$groupId.$uid.sessions.$deviceId?.[".validate"], "presence sessions must be validated");
assert.match(rules.presence.$groupId.$uid[".write"], /auth\.uid == \$uid/);
assert.match(rules.presence.$groupId[".read"], /e2eeGroups/);
assert.match(rules.presence.$groupId.$uid.sessions.$deviceId[".validate"], /'hidden'/);

console.log("Presence model and rules validated.");
