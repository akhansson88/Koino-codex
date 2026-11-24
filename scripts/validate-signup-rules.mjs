import { readFileSync } from "node:fs";

const rules = JSON.parse(readFileSync(new URL("../firebase.rules.json", import.meta.url), "utf8"));
const communityCollections = [
  "checkIns",
  "posts",
  "replies",
  "prayerReactions",
  "postReactions",
  "groupBiblePlanAnnouncements",
  "groupBiblePlanParticipation",
  "groupEvents",
  "eventRsvps",
  "discussionFollowers",
  "userDiscussionFollows",
  "prayerNotifications",
  "groupBiblePlanParticipantIds",
];

function collectWriteRules(node, path, out) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  for (const [key, value] of Object.entries(node)) {
    if (key === ".write" && typeof value === "string" && value !== "false") out.push({ path, value });
    else if (key !== ".write") collectWriteRules(value, `${path}/${key}`, out);
  }
}

const failures = [];
for (const collection of communityCollections) {
  for (const scope of [collection, `encryptedData/${collection}`]) {
    const node = scope.startsWith("encryptedData/")
      ? rules.rules.encryptedData?.[collection]
      : rules.rules[collection];
    if (!node) continue;
    const writes = [];
    collectWriteRules(node, scope, writes);
    for (const write of writes) {
      if (!write.value.includes("auth.token.email_verified == true")) {
        failures.push(`${write.path} saknar e-postverifieringsspärr`);
      }
    }
  }
}

if (rules.rules.signupGuard?.[".read"] !== false || rules.rules.signupGuard?.[".write"] !== false) {
  failures.push("signupGuard måste vara stängd för klientläsning och klientskrivning");
}
for (const path of ["buckets", "actions", "events", "verificationQueue"]) {
  if (!Array.isArray(rules.rules.signupGuard?.[path]?.[".indexOn"])) {
    failures.push(`signupGuard/${path} saknar .indexOn`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log("Signup rules are complete.");
