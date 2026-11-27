import { useEffect, useState } from "react";

// The Bible split reader owns horizontal gestures while it is open. The tab
// layout listens to this flag so a horizontal drag inside a pane can page the
// Bible chapter instead of switching the root tab.
let locked = false;
const listeners = new Set<(value: boolean) => void>();

export function setTabSwipeLocked(value: boolean) {
  if (locked === value) return;
  locked = value;
  listeners.forEach((listener) => listener(value));
}

export function useTabSwipeLocked() {
  const [value, setValue] = useState(locked);
  useEffect(() => {
    const listener = (next: boolean) => setValue(next);
    listeners.add(listener);
    setValue(locked);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return value;
}
