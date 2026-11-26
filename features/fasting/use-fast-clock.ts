import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

/** A clock that only ticks while the screen is focused. */
export function useFastClock(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useFocusEffect(useCallback(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]));
  return now;
}
