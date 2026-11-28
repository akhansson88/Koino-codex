import {
  buildBiblePlanDays,
  makeBiblePlanRange,
} from "@/features/bible-plans";
import { verseCountForChapter } from "@/features/bible-canon";
import type { BiblePlan, BiblePlanDay, BiblePlanRange } from "@/state/types";
import type { AppLanguage } from "@/ui/localization";
import { planLibraryTranslations } from "@/ui/translations/plan-library";

export type PlanLocale = AppLanguage;
export type LocalizedPlanText = { en: string; sv: string } & Partial<Record<AppLanguage, string>>;
export type BiblePlanCategory =
  | "start"
  | "whole"
  | "jesus"
  | "psalms"
  | "wisdom"
  | "life"
  | "letters"
  | "story"
  | "women";

type PlanTemplateBase = {
  id: string;
  coverKey: string;
  title: LocalizedPlanText;
  description: LocalizedPlanText;
  category: BiblePlanCategory;
  dayCount: number;
  minutesPerDay: number;
  featured?: boolean;
  tags: string[];
};

export type BiblePlanTemplate = PlanTemplateBase & (
  | { kind: "continuous"; ranges: BiblePlanRange[] }
  | { kind: "curated"; days: BiblePlanRange[][] }
);

let rangeSequence = 0;
const rangeId = () => `lib_${++rangeSequence}`;
const lastVerse = (book: string, chapter: number) => verseCountForChapter(book, chapter) || 1;

function passage(book: string, chapter: number, fromVerse: number, toVerse: number) {
  return makeBiblePlanRange(
    rangeId(),
    { book, chapter, verse: fromVerse },
    { book, chapter, verse: toVerse },
  );
}

function chapter(book: string, chapterNumber: number) {
  return passage(book, chapterNumber, 1, lastVerse(book, chapterNumber));
}

function chapters(book: string, fromChapter: number, toChapter: number) {
  return makeBiblePlanRange(
    rangeId(),
    { book, chapter: fromChapter, verse: 1 },
    { book, chapter: toChapter, verse: lastVerse(book, toChapter) },
  );
}

function across(
  fromBook: string,
  fromChapter: number,
  fromVerse: number,
  toBook: string,
  toChapter: number,
  toVerse: number,
) {
  return makeBiblePlanRange(
    rangeId(),
    { book: fromBook, chapter: fromChapter, verse: fromVerse },
    { book: toBook, chapter: toChapter, verse: toVerse },
  );
}

function curated(
  base: Omit<PlanTemplateBase, "dayCount">,
  days: BiblePlanRange[][],
): BiblePlanTemplate {
  return { ...base, kind: "curated", dayCount: days.length, days };
}

const wholeBible = () => across("Genesis", 1, 1, "Revelation", 22, 21);
const newTestament = () => across("Matthew", 1, 1, "Revelation", 22, 21);
const gospels = () => across("Matthew", 1, 1, "John", 21, 25);
const paul = () => across("Romans", 1, 1, "Philemon", 1, 25);

