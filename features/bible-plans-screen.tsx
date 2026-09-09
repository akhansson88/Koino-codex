import { useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  buildBiblePlanDays,
  completionPercent,
  dayKeyForPlanDay,
  firstPositionForPlanDay,
  makeBiblePlanRange,
  todayDateKey,
} from "@/features/bible-plans";
import { kjvBooks, normalizeBiblePosition, versesForChapter, type BiblePosition } from "@/features/bible-canon";
import { useKoino } from "@/state/koino-store";
import { isPlanDate, nextUnreadPlanDay, todayPlanDay, rescheduleBiblePlan } from "@/state/bible-plan-schedule";
import type { BiblePlan, BiblePlanRange, GroupBiblePlanAnnouncement } from "@/state/types";
import { AppScreen, BodyText, Card, FilterChips, IconButton, PrimaryButton, SecondaryButton, SectionHeading, TextInputField } from "@/ui/app-components";
import { useAppTranslation } from "@/ui/app-language";
import { confirmAction } from "@/ui/confirm";
import type { AppLanguage, TranslationFunction } from "@/ui/localization";
import { colors, radius, typography } from "@/ui/theme";

type PlanTab = "active" | "saved" | "completed" | "group";
type RangeDraft = {
  id: string;
  end: BiblePosition;
  start: BiblePosition;
};

const swedishBibleBookNames: Record<string, string> = {
  Genesis: "Första Moseboken",
  Exodus: "Andra Moseboken",
  Leviticus: "Tredje Moseboken",
  Numbers: "Fjärde Moseboken",
  Deuteronomy: "Femte Moseboken",
  Joshua: "Josua",
  Judges: "Domarboken",
  Ruth: "Rut",
  "1 Samuel": "Första Samuelsboken",
  "2 Samuel": "Andra Samuelsboken",
  "1 Kings": "Första Kungaboken",
  "2 Kings": "Andra Kungaboken",
  "1 Chronicles": "Första Krönikeboken",
  "2 Chronicles": "Andra Krönikeboken",
  Ezra: "Esra",
  Nehemiah: "Nehemja",
  Esther: "Ester",
  Job: "Job",
  Psalms: "Psaltaren",
  Proverbs: "Ordspråksboken",
  Ecclesiastes: "Predikaren",
  "Solomon's Song": "Höga Visan",
  Isaiah: "Jesaja",
  Jeremiah: "Jeremia",
  Lamentations: "Klagovisorna",
  Ezekiel: "Hesekiel",
  Daniel: "Daniel",
  Hosea: "Hosea",
  Joel: "Joel",
  Amos: "Amos",
  Obadiah: "Obadja",
  Jonah: "Jona",
  Micah: "Mika",
  Nahum: "Nahum",
  Habakkuk: "Habackuk",
  Zephaniah: "Sefanja",
  Haggai: "Haggai",
  Zechariah: "Sakarja",
  Malachi: "Malaki",
  Matthew: "Matteusevangeliet",
  Mark: "Markusevangeliet",
  Luke: "Lukasevangeliet",
  John: "Johannesevangeliet",
  Acts: "Apostlagärningarna",
  Romans: "Romarbrevet",
  "1 Corinthians": "Första Korinthierbrevet",
  "2 Corinthians": "Andra Korinthierbrevet",
  Galatians: "Galaterbrevet",
  Ephesians: "Efesierbrevet",
  Philippians: "Filipperbrevet",
  Colossians: "Kolosserbrevet",
  "1 Thessalonians": "Första Thessalonikerbrevet",
  "2 Thessalonians": "Andra Thessalonikerbrevet",
  "1 Timothy": "Första Timotheosbrevet",
  "2 Timothy": "Andra Timotheosbrevet",
  Titus: "Titusbrevet",
  Philemon: "Filemonbrevet",
  Hebrews: "Hebreerbrevet",
  James: "Jakobsbrevet",
  "1 Peter": "Första Petrusbrevet",
  "2 Peter": "Andra Petrusbrevet",
  "1 John": "Första Johannesbrevet",
  "2 John": "Andra Johannesbrevet",
  "3 John": "Tredje Johannesbrevet",
  Jude: "Judasbrevet",
  Revelation: "Uppenbarelseboken",
};

