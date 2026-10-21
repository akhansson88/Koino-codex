import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { normalizeScriptureQuery, searchScripture, type ScriptureSearchResponse } from "@/features/bible-search";
import type { BibleVersionId } from "@/features/bible-versions";
import type { AppLanguage } from "@/ui/localization";
import { prepareSemanticRuntime } from "./semantic-runtime";

const emptyResponse: ScriptureSearchResponse = { results: [], mode: "lexical", semanticState: "loading" };

/** Keep both search surfaces consistent, and cancel obsolete model or database work. */
export function useScriptureSearch({ language, limit, query, versionId, visible, retainOnHide = false, scopeKey = "" }: {
  language: AppLanguage;
  limit: number;
  query: string;
  versionId: BibleVersionId;
  visible: boolean;
  retainOnHide?: boolean;
  scopeKey?: string;
}) {
  const normalizedQuery = normalizeScriptureQuery(query);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; response: ScriptureSearchResponse; loading: boolean; error: boolean; interrupted?: boolean }>();
  const request = useRef(0);
  const retainedKey = useRef<string | undefined>(undefined);
  const suspended = useRef(false);
  const cancelRequest = useRef<(() => void) | undefined>(undefined);
  const key = JSON.stringify([scopeKey, language, versionId, normalizedQuery, limit, retry]);
  const eligible = normalizedQuery.replace(/[^\p{L}\p{N}]/gu, "").length >= 2;
  const suspend = useCallback(() => {
    suspended.current = true;
    cancelRequest.current?.();
    setState((current) => current?.loading ? { ...current, loading: false, interrupted: true } : current);
  }, []);

  useEffect(() => {
    if (visible) void prepareSemanticRuntime().catch(() => undefined);
  }, [visible]);

  useEffect(() => {
    const requestId = ++request.current;
    if (!eligible || retainedKey.current !== key) retainedKey.current = undefined;
    if (!eligible || (!visible && !retainOnHide)) {
      setState(undefined);
      return;
    }
    if (!visible) {
      suspend();
      return;
    }
    // A hidden native modal unmounts its content. Its owner retains this hook,
    // including partial results, until the query changes or Retry is requested.
    if (retainOnHide && suspended.current && retainedKey.current === key) return;
    suspended.current = false;
    retainedKey.current = key;
    const controller = new AbortController();
    setState({ key, response: emptyResponse, loading: true, error: false });
    const timer = setTimeout(() => {
      void searchScripture({
        language,
        limit,
        query: normalizedQuery,
        versionId,
        signal: controller.signal,
        onPartialResults: (response) => {
          if (request.current === requestId && !controller.signal.aborted) {
            setState({ key, response, loading: true, error: false });
          }
        },
      }).then((response) => {
        if (request.current === requestId && !controller.signal.aborted) {
          setState({ key, response, loading: false, error: false });
        }
      }).catch(() => {
        if (request.current === requestId && !controller.signal.aborted) {
          setState((current) => ({ key, response: current?.key === key ? current.response : emptyResponse, loading: false, error: true }));
        }
      });
    }, 180);
    const cancel = () => {
      clearTimeout(timer);
      controller.abort();
    };
    cancelRequest.current = cancel;
    return () => {
      cancel();
      if (cancelRequest.current === cancel) cancelRequest.current = undefined;
    };
  }, [eligible, key, language, limit, normalizedQuery, versionId, visible, retainOnHide, suspend]);

  const current = state?.key === key ? state : undefined;
  return {
    response: current?.response ?? emptyResponse,
    loading: eligible && visible && (current?.loading ?? true),
    error: current?.error ?? false,
    interrupted: current?.interrupted ?? false,
    eligible,
    retry: () => setRetry((value) => value + 1),
    suspend,
  };
}

export type ScriptureSearchScrollState = { offset: number; restore: boolean };

/** Lives above the native modal so dismissing it cannot discard a search. */
export function useScriptureSearchSession({ language, versionId, visible, scopeKey = "", limit = 20 }: {
  language: AppLanguage;
  versionId: BibleVersionId;
  visible: boolean;
  scopeKey?: string;
  limit?: number;
}) {
  const [input, setInput] = useState({ scopeKey, query: "" });
  const query = input.scopeKey === scopeKey ? input.query : "";
  const setQuery = useCallback((value: string) => setInput({ scopeKey, query: value }), [scopeKey]);
  useEffect(() => { setInput({ scopeKey, query: "" }); }, [scopeKey]);
  const search = useScriptureSearch({ language, versionId, visible, query, limit, scopeKey, retainOnHide: true });
  const scrollKey = JSON.stringify([scopeKey, language, versionId, normalizeScriptureQuery(query), limit]);
  const scroll = useMemo<ScriptureSearchScrollState>(() => ({ offset: 0, restore: false }), [scrollKey]);
  const wasVisible = useRef(visible);
  useEffect(() => {
    if (!visible && wasVisible.current) scroll.restore = true;
    wasVisible.current = visible;
  }, [visible, scroll]);
  const suspend = useCallback(() => {
    scroll.restore = true;
    search.suspend();
  }, [scroll, search.suspend]);
  return { query, setQuery, search, scroll, suspend };
}

export type ScriptureSearchSession = ReturnType<typeof useScriptureSearchSession>;
