import type { CheckIn, JournalEntry } from "@/state/types";

export type CheckInSubmissionErrorCode = "already_submitted" | "in_progress" | "unavailable";

export class CheckInSubmissionError extends Error {
  constructor(readonly code: CheckInSubmissionErrorCode) {
    super(`check-in:${code}`);
    this.name = "CheckInSubmissionError";
  }
}

export function checkInExistsForDay(checkIns: CheckIn[], userId: string | undefined, groupId: string | undefined, dayKey: string) {
  if (!userId || !groupId) return false;
  return checkIns.some((item) =>
    item.userId === userId &&
    item.groupId === groupId &&
    (item.dayKey === dayKey || localDayKey(item.createdAt) === dayKey),
  );
}

function localDayKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

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
