import { displayBibleReference } from "../bible-book-names";
import type { BibleVerse } from "@/state/types";
import type { AppLanguage } from "@/ui/translations/types";

export type BibleCopyVerse = Pick<BibleVerse, "text" | "startVerse" | "endVerse">;

export type BibleCopyInput = {
  verses: readonly BibleCopyVerse[];
  reference: string;
  translation?: string;
  language: AppLanguage;
};

function verseNumberLabel(verse: BibleCopyVerse) {
  const start = verse.startVerse ?? verse.endVerse;
  const end = verse.endVerse ?? start;
  if (!start) return "";
  return start === end ? String(start) : `${start}–${end}`;
}

/**
 * Format verses for the clipboard the way people paste them into a message:
 * the quoted text first, then one localized reference with the translation.
 * A passage gets verse numbers so the excerpt stays readable, and both a
 * single verse and a passage sit inside the same quotation marks.
 */
export function formatBibleCopyText({ verses, reference, translation, language }: BibleCopyInput) {
  const content = verses
    .filter((verse) => verse.text.trim().length > 0)
    .slice()
    .sort((a, b) => (a.startVerse ?? 0) - (b.startVerse ?? 0));
  if (content.length === 0) return "";

  const body = content.length === 1
    ? content[0].text.trim()
    : content.map((verse) => {
      const label = verseNumberLabel(verse);
      const text = verse.text.trim();
      return label ? `${label} ${text}` : text;
    }).join("\n");

  const localizedReference = displayBibleReference(reference, language).replace(/(\d)-(\d)/g, "$1–$2");
  const shortTranslation = translation?.startsWith("Reformationsbibeln") ? "SRB26" : translation;
  const source = shortTranslation ? `${localizedReference} (${shortTranslation})` : localizedReference;

  return `"${body}"${content.length > 1 ? "\n\n" : "\n"}${source}`;
}
