import assert from "node:assert/strict";
import test from "node:test";

import { passwordResetEmail } from "./account-email";
import { verifyEmailEmail } from "./account-verification-email";
import { passwordResetCopy } from "./emails/password-reset-copy.generated";
import { verifyEmailCopy } from "./emails/verify-email-copy.generated";

test("password reset email renders localized copy without leftover tokens", () => {
  const link = "https://koinolabs.com/reset/?oobCode=abc&x=1";
  const email = "alex@example.com";
  const german = passwordResetEmail("de", passwordResetCopy.de, link, email);
  assert.match(german.html, /Passwort/);
  assert.match(german.html, /alex@example\.com/);
  assert.match(german.html, /lang="de"/);
  assert.match(german.html, /dir="ltr"/);
  assert.match(german.text, /https:\/\/koinolabs\.com\/reset\//);
  assert.doesNotMatch(german.html, /\{\{|%EMAIL%|%LINK%/);
  assert.doesNotMatch(german.text, /%LINK%/);

  const arabic = passwordResetEmail("ar", passwordResetCopy.ar, link, email);
  assert.match(arabic.html, /lang="ar"/);
  assert.match(arabic.html, /dir="rtl"/);
  assert.doesNotMatch(arabic.html, /\{\{|%EMAIL%|%LINK%/);

  const english = passwordResetEmail("en", passwordResetCopy.en, link, email);
  assert.match(english.html, /Reset your password/);
  assert.match(english.html, /lang="en"/);
});

test("verification email renders localized copy without leftover tokens", () => {
  const link = "https://koino-codex.firebaseapp.com/__/auth/action?mode=verifyEmail&oobCode=abc";
  const email = "alex@example.com";
  const german = verifyEmailEmail("de", link, email);
  assert.match(german.html, /Willkommen/);
  assert.match(german.html, /alex@example\.com/);
  assert.match(german.html, /lang="de"/);
  assert.doesNotMatch(german.html, /\{\{|%EMAIL%|%LINK%/);
  assert.doesNotMatch(german.text, /%LINK%/);

  const arabic = verifyEmailEmail("ar", link, email);
  assert.match(arabic.html, /lang="ar"/);
  assert.match(arabic.html, /dir="rtl"/);
  assert.doesNotMatch(arabic.html, /\{\{|%EMAIL%|%LINK%/);

  assert.match(verifyEmailEmail("en", link, email).html, /Welcome to KOINO/);
  assert.equal(verifyEmailCopy.sv.subject.length > 0, true);
});
