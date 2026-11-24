/**
 * Pure signup-policy rules. No Firebase imports live here so the limits can be
 * unit tested with a fake clock and a deterministic hasher.
 */

export type SignupMode = "open" | "limited" | "closed";

export type SignupGuardLimits = {
  ipHour: number;
  ipDay: number;
  netHour: number;
  netDay: number;
  emailDay: number;
  emailMonth: number;
  domainHour: number;
  domainDay: number;
  globalHour: number;
  globalDay: number;
};

export type SignupGuardConfig = {
  mode: SignupMode;
  enforce: boolean;
  limits: SignupGuardLimits;
  blockDisposableDomains: boolean;
  allowlistDomains: string[];
};

export type SignupSubject = {
  email: string;
  ipAddress: string;
  userAgent: string;
  now: number;
};

export type SignupBucket = {
  key: string;
  label: string;
  limit: number;
  expiresAt: number;
};

export type PreCheck =
  | { allowed: true; email: string; domain: string; canonicalEmail: string }
  | {
      allowed: false;
      reason: "closed" | "disposable_email";
      email: string;
      domain: string;
      canonicalEmail: string;
    };

export type HashFn = (value: string) => string;

export const DEFAULT_LIMITS: SignupGuardLimits = {
  ipHour: 20,
  ipDay: 40,
  netHour: 50,
  netDay: 150,
  emailDay: 5,
  emailMonth: 10,
  domainHour: 50,
  domainDay: 200,
  globalHour: 500,
  globalDay: 2000,
};

export const DEFAULT_CONFIG: SignupGuardConfig = {
  mode: "open",
  // Phase 1 intentionally starts in shadow mode. Flip this in the deployed
  // config after the counters have been observed for a day.
  enforce: false,
  limits: DEFAULT_LIMITS,
  blockDisposableDomains: true,
  allowlistDomains: [],
};

/**
 * A small, deliberately conservative list of disposable-mail providers.
 * Subdomains are covered by the suffix check below. The list can be extended
 * without a deploy by adding entries to the config document.
 */
