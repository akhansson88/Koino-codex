import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bibleChapterAsync, nextBibleChapter, previousBibleChapter, type BibleChapter, type BiblePosition, type BibleVersionId } from "@/features/bible-kjv";
import { chapterIndex, readerChapterKey } from "./chapter-navigation";

export type ChapterPage = {
  key: string;
  index: number;
  position: BiblePosition;
  chapter?: BibleChapter;
  error?: boolean;
};

export function useChapterWindow(position: BiblePosition, version: BibleVersionId, enabled = true) {
  const positions = useMemo(() => [
    previousBibleChapter(position.book, position.chapter),
    { book: position.book, chapter: position.chapter, verse: 1 },
    nextBibleChapter(position.book, position.chapter),
  ].filter((item): item is BiblePosition => !!item), [position.book, position.chapter]);
  const descriptors = useMemo(() => positions.map(item => ({ key: readerChapterKey(version, item), index: chapterIndex(item), position: item })), [positions, version]);
  const [entries, setEntries] = useState<Record<string, { chapter?: BibleChapter; error?: boolean }>>({});
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const [attempt, setAttempt] = useState(0);
  const windowKey = descriptors.map(item => item.key).join("|");

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    // The database already deduplicates requests and keeps a bounded chapter cache.
    // React retains only this three-page window, never the entire Bible.
    setEntries(old => Object.fromEntries(descriptors.filter(item => old[item.key]).map(item => [item.key, old[item.key]])));
    // Queue the visible chapter first; neighbours fill in while it renders.
    const currentKey = readerChapterKey(version, position);
    const loadOrder = descriptors.map(item => item.key)
      .sort((left, right) => (left === currentKey ? -1 : right === currentKey ? 1 : 0));
    for (const key of loadOrder) {
      const item = descriptors.find(entry => entry.key === key);
      if (!item) continue;
      // Keep the measured preview's verse/projection identities during handoff.
      // Re-mapping cached rows can invalidate paragraph wrapping without causing
      // a new native text-layout event when the visible text is unchanged.
      if (entriesRef.current[item.key]?.chapter) continue;
      void bibleChapterAsync(item.position.book, item.position.chapter, version).then(chapter => {
        if (active) setEntries(old => ({ ...old, [item.key]: { chapter } }));
      }).catch(() => {
        if (active) setEntries(old => ({ ...old, [item.key]: { error: true } }));
      });
    }
    return () => { active = false; };
  }, [windowKey, attempt, enabled]);

  const retry = useCallback((key?: string) => {
    setEntries(old => Object.fromEntries(Object.entries(old).filter(([entryKey, entry]) => entry.chapter || (key && key !== entryKey))));
    setAttempt(value => value + 1);
  }, []);
  const pages: ChapterPage[] = useMemo(() => descriptors.map(item => ({ ...item, ...entries[item.key] })), [descriptors, entries]);
  const current = pages.find(item => item.key === readerChapterKey(version, position))!;
  const loadedChapter = useMemo(() => current.chapter ? { key: current.key, value: current.chapter } : undefined, [current.key, current.chapter]);
  return { pages, loadedChapter, chapterLoadError: !!current.error, retry };
}