export const biblePlanTemplates: BiblePlanTemplate[] = [
  {
    id: "whole-bible-1-year",
    coverKey: "whole-bible-1-year",
    title: { sv: "Hela Bibeln på ett år", en: "The whole Bible in one year" },
    description: {
      sv: "Läs hela Bibeln i en lugn, jämn takt – från Första Moseboken till Uppenbarelseboken.",
      en: "Read the whole Bible at a calm, steady pace—from Genesis to Revelation.",
    },
    category: "whole",
    dayCount: 365,
    minutesPerDay: 11,
    featured: true,
    tags: ["hela bibeln", "whole bible", "365", "ett år", "one year", "bibel på ett år"],
    kind: "continuous",
    ranges: [wholeBible()],
  },
  {
    id: "whole-bible-2-year",
    coverKey: "whole-bible-2-year",
    title: { sv: "Hela Bibeln på två år", en: "The whole Bible in two years" },
    description: {
      sv: "Hela Bibeln på två år, med kortare dagliga avsnitt för en hållbar rytm.",
      en: "The whole Bible over two years, with shorter daily portions for a sustainable rhythm.",
    },
    category: "whole",
    dayCount: 730,
    minutesPerDay: 6,
    tags: ["hela bibeln", "whole bible", "730", "två år", "two years"],
    kind: "continuous",
    ranges: [wholeBible()],
  },
  {
    id: "new-testament-90",
    coverKey: "new-testament-90",
    title: { sv: "Nya testamentet på 90 dagar", en: "The New Testament in 90 days" },
    description: {
      sv: "Nya testamentet på 90 dagar – evangelierna, Apostlagärningarna och breven.",
      en: "The New Testament in 90 days—the Gospels, Acts, and the letters.",
    },
    category: "whole",
    dayCount: 90,
    minutesPerDay: 12,
    tags: ["nya testamentet", "new testament", "90", "nt"],
    kind: "continuous",
    ranges: [newTestament()],
  },
  {
    id: "new-testament-1-year",
    coverKey: "new-testament-1-year",
    title: { sv: "Nya testamentet på ett år", en: "The New Testament in one year" },
    description: {
      sv: "Nya testamentet i ett lugnt tempo, en kort stund varje dag.",
      en: "The New Testament at a gentle pace, a short moment each day.",
    },
    category: "whole",
    dayCount: 365,
    minutesPerDay: 4,
    tags: ["nya testamentet", "new testament", "365", "ett år", "one year"],
    kind: "continuous",
    ranges: [newTestament()],
  },
  {
    id: "gospels-30",
    coverKey: "gospels-30",
    title: { sv: "Evangelierna på 30 dagar", en: "The Gospels in 30 days" },
    description: {
      sv: "Matteus, Markus, Lukas och Johannes på 30 dagar.",
      en: "Matthew, Mark, Luke, and John in 30 days.",
    },
    category: "jesus",
    dayCount: 30,
    minutesPerDay: 18,
    tags: ["evangelierna", "gospels", "jesus", "30"],
    kind: "continuous",
    ranges: [gospels()],
  },
  curated(
    {
      id: "jesus-life-21",
      coverKey: "jesus-life-21",
      title: { sv: "Jesu liv på 21 dagar", en: "The life of Jesus in 21 days" },
      description: {
        sv: "Följ Jesus från födelsen till uppståndelsen genom 21 nyckelavsnitt.",
        en: "Follow Jesus from birth to resurrection through 21 key passages.",
      },
      category: "jesus",
      minutesPerDay: 10,
      featured: true,
      tags: ["jesus", "jesu liv", "life of jesus", "21", "evangelierna"],
    },
    [
      [passage("Luke", 1, 26, 38), passage("Matthew", 1, 18, 25)],
      [passage("Luke", 2, 1, 20), passage("Luke", 2, 21, 40)],
      [passage("Matthew", 2, 1, 23)],
      [passage("Luke", 3, 1, 22)],
      [passage("Matthew", 4, 1, 25)],
      [passage("John", 2, 1, 25)],
      [passage("John", 3, 1, 36)],
      [passage("John", 4, 1, 42)],
      [passage("Matthew", 5, 1, 16), passage("Matthew", 5, 38, 48)],
      [passage("Luke", 7, 36, 50), passage("John", 8, 1, 11)],
      [passage("Luke", 10, 25, 37), passage("Luke", 10, 38, 42)],
      [passage("Luke", 15, 1, 32)],
      [passage("John", 6, 1, 71)],
      [passage("Matthew", 16, 13, 28)],
      [passage("John", 11, 1, 44)],
      [passage("Mark", 11, 1, 33)],
      [passage("John", 13, 1, 38)],
      [passage("John", 14, 1, 31), passage("John", 15, 1, 27), passage("John", 16, 1, 33), passage("John", 17, 1, 26)],
      [passage("Matthew", 26, 36, 75), passage("Matthew", 27, 1, 31)],
      [passage("Luke", 23, 32, 56), passage("Luke", 24, 1, 12)],
      [passage("Luke", 24, 13, 53), passage("Matthew", 28, 16, 20)],
    ],
  ),
  {
    id: "psalms-30",
    coverKey: "psalms-30",
    title: { sv: "Psaltaren på 30 dagar", en: "The Psalms in 30 days" },
    description: {
      sv: "Hela Psaltaren på 30 dagar – bön, klagan, lovsång och vila.",
      en: "The whole Psalter in 30 days—prayer, lament, praise, and rest.",
    },
    category: "psalms",
    dayCount: 30,
    minutesPerDay: 12,
    featured: true,
    tags: ["psaltaren", "psalms", "bön", "prayer", "30"],
    kind: "continuous",
    ranges: [chapters("Psalms", 1, 150)],
  },
  {
    id: "psalms-90",
    coverKey: "psalms-90",
    title: { sv: "Psaltaren på 90 dagar", en: "The Psalms in 90 days" },
    description: {
      sv: "Psaltaren i ett långsamt tempo, för den som vill stanna längre i bönen.",
      en: "The Psalms at a slower pace, for lingering in prayer.",
    },
    category: "psalms",
    dayCount: 90,
    minutesPerDay: 5,
    tags: ["psaltaren", "psalms", "bön", "prayer", "90"],
    kind: "continuous",
    ranges: [chapters("Psalms", 1, 150)],
  },
  {
    id: "proverbs-31",
    coverKey: "proverbs-31",
    title: { sv: "Ordspråken på 31 dagar", en: "Proverbs in 31 days" },
    description: {
      sv: "Ett kapitel om dagen ur Ordspråken – visdom för vardagen.",
      en: "One chapter a day from Proverbs—wisdom for everyday life.",
    },
    category: "wisdom",
    dayCount: 31,
    minutesPerDay: 7,
    tags: ["ordspråken", "proverbs", "visdom", "wisdom", "31"],
    kind: "continuous",
    ranges: [chapters("Proverbs", 1, 31)],
  },
  curated(
    {
      id: "wisdom-21",
      coverKey: "wisdom-21",
      title: { sv: "Visdom för livet", en: "Wisdom for life" },
      description: {
        sv: "Visdom från Ordspråken, Predikaren, Job och Jakob.",
        en: "Wisdom from Proverbs, Ecclesiastes, Job, and James.",
      },
      category: "wisdom",
      minutesPerDay: 9,
      tags: ["visdom", "wisdom", "ordspråken", "predikaren", "job", "jakob", "21"],
    },
    [
      [chapter("Proverbs", 1)],
      [chapter("Proverbs", 2)],
      [chapter("Proverbs", 3)],
      [chapter("Proverbs", 4)],
      [chapter("Proverbs", 8)],
      [chapter("Proverbs", 9)],
      [chapter("Proverbs", 10)],
      [chapter("Proverbs", 11)],
      [chapter("Proverbs", 12)],
      [chapter("Proverbs", 13)],
      [chapter("Proverbs", 14)],
      [chapter("Proverbs", 15)],
      [chapter("Proverbs", 16)],
      [chapter("Proverbs", 17)],
      [chapter("Proverbs", 18)],
      [chapters("Ecclesiastes", 1, 2)],
      [chapters("Ecclesiastes", 3, 4)],
      [chapters("Job", 38, 39)],
      [chapter("James", 1)],
      [chapter("James", 3)],
      [chapters("Psalms", 1, 2)],
    ],
  ),
  curated(
    {
      id: "anxiety-14",
      coverKey: "anxiety-14",
      title: { sv: "Rädsla & ångest", en: "Fear & anxiety" },
      description: {
        sv: "Bibelord för rädsla, oro och ångest – att andas långsammare.",
        en: "Scripture for fear, worry, and anxiety—to slow your breathing.",
      },
      category: "life",
      minutesPerDay: 7,
      featured: true,
      tags: ["rädsla", "ångest", "oro", "fear", "anxiety", "worry", "14"],
    },
    [
      [chapter("Psalms", 23)],
      [chapter("Psalms", 27)],
      [chapter("Psalms", 34)],
      [chapter("Psalms", 46)],
      [passage("Psalms", 55, 1, 23)],
      [chapter("Psalms", 62)],
      [chapter("Psalms", 91)],
      [passage("Psalms", 94, 1, 23)],
      [passage("Isaiah", 41, 8, 13)],
      [passage("Isaiah", 43, 1, 7)],
      [passage("Matthew", 6, 25, 34)],
      [passage("Philippians", 4, 4, 9)],
      [passage("1 Peter", 5, 6, 11)],
      [passage("Romans", 8, 31, 39)],
    ],
  ),
  curated(
    {
      id: "hope-21",
      coverKey: "hope-21",
      title: { sv: "Hopp i mörker", en: "Hope in the dark" },
      description: {
        sv: "Hopp när livet är mörkt, från Psaltaren till Uppenbarelseboken.",
        en: "Hope when life is dark, from the Psalms to Revelation.",
      },
      category: "life",
      minutesPerDay: 9,
      tags: ["hopp", "hope", "mörker", "dark", "lidande", "suffering", "21"],
    },
    [
      [chapter("Psalms", 42)],
      [chapter("Psalms", 43)],
      [chapter("Psalms", 77)],
      [chapter("Psalms", 88)],
      [passage("Lamentations", 3, 1, 33)],
      [chapter("Isaiah", 40)],
      [passage("Isaiah", 61, 1, 11)],
      [passage("Jeremiah", 29, 1, 14)],
      [passage("Habakkuk", 3, 17, 19)],
      [passage("Romans", 5, 1, 11)],
      [passage("Romans", 8, 18, 39)],
      [passage("2 Corinthians", 4, 1, 18)],
      [passage("2 Corinthians", 12, 1, 10)],
      [passage("Hebrews", 11, 1, 40)],
      [passage("Hebrews", 12, 1, 13)],
      [chapter("1 Peter", 1)],
      [passage("Revelation", 21, 1, 8)],
      [passage("Revelation", 21, 9, 27)],
      [passage("Revelation", 22, 1, 21)],
      [passage("Matthew", 5, 1, 12)],
      [passage("John", 11, 1, 44)],
    ],
  ),
  curated(
    {
      id: "prayer-14",
      coverKey: "prayer-14",
      title: { sv: "Bönens skola", en: "School of prayer" },
      description: {
        sv: "Lär dig be med Bibelns egna böner och Jesu undervisning.",
        en: "Learn to pray with the Bible's own prayers and Jesus' teaching.",
      },
      category: "psalms",
      minutesPerDay: 8,
      tags: ["bön", "prayer", "psaltaren", "14"],
    },
    [
      [chapter("Psalms", 5)],
      [chapter("Psalms", 51)],
      [chapter("Psalms", 62)],
      [chapter("Psalms", 84)],
      [chapter("Psalms", 145)],
      [passage("Matthew", 6, 5, 15)],
      [passage("Luke", 11, 1, 13)],
      [passage("Luke", 18, 1, 14)],
      [chapter("John", 17)],
      [passage("Romans", 8, 18, 30)],
      [passage("Ephesians", 3, 14, 21)],
      [passage("Philippians", 4, 4, 9)],
      [passage("Colossians", 4, 2, 6), passage("1 Thessalonians", 5, 16, 18)],
      [passage("James", 5, 13, 18)],
    ],
  ),
  curated(
    {
      id: "gratitude-7",
      coverKey: "gratitude-7",
      title: { sv: "Tacksamhet på 7 dagar", en: "Gratitude in 7 days" },
      description: {
        sv: "Sju dagar av tacksamhet – för hjärtat som behöver påminnas.",
        en: "Seven days of gratitude—for the heart that needs reminding.",
      },
      category: "life",
      minutesPerDay: 6,
      tags: ["tacksamhet", "gratitude", "7"],
    },
    [
      [chapter("Psalms", 100)],
      [chapter("Psalms", 103)],
      [passage("Psalms", 107, 1, 43)],
      [passage("1 Thessalonians", 5, 12, 28)],
      [passage("Colossians", 3, 12, 17)],
      [passage("Philippians", 4, 4, 9)],
      [passage("Luke", 17, 11, 19)],
    ],
  ),
  curated(
    {
      id: "love-14",
      coverKey: "love-14",
      title: { sv: "Kärlekens väg", en: "The way of love" },
      description: {
        sv: "Kärlekens väg genom Paulus, Johannes, Höga Visan och Rut.",
        en: "The way of love through Paul, John, Song of Songs, and Ruth.",
      },
      category: "life",
      minutesPerDay: 8,
      tags: ["kärlek", "love", "14", "höga visan", "rut"],
    },
    [
      [chapter("1 Corinthians", 13)],
      [passage("1 John", 4, 7, 21)],
      [passage("John", 13, 1, 17)],
      [passage("John", 15, 1, 17)],
      [passage("Romans", 12, 9, 21)],
      [passage("Ephesians", 5, 1, 2), passage("Ephesians", 5, 21, 33)],
      [passage("Colossians", 3, 12, 17)],
      [chapter("Solomon's Song", 1)],
      [chapter("Solomon's Song", 2)],
      [chapter("Solomon's Song", 8)],
      [chapter("Ruth", 1)],
      [chapter("Ruth", 2)],
      [chapters("Ruth", 3, 4)],
      [passage("Luke", 10, 25, 37)],
    ],
  ),
  curated(
    {
      id: "forgiveness-14",
      coverKey: "forgiveness-14",
      title: { sv: "Förlåtelse", en: "Forgiveness" },
      description: {
        sv: "Förlåtelse som gör oss fria – Guds och vår egen.",
        en: "Forgiveness that sets us free—God's and our own.",
      },
      category: "life",
      minutesPerDay: 8,
      tags: ["förlåtelse", "forgiveness", "14"],
    },
    [
      [chapter("Psalms", 51)],
      [chapter("Psalms", 130)],
      [passage("Matthew", 6, 5, 15)],
      [passage("Matthew", 18, 21, 35)],
      [passage("Luke", 15, 11, 32)],
      [passage("John", 8, 1, 11)],
      [passage("Colossians", 3, 1, 17)],
      [passage("Ephesians", 4, 17, 32)],
      [chapter("Philemon", 1)],
      [passage("2 Corinthians", 5, 11, 21)],
      [passage("Romans", 12, 14, 21)],
      [chapter("1 John", 1)],
      [passage("1 John", 2, 1, 14)],
      [passage("Luke", 23, 32, 43)],
    ],
  ),
  {
    id: "paul-30",
    coverKey: "paul-30",
    title: { sv: "Paulus brev på 30 dagar", en: "Paul's letters in 30 days" },
    description: {
      sv: "Paulus brev från Romarbrevet till Filemon på 30 dagar.",
      en: "Paul's letters from Romans to Philemon in 30 days.",
    },
    category: "letters",
    dayCount: 30,
    minutesPerDay: 9,
    tags: ["paulus", "paul", "brev", "letters", "30"],
    kind: "continuous",
    ranges: [paul()],
  },
  curated(
    {
      id: "story-30",
      coverKey: "story-30",
      title: { sv: "Bibelns stora berättelse", en: "The Bible's great story" },
      description: {
        sv: "Bibelns stora berättelse i 30 avgörande avsnitt – för nya och nyfikna.",
        en: "The Bible's great story in 30 pivotal passages—for newcomers and the curious.",
      },
      category: "story",
      minutesPerDay: 10,
      featured: true,
      tags: ["bibelns berättelse", "bible story", "översikt", "overview", "30"],
    },
    [
      [chapter("Genesis", 1)],
      [chapters("Genesis", 2, 3)],
      [chapters("Genesis", 6, 9)],
      [chapter("Genesis", 12)],
      [chapter("Genesis", 15)],
      [chapter("Genesis", 22)],
      [chapter("Genesis", 32)],
      [chapter("Genesis", 37)],
      [chapters("Genesis", 39, 41)],
      [chapter("Genesis", 45)],
      [chapter("Exodus", 3)],
      [chapter("Exodus", 12)],
      [chapter("Exodus", 14)],
      [chapter("Exodus", 20)],
      [chapter("Joshua", 1)],
      [chapter("Judges", 2)],
      [chapter("1 Samuel", 8)],
      [chapter("1 Samuel", 16)],
      [chapter("2 Samuel", 7)],
      [chapter("1 Kings", 18)],
      [chapter("Isaiah", 6)],
      [chapter("Isaiah", 53)],
      [chapter("Jeremiah", 31)],
      [chapter("Ezekiel", 37)],
      [chapter("Daniel", 3)],
      [chapters("Jonah", 1, 4)],
      [chapters("Luke", 1, 2)],
      [chapter("Luke", 24)],
      [chapter("Acts", 2)],
      [chapter("Revelation", 21)],
    ],
  ),
  curated(
    {
      id: "women-21",
      coverKey: "women-21",
      title: { sv: "Bibelns kvinnor", en: "Women of the Bible" },
      description: {
        sv: "Möt kvinnor som bar historien framåt – från Eva till Phoebe.",
        en: "Meet women who carried the story forward—from Eve to Phoebe.",
      },
      category: "women",
      minutesPerDay: 9,
      tags: ["kvinnor", "women", "21", "bibelns kvinnor"],
    },
    [
      [passage("Genesis", 1, 26, 31), passage("Genesis", 2, 18, 25)],
      [chapter("Genesis", 16)],
      [passage("Genesis", 18, 1, 15), passage("Genesis", 21, 1, 7)],
      [chapter("Genesis", 24)],
      [passage("Genesis", 29, 31, 35), passage("Genesis", 30, 1, 24)],
      [passage("Exodus", 1, 8, 22), passage("Exodus", 2, 1, 10)],
      [chapter("Joshua", 2)],
      [chapters("Judges", 4, 5)],
      [chapters("Ruth", 1, 2)],
      [chapter("1 Samuel", 1)],
      [chapter("1 Samuel", 25)],
      [chapter("Esther", 2), chapter("Esther", 4)],
      [passage("Luke", 1, 26, 56)],
      [passage("Luke", 2, 36, 38)],
      [passage("John", 4, 1, 42)],
      [passage("Luke", 7, 36, 50)],
      [passage("John", 11, 1, 44)],
      [passage("Luke", 24, 1, 12), passage("John", 20, 1, 18)],
      [passage("Acts", 16, 11, 40)],
      [passage("Acts", 18, 1, 26)],
      [passage("Romans", 16, 1, 16)],
    ],
  ),
  curated(
    {
      id: "new-believer-14",
      coverKey: "new-believer-14",
      title: { sv: "Ny i tron", en: "New to faith" },
      description: {
        sv: "En trygg start i tron: Jesus, nåden och det nya livet.",
        en: "A confident start in faith: Jesus, grace, and the new life.",
      },
      category: "start",
      minutesPerDay: 8,
      featured: true,
      tags: ["ny i tron", "new believer", "start", "14", "grunderna"],
    },
    [
      [passage("John", 1, 1, 18)],
      [passage("John", 3, 1, 21)],
      [passage("John", 14, 1, 14)],
      [passage("Luke", 15, 11, 32)],
      [passage("Romans", 3, 21, 31)],
      [passage("Romans", 5, 1, 11)],
      [passage("Romans", 8, 1, 17)],
      [passage("Romans", 8, 31, 39)],
      [chapter("Ephesians", 2)],
      [passage("Philippians", 2, 1, 11)],
      [passage("Colossians", 3, 1, 17)],
      [chapter("1 John", 1)],
      [passage("1 John", 4, 7, 21)],
      [chapter("Acts", 2)],
    ],
  ),
];

