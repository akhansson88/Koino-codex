import type { BibleHighlight } from "@/state/types";

export type BibleHighlightChanges = Record<string, BibleHighlight | null>;

function sameHighlight(a: BibleHighlight | null, b: BibleHighlight | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  const keys = Object.keys(a) as (keyof BibleHighlight)[];
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

// Firebase emits local writes before acknowledging them. Keep those echoes out
// of the confirmed baseline so a rejected write can roll back immediately.
export function createBibleHighlightMutations(publish: (records: BibleHighlight[]) => void) {
  const confirmed = new Map<string, BibleHighlight>();
  const committedVersions = new Map<string, number>();
  const pending = new Map<number, { changes: BibleHighlightChanges; observed: Map<string, number>; writing: boolean }>();
  let lastSnapshot = new Map<string, BibleHighlight>();
  let snapshotRevision = 0, version = 0, active = true;
  let tail = Promise.resolve();
  let published: BibleHighlight[] | undefined;

  const snapshot = () => {
    const visible = new Map(confirmed);
    for (const [revision, operation] of pending) {
      for (const [id, record] of Object.entries(operation.changes)) {
        if (revision <= (committedVersions.get(id) ?? 0)) continue;
        if (record) visible.set(id, record); else visible.delete(id);
      }
    }
    return [...visible.values()].sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));
  };
  const emit = () => {
    if (!active) return;
    const next = snapshot();
    if (published?.length === next.length && next.every((record, index) => sameHighlight(record, published![index]))) return;
    published = next;
    publish(next);
  };
  const isEcho = (id: string, record: BibleHighlight | null) => [...pending].some(([revision, operation]) =>
    operation.writing && revision > (committedVersions.get(id) ?? 0) && Object.hasOwn(operation.changes, id) && sameHighlight(record, operation.changes[id]));

  return {
    snapshot,
    receive(records: BibleHighlight[]) {
      if (!active) return;
      lastSnapshot = new Map(records.map((record) => [record.id, record]));
      snapshotRevision++;
      for (const id of new Set([...confirmed.keys(), ...lastSnapshot.keys(), ...[...pending.values()].flatMap((op) => Object.keys(op.changes))])) {
        const record = lastSnapshot.get(id) ?? null;
        for (const operation of pending.values()) {
          if (operation.writing && Object.hasOwn(operation.changes, id) && sameHighlight(record, operation.changes[id])) operation.observed.set(id, snapshotRevision);
        }
        if (isEcho(id, record)) continue;
        if (record) confirmed.set(id, record); else confirmed.delete(id);
      }
      emit();
    },
    mutate(changes: BibleHighlightChanges, write: () => Promise<unknown>, isCurrent: () => boolean) {
      if (!active || !isCurrent()) return Promise.reject(new Error("The encrypted session changed."));
      if (Object.keys(changes).some((id) => !id.trim() || id.includes("/"))) return Promise.reject(new Error("Could not find the selected highlights."));
      const revision = ++version;
      const operation = { changes, observed: new Map<string, number>(), writing: false };
      pending.set(revision, operation);
      emit();
      // Preserve the user's order even if an earlier batch takes longer to
      // encrypt or the connection is slow. The newest color stays visible.
      const result = tail.then(async () => {
        if (!active || !isCurrent()) throw new Error("The encrypted session changed.");
        operation.writing = true;
        await write();
        if (!active || !isCurrent()) return;
        for (const [id, record] of Object.entries(changes)) {
          if (revision <= (committedVersions.get(id) ?? 0)) continue;
          const observed = operation.observed.get(id);
          const latest = lastSnapshot.get(id) ?? null;
          const newerRemoteValue = observed !== undefined && snapshotRevision > observed && !sameHighlight(latest, record) && !isEcho(id, latest);
          if (!newerRemoteValue) {
            if (record) confirmed.set(id, record); else confirmed.delete(id);
          }
          committedVersions.set(id, revision);
        }
        pending.delete(revision);
        emit();
      }).catch((error: unknown) => {
        if (active && isCurrent()) { pending.delete(revision); emit(); }
        throw error;
      });
      tail = result.catch(() => {});
      return result;
    },
    dispose() {
      active = false;
      pending.clear(); confirmed.clear(); committedVersions.clear(); lastSnapshot.clear();
      published = undefined;
    },
  };
}
