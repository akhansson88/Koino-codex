import type { ServiceLanguage } from "../service-language";

export type AccountEmailCopy = {
  subject: string;
  text: string;
  title: string;
  preview: string;
  heading: string;
  intro: string;
  intro2: string;
  button: string;
  linkHint: string;
  ignore: string;
  brand: string;
  reason: string;
};

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** Fills one tokenized designed email with localized copy and a real link. */
export function renderAccountEmail(
  template: string,
  language: ServiceLanguage,
  copy: AccountEmailCopy,
  link: string,
  email: string,
) {
  const safeEmail = escapeHtml(email);
  const introHtml = copy.intro.replaceAll("%EMAIL%", `<span style="color:#14120F;">${safeEmail}</span>`);
  const reasonHtml = copy.reason.replaceAll("%EMAIL%", safeEmail);
  const html = template
    .replaceAll("{{LANG}}", language)
    .replaceAll("{{DIR}}", language === "ar" ? "rtl" : "ltr")
    .replaceAll("{{SUBJECT}}", escapeHtml(copy.subject))
    .replaceAll("{{PREVIEW}}", escapeHtml(copy.preview))
    .replaceAll("{{HEADING}}", escapeHtml(copy.heading))
    .replaceAll("{{INTRO_HTML}}", introHtml)
    .replaceAll("{{INTRO2}}", escapeHtml(copy.intro2))
    .replaceAll("{{BUTTON}}", escapeHtml(copy.button))
    .replaceAll("{{LINK_HINT}}", escapeHtml(copy.linkHint))
    .replaceAll("{{IGNORE}}", escapeHtml(copy.ignore))
    .replaceAll("{{BRAND}}", escapeHtml(copy.brand))
    .replaceAll("{{REASON_HTML}}", reasonHtml)
    .replaceAll("%LINK%", escapeHtml(link));
  return { html, text: copy.text.replaceAll("%LINK%", link) };
}
