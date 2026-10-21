import { memo, useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Text, type TextLayoutEventData, type TextStyle } from "react-native";
import { paragraphProjectionSlice, paragraphVerseBounds, type paragraphProjection } from "@/features/bible-reader/paragraph-layout";

export type ParagraphChunkGeometry = {
  id: string;
  y: number;
  start: number;
  end: number;
  lines: TextLayoutEventData["lines"];
};

export const BibleParagraphChunk = memo(function BibleParagraphChunk({
  id, projection, start, end, readerTextStyle, style, measuring = false, onGeometry, onLines, renderRange,
}: {
  id: string;
  projection: ReturnType<typeof paragraphProjection>;
  start: number;
  end: number;
  readerTextStyle: TextStyle;
  style?: TextStyle;
  measuring?: boolean;
  onGeometry?: (geometry: ParagraphChunkGeometry) => void;
  onLines?: (lines: TextLayoutEventData["lines"]) => void;
  renderRange: (start: number, end: number, ascenders: Record<number, number>, measuring: boolean) => ReactNode;
}) {
  const offset = useRef<number | undefined>(undefined);
  const lines = useRef<TextLayoutEventData["lines"] | undefined>(undefined);
  const slice = useMemo(() => paragraphProjectionSlice(projection, start, end), [projection, start, end]);
  const [metrics, setMetrics] = useState<{ minHeight: number; ascenders: Record<number, number> }>({ minHeight: 0, ascenders: {} });
  const publish = useCallback(() => {
    if (offset.current !== undefined && lines.current) {
      onGeometry?.({ id, y: offset.current, start, end, lines: lines.current });
    }
  }, [id, start, end, onGeometry]);
  useLayoutEffect(publish, [publish]);
  return <Text testID={measuring ? "bible-paragraph-measurement" : start === 0 ? "bible-paragraph-opening" : "bible-paragraph-continuation"}
    accessible={measuring ? false : undefined}
    android_hyphenationFrequency="none" textBreakStrategy="simple"
    style={[readerTextStyle, style, { minHeight: metrics.minHeight, includeFontPadding: false }]}
    onLayout={event => { offset.current = event.nativeEvent.layout.y; publish(); }}
    onTextLayout={event => {
      const measured = event.nativeEvent.lines;
      lines.current = measured;
      const ascenders: Record<number, number> = {};
      for (const bound of paragraphVerseBounds(slice, measured)) {
        const ascender = measured.find(line => line.y === bound.y)?.ascender;
        if (typeof ascender === "number" && Number.isFinite(ascender) && ascender > 0) ascenders[bound.verse] = ascender;
      }
      const minHeight = Math.ceil(Math.max(0, ...measured.map(line => line.y + line.height)));
      setMetrics(current => current.minHeight === minHeight && Object.keys(current.ascenders).length === Object.keys(ascenders).length &&
        Object.entries(ascenders).every(([verse, ascender]) => Math.abs(current.ascenders[Number(verse)] - ascender) < 0.25)
        ? current : { minHeight, ascenders });
      onLines?.(measured);
      publish();
    }}
  >{renderRange(start, end, metrics.ascenders, measuring)}</Text>;
});
