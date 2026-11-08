export const readerHeaderMotion = {
  initialHeight: 63,
  hideThreshold: 12,
  revealThreshold: 6,
  topTolerance: 4,
  settleDuration: 160,
  fadeDuration: 120,
  momentumGrace: 48,
} as const;

export type HeaderScrollState = {
  hidden: number;
  previousY: number;
  direction: number;
  travel: number;
  intent: number;
  tracking: boolean;
  dragging: boolean;
  momentum: boolean;
};

export function headerScrollState(y = 0, hidden = 0): HeaderScrollState {
  "worklet";
  return { hidden, previousY: y, direction: 0, travel: 0, intent: 0, tracking: false, dragging: false, momentum: false };
}

export function boundedReaderOffset(y: number, contentHeight: number, viewportHeight: number) {
  "worklet";
  return Math.max(0, Math.min(y, Math.max(0, contentHeight - viewportHeight)));
}

/** Only an active, user-started scroll may change the header. */
export function advanceHeaderScroll(state: HeaderScrollState, y: number, contentHeight: number, viewportHeight: number, height: number): HeaderScrollState {
  "worklet";
  const offset = boundedReaderOffset(y, contentHeight, viewportHeight);
  if (!state.tracking) return { ...state, previousY: offset };
  if (offset <= readerHeaderMotion.topTolerance) {
    return { ...state, hidden: 0, previousY: offset, direction: 0, travel: 0, intent: -1 };
  }
  const delta = offset - state.previousY;
  if (delta === 0) return state;
  const direction = delta > 0 ? 1 : -1;
  const travel = direction === state.direction ? state.travel + Math.abs(delta) : Math.abs(delta);
  const threshold = direction > 0 ? readerHeaderMotion.hideThreshold : readerHeaderMotion.revealThreshold;
  const qualified = travel >= threshold;
  const distance = Math.min(Math.abs(delta), Math.max(0, travel - threshold));
  return {
    ...state, previousY: offset, direction, travel,
    intent: qualified ? direction : state.intent,
    hidden: qualified ? Math.max(0, Math.min(height, state.hidden + direction * distance)) : state.hidden,
  };
}

export function headerSettleTarget(state: HeaderScrollState, height: number) {
  "worklet";
  if (state.previousY <= readerHeaderMotion.topTolerance) return 0;
  // A new touch can interrupt settling halfway; never leave a resting half-header.
  return state.intent === 0 ? (state.hidden >= height / 2 ? height : 0) : state.intent > 0 ? height : 0;
}

export function readerHeaderOcclusion(height: number, hidden: number, reducedMotion = false, opacity = 1) {
  "worklet";
  return reducedMotion ? (opacity <= 0.01 ? 0 : height) : Math.max(0, height - hidden);
}
