import { useMemo, useState } from "react";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";

import {
  completionPercent,
  currentPlanDay,
  firstPositionForPlanDay,
  makeBiblePlanRange,
  todayDateKey,
} from "@/features/bible-plans";
import { kjvBooks, normalizeBiblePosition, versesForChapter, type BiblePosition } from "@/features/bible-kjv";
import { useKoino } from "@/state/koino-store";
import type { BiblePlan, BiblePlanRange, GroupBiblePlanAnnouncement } from "@/state/types";
import { AppScreen, BodyText, Card, FilterChips, IconButton, PrimaryButton, SecondaryButton, SectionHeading, TextInputField } from "@/ui/app-components";
import { confirmAction } from "@/ui/confirm";
import { colors, radius, typography } from "@/ui/theme";

type PlanTab = "active" | "saved" | "completed" | "group";
type RangeDraft = {
  id: string;
  end: BiblePosition;
  start: BiblePosition;
};

const tabs: { label: string; value: PlanTab }[] = [
  { label: "Active", value: "active" },
  { label: "Saved", value: "saved" },
  { label: "Completed", value: "completed" },
  { label: "Group", value: "group" },
];

function formatPlanDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(date);
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
  const [tab, setTab] = useState<PlanTab>("active");
  const [title, setTitle] = useState("");
  const [dayCount, setDayCount] = useState("7");
  const [startDate, setStartDate] = useState(todayDateKey());
  const [rangeDrafts, setRangeDrafts] = useState<RangeDraft[]>([firstRangeDraft()]);
  const group = state.groups.find((item) => item.id === state.currentGroupId);
  const ownsGroup = Boolean(group && group.ownerId === state.currentUserId);
  const plans = useMemo(() => state.biblePlans.filter((plan) => plan.userId === state.currentUserId), [state.biblePlans, state.currentUserId]);
  const filteredPlans = plans.filter((plan) => {
    if (tab === "group") return plan.source === "group";
    if (tab === "active") return plan.status === "active";
    return plan.status === tab;
  });
  const ranges = rangeDrafts.map(rangeFromDraft);
  const canCreate = title.trim().length > 0 && ranges.length > 0 && Number(dayCount) > 0 && /^\d{4}-\d{2}-\d{2}$/.test(startDate);

  async function createPlan() {
    if (!canCreate) return;
    await dispatch({
      type: "createBiblePlan",
      title,
      ranges,
      dayCount: Number(dayCount),
      startDate,
    });
    setTitle("");
    setDayCount("7");
    setStartDate(todayDateKey());
    setRangeDrafts([firstRangeDraft()]);
    setTab("active");
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
        <IconButton accessibilityLabel="Back" icon="arrow-left" onPress={() => router.back()} />
        <Text style={[typography.label, { color: colors.olive }]}>Bible Plans</Text>
        <View style={{ width: 38 }} />
      </View>

      <View style={{ gap: 6 }}>
        <Text style={[typography.screenTitle, { color: colors.ink, fontSize: 25, lineHeight: 31 }]}>Bible Plans</Text>
        <BodyText muted>Create a plan, follow today’s reading, and keep your community in rhythm.</BodyText>
      </View>

      <CreatePlanCard
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
      />

      <FilterChips options={tabs} value={tab} onChange={setTab} />

      {tab === "group" ? (
        <View style={{ gap: 12 }}>
          <SectionHeading>Announced plans</SectionHeading>
          {state.groupBiblePlanAnnouncements.length === 0 ? (
            <Card>
              <BodyText muted>No Bible plans have been announced in this community yet.</BodyText>
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
                        title: "Unannounce plan?",
                        message: "The plan will no longer be shown to the community.",
                        confirmText: "Unannounce",
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
          <SectionHeading>{tab === "active" ? "Active plans" : tab === "saved" ? "Saved plans" : "Completed plans"}</SectionHeading>
          {filteredPlans.length === 0 ? (
            <Card>
              <BodyText muted>{tab === "completed" ? "Completed Bible plans will appear here." : "Create a Bible plan to begin."}</BodyText>
            </Card>
          ) : null}
          {filteredPlans.map((plan) => (
            <PlanCard
              canAnnounce={ownsGroup && plan.source === "personal" && !plan.announcementId}
              key={plan.id}
              onAnnounce={() => dispatch({ type: "announceBiblePlan", planId: plan.id })}
              onDelete={() =>
                confirmAction({
                  title: "Delete Bible plan?",
                  message: "This removes the plan from your saved plans.",
                  confirmText: "Delete",
                  destructive: true,
                  onConfirm: () => dispatch({ type: "deleteBiblePlan", id: plan.id }),
                })
              }
              onJump={() => {
                const position = firstPositionForPlanDay(currentPlanDay(plan)?.day);
                if (position) router.push("/(tabs)/bible" as never);
              }}
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
  return (
    <Card>
      <View style={{ gap: 4 }}>
        <Text style={[typography.cardTitle, { color: colors.ink }]}>Create custom plan</Text>
        <BodyText muted>Choose passages, days, and a start date.</BodyText>
      </View>
      <TextInputField placeholder="Plan title" value={title} onChangeText={onTitle} />
      <View style={{ flexDirection: "row", gap: 10 }}>
        <TextInputField
          keyboardType="number-pad"
          onChangeText={(value) => onDayCount(value.replace(/[^0-9]/g, ""))}
          placeholder="Days"
          style={{ flex: 1 }}
          value={dayCount}
        />
        <TextInputField placeholder="YYYY-MM-DD" style={{ flex: 1.4 }} value={startDate} onChangeText={onStartDate} />
      </View>
      <View style={{ gap: 10 }}>
        <SectionHeading muted>Ranges</SectionHeading>
        {rangeDrafts.map((range, index) => (
          <RangeEditor
            key={range.id}
            label={`Range ${index + 1}`}
            onRemove={rangeDrafts.length > 1 ? () => onRemoveRange(range.id) : undefined}
            onUpdate={(side, next) => onUpdateRange(range.id, side, next)}
            range={range}
          />
        ))}
      </View>
      <SecondaryButton icon="plus" onPress={onAddRange}>
        Add range
      </SecondaryButton>
      <PrimaryButton disabled={!canCreate} icon="calendar" onPress={onCreate}>
        Create plan
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
  return (
    <View style={{ backgroundColor: colors.input, borderColor: colors.line, borderRadius: radius.lg, borderWidth: 1, gap: 10, padding: 12 }}>
      <View style={{ alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "space-between" }}>
        <Text style={[typography.label, { color: colors.ink }]}>{label}</Text>
        {onRemove ? (
          <Pressable accessibilityLabel={`Remove ${label}`} accessibilityRole="button" onPress={onRemove} style={{ padding: 6 }}>
            <Feather name="x" size={17} color={colors.olive} />
          </Pressable>
        ) : null}
      </View>
      <PositionEditor label="Start" position={range.start} onChange={(next) => onUpdate("start", next)} />
      <PositionEditor label="Finish" position={range.end} onChange={(next) => onUpdate("end", next)} />
    </View>
  );
}

function PositionEditor({ label, onChange, position }: { label: string; onChange: (position: BiblePosition) => void; position: BiblePosition }) {
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
      <PickerRow values={kjvBooks.map((item) => item.name)} selected={position.book} onSelect={setBook} />
      <PickerRow values={(book?.chapters ?? []).map(String)} selected={String(position.chapter)} onSelect={(value) => setChapter(Number(value))} />
      <PickerRow values={verses.map(String)} selected={String(position.verse)} onSelect={(value) => onChange(normalizeBiblePosition({ ...position, verse: Number(value) }))} />
    </View>
  );
}

function PickerRow({ onSelect, selected, values }: { onSelect: (value: string) => void; selected: string; values: string[] }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
      {values.map((value) => {
        const isSelected = value === selected;
        return (
          <Pressable
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
            <Text style={{ color: isSelected ? colors.olive : colors.muted, fontSize: 13, fontWeight: "800" }}>{value}</Text>
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
  plan,
}: {
  canAnnounce: boolean;
  onAnnounce: () => void;
  onDelete: () => void;
  onJump: () => void;
  plan: BiblePlan;
}) {
  const completed = completedCount(plan);
  const percent = completionPercent(completed, plan.days.length);
  const current = currentPlanDay(plan);

  return (
    <Card>
      <View style={{ alignItems: "flex-start", flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1, gap: 5 }}>
          <Text style={[typography.cardTitle, { color: colors.ink }]}>{plan.title}</Text>
          <BodyText muted>
            {formatPlanDate(plan.startDate)} · {plan.dayCount} days · {percent}% complete
          </BodyText>
        </View>
        <Pressable accessibilityLabel={`Delete ${plan.title}`} accessibilityRole="button" onPress={onDelete} style={{ padding: 8 }}>
          <Feather name="trash-2" size={18} color={colors.danger} />
        </Pressable>
      </View>
      <View style={{ backgroundColor: colors.line, borderRadius: 999, height: 8, overflow: "hidden" }}>
        <View style={{ backgroundColor: colors.gold, height: 8, width: `${percent}%` }} />
      </View>
      <BodyText muted>{current?.day ? `Today: day ${current.day.dayNumber}` : "No reading scheduled."}</BodyText>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <SecondaryButton icon="book-open" onPress={onJump} style={{ flex: 1 }}>
          Read
        </SecondaryButton>
        {canAnnounce ? (
          <PrimaryButton icon="users" onPress={onAnnounce} style={{ flex: 1 }}>
            Announce
          </PrimaryButton>
        ) : null}
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
            Starts {formatPlanDate(announcement.startDate)} · {joinedCount} joined · {percent}% complete
          </BodyText>
        </View>
        {onUnannounce ? (
          <Pressable accessibilityLabel={`Unannounce ${announcement.title}`} accessibilityRole="button" onPress={onUnannounce} style={{ padding: 8 }}>
            <Feather name="x-circle" size={18} color={colors.danger} />
          </Pressable>
        ) : null}
      </View>
      <View style={{ backgroundColor: colors.line, borderRadius: 999, height: 8, overflow: "hidden" }}>
        <View style={{ backgroundColor: colors.olive, height: 8, width: `${percent}%` }} />
      </View>
      <PrimaryButton disabled={joined} icon={joined ? "check" : "plus"} onPress={onJoin}>
        {joined ? "Joined" : "Join plan"}
      </PrimaryButton>
    </Card>
  );
}
