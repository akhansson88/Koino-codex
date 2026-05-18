import type { CheckIn, JournalEntry } from "@/state/types";

export function hasLinkedPrivateCheckInJournal(checkIn: CheckIn, journalEntries: JournalEntry[]) {
  if (checkIn.visibility !== "private") return false;

  return journalEntries.some((entry) => {
    if (entry.userId !== checkIn.userId || entry.source !== "private_check_in") return false;
    return entry.createdAt === checkIn.createdAt;
  });
}

export function activePrivateCheckIns(privateCheckIns: CheckIn[], journalEntries: JournalEntry[]) {
  return privateCheckIns.filter((checkIn) => hasLinkedPrivateCheckInJournal(checkIn, journalEntries));
}
