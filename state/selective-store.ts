import { useCallback, useRef, useSyncExternalStore } from "react";

export type SnapshotStore<State> = {
  getSnapshot: () => State;
  subscribe: (listener: () => void) => () => void;
  publish: (state: State) => void;
};

export function createSnapshotStore<State>(initial: State): SnapshotStore<State> {
  let state = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    publish: (next) => {
      if (Object.is(state, next)) return;
      state = next;
      listeners.forEach((listener) => listener());
    },
  };
}

export function useSelectedSnapshot<State, Value>(store: SnapshotStore<State>, selector: (state: State) => Value): Value {
  const selected = useRef<{ state: State; selector: typeof selector; value: Value } | null>(null);
  const getSelected = useCallback(() => {
    const state = store.getSnapshot();
    if (selected.current?.state === state && selected.current.selector === selector) return selected.current.value;
    const value = selector(state);
    if (selected.current && Object.is(value, selected.current.value)) {
      selected.current = { state, selector, value: selected.current.value };
      return selected.current.value;
    }
    selected.current = { state, selector, value };
    return value;
  }, [store, selector]);
  return useSyncExternalStore(store.subscribe, getSelected, getSelected);
}
