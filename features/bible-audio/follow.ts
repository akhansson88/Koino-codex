type Bounds = { y: number; height: number };
type Measurements = { verse: Bounds; viewport: Bounds; offset: number; controlsTop: number };

/** A follow request survives delayed layout, but never manual browsing or a newer verse. */
export class AudioFollowScroll {
  private target?: { chapterKey: string; verse: number };
  request(chapterKey: string, verse: number) { this.target = { chapterKey, verse }; }
  cancel() { this.target = undefined; }
  tryScroll(chapterKey: string, measure: (verse: number, done: (value: Measurements) => void) => void, scroll: (offset: number, verse: number) => void) {
    const target = this.target;
    if (!target || target.chapterKey !== chapterKey) return;
    measure(target.verse, ({ verse, viewport, offset, controlsTop }) => {
      if (this.target !== target || verse.height <= 0 || viewport.height <= 0 ||
        ![verse.y, verse.height, viewport.y, viewport.height, offset, controlsTop].every(Number.isFinite)) return;
      const top = viewport.y + 18;
      const bottom = Math.min(viewport.y + viewport.height, controlsTop) - 18;
      if (bottom <= top) return;
      this.target = undefined;
      const destination = Math.max(0, offset + verse.y - top);
      // A long verse may never fit in full. Once its start is aligned, another
      // visibility check must not restart the same animation indefinitely.
      if ((verse.y < top || verse.y + verse.height > bottom) && Math.abs(destination - offset) > 1) scroll(destination, target.verse);
    });
  }
}