export const DISPOSABLE_DOMAINS = new Set([
  "10minutemail.com",
  "10minutemail.net",
  "20minutemail.com",
  "33mail.com",
  "anonbox.net",
  "binkmail.com",
  "bobmail.info",
  "burnermail.io",
  "chammy.info",
  "discard.email",
  "discardmail.com",
  "discardmail.de",
  "dispostable.com",
  "emailfake.com",
  "emailondeck.com",
  "etempmail.com",
  "fakeinbox.com",
  "generator.email",
  "getairmail.com",
  "getnada.com",
  "grr.la",
  "guerrillamail.biz",
  "guerrillamail.com",
  "guerrillamail.de",
  "guerrillamail.info",
  "guerrillamail.net",
  "guerrillamail.org",
  "guerrillamailblock.com",
  "harakirimail.com",
  "inboxkitten.com",
  "jetable.org",
  "letthemeatspam.com",
  "mailcatch.com",
  "maildrop.cc",
  "mailforspam.com",
  "mailimate.com",
  "mailinator.com",
  "mailinator.net",
  "mailinator2.com",
  "mailismagic.com",
  "mailmetrash.com",
  "mailnesia.com",
  "mailnull.com",
  "mailpoof.com",
  "mailsac.com",
  "mailsiphon.com",
  "mailtemp.info",
  "mailzilla.com",
  "mbx.cc",
  "meltmail.com",
  "mintemail.com",
  "moakt.com",
  "mohmal.com",
  "mytemp.email",
  "nada.email",
  "nepwk.com",
  "nervmich.net",
  "nervtmich.net",
  "netmails.com",
  "netmails.net",
  "neverbox.com",
  "nobulk.com",
  "noclickemail.com",
  "nomail.xl.cx",
  "nomail2me.com",
  "nospam.ze.tc",
  "nospam4.us",
  "nospamfor.us",
  "nospammail.net",
  "nowmymail.com",
  "oneoffemail.com",
  "onewaymail.com",
  "oopi.org",
  "pokemail.net",
  "pookmail.com",
  "proxymail.eu",
  "rcpt.at",
  "recode.me",
  "regbypass.com",
  "rejectmail.com",
  "rtrtr.com",
  "s0ny.net",
  "safe-mail.net",
  "sharklasers.com",
  "shitmail.me",
  "shortmail.net",
  "skeefmail.com",
  "slaskpost.se",
  "smashmail.de",
  "snakemail.com",
  "sneakemail.com",
  "snkmail.com",
  "sofort-mail.de",
  "spam.la",
  "spam4.me",
  "spamavert.com",
  "spambob.com",
  "spambob.net",
  "spambob.org",
  "spambog.com",
  "spambog.de",
  "spambog.ru",
  "spambox.info",
  "spambox.us",
  "spamcannon.com",
  "spamcannon.net",
  "spamcero.com",
  "spamcon.org",
  "spamcorptastic.com",
  "spamcowboy.com",
  "spamcowboy.net",
  "spamcowboy.org",
  "spamday.com",
  "spamex.com",
  "spamfree24.com",
  "spamfree24.de",
  "spamfree24.eu",
  "spamfree24.info",
  "spamfree24.net",
  "spamfree24.org",
  "spamgoes.in",
  "spamgourmet.com",
  "spamgourmet.net",
  "spamgourmet.org",
  "spamherelots.com",
  "spamhereplease.com",
  "spamhole.com",
  "spamify.com",
  "spaminator.de",
  "spamkill.info",
  "spaml.com",
  "spaml.de",
  "spammotel.com",
  "spamobox.com",
  "spamoff.de",
  "spamsalad.in",
  "spamslicer.com",
  "spamspot.com",
  "spamstack.net",
  "spamthis.co.uk",
  "spamthisplease.com",
  "spamtrail.com",
  "spamtroll.net",
  "speed.1s.fr",
  "supergreatmail.com",
  "teewars.org",
  "teleworm.com",
  "teleworm.us",
  "temp-mail.org",
  "temp-mail.ru",
  "tempail.com",
  "tempalias.com",
  "tempe-mail.com",
  "tempemail.biz",
  "tempemail.com",
  "tempemail.net",
  "tempinbox.co.uk",
  "tempinbox.com",
  "tempmail.co",
  "tempmail.it",
  "tempmail2.com",
  "tempmaildemo.com",
  "tempmailer.com",
  "tempmailer.de",
  "tempomail.fr",
  "temporaryemail.net",
  "temporaryforwarding.com",
  "temporaryinbox.com",
  "temporarymailaddress.com",
  "tempthe.net",
  "thankyou2010.com",
  "thisisnotmyrealemail.com",
  "throwawayemailaddress.com",
  "throwawaymail.com",
  "tilien.com",
  "tmail.ws",
  "tmailinator.com",
  "toiea.com",
  "toomail.biz",
  "tradermail.info",
  "trash-amil.com",
  "trash-mail.at",
  "trash-mail.com",
  "trash-mail.de",
  "trash2009.com",
  "trash2010.com",
  "trash2011.com",
  "trashdevil.com",
  "trashdevil.de",
  "trashemail.de",
  "trashmail.at",
  "trashmail.com",
  "trashmail.de",
  "trashmail.me",
  "trashmail.net",
  "trashmail.org",
  "trashmail.ws",
  "trashmailer.com",
  "trashymail.com",
  "trashymail.net",
  "trayna.com",
  "trbvm.com",
  "twinmail.de",
  "tyldd.com",
  "uggsrock.com",
  "uroid.com",
  "venompen.com",
  "veryrealemail.com",
  "viditag.com",
  "vomoto.com",
  "vubby.com",
  "wasteland.rfc822.org",
  "webemail.me",
  "wegwerfmail.de",
  "wegwerfmail.net",
  "wegwerfmail.org",
  "wh4f.org",
  "whyspam.me",
  "willselfdestruct.com",
  "winemaven.info",
  "wronghead.com",
  "wuzup.net",
  "wuzupmail.net",
  "xagloo.com",
  "xemaps.com",
  "xents.com",
  "xmaily.com",
  "xoxy.net",
  "yep.it",
  "yogamaven.com",
  "yopmail.com",
  "yopmail.fr",
  "yopmail.net",
  "yuurok.com",
  "zehnminuten.de",
  "zehnminutenmail.de",
  "zetmail.com",
  "zippymail.info",
  "zoaxe.com",
  "zoemail.org",
  "zomg.info",
]);

const PUBLIC_EMAIL_DOMAINS = new Set([
  "aol.com",
  "gmail.com",
  "googlemail.com",
  "gmx.com",
  "gmx.net",
  "hotmail.com",
  "icloud.com",
  "live.com",
  "mail.com",
  "me.com",
  "outlook.com",
  "proton.me",
  "protonmail.com",
  "qq.com",
  "web.de",
  "yahoo.com",
  "yandex.com",
  "zoho.com",
]);

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;

function splitEmail(email: string): { local: string; domain: string } | null {
  const at = email.lastIndexOf("@");
  if (at <= 0 || at === email.length - 1) return null;
  return {
    local: email.slice(0, at).trim().toLowerCase(),
    domain: email.slice(at + 1).trim().toLowerCase().replace(/\.$/, ""),
  };
}

/**
 * Canonical form used only for rate-limit keys. It deliberately does not
 * change what the user signs in with; Firebase keeps the real address.
 */
