import { logger } from "firebase-functions";
import { beforeUserCreated, HttpsError } from "firebase-functions/v2/identity";

import {
  buildSignupBuckets,
  ipSubnet,
  preCheckSignup,
  type SignupGuardConfig,
  type SignupSubject,
} from "./policy";
import {
  getConfig,
  hashValue,
  incrementBucket,
  isBlocked,
  logSignupEvent,
  queueVerification,
  type SignupEvent,
} from "./store";

function safeErrorCode(error: unknown): string {
  if (error && typeof error === "object") {
    if ("code" in error && typeof error.code === "string") return error.code;
    if ("name" in error && typeof error.name === "string") return error.name;
  }
  return "unknown";
}

type GuardDecision = {
  blocked: boolean;
  reason: string;
  bucket?: string;
  count?: number;
  limit?: number;
};

async function evaluateSignup(
  subject: SignupSubject,
  config: SignupGuardConfig,
): Promise<{
  decision: GuardDecision;
  event: Omit<SignupEvent, "decision">;
}> {
  const identity = preCheckSignup(subject, config);
  const ip = subject.ipAddress.trim();
  const subnet = ipSubnet(ip);
  const [ipHash, netHash, emailHash, uaHash, domainHash] = await Promise.all([
    hashValue(ip || "unknown"),
    hashValue(subnet || ip || "unknown"),
    hashValue(identity.canonicalEmail || subject.email || "unknown"),
    hashValue(subject.userAgent || "unknown"),
    hashValue(identity.domain || "unknown"),
  ]);

  const baseEvent = {
    reason: "allowed",
    ipHash,
    netHash,
    emailHash,
    uaHash,
    domainHash,
  };

  if (!identity.allowed) {
    return {
      decision: { blocked: true, reason: identity.reason },
      event: { ...baseEvent, reason: identity.reason },
    };
  }

  const [ipBlocked, netBlocked, emailBlocked, domainBlocked] = await Promise.all([
    isBlocked("ip", ipHash),
    isBlocked("subnet", netHash),
    isBlocked("email", emailHash),
    identity.domain ? isBlocked("domain", domainHash) : Promise.resolve(false),
  ]);
  if (ipBlocked || netBlocked || emailBlocked || domainBlocked) {
    return {
      decision: { blocked: true, reason: "blocked" },
      event: { ...baseEvent, reason: "blocked" },
    };
  }

  const buckets = buildSignupBuckets(subject, identity, config, (value) => {
    if (value === subject.ipAddress.trim()) return ipHash;
    if (value === subnet) return netHash;
    if (value === identity.canonicalEmail) return emailHash;
    if (value === identity.domain) return domainHash;
    throw new Error("Signup guard received an unhashed bucket value.");
  });
  if (buckets.length === 0) {
    return { decision: { blocked: false, reason: "allowed" }, event: baseEvent };
  }

  for (const bucket of buckets) {
    const count = await incrementBucket(bucket);
    if (count > bucket.limit) {
      return {
        decision: {
          blocked: true,
          reason: "rate_limited",
          bucket: bucket.label,
          count,
          limit: bucket.limit,
        },
        event: { ...baseEvent, reason: "rate_limited", bucket: bucket.label, count, limit: bucket.limit },
      };
    }
  }

  return { decision: { blocked: false, reason: "allowed" }, event: baseEvent };
}

export const koinoSignupGuard = beforeUserCreated(
  { region: "europe-west1", timeoutSeconds: 7, maxInstances: 20 },
  async (event) => {
    const data = event.data;
    if (!data) return;
    const email = data.email ?? "";
    const subject: SignupSubject = {
      email,
      ipAddress: event.ipAddress ?? "",
      userAgent: event.userAgent ?? "",
      now: Date.now(),
    };

    try {
      const config = await getConfig();
      const { decision, event: signupEvent } = await evaluateSignup(subject, config);
      const logDecision = decision.blocked ? (config.enforce ? "blocked" : "shadow_blocked") : "allowed";

      await logSignupEvent({ ...signupEvent, decision: logDecision }).catch((error) => {
        logger.error("signup_guard_event_write_failed", { code: safeErrorCode(error) });
      });

      if (decision.blocked) {
        if (!config.enforce) {
          logger.warn("signup_guard_shadow_block", {
            reason: decision.reason,
            bucket: decision.bucket,
            count: decision.count,
            limit: decision.limit,
          });
          return;
        }
        throw new HttpsError("resource-exhausted", `SIGNUP_BLOCKED:${decision.reason}`);
      }

      if (config.enforce && data.uid) {
        await queueVerification(data.uid, signupEvent.emailHash).catch((error) => {
          logger.error("signup_guard_queue_failed", { code: safeErrorCode(error) });
        });
      }
      return;
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      // A broken counter must not stop every new account. The email gate is the
      // second line of defence; this path always raises an alert in monitoring.
      logger.error("signup_guard_failed_open", { code: safeErrorCode(error) });
      return;
    }
  },
);
