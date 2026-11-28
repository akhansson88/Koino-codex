import { createHash } from "node:crypto";
import { defineSecret } from "firebase-functions/params";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { getAuth } from "firebase-admin/auth";
import { getDatabase } from "firebase-admin/database";
import nodemailer from "nodemailer";

import { adminApp } from "./firebase-admin";
import { verifyEmailHtml } from "./emails/verifyEmailHtml.generated";
import { verifyEmailCopy } from "./emails/verify-email-copy.generated";
import { renderAccountEmail } from "./emails/render";
import { serviceLanguage, type ServiceLanguage } from "./service-language";

const smtpPassword = defineSecret("SMTP_PASSWORD");
const SMTP_HOST = process.env.SMTP_HOST ?? "smtp.strato.de";
const SMTP_PORT = Number(process.env.SMTP_PORT ?? "465");
const SMTP_USER = process.env.SMTP_USER ?? "no-reply@koinolabs.com";
const FROM = "KOINO <no-reply@koinolabs.com>";
const VERIFY_CONTINUE_URL = process.env.VERIFY_CONTINUE_URL ?? "https://koinolabs.com/";
const THROTTLE_MS = 60_000;

export function verifyEmailEmail(language: ServiceLanguage, link: string, email: string) {
  return renderAccountEmail(verifyEmailHtml, language, verifyEmailCopy[language], link, email);
}

export const koinoSendEmailVerification = onCall(
  { region: "europe-west1", timeoutSeconds: 30, secrets: [smtpPassword] },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) throw new HttpsError("unauthenticated", "Sign in again before requesting a verification email.");

    const user = await getAuth(adminApp).getUser(uid);
    if (!user.email) throw new HttpsError("failed-precondition", "This account has no email address.");
    if (user.emailVerified) return { sent: true };

    const key = createHash("sha256").update(`verify:${uid}`).digest("hex");
    const throttle = getDatabase(adminApp).ref(`verificationEmailRequests/${key}`);
    const now = Date.now();
    const previous = Number((await throttle.get()).val() ?? 0);
    if (now - previous < THROTTLE_MS) return { sent: true };
    await throttle.set(now);

    let link: string;
    try {
      link = await getAuth(adminApp).generateEmailVerificationLink(user.email, { url: VERIFY_CONTINUE_URL });
    } catch {
      try {
        link = await getAuth(adminApp).generateEmailVerificationLink(user.email);
      } catch {
        return { sent: true };
      }
    }

    const language = serviceLanguage((request.data as { language?: unknown } | undefined)?.language);
    const copy = verifyEmailCopy[language];
    const { html, text } = verifyEmailEmail(language, link, user.email);

    const transport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: smtpPassword.value() },
    });
    try {
      await transport.sendMail({
        from: FROM,
        to: user.email,
        replyTo: "no-reply@koinolabs.com",
        subject: copy.subject,
        text,
        html,
        headers: { "X-Auto-Response-Suppress": "All", "Auto-Submitted": "auto-generated" },
      });
    } catch (error) {
      console.error("[verify-email] send failed", error instanceof Error ? error.message : "unknown");
      throw new HttpsError("unavailable", "The email could not be sent. Try again in a minute.");
    }
    return { sent: true };
  },
);
