import type { TranslationFunction, TranslationKey } from "@/ui/localization";

// The store keeps the same stable English strings for local session errors.
// Map the known ones to translation keys and never leak a raw English message
// into another language.
const knownMessages: Record<string, TranslationKey> = {
  "Something went wrong. Please try again.": "errors.generic",
  "That email already has an account. Try signing in instead.": "errors.emailInUse",
  "Enter a valid email address.": "errors.invalidEmail",
  "The email or password did not match.": "errors.credentials",
  "Use a password with at least 6 characters.": "errors.weakPassword",
  "That reset link has expired. Request a new one from sign in.": "errors.resetExpired",
  "That reset link is invalid or has already been used. Request a new one from sign in.": "errors.resetInvalid",
  "Too many attempts. Please wait a bit and try again.": "errors.tooManyAttempts",
  "The reset link URL needs to be authorized in Firebase.": "errors.resetUrl",
  "Please sign out and back in, then try changing your password again.": "errors.recentLogin",
  "Firebase blocked that change. Check the database rules for this project.": "errors.permission",
};

export function translatedSystemError(message: string | undefined, t: TranslationFunction) {
  if (!message) return "";
  const key = knownMessages[message];
  return key ? t(key) : t("errors.generic");
}
