import { createHash } from "node:crypto";
import { defineSecret } from "firebase-functions/params";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import nodemailer from "nodemailer";

import { adminApp } from "./firebase-admin";
import { passwordResetHtml } from "./emails/passwordResetHtml.generated";
import { passwordResetCopy, type PasswordResetCopy } from "./emails/password-reset-copy.generated";
import { renderAccountEmail } from "./emails/render";
import { serviceLanguage, type ServiceLanguage } from "./service-language";

// Sending-only mailbox on the product domain. Firebase's own mailer refuses
// template changes on this project, so the branded messages go out through it.
const smtpPassword = defineSecret("SMTP_PASSWORD");
const SMTP_HOST = process.env.SMTP_HOST ?? "smtp.strato.de";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? "465");
const SMTP_USER = process.env.SMTP_USER ?? "no-reply@koinolabs.com";
const FROM = "KOINO <no-reply@koinolabs.com>";
const CONTINUE_URL = process.env.RESET_CONTINUE_URL ?? "https://koino-codex.firebaseapp.com/reset-password";
const RESET_LINK_BASE = process.env.RESET_LINK_BASE ?? "https://koinolabs.com/reset/";
const THROTTLE_MS = 60_000;

export function passwordResetEmail(language: ServiceLanguage, copy: PasswordResetCopy, link: string, email: string) {
  return renderAccountEmail(passwordResetHtml, language, copy, link, email);
}

export const koinoSendPasswordReset = onCall(
  { region: "europe-west1", timeoutSeconds: 30, secrets: [smtpPassword] },
  async (request) => {
    const data = (request.data ?? {}) as { email?: unknown; language?: unknown };
    const raw = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(raw)) throw new HttpsError("invalid-argument", "Enter the email address for your account.");
    const language: ServiceLanguage = serviceLanguage(data.language);

    const key = createHash("sha256").update(raw).digest("hex");
    const throttle = getDatabase(adminApp).ref(`passwordResetRequests/${key}`);
    const now = Date.now();
    const previous = Number((await throttle.get()).val() ?? 0);
    // Always answer the same way: the caller never learns whether an account exists.
    if (now - previous < THROTTLE_MS) return { sent: true };
    await throttle.set(now);

    let firebaseLink: string;
    try {
      firebaseLink = await getAuth(adminApp).generatePasswordResetLink(raw, { url: CONTINUE_URL, handleCodeInApp: true });
    } catch {
      return { sent: true };
    }

    // The emailed link goes to our own page, which hands the one-time code to
    // the app's reset screen. Firebase's hosted action page is never shown.
    const code = new URL(firebaseLink).searchParams.get("oobCode");
    if (!code) return { sent: true };
    const link = `${RESET_LINK_BASE}?oobCode=${encodeURIComponent(code)}`;

    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: smtpPassword.value() },
    });
    try {
      const copy = passwordResetCopy[language];
      const { html, text } = passwordResetEmail(language, copy, link, raw);
      await transport.sendMail({
        from: FROM,
        to: raw,
        replyTo: "no-reply@koinolabs.com",
        subject: copy.subject,
        text,
        html,
        headers: { "X-Auto-Response-Suppress": "All", "Auto-Submitted": "auto-generated" },
      });
    } catch (error) {
      console.error("[password-reset] send failed", error instanceof Error ? error.message : "unknown");
      throw new HttpsError("unavailable", "The email could not be sent. Try again in a minute.");
    }
    return { sent: true };
  },
);
