import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, Share, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { displayBibleReference } from "@/features/bible-book-names";
import { kjvBooks } from "@/features/bible-kjv";
import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import { BookmarkSheet } from "@/features/bookmarks/bookmark-sheet";
import {
  BookmarkCollectionStrip,
  BookmarkEmpty,
  BookmarkGlyph,
  BookmarkRow,
  BookmarkSelectionBar,
  bookmarkColor,
} from "@/features/bookmarks/bookmark-ui";
import { CollectionEditor } from "@/features/bookmarks/collection-editor";
import { readBookmarkCache, readBookmarkSort, writeBookmarkSort } from "@/state/bookmark-cache";
import {
  bookmarkCollectionCount,
  formatBookmarkCsv,
  formatBookmarkMarkdown,
  setBookmarkBookOrder,
  sortBookmarkCollections,
  sortBookmarks,
  type BookmarkSort,
} from "@/state/bookmarks";
import { useKoinoActions, useKoinoFields } from "@/state/koino-store";
import type { BookmarkCollection, BookmarkCollectionColor, BibleRibbon, SavedVerse } from "@/state/types";
import { BottomSheet, IconButton } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { AmbientBackground } from "@/ui/ambient-background";
import { colors, radius, shadcn, typography } from "@/ui/theme";
import { useTheme } from "@/ui/theme-provider";

type CollectionFilter = string | null | undefined;

