// New plaintext records carry no historyGeneration. Only a record that
// declares a generation can be stale; treating a missing one as stale silently
// stopped every push for newly created content.
export function currentHistoryGeneration(
  recordGeneration: unknown,
  policy: { sharedWritesFrozen?: boolean; historyGeneration?: number } | null | undefined,
) {
  if (policy?.sharedWritesFrozen) return false;
  if (typeof recordGeneration !== "number") return true;
  return recordGeneration === policy?.historyGeneration;
}
