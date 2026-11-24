import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSignupBuckets,
  canonicalEmail,
  DEFAULT_CONFIG,
  DEFAULT_LIMITS,
  ipSubnet,
  isDisposableDomain,
  preCheckSignup,
  type SignupGuardConfig,
} from "./policy";

function config(overrides: Partial<SignupGuardConfig> = {}): SignupGuardConfig {
  return { ...DEFAULT_CONFIG, ...overrides, limits: { ...DEFAULT_LIMITS, ...(overrides.limits ?? {}) } };
}

const identityHash = (value: string) => `h:${value}`;

test("canonicalises Gmail dots and plus aliases without changing the real address", () => {
  assert.deepEqual(canonicalEmail("  Alex.Hansson+koino@googlemail.com "), {
    email: "alex.hansson+koino@googlemail.com",
    domain: "gmail.com",
    canonical: "alexhansson@gmail.com",
  });
});

test("keeps plus aliases on custom domains only for the rate-limit key", () => {
  const value = canonicalEmail("team+signup@example.church");
  assert.equal(value.email, "team+signup@example.church");
  assert.equal(value.canonical, "team@example.church");
});

test("recognises disposable domains and their subdomains", () => {
  assert.equal(isDisposableDomain("mailinator.com"), true);
  assert.equal(isDisposableDomain("inbox.mailinator.com"), true);
  assert.equal(isDisposableDomain("example.church"), false);
});

test("reduces IPv4 to /24 and IPv6 to /64", () => {
  assert.equal(ipSubnet("203.0.113.7"), "203.0.113.0/24");
  assert.equal(ipSubnet("2001:db8:abcd:1234:5678:90ab:cdef:1234"), "2001:db8:abcd:1234::/64");
  assert.equal(ipSubnet("::1"), "0:0:0:0::/64");
});

test("blocks disposable email before any counter is touched", () => {
  const result = preCheckSignup({
    email: "someone@mailinator.com",
    ipAddress: "203.0.113.7",
    userAgent: "test",
    now: 1_700_000_000_000,
  }, config());
  assert.equal(result.allowed, false);
  assert.equal(result.allowed ? "" : result.reason, "disposable_email");
});

test("honours closed and allow-listed limited modes", () => {
  const subject = { email: "person@example.church", ipAddress: "203.0.113.7", userAgent: "test", now: 1_700_000_000_000 };
  assert.equal(preCheckSignup(subject, config({ mode: "closed" })).allowed, false);
  assert.equal(preCheckSignup(subject, config({ mode: "limited", allowlistDomains: [] })).allowed, false);
  assert.equal(preCheckSignup(subject, config({ mode: "limited", allowlistDomains: ["example.church"] })).allowed, true);
});

test("builds per-IP, per-network, per-email, per-domain and global buckets", () => {
  const subject = { email: "person@example.church", ipAddress: "203.0.113.7", userAgent: "test", now: 1_700_000_000_000 };
  const pre = preCheckSignup(subject, config());
  const buckets = buildSignupBuckets(subject, pre, config(), identityHash);
  const labels = buckets.map((bucket) => bucket.label).sort();
  assert.deepEqual(labels, [
    "domain_day",
    "domain_hour",
    "email_day",
    "email_month",
    "global_day",
    "global_hour",
    "ip_day",
    "ip_hour",
    "net_day",
    "net_hour",
  ]);
  assert.ok(buckets.every((bucket) => bucket.limit > 0 && bucket.expiresAt > subject.now));
});

test("does not add a domain bucket for public mailbox providers", () => {
  const subject = { email: "person@gmail.com", ipAddress: "203.0.113.7", userAgent: "test", now: 1_700_000_000_000 };
  const pre = preCheckSignup(subject, config());
  const labels = buildSignupBuckets(subject, pre, config(), identityHash).map((bucket) => bucket.label);
  assert.equal(labels.includes("domain_hour"), false);
  assert.equal(labels.includes("email_day"), true);
});
