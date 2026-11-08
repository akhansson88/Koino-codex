import { useCallback, useLayoutEffect, useRef, type RefObject } from "react";
import type { View } from "react-native";
import type { MeasurableView } from "@/features/bible-reader/types";

type Bounds = { y: number; height: number };
type Reader = {
  chapterKey: string;
  layoutKey?: string;
  ready: boolean;
  enabled: boolean;
  verses: readonly { verse: number }[];
  viewport: RefObject<View | null>;
  rows: RefObject<Record<number, MeasurableView | null>>;
  offset: RefObject<number>;
  controlsTop?: number;
  onSelect: (verse: number) => void;
};

/** Resolve a headphones tap from native geometry before audio changes the layout. */
export function useVisibleVerseSelection(reader: Reader) {
  const latest = useRef(reader);
  const pending = useRef<{ chapterKey: string } | undefined>(undefined);
  const frame = useRef<number | undefined>(undefined);
  const measurement = useRef<object | undefined>(undefined);
  const layoutRevision = useRef(0);

  const cancel = useCallback(() => {
    pending.current = undefined;
    measurement.current = undefined;
    if (frame.current !== undefined) cancelAnimationFrame(frame.current);
    frame.current = undefined;
  }, []);

  const retry = useCallback(function scheduleMeasurement() {
    if (!pending.current || frame.current !== undefined) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = undefined;
      const current = latest.current;
      const request = pending.current;
      if (!request || request.chapterKey !== current.chapterKey || !current.enabled || !current.ready) return;
      const viewport = current.viewport.current;
      const rows = current.verses.map(({ verse }) => ({ verse, node: current.rows.current[verse] }));
      // Layout/ref callbacks retry a waiting tap once every row is mounted.
      if (!viewport || !rows.length || rows.some(row => !row.node)) return;
      const token = {};
      measurement.current = token;
      const revision = layoutRevision.current;
      const offset = current.offset.current;
      const controlsTop = current.controlsTop;
      const bounds = new Map<number, Bounds>();
      let viewportBounds: Bounds | undefined;
      const finish = () => {
        if (measurement.current !== token || pending.current !== request) return;
        if (latest.current.chapterKey !== request.chapterKey || !latest.current.enabled || !latest.current.ready) return;
        if (layoutRevision.current !== revision || latest.current.offset.current !== offset || latest.current.controlsTop !== controlsTop) {
          scheduleMeasurement();
          return;
        }
        if (!viewportBounds || bounds.size !== rows.length) return;
        if ([viewportBounds, ...bounds.values()].some(row => !Number.isFinite(row.y) || !Number.isFinite(row.height) || row.height <= 0)) return;
        const top = viewportBounds.y;
        const bottom = Math.min(top + viewportBounds.height, controlsTop ?? Infinity);
        if (bottom <= top) return;
        const visibleHeight = bottom - top;
        let clearest: { verse: number; visible: number } | undefined;
        let selected: number | undefined;
        for (const row of rows) {
          const measured = bounds.get(row.verse)!;
          const visible = Math.max(0, Math.min(measured.y + measured.height, bottom) - Math.max(measured.y, top));
          if (visible >= Math.min(measured.height, visibleHeight) / 2) {
            selected = row.verse;
            break;
          }
          if (visible > 0 && (!clearest || visible > clearest.visible)) clearest = { verse: row.verse, visible };
        }
        // If no verse is clear, use the one with the most text showing. In a
        // heading or a gap, use the next verse; below the chapter, use its last.
        selected ??= clearest?.verse ?? rows.find(row => bounds.get(row.verse)!.y >= top)?.verse ?? rows[rows.length - 1].verse;
        pending.current = undefined;
        measurement.current = undefined;
        latest.current.onSelect(selected);
      };
      viewport.measureInWindow((_x, y, _width, height) => {
        viewportBounds = { y, height };
        finish();
      });
      for (const row of rows) {
        row.node!.measureInWindow((_x, y, _width, height) => {
          bounds.set(row.verse, { y, height });
          finish();
        });
      }
    });
  }, []);

  const layoutChanged = useCallback(() => {
    layoutRevision.current++;
    retry();
  }, [retry]);

  useLayoutEffect(() => {
    latest.current = reader;
    retry();
  });
  useLayoutEffect(() => { layoutChanged(); }, [reader.layoutKey, reader.controlsTop, layoutChanged]);
  useLayoutEffect(() => cancel, [reader.chapterKey, reader.enabled, cancel]);

  const select = useCallback(() => {
    cancel();
    if (!latest.current.enabled) return;
    pending.current = { chapterKey: latest.current.chapterKey };
    retry();
  }, [cancel, retry]);

  return { select, retry, layoutChanged, cancel };
}