export function canonicalEmail(email: string): { email: string; domain: string; canonical: string } {
  const trimmed = email.trim().toLowerCase();
  const parts = splitEmail(trimmed);
  if (!parts) return { email: trimmed, domain: "", canonical: trimmed };

  const domain = parts.domain === "googlemail.com" ? "gmail.com" : parts.domain;
  let local = parts.local;
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "gmail.com") local = local.replace(/\./g, "");

  return { email: trimmed, domain, canonical: `${local}@${domain}` };
}

export function isDisposableDomain(domain: string): boolean {
  if (!domain) return false;
  for (const candidate of DISPOSABLE_DOMAINS) {
    if (domain === candidate || domain.endsWith(`.${candidate}`)) return true;
  }
  return false;
}

function allowedDomain(domain: string, allowlist: string[]): boolean {
  return allowlist.some((entry) => {
    const normalized = entry.trim().toLowerCase().replace(/^@/, "");
    return normalized.length > 0 && (domain === normalized || domain.endsWith(`.${normalized}`));
  });
}

function expandIpv6(value: string): string[] | null {
  const [head, tail] = value.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  return [...left, ...Array.from({ length: missing }, () => "0"), ...right];
}

export function ipSubnet(ipAddress: string): string {
  const ip = ipAddress.trim();
  if (!ip) return "";
  if (ip.includes(".") && !ip.includes(":")) {
    const octets = ip.split(".");
    if (octets.length === 4 && octets.every((octet) => /^\d{1,3}$/.test(octet))) {
      return `${octets[0]}.${octets[1]}.${octets[2]}.0/24`;
    }
    return ip;
  }
  if (ip.includes(":")) {
    const expanded = expandIpv6(ip);
    if (expanded) return `${expanded.slice(0, 4).join(":")}::/64`;
  }
  return ip;
}

export function preCheckSignup(subject: SignupSubject, config: SignupGuardConfig): PreCheck {
  const parsed = canonicalEmail(subject.email);
  const identity = {
    email: parsed.email,
    domain: parsed.domain,
    canonicalEmail: parsed.canonical,
  };

  if (config.mode === "closed") return { allowed: false, reason: "closed", ...identity };
  if (config.mode === "limited" && !allowedDomain(identity.domain, config.allowlistDomains)) {
    return { allowed: false, reason: "closed", ...identity };
  }
  if (config.blockDisposableDomains && isDisposableDomain(identity.domain)) {
    return { allowed: false, reason: "disposable_email", ...identity };
  }
  return { allowed: true, ...identity };
}

export function buildSignupBuckets(
  subject: SignupSubject,
  identity: PreCheck,
  config: SignupGuardConfig,
  hash: HashFn,
): SignupBucket[] {
  if (!identity.allowed) return [];

  const now = subject.now;
  const hourWindow = Math.floor(now / HOUR_MS);
  const dayWindow = Math.floor(now / DAY_MS);
  const monthWindow = Math.floor(now / MONTH_MS);
  const buckets: SignupBucket[] = [];
  const add = (key: string, label: string, limit: number, expiry: number) => {
    if (limit > 0) buckets.push({ key, label, limit, expiresAt: expiry });
  };

  const ip = subject.ipAddress.trim();
  if (ip) {
    add(`ip:${hash(ip)}:h:${hourWindow}`, "ip_hour", config.limits.ipHour, (hourWindow + 2) * HOUR_MS);
    add(`ip:${hash(ip)}:d:${dayWindow}`, "ip_day", config.limits.ipDay, (dayWindow + 2) * DAY_MS);
    const subnet = ipSubnet(ip);
    if (subnet && subnet !== ip) {
      add(`net:${hash(subnet)}:h:${hourWindow}`, "net_hour", config.limits.netHour, (hourWindow + 2) * HOUR_MS);
      add(`net:${hash(subnet)}:d:${dayWindow}`, "net_day", config.limits.netDay, (dayWindow + 2) * DAY_MS);
    }
  }

  add(`email:${hash(identity.canonicalEmail)}:d:${dayWindow}`, "email_day", config.limits.emailDay, (dayWindow + 2) * DAY_MS);
  add(`email:${hash(identity.canonicalEmail)}:m:${monthWindow}`, "email_month", config.limits.emailMonth, (monthWindow + 2) * MONTH_MS);

  if (identity.domain && !PUBLIC_EMAIL_DOMAINS.has(identity.domain)) {
    add(`domain:${hash(identity.domain)}:h:${hourWindow}`, "domain_hour", config.limits.domainHour, (hourWindow + 2) * HOUR_MS);
    add(`domain:${hash(identity.domain)}:d:${dayWindow}`, "domain_day", config.limits.domainDay, (dayWindow + 2) * DAY_MS);
  }

  add(`global:h:${hourWindow}`, "global_hour", config.limits.globalHour, (hourWindow + 2) * HOUR_MS);
  add(`global:d:${dayWindow}`, "global_day", config.limits.globalDay, (dayWindow + 2) * DAY_MS);

  return buckets;
}
