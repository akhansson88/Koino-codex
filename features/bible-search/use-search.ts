import { useEffect, useRef, useState } from "react";
import { normalizeScriptureQuery, searchScripture, type ScriptureSearchResponse } from "@/features/bible-search";
import type { BibleVersionId } from "@/features/bible-versions";
import type { AppLanguage } from "@/ui/localization";
import { prepareSemanticRuntime } from "./semantic-runtime";

const emptyResponse: ScriptureSearchResponse = { results: [], mode: "lexical", semanticState: "loading" };

/** Keep both search surfaces consistent, and cancel obsolete model or database work. */
export function useScriptureSearch({ language, limit, query, versionId, visible }: {
  language: AppLanguage;
  limit: number;
  query: string;
  versionId: BibleVersionId;
  visible: boolean;
}) {
  const normalizedQuery = normalizeScriptureQuery(query);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<{ key: string; response: ScriptureSearchResponse; loading: boolean; error: boolean }>();
  const request = useRef(0);
  const key = `${language}|${versionId}|${normalizedQuery}|${limit}|${retry}`;
  const eligible = normalizedQuery.replace(/[^\p{L}\p{N}]/gu, "").length >= 2;

  useEffect(() => {
    if (visible) void prepareSemanticRuntime().catch(() => undefined);
  }, [visible]);

  useEffect(() => {
    const requestId = ++request.current;
    if (!visible || !eligible) {
      setState(undefined);
      return;
    }
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
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [eligible, key, language, limit, normalizedQuery, versionId, visible]);

  const current = state?.key === key ? state : undefined;
  return {
    response: current?.response ?? emptyResponse,
    loading: eligible && visible && (current?.loading ?? true),
    error: current?.error ?? false,
    eligible,
    retry: () => setRetry((value) => value + 1),
  };
}
