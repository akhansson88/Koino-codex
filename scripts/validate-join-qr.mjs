import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { transform } from "esbuild";

const result = await transform(await readFile(new URL("../state/join-qr.ts", import.meta.url), "utf8"), {
  loader: "ts",
  format: "esm",
});
const { joinQrPayload, normalizeInviteCode, parseJoinPayload } = await import(
  `data:text/javascript;base64,${Buffer.from(result.code).toString("base64")}`
);

// The QR carries only the code, never a group id or a name.
assert.equal(joinQrPayload("abc123"), "koino://join?code=ABC123");
assert.equal(joinQrPayload("  AbC-123 "), "koino://join?code=ABC-123");
assert.throws(() => joinQrPayload(""));
assert.throws(() => joinQrPayload("two words"));
assert.throws(() => joinQrPayload("a/b"));

assert.equal(normalizeInviteCode(" abc "), "ABC");

// Bare codes.
assert.equal(parseJoinPayload("ABC123"), "ABC123");
assert.equal(parseJoinPayload("abc123"), "ABC123");
assert.equal(parseJoinPayload("  ABC123  "), "ABC123");

// The scheme the QR and the system camera produce.
assert.equal(parseJoinPayload("koino://join?code=ABC123"), "ABC123");
assert.equal(parseJoinPayload("koino://join?code=abc123&from=qr"), "ABC123");
assert.equal(parseJoinPayload("koino:join?code=ABC123"), "ABC123");
assert.equal(parseJoinPayload("KOINO://JOIN?CODE=ABC123"), "ABC123");

// The https join page, as a later App Link would deliver it.
assert.equal(parseJoinPayload("https://koinolabs.com/join?code=ABC123"), "ABC123");
assert.equal(parseJoinPayload("https://koinolabs.com/join/ABC123"), "ABC123");
assert.equal(parseJoinPayload("https://koinolabs.com/join/ABC123?utm=qr"), "ABC123");

// Malformed payloads are rejected, never guessed.
assert.equal(parseJoinPayload(""), undefined);
assert.equal(parseJoinPayload("   "), undefined);
assert.equal(parseJoinPayload(null), undefined);
assert.equal(parseJoinPayload(undefined), undefined);
assert.equal(parseJoinPayload("koino://join"), undefined);
assert.equal(parseJoinPayload("koino://join?code="), undefined);
assert.equal(parseJoinPayload("koino://join?code=!!!bad"), undefined);
assert.equal(parseJoinPayload("https://koinolabs.com/"), undefined);
assert.equal(parseJoinPayload("https://example.com/join?code=ABC123"), "ABC123");
assert.equal(parseJoinPayload("mailto:someone@example.com"), undefined);
assert.equal(parseJoinPayload("ABC 123"), undefined);

console.log("Join QR payload validation passed.");

// The same gate the members screen and room details use.
const roles = await transform(await readFile(new URL("../features/community/roles.ts", import.meta.url), "utf8"), {
  loader: "ts",
  format: "esm",
});
const { canApproveJoinRequests } = await import(`data:text/javascript;base64,${Buffer.from(roles.code).toString("base64")}`);

assert.equal(canApproveJoinRequests("owner", { joinApprovers: undefined }), true);
assert.equal(canApproveJoinRequests("owner", { joinApprovers: "owner" }), true);
assert.equal(canApproveJoinRequests("owner", { joinApprovers: "owner_and_leaders" }), true);
assert.equal(canApproveJoinRequests("leader", { joinApprovers: "owner_and_leaders" }), true);
assert.equal(canApproveJoinRequests("leader", { joinApprovers: "owner" }), false);
assert.equal(canApproveJoinRequests("leader", { joinApprovers: undefined }), false);
assert.equal(canApproveJoinRequests("member", { joinApprovers: "owner_and_leaders" }), false);
assert.equal(canApproveJoinRequests(undefined, { joinApprovers: "owner_and_leaders" }), false);
assert.equal(canApproveJoinRequests("owner", undefined), false);

console.log("Join approver gate validation passed.");
