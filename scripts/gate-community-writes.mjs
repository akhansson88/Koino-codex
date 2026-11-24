import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../firebase.rules.json", import.meta.url);
const rules = JSON.parse(readFileSync(path, "utf8"));

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

function gateWrites(node) {
  if (!node || typeof node !== "object" || Array.isArray(node)) return;
  if (typeof node[".write"] === "string" && node[".write"] !== "false") {
    node[".write"] = `(auth != null && auth.token.email_verified == true) && (${node[".write"]})`;
  }
  for (const [key, value] of Object.entries(node)) {
    if (key !== ".write") gateWrites(value);
  }
}

for (const collection of communityCollections) {
  if (rules.rules[collection]) gateWrites(rules.rules[collection]);
  if (rules.rules.encryptedData?.[collection]) gateWrites(rules.rules.encryptedData[collection]);
}

rules.rules.signupGuard = {
  ".read": false,
  ".write": false,
  buckets: { ".indexOn": ["expiresAt"] },
  actions: { ".indexOn": ["expiresAt"] },
  events: { ".indexOn": ["expiresAt"] },
  verificationQueue: { ".indexOn": ["expiresAt"] },
};

writeFileSync(path, `${JSON.stringify(rules)}\n`, "utf8");
console.log("Updated firebase.rules.json");
