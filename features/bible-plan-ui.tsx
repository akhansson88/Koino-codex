import { Feather } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import type { ReactNode } from "react";
import { Image, Pressable, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { displayBibleBookName, displayBibleReference } from "@/features/bible-book-names";
import {
  completionPercent,
  formatPlanDate,
  planDayMinutes,
  planWeek,
  todayDateKey,
  type PlanWeekDay,
} from "@/features/bible-plans";
import { verseCountForChapter } from "@/features/bible-canon";
import { biblePlanCover } from "@/features/bible-plan-images";
import { useBibleBookLanguage } from "@/features/use-bible-book-language";
import type { BiblePlan, BiblePlanDay } from "@/state/types";
import { useAppTranslation } from "@/ui/app-language";
import { colors, radius, shadcn, typography } from "@/ui/theme";

export function PlanCoverImage({
  children,
  coverKey,
  style,
}: {
  children?: ReactNode;
  coverKey?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ backgroundColor: shadcn.secondary, overflow: "hidden" }, style]}>
      <Image
        accessibilityIgnoresInvertColors
        resizeMode="cover"
        source={biblePlanCover(coverKey)}
        style={{ height: "100%", width: "100%" }}
      />
      {children}
    </View>
  );
}

export function PlanCoverCard({
  coverKey,
  eyebrow,
  meta,
  onPress,
  title,
}: {
  coverKey?: string;
  eyebrow?: string;
  meta?: string;
  onPress?: () => void;
  title: string;
}) {
  return (
    <Pressable
      accessibilityLabel={`${title}${meta ? `. ${meta}` : ""}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        borderRadius: radius.xxl,
        height: 184,
        opacity: pressed ? 0.9 : 1,
        overflow: "hidden",
        width: 292,
      })}
    >
      <PlanCoverImage coverKey={coverKey} style={{ height: "100%", width: "100%" }}>
        <LinearGradient
          colors={["rgba(20, 12, 6, 0)", "rgba(20, 12, 6, 0.18)", "rgba(20, 12, 6, 0.82)"]}
          locations={[0, 0.45, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={{ bottom: 0, left: 0, padding: 16, position: "absolute", right: 0 }}
        >
          {eyebrow ? (
            <Text style={[typography.sectionLabel, { color: "#FFD9BA", fontSize: 10, letterSpacing: 1.4 }]}>
              {eyebrow}
            </Text>
          ) : null}
          <Text numberOfLines={2} style={[typography.title, { color: "#FFFFFF", letterSpacing: -0.35 }]}>
            {title}
          </Text>
          {meta ? <Text style={[typography.caption, { color: "rgba(255,255,255,0.82)" }]}>{meta}</Text> : null}
        </LinearGradient>
      </PlanCoverImage>
    </Pressable>
  );
}

export function PlanThumbnail({ coverKey, style }: { coverKey?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <PlanCoverImage
      coverKey={coverKey}
      style={[
        {
          borderColor: "rgba(35, 26, 19, 0.08)",
          borderRadius: radius.lg,
          borderWidth: 1,
          height: 62,
          width: 96,
        },
        style,
      ]}
    />
  );
}

export function PlanProgressRing({
  percent,
  size = 48,
  strokeWidth = 5,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
}) {
  const radiusValue = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radiusValue;
  const offset = circumference * (1 - Math.max(0, Math.min(100, percent)) / 100);
  return (
    <View
      accessibilityLabel={`${percent}%`}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: percent }}
      style={{ alignItems: "center", height: size, justifyContent: "center", width: size }}
    >
      <Svg height={size} width={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radiusValue}
          stroke={shadcn.secondary}
          strokeWidth={strokeWidth}
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          fill="none"
          r={radiusValue}
          stroke={shadcn.brand}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={offset}
          strokeLinecap="round"
          strokeWidth={strokeWidth}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <Text style={[typography.caption, { color: colors.ink, fontSize: 11, fontWeight: "700", position: "absolute" }]}>
        {percent}%
      </Text>
    </View>
  );
}

export function PlanProgressBar({ percent }: { percent: number }) {
  return (
    <View
      accessibilityLabel={`${percent}%`}
      accessibilityRole="progressbar"
      accessibilityValue={{ max: 100, min: 0, now: percent }}
      style={{ backgroundColor: shadcn.secondary, borderRadius: 999, height: 6, overflow: "hidden" }}
    >
      <View style={{ backgroundColor: shadcn.brand, borderRadius: 999, height: "100%", width: `${percent}%` }} />
    </View>
  );
}

const weekdayLabels = {
  en: ["M", "T", "W", "T", "F", "S", "S"],
  sv: ["M", "T", "O", "T", "F", "L", "S"],
} as const;

export function PlanWeekStrip({
  date = todayDateKey(),
  onSelectDay,
  plan,
}: {
  date?: string;
  onSelectDay?: (dayNumber: number) => void;
  plan: Pick<BiblePlan, "days" | "startDate" | "pausedAt">;
}) {
  const { language } = useAppTranslation();
  const week = planWeek(plan, date);
  const labels = weekdayLabels[language];

  return (
    <View accessibilityLabel={language === "sv" ? "Den här veckan" : "This week"} style={{ flexDirection: "row", gap: 6 }}>
      {week.map((entry, index) => (
        <WeekDay
          key={entry.date}
          entry={entry}
          label={labels[index]}
          onPress={entry.day && onSelectDay ? () => onSelectDay(entry.day!.dayNumber) : undefined}
        />
      ))}
    </View>
  );
}

function WeekDay({ entry, label, onPress }: { entry: PlanWeekDay; label: string; onPress?: () => void }) {
  const { language } = useAppTranslation();
  const done = entry.status === "done";
  const today = entry.status === "today";
  const missed = entry.status === "missed";
  const empty = entry.status === "empty";
  const background = done ? shadcn.brand : today ? shadcn.brandSoft : missed ? colors.dangerSurface : shadcn.card;
  const borderColor = done ? shadcn.brand : today ? shadcn.brand : missed ? colors.dangerBorder : shadcn.border;
  const contentColor = done ? "#FFFFFF" : missed ? colors.danger : empty ? colors.disabledText : colors.muted;
  const description = entry.day
    ? `${formatPlanDate(entry.date, language, { weekday: "long", month: "long", day: "numeric" })} · ${
        done ? (language === "sv" ? "läst" : "read") : today ? (language === "sv" ? "idag" : "today") : missed ? (language === "sv" ? "missad" : "missed") : (language === "sv" ? "kommande" : "upcoming")
      }`
    : `${formatPlanDate(entry.date, language, { weekday: "long", month: "long", day: "numeric" })} · ${language === "sv" ? "ingen läsning" : "no reading"}`;

  return (
    <Pressable
      accessibilityLabel={description}
      accessibilityRole={onPress ? "button" : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={{ alignItems: "center", flex: 1, gap: 5, opacity: empty ? 0.55 : 1 }}
    >
      <Text style={[typography.caption, { color: colors.muted, fontSize: 10, fontWeight: "700" }]}>{label}</Text>
      <View
        style={{
          alignItems: "center",
          backgroundColor: background,
          borderColor,
          borderRadius: 999,
          borderWidth: 1,
          height: 30,
          justifyContent: "center",
          width: 30,
        }}
      >
        {done ? (
          <Feather color={contentColor} name="check" size={14} />
        ) : today ? (
          <View style={{ backgroundColor: shadcn.brand, borderRadius: 999, height: 8, width: 8 }} />
        ) : (
          <View style={{ backgroundColor: contentColor, borderRadius: 999, height: 4, opacity: 0.55, width: 4 }} />
        )}
      </View>
    </Pressable>
  );
}

export function PlanMetaRow({
  category,
  dayCount,
  minutes,
}: {
  category?: string;
  dayCount: number;
  minutes: number;
}) {
  const { language } = useAppTranslation();
  return (
    <Text style={[typography.caption, { color: colors.muted }]}>
      {[category, language === "sv" ? `${dayCount} dagar` : `${dayCount} days`, language === "sv" ? `ca ${minutes} min/dag` : `about ${minutes} min/day`]
        .filter(Boolean)
        .join("  ·  ")}
    </Text>
  );
}

export function planReferencesLabel(day: BiblePlanDay | undefined, bookLanguage: "en" | "sv") {
  if (!day?.ranges.length) return "";
  let previousBook = "";
  return day.ranges
    .map((range) => {
      if (range.start.book !== range.end.book) {
        previousBook = range.end.book;
        return displayBibleReference(range.displayReference, bookLanguage);
      }
      const bookName = displayBibleBookName(range.start.book, bookLanguage);
      const prefix = range.start.book === previousBook ? "" : `${bookName} `;
      previousBook = range.start.book;
      const lastChapterVerse = verseCountForChapter(range.end.book, range.end.chapter);
      const chapterPart = range.start.chapter === range.end.chapter
        ? range.start.verse === 1 && range.end.verse === lastChapterVerse
          ? `${range.start.chapter}`
          : `${range.start.chapter}:${range.start.verse}${range.start.verse === range.end.verse ? "" : `–${range.end.verse}`}`
        : `${range.start.chapter}:${range.start.verse}–${range.end.chapter}:${range.end.verse}`;
      return `${prefix}${chapterPart}`;
    })
    .join("; ");
}

export function PlanDayReference({ day, style }: { day?: BiblePlanDay; style?: StyleProp<TextStyle> }) {
  const bookLanguage = useBibleBookLanguage();
  const references = planReferencesLabel(day, bookLanguage);
  return (
    <Text numberOfLines={2} style={[typography.label, { color: colors.ink, lineHeight: 19 }, style]}>
      {references}
    </Text>
  );
}

export function PlanDayMinutes({ day }: { day?: BiblePlanDay }) {
  const { language } = useAppTranslation();
  const minutes = planDayMinutes(day);
  if (!minutes) return null;
  return (
    <Text style={[typography.caption, { color: colors.muted }]}>
      {language === "sv" ? `ca ${minutes} min` : `about ${minutes} min`}
    </Text>
  );
}

export function completionForPlan(plan: Pick<BiblePlan, "days">) {
  const completed = plan.days.filter((day) => Boolean(day.completedAt)).length;
  return { completed, percent: completionPercent(completed, plan.days.length) };
}

export function StartDateChoice({
  language,
  onChange,
  value,
}: {
  language: "en" | "sv";
  onChange: (value: string) => void;
  value: string;
}) {
  const { t } = useAppTranslation();
  const today = todayDateKey();
  const tomorrow = shiftDate(today, 1);
  const mondayOffset = (8 - new Date(`${today}T12:00:00Z`).getUTCDay()) % 7;
  const monday = shiftDate(today, mondayOffset === 0 ? 7 : mondayOffset);
  const options = [
    { label: t("bible.plans.library.today"), value: today },
    { label: t("bible.plans.library.tomorrow"), value: tomorrow },
    { label: t("bible.plans.library.monday"), value: monday },
  ];
  const selected = options.find((option) => option.value === value);

  return (
    <View style={{ gap: 8 }}>
      <Text style={[typography.label, { color: colors.ink }]}>{t("bible.plans.library.startDate")}</Text>
      <View style={{ flexDirection: "row", gap: 8 }}>
        {options.map((option) => {
          const active = value === option.value;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={option.value}
              onPress={() => onChange(option.value)}
              style={{
                alignItems: "center",
                backgroundColor: active ? shadcn.primary : shadcn.card,
                borderColor: active ? shadcn.primary : shadcn.border,
                borderRadius: radius.md,
                borderWidth: 1,
                flex: 1,
                justifyContent: "center",
                minHeight: 40,
                paddingHorizontal: 8,
              }}
            >
              <Text style={[typography.label, { color: active ? shadcn.primaryForeground : colors.ink }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View
        style={{
          alignItems: "center",
          backgroundColor: shadcn.card,
          borderColor: shadcn.border,
          borderRadius: radius.md,
          borderWidth: 1,
          flexDirection: "row",
          minHeight: 48,
          paddingHorizontal: 4,
        }}
      >
        <Pressable
          accessibilityLabel={t("bible.plans.date.previous")}
          accessibilityRole="button"
          onPress={() => onChange(shiftDate(value, -1))}
          style={({ pressed }) => ({ alignItems: "center", height: 44, justifyContent: "center", opacity: pressed ? 0.55 : 1, width: 44 })}
        >
          <Feather color={colors.ink} name="chevron-left" size={19} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[typography.bodyMedium, { color: colors.ink, textAlign: "center" }]}>
            {formatPlanDate(value, language, { weekday: "long", month: "long", day: "numeric" })}
          </Text>
          {selected ? (
            <Text style={[typography.caption, { color: colors.muted, textAlign: "center" }]}>
              {selected.label}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityLabel={t("bible.plans.date.next")}
          accessibilityRole="button"
          onPress={() => onChange(shiftDate(value, 1))}
          style={({ pressed }) => ({ alignItems: "center", height: 44, justifyContent: "center", opacity: pressed ? 0.55 : 1, width: 44 })}
        >
          <Feather color={colors.ink} name="chevron-right" size={19} />
        </Pressable>
      </View>
    </View>
  );
}

function shiftDate(value: string, offset: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}