function displayBibleBookName(bookName: string, language: AppLanguage) {
  return language === "sv" ? swedishBibleBookNames[bookName] ?? bookName : bookName;
}

function formatPlanDate(value: string, language: AppLanguage) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(language === "sv" ? "sv-SE" : "en", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function dayCountLabel(count: number, t: TranslationFunction) {
  return count === 1 ? t("bible.plans.day.single") : t("bible.plans.day.count", { count });
}

function participantCountLabel(count: number, t: TranslationFunction) {
  return count === 1 ? t("bible.plans.participant.single") : t("bible.plans.participant.count", { count });
}

function firstRangeDraft(): RangeDraft {
  const firstBook = kjvBooks[0]?.name ?? "Genesis";
  return {
    id: "range_1",
    start: normalizeBiblePosition({ book: firstBook, chapter: 1, verse: 1 }),
    end: normalizeBiblePosition({ book: firstBook, chapter: 1, verse: 1 }),
  };
}

function rangeFromDraft(draft: RangeDraft, index: number): BiblePlanRange {
  return makeBiblePlanRange(`range_${index + 1}`, draft.start, draft.end);
}

function completedCount(plan: Pick<BiblePlan, "days">) {
  return plan.days.filter((day) => Boolean(day.completedAt)).length;
}

function announcementJoined(plan: GroupBiblePlanAnnouncement, plans: BiblePlan[]) {
  return plans.some((item) => item.announcementId === plan.id);
}

export function BiblePlansScreen() {
  const { state, dispatch } = useKoino();
  const { t } = useAppTranslation();
  const [tab, setTab] = useState<PlanTab>("active");
  const [creating, setCreating] = useState(false);
  const [savingPlan, setSavingPlan] = useState(false);
  const [title, setTitle] = useState("");
  const [dayCount, setDayCount] = useState("7");
  const [startDate, setStartDate] = useState(todayDateKey());
  const [rangeDrafts, setRangeDrafts] = useState<RangeDraft[]>([firstRangeDraft()]);
  const tabs = useMemo<{ label: string; value: PlanTab }[]>(
    () => [
      { label: t("bible.plans.tab.active"), value: "active" },
      { label: t("bible.plans.tab.saved"), value: "saved" },
      { label: t("bible.plans.tab.completed"), value: "completed" },
      { label: t("bible.plans.tab.group"), value: "group" },
    ],
    [t],
  );
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const ownsGroup = Boolean(group && group.ownerId === state.currentUserId);
  const plans = useMemo(() => state.biblePlans.filter((plan) => plan.userId === state.currentUserId), [state.biblePlans, state.currentUserId]);
  const filteredPlans = plans.filter((plan) => {
    if (tab === "group") return plan.source === "group";
    if (tab === "active") return plan.status === "active";
    return plan.status === tab;
  });
  const ranges = useMemo(() => rangeDrafts.map(rangeFromDraft), [rangeDrafts]);
  const validDayCount = Number.isInteger(Number(dayCount)) && Number(dayCount) > 0 && Number(dayCount) <= 3660;
  const canCreate = !savingPlan && title.trim().length > 0 && ranges.length > 0 && validDayCount && isPlanDate(startDate);

  async function createPlan() {
    if (!canCreate) return;
    setSavingPlan(true);
    try {
      await dispatch({ type: "createBiblePlan", title, ranges, dayCount: Number(dayCount), startDate });
      setTitle("");
      setDayCount("7");
      setStartDate(todayDateKey());
      setRangeDrafts([firstRangeDraft()]);
      setTab("active");
      setCreating(false);
    } catch { /* The store exposes the save error; keep the draft open. */ }
    finally { setSavingPlan(false); }
  }

  function updateRange(id: string, side: "start" | "end", next: BiblePosition) {
    setRangeDrafts((current) => current.map((range) => (range.id === id ? { ...range, [side]: normalizeBiblePosition(next) } : range)));
  }

  function addRange() {
    setRangeDrafts((current) => [...current, { ...firstRangeDraft(), id: `range_${Date.now()}` }]);
  }

  function removeRange(id: string) {
    setRangeDrafts((current) => (current.length === 1 ? current : current.filter((range) => range.id !== id)));
  }

  return (
    <AppScreen>
      <View style={{ alignItems: "center", flexDirection: "row", justifyContent: "space-between", gap: 12 }}>
        <IconButton accessibilityLabel={t("bible.plans.back")} icon="arrow-left" onPress={() => router.back()} />
        <Text style={[typography.label, { color: colors.olive }]}>{t("bible.plans.title")}</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={[typography.screenTitle, { color: colors.ink, fontSize: 25, lineHeight: 31 }]}>{t("bible.plans.title")}</Text>
        <BodyText muted>{t("bible.plans.description")}</BodyText>
      </View>

      <SecondaryButton icon={creating ? "x" : "plus"} disabled={savingPlan} onPress={() => setCreating(!creating)}>
        {t(creating ? "bible.plans.confirm.cancel" : "bible.plans.create.action")}
      </SecondaryButton>
      {creating ? <CreatePlanCard
        canCreate={canCreate}
        dayCount={dayCount}
        onAddRange={addRange}
        onCreate={createPlan}
        onDayCount={setDayCount}
        onRemoveRange={removeRange}
        onStartDate={setStartDate}
        onTitle={setTitle}
        onUpdateRange={updateRange}
        rangeDrafts={rangeDrafts}
        startDate={startDate}
        title={title}
      /> : null}

      <FilterChips options={tabs} value={tab} onChange={setTab} />
      {state.authError ? <Text accessibilityRole="alert" style={{ color: colors.danger }}>{state.authError}</Text> : null}

      {tab === "group" ? (
        <View style={{ gap: 12 }}>
          <SectionHeading>{t("bible.plans.section.group")}</SectionHeading>
          {state.groupBiblePlanAnnouncements.length === 0 ? (
            <Card>
              <BodyText muted>{t("bible.plans.empty.group")}</BodyText>
            </Card>
          ) : null}
          {state.groupBiblePlanAnnouncements.map((announcement) => (
            <GroupAnnouncementCard
              announcement={announcement}
              joined={announcementJoined(announcement, plans)}
              key={announcement.id}
              onJoin={() => dispatch({ type: "joinGroupBiblePlan", announcementId: announcement.id })}
              onUnannounce={
                ownsGroup
                  ? () =>
                      confirmAction({
                        title: t("bible.plans.group.removeTitle"),
                        message: t("bible.plans.group.removeMessage"),
                        confirmText: t("bible.plans.group.removeConfirm"),
                        cancelText: t("bible.plans.confirm.cancel"),
                        destructive: true,
                        onConfirm: () => dispatch({ type: "unannounceBiblePlan", announcementId: announcement.id }),
                      })
                  : undefined
              }
              participations={state.groupBiblePlanParticipations.filter((item) => item.announcementId === announcement.id)}
            />
          ))}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <SectionHeading>
            {tab === "active" ? t("bible.plans.section.active") : tab === "saved" ? t("bible.plans.section.saved") : t("bible.plans.section.completed")}
          </SectionHeading>
          {filteredPlans.length === 0 ? (
            <Card>
              <BodyText muted>{tab === "completed" ? t("bible.plans.empty.completed") : t("bible.plans.empty.start")}</BodyText>
            </Card>
          ) : null}
          {filteredPlans.map((plan) => (
            <PlanCard
              canAnnounce={ownsGroup && plan.source === "personal" && !plan.announcementId}
              key={plan.id}
              onAnnounce={() => dispatch({ type: "announceBiblePlan", planId: plan.id })}
              onDelete={() =>
                confirmAction({
                  title: t("bible.plans.plan.deleteTitle"),
                  message: t("bible.plans.plan.deleteMessage"),
                  confirmText: t("bible.plans.plan.deleteConfirm"),
                  cancelText: t("bible.plans.confirm.cancel"),
                  destructive: true,
                  onConfirm: () => dispatch({ type: "deleteBiblePlan", id: plan.id }),
                })
              }
              onJump={(dayNumber) => {
                const day = plan.days.find((item) => item.dayNumber === dayNumber);
                if (firstPositionForPlanDay(day)) router.push({ pathname: "/(tabs)/bible", params: { planId: plan.id, planDay: String(dayNumber), planJump: String(Date.now()) } });
              }}
              onMarkDay={(dayNumber, read) => dispatch({ type: "markBiblePlanDay", planId: plan.id, dayNumber, read })}
              onPause={() => dispatch({ type: "pauseBiblePlan", planId: plan.id })}
              onReschedule={(date) => dispatch({ type: "rescheduleBiblePlan", planId: plan.id, startDate: date })}
              plan={plan}
            />
          ))}
        </View>
      )}
    </AppScreen>
  );
}

function CreatePlanCard({
  canCreate,
  dayCount,
  onAddRange,
  onCreate,
  onDayCount,
  onRemoveRange,
  onStartDate,
  onTitle,
  onUpdateRange,
  rangeDrafts,
  startDate,
  title,
}: {
  canCreate: boolean;
  dayCount: string;
  onAddRange: () => void;
  onCreate: () => void;
  onDayCount: (value: string) => void;
  onRemoveRange: (id: string) => void;
  onStartDate: (value: string) => void;
  onTitle: (value: string) => void;
  onUpdateRange: (id: string, side: "start" | "end", next: BiblePosition) => void;
  rangeDrafts: RangeDraft[];
  startDate: string;
  title: string;
}) {
  const { t } = useAppTranslation();
  const preview = useMemo(() => {
    const count = Number(dayCount);
    return Number.isInteger(count) && count > 0 && count <= 3660 ? buildBiblePlanDays(rangeDrafts.map(rangeFromDraft), count) : [];
  }, [dayCount, rangeDrafts]);
  const emptyDays = preview.filter((day) => !day.ranges.length).length;

  return (
    <Card>
      <View style={{ gap: 4 }}>
        <Text style={[typography.cardTitle, { color: colors.ink }]}>{t("bible.plans.create.title")}</Text>
        <BodyText muted>{t("bible.plans.create.description")}</BodyText>
      </View>
      <TextInputField placeholder={t("bible.plans.create.titlePlaceholder")} value={title} onChangeText={onTitle} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TextInputField
          keyboardType="number-pad"
          onChangeText={(value) => onDayCount(value.replace(/[^0-9]/g, ""))}
          placeholder={t("bible.plans.create.daysPlaceholder")}
          style={{ flex: 1, minWidth: 0 }}
          value={dayCount}
        />
        <TextInputField placeholder={t("bible.plans.create.datePlaceholder")} style={{ flex: 1.4, minWidth: 0 }} value={startDate} onChangeText={onStartDate} />
      </View>
      <View style={{ gap: 10 }}>
        <SectionHeading muted>{t("bible.plans.create.passages")}</SectionHeading>
        {rangeDrafts.map((range, index) => (
          <RangeEditor
            key={range.id}
            label={t("bible.plans.create.passage", { number: index + 1 })}
            onRemove={rangeDrafts.length > 1 ? () => onRemoveRange(range.id) : undefined}
            onUpdate={(side, next) => onUpdateRange(range.id, side, next)}
            range={range}
          />
        ))}
      </View>
      <SecondaryButton icon="plus" onPress={onAddRange}>
        {t("bible.plans.create.addPassage")}
      </SecondaryButton>
      <SectionHeading>{t("bible.plans.preview")}</SectionHeading>
      {!isPlanDate(startDate) || !preview.length ? <BodyText muted>{t("bible.plans.invalidSchedule")}</BodyText> : (
        <>
          {emptyDays > 0 ? <BodyText>{t("bible.plans.emptyDays", { count: emptyDays })}</BodyText> : null}
          <ScrollView style={{ maxHeight: 260 }} nestedScrollEnabled>
            {preview.map((day) => <View key={day.dayNumber} style={{ paddingVertical: 8, gap: 4 }}>
              <Text style={[typography.label, { color: colors.ink }]}>{t("bible.plans.checklist.day", { day: day.dayNumber })} · {dayKeyForPlanDay({ startDate }, day.dayNumber)}</Text>
              <BodyText muted>{day.ranges.map((range) => range.displayReference).join("; ") || t("bible.plans.plan.noReading")}</BodyText>
            </View>)}
          </ScrollView>
        </>
      )}
      <PrimaryButton disabled={!canCreate} icon="calendar" onPress={onCreate}>
        {t("bible.plans.create.action")}
      </PrimaryButton>
    </Card>
  );
}

function RangeEditor({
  label,
  onRemove,
  onUpdate,
  range,
}: {
  label: string;
  onRemove?: () => void;
  onUpdate: (side: "start" | "end", next: BiblePosition) => void;
  range: RangeDraft;
}) {
  const { t } = useAppTranslation();

  return (
    <View style={{ backgroundColor: colors.input, borderColor: colors.line, borderRadius: radius.lg, borderWidth: 1, gap: 10, padding: 12 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" }}>
        <Text style={[typography.label, { color: colors.ink }]}>{label}</Text>
        {onRemove ? (
          <Pressable accessibilityLabel={t("bible.plans.create.removePassage", { passage: label })} accessibilityRole="button" onPress={onRemove} style={{ padding: 6 }}>
            <Feather name="x" size={17} color={colors.olive} />
          </Pressable>
        ) : null}
      </View>
      <PositionEditor label={t("bible.plans.create.start")} position={range.start} onChange={(next) => onUpdate("start", next)} />
      <PositionEditor label={t("bible.plans.create.finish")} position={range.end} onChange={(next) => onUpdate("end", next)} />
    </View>
  );
}

function PositionEditor({ label, onChange, position }: { label: string; onChange: (position: BiblePosition) => void; position: BiblePosition }) {
  const { language } = useAppTranslation();
  const book = kjvBooks.find((item) => item.name === position.book) ?? kjvBooks[0];
  const verses = versesForChapter(position.book, position.chapter);

  function setBook(bookName: string) {
    const nextBook = kjvBooks.find((item) => item.name === bookName) ?? book;
    const chapter = nextBook.chapters[0] ?? 1;
    onChange(normalizeBiblePosition({ book: nextBook.name, chapter, verse: 1 }));
  }

  function setChapter(chapter: number) {
    onChange(normalizeBiblePosition({ book: position.book, chapter, verse: 1 }));
  }

  return (
    <View style={{ gap: 8 }}>
      <Text style={[typography.caption, { color: colors.muted }]}>{label}</Text>
      <PickerRow
        displayValue={(value) => displayBibleBookName(value, language)}
        values={kjvBooks.map((item) => item.name)}
        selected={position.book}
        onSelect={setBook}
      />
      <PickerRow values={(book?.chapters ?? []).map(String)} selected={String(position.chapter)} onSelect={(value) => setChapter(Number(value))} />
      <PickerRow values={verses.map(String)} selected={String(position.verse)} onSelect={(value) => onChange(normalizeBiblePosition({ ...position, verse: Number(value) }))} />
    </View>
  );
}

function PickerRow({
  displayValue = (value) => value,
  onSelect,
  selected,
  values,
}: {
  displayValue?: (value: string) => string;
  onSelect: (value: string) => void;
  selected: string;
  values: string[];
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {values.map((value) => {
        const isSelected = value === selected;
        const label = displayValue(value);
        return (
          <Pressable
            accessibilityLabel={label}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            key={value}
            onPress={() => onSelect(value)}
            style={{
              alignItems: "center",
              backgroundColor: isSelected ? colors.accentSubtle : colors.paper,
              borderColor: isSelected ? colors.gold : colors.line,
              borderRadius: 999,
              borderWidth: 1,
              justifyContent: "center",
              minHeight: 34,
              paddingHorizontal: 12,
            }}
          >
            <Text style={{ color: isSelected ? colors.olive : colors.muted, fontSize: 13, fontWeight: "800" }}>{label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

function PlanCard({
  canAnnounce,
  onAnnounce,
  onDelete,
  onJump,
  onMarkDay,
  onPause,
  onReschedule,
  plan,
}: {
  canAnnounce: boolean;
  onAnnounce: () => void;
  onDelete: () => void;
  onJump: (dayNumber: number) => void;
  onMarkDay: (dayNumber: number, read: boolean) => Promise<void>;
  onPause: () => Promise<void>;
  onReschedule: (date: string) => Promise<void>;
  plan: BiblePlan;
}) {
  const { language, t } = useAppTranslation();
  const [saving, setSaving] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [restartDate, setRestartDate] = useState(todayDateKey());
  const completed = completedCount(plan);
  const percent = completionPercent(completed, plan.days.length);
  const today = todayPlanDay(plan, todayDateKey());
  const next = nextUnreadPlanDay(plan);
  const schedulePreview = isPlanDate(restartDate) ? rescheduleBiblePlan(plan, restartDate).filter((day) => !day.completedAt) : [];
  async function changeSchedule(action: () => Promise<void>) {
    setSaving(true);
    try { await action(); setScheduleOpen(false); } catch { /* Keep controls open; the store exposes the error. */ }
    finally { setSaving(false); }
  }

  return (
    <Card>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{plan.title}</Text>
          <BodyText muted>
            {t("bible.plans.plan.metadata", {
              date: formatPlanDate(plan.startDate, language),
              days: dayCountLabel(plan.dayCount, t),
              progress: t("bible.plans.progress", { percent }),
            })}
          </BodyText>
        </View>
        <Pressable accessibilityLabel={t("bible.plans.plan.deleteAccessibility", { title: plan.title })} accessibilityRole="button" onPress={onDelete} style={{ padding: 8 }}>
          <Feather name="trash-2" size={18} color={colors.danger} />
        </Pressable>
      </View>
      <View style={{ backgroundColor: colors.line, borderRadius: 999, height: 8, overflow: "hidden" }}>
        <View style={{ backgroundColor: colors.gold, height: 8, width: `${percent}%` }} />
      </View>
      {plan.pausedAt ? <BodyText>{t("bible.plans.paused")}</BodyText> : null}
      <BodyText muted>{today ? t("bible.plans.plan.today", { day: today.dayNumber }) : t("bible.plans.noToday")}</BodyText>
      <BodyText muted>{next ? t("bible.plans.nextDay", { day: next.dayNumber }) : t("bible.plans.noUnread")}</BodyText>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <SecondaryButton disabled={!today?.ranges?.length} icon="calendar" onPress={() => today && onJump(today.dayNumber)} style={{ flex: 1 }}>
          {t("bible.plans.today")}
        </SecondaryButton>
        <SecondaryButton disabled={!next} icon="book-open" onPress={() => next && onJump(next.dayNumber)} style={{ flex: 1 }}>
          {t("bible.plans.nextUnread")}
        </SecondaryButton>
      </View>
      <View style={{ gap: 10 }}>
        {canAnnounce ? (
          <PrimaryButton icon="users" onPress={onAnnounce} style={{ flex: 1 }}>
            {t("bible.plans.plan.share")}
          </PrimaryButton>
        ) : null}
      </View>
      {plan.status !== "completed" ? <View style={{ gap: 10 }}>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <SecondaryButton disabled={saving} icon={plan.pausedAt ? "play" : "pause"} onPress={() => changeSchedule(plan.pausedAt ? () => onReschedule(todayDateKey()) : onPause)} style={{ flex: 1 }}>
            {t(plan.pausedAt ? "bible.plans.resume" : "bible.plans.pause")}
          </SecondaryButton>
          <SecondaryButton disabled={saving} icon="calendar" onPress={() => setScheduleOpen(!scheduleOpen)} style={{ flex: 1 }}>
            {t("bible.plans.reschedule")}
          </SecondaryButton>
        </View>
        {plan.pausedAt || scheduleOpen ? <BodyText muted>{t("bible.plans.scheduleHelp")}</BodyText> : null}
        {scheduleOpen ? <View style={{ gap: 10 }}>
          <Text style={[typography.label, { color: colors.ink }]}>{t("bible.plans.restartDate")}</Text>
          <TextInputField value={restartDate} onChangeText={setRestartDate} placeholder="YYYY-MM-DD" />
          {!isPlanDate(restartDate) ? <BodyText>{t("bible.plans.invalidSchedule")}</BodyText> : <ScrollView style={{ maxHeight: 180 }} nestedScrollEnabled>
            {schedulePreview.map((day) => <BodyText muted key={day.dayNumber}>{t("bible.plans.checklist.day", { day: day.dayNumber })} · {day.scheduledDate}</BodyText>)}
          </ScrollView>}
          <PrimaryButton disabled={saving || !isPlanDate(restartDate)} onPress={() => changeSchedule(() => onReschedule(restartDate))}>
            {t("bible.plans.applySchedule")}
          </PrimaryButton>
        </View> : null}
      </View> : null}
      <View style={{ gap: 10 }}>
        {plan.days.map((day) => {
          const read = Boolean(day.completedAt);
          return (
            <View key={day.dayNumber} style={{ borderTopWidth: 1, borderColor: colors.line, paddingTop: 12, gap: 6 }}>
              <Text style={[typography.label, { color: colors.ink }]}>
                {t("bible.plans.checklist.day", { day: day.dayNumber })} · {formatPlanDate(dayKeyForPlanDay(plan, day.dayNumber), language)}
              </Text>
              {day.ranges.map((range) => <BodyText muted key={range.id}>{range.displayReference}</BodyText>)}
              {!day.ranges.length ? <BodyText muted>{t("bible.plans.plan.noReading")}</BodyText> : null}
              <View style={{ flexDirection: "row", gap: 10 }}>
                <SecondaryButton disabled={!day.ranges.length} icon="book-open" onPress={() => onJump(day.dayNumber)} style={{ flex: 1 }}>
                  {t("bible.plans.plan.read")}
                </SecondaryButton>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: read, disabled: saving }}
                  accessibilityLabel={`${t("bible.plans.checklist.day", { day: day.dayNumber })}: ${t(read ? "bible.plans.markUnread" : "bible.plans.markRead")}`}
                  disabled={saving}
                  onPress={async () => {
                    setSaving(true);
                    try { await onMarkDay(day.dayNumber, !read); } finally { setSaving(false); }
                  }}
                  style={{ flex: 1, minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, opacity: saving ? 0.5 : 1 }}
                >
                  <Feather name={read ? "check-square" : "square"} size={20} color={colors.olive} />
                  <Text style={[typography.label, { color: colors.olive }]}>{t(read ? "bible.plans.markUnread" : "bible.plans.markRead")}</Text>
                </Pressable>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function GroupAnnouncementCard({
  announcement,
  joined,
  onJoin,
  onUnannounce,
  participations,
}: {
  announcement: GroupBiblePlanAnnouncement;
  joined: boolean;
  onJoin: () => void;
  onUnannounce?: () => void;
  participations: { completedDayNumbers: Record<string, true>; totalDays: number }[];
}) {
  const { language, t } = useAppTranslation();
  const joinedCount = participations.length;
  const totalSlots = Math.max(1, joinedCount * announcement.dayCount);
  const completedSlots = participations.reduce((sum, item) => sum + Object.keys(item.completedDayNumbers ?? {}).length, 0);
  const percent = joinedCount ? completionPercent(completedSlots, totalSlots) : 0;

  return (
    <Card>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{announcement.title}</Text>
          <BodyText muted>
            {t("bible.plans.group.metadata", {
              date: formatPlanDate(announcement.startDate, language),
              participants: participantCountLabel(joinedCount, t),
              progress: t("bible.plans.progress", { percent }),
            })}
          </BodyText>
        </View>
        {onUnannounce ? (
          <Pressable accessibilityLabel={t("bible.plans.group.removeAccessibility", { title: announcement.title })} accessibilityRole="button" onPress={onUnannounce} style={{ padding: 8 }}>
            <Feather name="x-circle" size={18} color={colors.danger} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ backgroundColor: colors.line, borderRadius: 999, height: 8, overflow: "hidden" }}>
        <View style={{ backgroundColor: colors.olive, height: 8, width: `${percent}%` }} />
      </View>
      <PrimaryButton disabled={joined} icon={joined ? "check" : "plus"} onPress={onJoin}>
        {joined ? t("bible.plans.group.joined") : t("bible.plans.group.join")}
      </PrimaryButton>
    </Card>
  );
}
