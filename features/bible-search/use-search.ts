import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createScriptureSearchPageSession, normalizeScriptureQuery, type ScriptureSearchPageSession, type ScriptureSearchResponse } from "@/features/bible-search";
import type { BibleVersionId } from "@/features/bible-versions";
import { biblePassagesFromRanges } from "@/features/bible-kjv";
import type { AppLanguage } from "@/ui/localization";
import { prepareSemanticRuntime } from "./semantic-runtime";

const emptyResponse: ScriptureSearchResponse = { results: [], mode: "lexical", semanticState: "loading" };
let searchSessionCounter = 0;
const searchSessionSeed = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

type SearchState = {
  key: string; response: ScriptureSearchResponse; loading: boolean; error: boolean;
  hasMore: boolean; loadingMore: boolean; moreError: boolean; interrupted?: boolean;
};
const CACHE_PAGE_SIZE = 20;
const MAX_CACHED_PAGES = 7;
type ExcerptCache = { key: string; registered: number; clock: number; stamps: Map<number, number>; visible: Set<number>; running: Set<number> };

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
  const [state, setState] = useState<SearchState>();
  const request = useRef(0);
  const retainedKey = useRef<string | undefined>(undefined);
  const suspended = useRef(false);
  const cancelRequest = useRef<(() => void) | undefined>(undefined);
  const pageSession = useRef<{ key: string; value: ScriptureSearchPageSession } | undefined>(undefined);
  const pageRequest = useRef<{ key: string; controller: AbortController } | undefined>(undefined);
  const key = JSON.stringify([scopeKey, language, versionId, normalizedQuery, limit, retry]);
  const sessionId = useMemo(() => `search-session-${searchSessionSeed}-${++searchSessionCounter}`, [key]);
  const excerptCache = useRef<ExcerptCache | undefined>(undefined);
  if (!excerptCache.current || excerptCache.current.key !== key) excerptCache.current = { key, registered: 0, clock: 0, stamps: new Map(), visible: new Set([0]), running: new Set() };
  const eligible = normalizedQuery.replace(/[^\p{L}\p{N}]/gu, "").length >= 2;
  const suspend = useCallback(() => {
    suspended.current = true;
    cancelRequest.current?.();
    pageRequest.current?.controller.abort();
    pageRequest.current = undefined;
    pageSession.current?.value.suspend();
    setState((current) => current ? { ...current, loading: false, loadingMore: false, interrupted: current.loading || current.interrupted } : current);
  }, []);

  useEffect(() => () => {
    pageRequest.current?.controller.abort();
    pageSession.current?.value.dispose();
    pageSession.current = undefined;
  }, []);

  useEffect(() => {
    if (visible) void prepareSemanticRuntime().catch(() => undefined);
  }, [visible]);

  useEffect(() => {
    const requestId = ++request.current;
    if (pageRequest.current && (pageRequest.current.key !== key || !visible)) {
      pageRequest.current.controller.abort();
      pageRequest.current = undefined;
    }
    if (pageSession.current && pageSession.current.key !== key) {
      pageSession.current.value.dispose();
      pageSession.current = undefined;
    }
    if (!eligible || retainedKey.current !== key) retainedKey.current = undefined;
    if (!eligible || (!visible && !retainOnHide)) {
      pageSession.current?.value.dispose();
      pageSession.current = undefined;
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
    pageSession.current?.value.dispose();
    const session = createScriptureSearchPageSession({ language, limit, query: normalizedQuery, versionId });
    pageSession.current = { key, value: session };
    const controller = new AbortController();
    setState({ key, response: emptyResponse, loading: true, error: false, hasMore: false, loadingMore: false, moreError: false });
    const timer = setTimeout(() => {
      void session.firstPage(controller.signal, (response) => {
          if (request.current === requestId && !controller.signal.aborted) {
            setState({ key, response, loading: true, error: false, hasMore: false, loadingMore: false, moreError: false });
          }
      }).then(({ hasMore, ...response }) => {
        if (request.current === requestId && !controller.signal.aborted) {
          setState({ key, response, loading: false, error: false, hasMore, loadingMore: false, moreError: false });
        }
      }).catch(() => {
        if (request.current === requestId && !controller.signal.aborted) {
          setState((current) => ({ key, response: current?.key === key ? current.response : emptyResponse, loading: false, error: true, hasMore: false, loadingMore: false, moreError: false }));
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
  const currentRef = useRef(current);
  currentRef.current = current;
  const loadMore = useCallback((retryPage = false) => {
    const existing = currentRef.current;
    const session = pageSession.current;
    if (!visible || !session || session.key !== key || !existing?.hasMore || existing.loading || existing.interrupted || existing.error || (existing.moreError && !retryPage) || pageRequest.current) return;
    const controller = new AbortController();
    const pending = { key, controller };
    pageRequest.current = pending;
    setState((value) => value?.key === key ? { ...value, loadingMore: true, moreError: false } : value);
    void session.value.nextPage(controller.signal).then(({ hasMore, results }) => {
      if (pageRequest.current !== pending || controller.signal.aborted) return;
      setState((value) => value?.key === key ? { ...value, response: { ...value.response, results: [...value.response.results, ...results] }, hasMore, loadingMore: false, moreError: false } : value);
    }).catch(() => {
      if (pageRequest.current === pending && !controller.signal.aborted) setState((value) => value?.key === key ? { ...value, loadingMore: false, moreError: true } : value);
    }).finally(() => { if (pageRequest.current === pending) pageRequest.current = undefined; });
  }, [key, visible]);

  const trimExcerpts = useCallback(() => {
    const cache = excerptCache.current, value = currentRef.current;
    if (!cache || cache.key !== key || !value || cache.stamps.size <= MAX_CACHED_PAGES) return;
    const protectedPages = new Set<number>();
    for (const page of cache.visible) { protectedPages.add(page - 1); protectedPages.add(page); protectedPages.add(page + 1); }
    const candidates = [...cache.stamps.entries()].filter(([page]) => !protectedPages.has(page) && !cache.running.has(page)).sort((a, b) => a[1] - b[1]);
    const evict = candidates.slice(0, Math.max(0, cache.stamps.size - MAX_CACHED_PAGES)).map(([page]) => page);
    if (!evict.length) return;
    evict.forEach((page) => cache.stamps.delete(page));
    setState((previous) => {
      if (!previous || previous.key !== key) return previous;
      const results = previous.response.results.slice();
      for (const page of evict) for (let index = page * CACHE_PAGE_SIZE; index < Math.min(results.length, (page + 1) * CACHE_PAGE_SIZE); index++) {
        const item = results[index];
        if (!item.contentState) results[index] = { ...item, verse: { ...item.verse, text: "" }, verses: [], contentState: "evicted" };
      }
      return { ...previous, response: { ...previous.response, results } };
    });
  }, [key]);

  const hydratePage = useCallback((page: number, retryPage = false) => {
    const cache = excerptCache.current, value = currentRef.current;
    if (!cache || cache.key !== key || !value || cache.running.has(page)) return;
    const first = page * CACHE_PAGE_SIZE;
    const needed = value.response.results.slice(first, first + CACHE_PAGE_SIZE).flatMap((item, offset) =>
      item.contentState === "evicted" || (retryPage && item.contentState === "error") ? [{ index: first + offset, item }] : []);
    if (!needed.length) return;
    cache.running.add(page);
    setState((previous) => {
      if (!previous || previous.key !== key) return previous;
      const results = previous.response.results.slice();
      for (const { index, item } of needed) if (results[index]?.id === item.id) results[index] = { ...results[index], contentState: "loading" };
      return { ...previous, response: { ...previous.response, results } };
    });
    void (async () => {
      try {
        const ranges = needed.map(({ item }) => ({ book: item.verse.book!, chapter: item.verse.chapter!, startVerse: item.verse.startVerse!, endVerse: item.verse.endVerse ?? item.verse.startVerse! }));
        const passages = await biblePassagesFromRanges(ranges, versionId);
        if (excerptCache.current !== cache) return;
        setState((previous) => {
          if (!previous || previous.key !== key) return previous;
          const results = previous.response.results.slice();
          needed.forEach(({ index, item }, offset) => {
            if (results[index]?.id !== item.id) return;
            const passage = passages[offset];
            results[index] = passage ? { ...results[index], ...passage, contentState: undefined } : { ...results[index], contentState: "error" };
          });
          return { ...previous, response: { ...previous.response, results } };
        });
        cache.stamps.set(page, ++cache.clock);
      } catch {
        if (excerptCache.current !== cache) return;
        setState((previous) => {
          if (!previous || previous.key !== key) return previous;
          const results = previous.response.results.slice();
          for (const { index, item } of needed) if (results[index]?.id === item.id) results[index] = { ...results[index], contentState: "error" };
          return { ...previous, response: { ...previous.response, results } };
        });
      } finally {
        cache.running.delete(page);
        trimExcerpts();
      }
    })();
  }, [key, trimExcerpts, versionId]);

  const onVisibleResults = useCallback((indexes: number[]) => {
    const cache = excerptCache.current, value = currentRef.current;
    if (!cache || cache.key !== key || !value || !indexes.length) return;
    cache.visible = new Set(indexes.map((index) => Math.floor(index / CACHE_PAGE_SIZE)));
    for (const page of cache.visible) for (const nearby of [page - 1, page, page + 1]) {
      if (nearby < 0 || nearby * CACHE_PAGE_SIZE >= value.response.results.length) continue;
      if (cache.stamps.has(nearby)) cache.stamps.set(nearby, ++cache.clock);
      hydratePage(nearby);
    }
    trimExcerpts();
  }, [hydratePage, key, trimExcerpts]);

  useEffect(() => {
    const cache = excerptCache.current, value = currentRef.current;
    if (!cache || cache.key !== key || !value) return;
    const count = value.response.results.length;
    if (count < cache.registered) { cache.stamps.clear(); cache.registered = 0; }
    for (let page = Math.floor(cache.registered / CACHE_PAGE_SIZE); page * CACHE_PAGE_SIZE < count; page++) cache.stamps.set(page, ++cache.clock);
    cache.registered = count;
    trimExcerpts();
  }, [current?.response.results.length, key, trimExcerpts]);

  return {
    response: current?.response ?? emptyResponse,
    loading: eligible && visible && (current?.loading ?? true),
    error: current?.error ?? false,
    interrupted: current?.interrupted ?? false,
    hasMore: current?.hasMore ?? false,
    loadingMore: current?.loadingMore ?? false,
    moreError: current?.moreError ?? false,
    loadMore: () => loadMore(),
    retryMore: () => loadMore(true),
    onVisibleResults,
    retryExcerpt: (index: number) => hydratePage(Math.floor(index / CACHE_PAGE_SIZE), true),
    sessionId,
    eligible,
    retry: () => setRetry((value) => value + 1),
    suspend,
  };
}

export type ScriptureSearchScrollState = { offset: number; restore: boolean; index?: number; contentHeight?: number };

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
