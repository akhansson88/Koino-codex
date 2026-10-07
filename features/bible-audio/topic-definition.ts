import { bibleTopicKey } from "@/features/bible-reader/topics-api";
import type { BibleVerse } from "@/state/types";
import { AUDIO_TRANSLATION } from "./catalog";
import { savedAudioPassage } from "./saved-passage";
import type { TopicDefinition } from "./topic-playback";

export function topicReferenceItemIds(references: { reference: string }[]) {
  const occurrences = new Map<string, number>();
  return references.map(({ reference }) => {
    const key = reference.trim();
    const occurrence = occurrences.get(key) ?? 0;
    occurrences.set(key, occurrence + 1);
    return `${encodeURIComponent(key)}:${occurrence}`;
  });
}

/** Build a stable list without votes, and reject references the text resolver could not resolve. */
export function topicDefinition({ topic, title, translation, references }: {
  topic: string;
  title: string;
  translation: string;
  references: { reference: string; displayedReference?: string; verse?: BibleVerse }[];
}): TopicDefinition {
  const ids = topicReferenceItemIds(references);
  const items = references.flatMap((item, index) => {
    if (!item.verse) return [];
    // Reuse strict canonical reference validation. Translation availability is checked separately.
    const passage = savedAudioPassage({ ...item.verse, reference: item.reference, translation: AUDIO_TRANSLATION, id: ids[index], savedAt: "" });
    return passage ? [{ id: ids[index], reference: item.displayedReference ?? item.reference, book: passage.book, chapter: passage.chapter, startVerse: passage.startVerse, endVerse: passage.endVerse }] : [];
  });
  return { id: `${translation}:${bibleTopicKey(topic)}`, topic, title, translation, items, unavailableCount: references.length - items.length };
}