const templateById = new Map(biblePlanTemplates.map((template) => [template.id, template]));
const daysCache = new Map<string, BiblePlanDay[]>();

export function planTemplateById(id?: string) {
  return id ? templateById.get(id) : undefined;
}

export function planTemplateDays(template: BiblePlanTemplate): BiblePlanDay[] {
  const cached = daysCache.get(template.id);
  if (cached) return cached.map((day) => ({ ...day, ranges: day.ranges.map((range) => ({ ...range })) }));
  const days = template.kind === "continuous"
    ? buildBiblePlanDays(template.ranges, template.dayCount)
    : template.days.map((ranges, index) => ({ dayNumber: index + 1, ranges }));
  daysCache.set(template.id, days);
  return days.map((day) => ({ ...day, ranges: day.ranges.map((range) => ({ ...range })) }));
}

export function planTemplateRanges(template: BiblePlanTemplate): BiblePlanRange[] {
  const ranges = template.kind === "continuous" ? template.ranges : template.days.flat();
  const seen = new Set<string>();
  return ranges.filter((range) => {
    const key = `${range.start.book}:${range.start.chapter}:${range.start.verse}-${range.end.book}:${range.end.chapter}:${range.end.verse}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function localizedPlanText(value: LocalizedPlanText, language: PlanLocale) {
  return value[language] ?? value.en;
}

function templateCopy(template: BiblePlanTemplate, language: PlanLocale) {
  return planLibraryTranslations[language]?.[template.id];
}

export function displayPlanTitle(plan: Pick<BiblePlan, "templateId" | "title">, language: PlanLocale) {
  const template = planTemplateById(plan.templateId);
  if (!template) return plan.title;
  return templateCopy(template, language)?.title ?? template.title[language] ?? template.title.en;
}

export function displayPlanDescription(plan: Pick<BiblePlan, "templateId">, language: PlanLocale) {
  const template = planTemplateById(plan.templateId);
  if (!template) return undefined;
  return templateCopy(template, language)?.description ?? template.description[language] ?? template.description.en;
}

export function planCoverKey(plan: Pick<BiblePlan, "coverKey" | "templateId">) {
  return plan.coverKey ?? planTemplateById(plan.templateId)?.coverKey ?? "custom";
}

export function displayAnnouncementTitle(
  announcement: { templateId?: string; title: string },
  language: PlanLocale,
) {
  const template = planTemplateById(announcement.templateId);
  return template ? displayPlanTitle({ templateId: template.id, title: announcement.title }, language) : announcement.title;
}

export function announcementCoverKey(announcement: { coverKey?: string; templateId?: string }) {
  return announcement.coverKey ?? planTemplateById(announcement.templateId)?.coverKey ?? "custom";
}

export const planCategoryOrder: BiblePlanCategory[] = [
  "start",
  "whole",
  "jesus",
  "psalms",
  "wisdom",
  "life",
  "letters",
  "story",
  "women",
];

export const planCategoryTranslationKeys = {
  start: "bible.plans.category.start",
  whole: "bible.plans.category.whole",
  jesus: "bible.plans.category.jesus",
  psalms: "bible.plans.category.psalms",
  wisdom: "bible.plans.category.wisdom",
  life: "bible.plans.category.life",
  letters: "bible.plans.category.letters",
  story: "bible.plans.category.story",
  women: "bible.plans.category.women",
} as const;

export function matchesPlanSearch(template: BiblePlanTemplate, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  const translations = Object.values(planLibraryTranslations).flatMap((catalog) => {
    const copy = catalog?.[template.id];
    return copy ? [copy.title, copy.description] : [];
  });
  return [
    template.title.en,
    template.title.sv,
    template.description.en,
    template.description.sv,
    ...translations,
    ...template.tags,
  ].some((value) => value.toLocaleLowerCase().includes(normalized));
}