export function BookmarksScreen() {
  const { t } = useAppTranslation();
  const bookLanguage = useBibleBookLanguage();
  const { dispatch } = useKoinoActions();
  const state = useKoinoFields(["bookmarkCollections", "bookmarkOutboxCount", "bibleRibbons", "bookmarksLoaded", "currentGroupId", "currentUserId", "savedVerses"]);
  const insets = useSafeAreaInsets();
  useTheme();

  const [query, setQuery] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const [collectionFilter, setCollectionFilter] = useState<CollectionFilter>(undefined);
  const [sort, setSort] = useState<BookmarkSort>("recent");
  const [sortReady, setSortReady] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sheetVerse, setSheetVerse] = useState<SavedVerse>();
  const [editorVisible, setEditorVisible] = useState(false);
  const [editingCollection, setEditingCollection] = useState<BookmarkCollection>();
  const [moveVisible, setMoveVisible] = useState(false);
  const [sortVisible, setSortVisible] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [cache, setCache] = useState<{ bookmarks: SavedVerse[]; collections: BookmarkCollection[]; ribbons: BibleRibbon[] }>({
    bookmarks: [],
    collections: [],
    ribbons: [],
  });
  const [toast, setToast] = useState<string>();

  useEffect(() => {
    setBookmarkBookOrder(kjvBooks.map((book) => book.name));
  }, []);

  useEffect(() => {
    if (!state.currentUserId) return;
    let active = true;
    setSortReady(false);
    void readBookmarkSort(state.currentUserId).then((value) => {
      if (!active) return;
      if (value) setSort(value);
      setSortReady(true);
    });
    return () => {
      active = false;
    };
  }, [state.currentUserId]);

  useEffect(() => {
    if (!state.currentUserId || state.bookmarksLoaded || state.savedVerses.length > 0) return;
    let active = true;
    void readBookmarkCache(state.currentUserId).then((snapshot) => {
      if (!active || !snapshot) return;
      setCache({
        bookmarks: snapshot.bookmarks,
        collections: snapshot.collections,
        ribbons: snapshot.ribbons,
      });
    });
    return () => {
      active = false;
    };
  }, [state.bookmarksLoaded, state.currentUserId, state.savedVerses.length]);

  useEffect(() => {
    if (!state.currentUserId || !sortReady) return;
    void writeBookmarkSort(state.currentUserId, sort);
  }, [sort, sortReady, state.currentUserId]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(undefined), 3000);
    return () => clearTimeout(timer);
  }, [toast]);

  const bookmarks = state.bookmarksLoaded ? state.savedVerses : cache.bookmarks;
  const collections = state.bookmarksLoaded ? state.bookmarkCollections : cache.collections;
  const ribbons = state.bookmarksLoaded ? state.bibleRibbons : cache.ribbons;
  const selectionMode = selectedIds.length > 0;

  const collectionCounts = useMemo(() => Object.fromEntries(
    collections.map((collection) => [collection.id, bookmarkCollectionCount(bookmarks, collection.id)]),
  ), [bookmarks, collections]);
  const unsorted = bookmarkCollectionCount(bookmarks, null);

  const visible = useMemo(() => {
    const filtered = bookmarks.filter((verse) => {
      if (collectionFilter === null && verse.collectionId) return false;
      if (typeof collectionFilter === "string" && verse.collectionId !== collectionFilter) return false;
      const normalized = query.trim().toLocaleLowerCase("sv");
      if (!normalized) return true;
      const haystack = [verse.reference, verse.text, verse.note ?? "", verse.translation ?? ""].join(" ").toLocaleLowerCase("sv");
      return haystack.includes(normalized) || haystack.replace(/[åä]/g, "a").replace(/ö/g, "o").includes(normalized.replace(/[åä]/g, "a").replace(/ö/g, "o"));
    });
    return sortBookmarks(filtered, sort);
  }, [bookmarks, collectionFilter, query, sort]);

  const referenceFor = useCallback(
    (verse: SavedVerse) => displayBibleReference(verse.reference, bookLanguage, verse.translation),
    [bookLanguage],
  );

  const openVerse = useCallback((verse: SavedVerse) => {
    setSheetVerse(undefined);
    void dispatch({ type: "touchSavedVerse", id: verse.id });
    if (!verse.book || !verse.chapter || !verse.startVerse) {
      router.push("/(tabs)/bible" as never);
      return;
    }
    router.push({
      pathname: "/(tabs)/bible",
      params: {
        book: verse.book,
        chapter: String(verse.chapter),
        verse: String(verse.startVerse),
      },
    } as never);
  }, []);

  const openRibbon = useCallback((ribbon: BibleRibbon) => {
    void dispatch({ type: "touchBibleRibbon", id: ribbon.id });
    router.push({
      pathname: "/(tabs)/bible",
      params: {
        book: ribbon.book,
        chapter: String(ribbon.chapter),
        verse: String(ribbon.verse),
      },
    } as never);
  }, [dispatch]);

  const openJournal = useCallback((verse: SavedVerse, kind: "scripture" | "prayer_request") => {
    setSheetVerse(undefined);
    router.push({
      pathname: "/(tabs)/me",
      params: {
        newEntry: `${Date.now()}`,
        composeKind: kind,
        composeTitle: referenceFor(verse),
        verseBook: verse.book,
        verseChapter: String(verse.chapter),
        verseStart: String(verse.startVerse),
        verseEnd: String(verse.endVerse ?? verse.startVerse),
        verseReference: verse.reference,
        verseText: verse.text,
        verseTranslation: verse.translation,
      },
    } as never);
  }, [referenceFor]);

  const shareToCommunity = useCallback((verse: SavedVerse) => {
    if (!state.currentGroupId) {
      Alert.alert(t("bookmarks.communityUnavailableTitle"), t("bookmarks.communityUnavailableBody"));
      return;
    }
    setSheetVerse(undefined);
    void dispatch({
      type: "createPost",
      body: t("bookmarks.shareBody"),
      kind: "scripture",
      title: referenceFor(verse),
      verse: {
        book: verse.book,
        chapter: verse.chapter,
        startVerse: verse.startVerse,
        endVerse: verse.endVerse,
        reference: verse.reference,
        text: verse.text,
        translation: verse.translation,
        contextBefore: verse.contextBefore,
        contextAfter: verse.contextAfter,
      },
    }).then(() => setToast(t("bookmarks.shared")));
  }, [dispatch, referenceFor, state.currentGroupId, t]);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }, []);

  const deleteOne = useCallback((verse: SavedVerse) => {
    setSheetVerse(undefined);
    void dispatch({ type: "removeSavedVerse", id: verse.id }).then(() => setToast(t("bookmarks.deleted")));
  }, [dispatch, t]);

  const deleteSelected = useCallback(() => {
    if (!selectedIds.length) return;
    Alert.alert(t("bookmarks.deleteTitle"), t("bookmarks.deleteManyBody", { count: selectedIds.length }), [
      { text: t("bookmarks.cancel"), style: "cancel" },
      {
        text: t("bookmarks.delete"),
        style: "destructive",
        onPress: () => {
          const ids = [...selectedIds];
          setSelectedIds([]);
          void dispatch({ type: "removeSavedVerses", ids }).then(() => setToast(t("bookmarks.deleted")));
        },
      },
    ]);
  }, [dispatch, selectedIds, t]);

  const moveSelected = useCallback((collectionId: string | null) => {
    if (!selectedIds.length) return;
    const ids = [...selectedIds];
    setSelectedIds([]);
    setMoveVisible(false);
    void dispatch({ type: "moveSavedVerses", ids, collectionId }).then(() => setToast(t("bookmarks.moved")));
  }, [dispatch, selectedIds, t]);

  const openNewCollection = useCallback(() => {
    setSheetVerse(undefined);
    setEditingCollection(undefined);
    setEditorVisible(true);
  }, []);

  const saveCollection = useCallback((name: string, color: BookmarkCollectionColor) => {
    if (editingCollection) {
      void dispatch({ type: "updateBookmarkCollection", id: editingCollection.id, name, color });
    } else {
      void dispatch({ type: "createBookmarkCollection", name, color });
    }
    setEditorVisible(false);
    setEditingCollection(undefined);
  }, [dispatch, editingCollection]);

  const deleteCollection = useCallback((collection: BookmarkCollection) => {
    Alert.alert(t("bookmarks.collection.deleteTitle"), t("bookmarks.collection.deleteBody"), [
      { text: t("bookmarks.cancel"), style: "cancel" },
      {
        text: t("bookmarks.collection.delete"),
        style: "destructive",
        onPress: () => {
          void dispatch({ type: "deleteBookmarkCollection", id: collection.id });
          setEditorVisible(false);
          setEditingCollection(undefined);
          setToast(t("bookmarks.collection.deleted"));
        },
      },
    ]);
  }, [dispatch, t]);

  const changeSort = useCallback(() => setSortVisible(true), []);

  const exportBookmarks = useCallback(() => setExportVisible(true), []);

  return (
    <View style={{ backgroundColor: colors.background, flex: 1 }}>
      <AmbientBackground />
      <View
        style={{
          alignItems: "center",
          flexDirection: "row",
          gap: 10,
          paddingBottom: 10,
          paddingHorizontal: 20,
          paddingTop: insets.top + 10,
        }}
      >
        {selectionMode ? (
          <>
            <IconButton accessibilityLabel={t("bookmarks.cancel")} icon="x" onPress={() => setSelectedIds([])} />
            <Text style={[typography.title, { color: colors.ink, flex: 1 }]}>
              {t("bookmarks.selectedCount", { count: selectedIds.length })}
            </Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => setSelectedIds(selectedIds.length === visible.length ? [] : visible.map((verse) => verse.id))}
              style={{ minHeight: 44, justifyContent: "center", paddingHorizontal: 8 }}
            >
              <Text style={[typography.label, { color: colors.gold }]}>{t("bookmarks.selectAll")}</Text>
            </Pressable>
          </>
        ) : (
          <>
            <IconButton accessibilityLabel={t("bookmarks.back")} icon="arrow-left" onPress={() => router.back()} />
            <Text style={[typography.screenTitle, { color: colors.ink, flex: 1, fontSize: 28 }]}>
              {t("bookmarks.title")}
            </Text>
            <IconButton
              accessibilityLabel={t("bookmarks.search")}
              icon="search"
              onPress={() => setSearchVisible((current) => !current)}
            />
            <IconButton accessibilityLabel={t("bookmarks.more")} icon="more-horizontal" onPress={exportBookmarks} />
          </>
        )}
      </View>

      {searchVisible ? (
        <View style={{ paddingBottom: 8, paddingHorizontal: 20 }}>
          <View
            style={{
              alignItems: "center",
              backgroundColor: shadcn.input,
              borderColor: colors.line,
              borderRadius: radius.lg,
              borderWidth: 1,
              flexDirection: "row",
              gap: 8,
              minHeight: 48,
              paddingHorizontal: 12,
            }}
          >
            <Feather name="search" size={17} color={colors.muted} />
            <TextInput
              accessibilityLabel={t("bookmarks.search")}
              autoFocus
              onChangeText={setQuery}
              placeholder={t("bookmarks.searchPlaceholder")}
              placeholderTextColor={colors.muted}
              returnKeyType="search"
              style={[typography.body, { color: colors.ink, flex: 1, minHeight: 46 }]}
              value={query}
            />
            {query ? (
              <Pressable accessibilityLabel={t("bookmarks.clearSearch")} onPress={() => setQuery("")} style={{ height: 32, justifyContent: "center", width: 32 }}>
                <Feather name="x" size={17} color={colors.muted} />
              </Pressable>
            ) : null}
          </View>
        </View>
      ) : null}

      {state.bookmarkOutboxCount > 0 ? (
        <View style={{ alignItems: "center", backgroundColor: colors.accentSubtle, borderColor: colors.line, borderRadius: radius.md, borderWidth: 1, flexDirection: "row", gap: 7, marginBottom: 8, marginHorizontal: 20, minHeight: 34, paddingHorizontal: 12 }}>
          <Feather name="cloud-off" size={14} color={colors.gold} />
          <Text style={[typography.caption, { color: colors.gold, fontSize: 12 }]}>{t("bookmarks.sync.pending")}</Text>
        </View>
      ) : null}

      <FlatList
        contentContainerStyle={{ gap: 8, paddingBottom: selectionMode ? 140 : 40, paddingHorizontal: 20 }}
        data={visible}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        keyboardShouldPersistTaps="handled"
        keyExtractor={(item) => item.id}
        ListEmptyComponent={query ? (
          <View style={{ alignItems: "center", gap: 10, paddingVertical: 48 }}>
            <Feather name="search" size={26} color={colors.muted} />
            <Text style={[typography.body, { color: colors.muted, textAlign: "center" }]}>
              {t("bookmarks.noResults", { query })}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setQuery("")} style={{ minHeight: 44, justifyContent: "center" }}>
              <Text style={[typography.label, { color: colors.gold }]}>{t("bookmarks.clearSearch")}</Text>
            </Pressable>
          </View>
        ) : (
          <BookmarkEmpty onOpenBible={() => router.push("/(tabs)/bible" as never)} />
        )}
        ListHeaderComponent={(
          <View style={{ gap: 16, paddingBottom: 4, paddingTop: 4 }}>
            {ribbons.length ? (
              <View style={{ gap: 9 }}>
                <Text style={[typography.label, { color: colors.muted }]}>{t("ribbons.title")}</Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  {ribbons.slice(0, 5).map((ribbon) => {
                    const reference = displayBibleReference(
                      `${ribbon.book} ${ribbon.chapter}:${ribbon.verse}`,
                      bookLanguage,
                    );
                    return (
                      <Pressable
                        accessibilityLabel={`${ribbon.label ?? reference}. ${t("ribbons.continue")}`}
                        accessibilityRole="button"
                        key={ribbon.id}
                        onPress={() => openRibbon(ribbon)}
                        style={({ pressed }) => ({
                          backgroundColor: pressed ? shadcn.secondary : shadcn.card,
                          borderColor: colors.line,
                          borderCurve: "continuous",
                          borderRadius: radius.lg,
                          borderWidth: 1,
                          flex: 1,
                          gap: 7,
                          minHeight: 78,
                          minWidth: 0,
                          padding: 11,
                        })}
                      >
                        <View style={{ alignItems: "center", flexDirection: "row", gap: 7 }}>
                          <BookmarkGlyph color={colors.gold} size={18} />
                          <Text numberOfLines={1} style={[typography.label, { color: colors.ink, flex: 1 }]}>
                            {ribbon.label ?? reference}
                          </Text>
                        </View>
                        <Text numberOfLines={1} style={[typography.caption, { color: colors.muted, fontSize: 12 }]}>
                          {ribbon.label ? reference : t("ribbons.continue")}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            <BookmarkCollectionStrip
              collections={sortBookmarkCollections(collections)}
              counts={collectionCounts}
              onSelect={setCollectionFilter}
              selectedId={collectionFilter}
              total={bookmarks.length}
              unsorted={unsorted}
            />

            <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={[typography.sectionLabel, { color: colors.muted }]}>
                {t(sort === "recent" ? "bookmarks.sort.recent" : sort === "canonical" ? "bookmarks.sort.canonical" : "bookmarks.sort.opened")}
              </Text>
              <Pressable accessibilityRole="button" onPress={changeSort} style={{ alignItems: "center", flexDirection: "row", gap: 5, minHeight: 38 }}>
                <Feather name="sliders" size={14} color={colors.gold} />
                <Text style={[typography.label, { color: colors.gold }]}>{t("bookmarks.sort.action")}</Text>
              </Pressable>
              {typeof collectionFilter === "string" ? (
                <Pressable
                  accessibilityLabel={t("bookmarks.collection.edit")}
                  accessibilityRole="button"
                  onPress={() => {
                    const collection = collections.find((item) => item.id === collectionFilter);
                    if (!collection) return;
                    setEditingCollection(collection);
                    setEditorVisible(true);
                  }}
                  style={{ alignItems: "center", flexDirection: "row", gap: 5, minHeight: 38 }}
                >
                  <Feather name="edit-3" size={14} color={colors.gold} />
                  <Text style={[typography.label, { color: colors.gold }]}>{t("bookmarks.collection.edit")}</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        )}
        renderItem={({ item }) => (
          <BookmarkRow
            collection={collections.find((collection) => collection.id === item.collectionId)}
            onDelete={() => deleteOne(item)}
            onLongPress={() => toggleSelected(item.id)}
            onMore={() => setSheetVerse(item)}
            onMove={() => {
              setSelectedIds([item.id]);
              setMoveVisible(true);
            }}
            onPress={() => selectionMode ? toggleSelected(item.id) : setSheetVerse(item)}
            reference={referenceFor(item)}
            selected={selectedIds.includes(item.id)}
            selectionMode={selectionMode}
            verse={item}
          />
        )}
      />

      {selectionMode ? (
        <BookmarkSelectionBar
          count={selectedIds.length}
          onCancel={() => setSelectedIds([])}
          onDelete={deleteSelected}
          onMove={() => setMoveVisible(true)}
        />
      ) : null}

      {toast ? (
        <View
          style={{
            alignSelf: "center",
            backgroundColor: colors.ink,
            borderRadius: 999,
            bottom: selectionMode ? 96 : 28,
            paddingHorizontal: 16,
            paddingVertical: 10,
            position: "absolute",
          }}
        >
          <Text style={[typography.caption, { color: shadcn.primaryForeground }]}>{toast}</Text>
        </View>
      ) : null}

      <BookmarkSheet
        collections={sortBookmarkCollections(collections)}
        onClose={() => setSheetVerse(undefined)}
        onCreateCollection={openNewCollection}
        onDelete={deleteOne}
        onOpen={openVerse}
        onPray={(verse) => openJournal(verse, "prayer_request")}
        onReflect={(verse) => openJournal(verse, "scripture")}
        onShareToCommunity={shareToCommunity}
        onUpdate={(id, patch) => { void dispatch({ type: "updateSavedVerse", id, patch }); }}
        reference={sheetVerse ? referenceFor(sheetVerse) : ""}
        verse={sheetVerse}
      />

      <CollectionEditor
        collection={editingCollection}
        onClose={() => {
          setEditorVisible(false);
          setEditingCollection(undefined);
        }}
        onDelete={deleteCollection}
        onSave={saveCollection}
        visible={editorVisible}
      />

      <MoveSheet
        collections={sortBookmarkCollections(collections)}
        onClose={() => setMoveVisible(false)}
        onMove={moveSelected}
        visible={moveVisible}
      />

      <SortSheet
        onClose={() => setSortVisible(false)}
        onSelect={(next) => {
          setSort(next);
          setSortVisible(false);
        }}
        sort={sort}
        visible={sortVisible}
      />

      <ExportSheet
        onClose={() => setExportVisible(false)}
        onCsv={() => {
          setExportVisible(false);
          void Clipboard.setStringAsync(formatBookmarkCsv(bookmarks, collections))
            .then(() => setToast(t("bookmarks.export.copied")));
        }}
        onMarkdown={() => {
          setExportVisible(false);
          void Clipboard.setStringAsync(formatBookmarkMarkdown(bookmarks, collections))
            .then(() => setToast(t("bookmarks.export.copied")));
        }}
        onShare={() => {
          setExportVisible(false);
          void Share.share({ message: formatBookmarkMarkdown(bookmarks, collections) });
        }}
        visible={exportVisible}
      />
    </View>
  );
}

function MoveSheet({
  collections,
  onClose,
  onMove,
  visible,
}: {
  collections: BookmarkCollection[];
  onClose: () => void;
  onMove: (collectionId: string | null) => void;
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  return (
    <BottomSheet onClose={onClose} title={t("bookmarks.moveTitle")} visible={visible}>
      <View style={{ gap: 8, paddingBottom: 28, paddingHorizontal: 20 }}>
        <MoveRow label={t("bookmarks.collection.unsorted")} onPress={() => onMove(null)} />
        {collections.map((collection) => (
          <MoveRow
            color={bookmarkColor(collection.color)}
            key={collection.id}
            label={collection.name}
            onPress={() => onMove(collection.id)}
          />
        ))}
        {!collections.length ? (
          <Text style={[typography.body, { color: colors.muted }]}>{t("bookmarks.collection.empty")}</Text>
        ) : null}
      </View>
    </BottomSheet>
  );
}

function MoveRow({ color, label, onPress }: { color?: string; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: "center",
        backgroundColor: pressed ? shadcn.secondary : shadcn.card,
        borderColor: colors.line,
        borderRadius: radius.md,
        borderWidth: 1,
        flexDirection: "row",
        gap: 10,
        minHeight: 54,
        paddingHorizontal: 14,
      })}
    >
      {color ? <View style={{ backgroundColor: color, borderRadius: 999, height: 9, width: 9 }} /> : <Feather name="archive" size={16} color={colors.muted} />}
      <Text style={[typography.body, { color: colors.ink, flex: 1 }]}>{label}</Text>
      <Feather name="chevron-right" size={17} color={colors.muted} />
    </Pressable>
  );
}

function SortSheet({
  onClose,
  onSelect,
  sort,
  visible,
}: {
  onClose: () => void;
  onSelect: (sort: BookmarkSort) => void;
  sort: BookmarkSort;
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  const options: { label: string; value: BookmarkSort }[] = [
    { label: t("bookmarks.sort.recent"), value: "recent" },
    { label: t("bookmarks.sort.canonical"), value: "canonical" },
    { label: t("bookmarks.sort.opened"), value: "opened" },
  ];
  return (
    <BottomSheet onClose={onClose} title={t("bookmarks.sort.title")} visible={visible}>
      <View style={{ gap: 8, paddingBottom: 28, paddingHorizontal: 20 }}>
        {options.map((option) => (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: sort === option.value }}
            key={option.value}
            onPress={() => onSelect(option.value)}
            style={({ pressed }) => ({
              alignItems: "center",
              backgroundColor: pressed ? shadcn.secondary : sort === option.value ? colors.accentSubtle : shadcn.card,
              borderColor: sort === option.value ? colors.gold : colors.line,
              borderRadius: radius.md,
              borderWidth: 1,
              flexDirection: "row",
              justifyContent: "space-between",
              minHeight: 54,
              paddingHorizontal: 14,
            })}
          >
            <Text style={[typography.body, { color: colors.ink }]}>{option.label}</Text>
            {sort === option.value ? <Feather name="check" size={17} color={colors.gold} /> : null}
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

function ExportSheet({
  onClose,
  onCsv,
  onMarkdown,
  onShare,
  visible,
}: {
  onClose: () => void;
  onCsv: () => void;
  onMarkdown: () => void;
  onShare: () => void;
  visible: boolean;
}) {
  const { t } = useAppTranslation();
  return (
    <BottomSheet onClose={onClose} title={t("bookmarks.export.title")} visible={visible}>
      <View style={{ gap: 8, paddingBottom: 28, paddingHorizontal: 20 }}>
        <Text style={[typography.caption, { color: colors.muted }]}>{t("bookmarks.export.warning")}</Text>
        <Pressable accessibilityRole="button" onPress={onMarkdown} style={exportRowStyle()}>
          <Feather name="clipboard" size={17} color={colors.gold} />
          <Text style={[typography.body, { color: colors.ink, flex: 1 }]}>{t("bookmarks.export.markdown")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onCsv} style={exportRowStyle()}>
          <Feather name="grid" size={17} color={colors.gold} />
          <Text style={[typography.body, { color: colors.ink, flex: 1 }]}>{t("bookmarks.export.csv")}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={onShare} style={exportRowStyle()}>
          <Feather name="share-2" size={17} color={colors.gold} />
          <Text style={[typography.body, { color: colors.ink, flex: 1 }]}>{t("bookmarks.export.share")}</Text>
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const exportRowStyle = () => ({
  alignItems: "center" as const,
  backgroundColor: shadcn.card,
  borderColor: colors.line,
  borderRadius: radius.md,
  borderWidth: 1,
  flexDirection: "row" as const,
  gap: 10,
  minHeight: 54,
  paddingHorizontal: 14,
});
