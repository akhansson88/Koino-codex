import { localDayKey } from "@/state/store/helpers";
import type { JournalEntry } from "@/state/types";
import { presentedJournalEntryType } from "@/ui/journal-presentation";

const RECENT_ENTRY_LIMIT = 3;

export function ownedJournalEntries(entries: JournalEntry[], userId: string | undefined) {
  if (!userId) return [];
  return entries
    .filter((entry) => entry.userId === userId)
    .sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

export function recentJourneyEntries(chronologicalEntries: JournalEntry[]) {
  return chronologicalEntries.slice(0, RECENT_ENTRY_LIMIT);
}

export function reflectionForJournalDay(chronologicalEntries: JournalEntry[], day: string) {
  return chronologicalEntries.find((entry) =>
    presentedJournalEntryType(entry) === "reflection" && localDayKey(entry.createdAt) === day,
  );
}
