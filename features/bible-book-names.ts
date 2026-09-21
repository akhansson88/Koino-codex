import type { AppLanguage } from "@/ui/localization";

export const swedishBibleBookNames: Readonly<Record<string, string>> = {
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

export function bibleBookLanguage(language: AppLanguage, version?: string): AppLanguage {
  return version?.toLowerCase().startsWith("reformationsbibeln") ? "sv" : language;
}

export function displayBibleBookName(bookName: string, language: AppLanguage, version?: string) {
  return bibleBookLanguage(language, version) === "sv" ? swedishBibleBookNames[bookName] ?? bookName : bookName;
}

// Replace every book in a reference, including both ends of cross-book ranges.
export function displayBibleReference(reference: string, language: AppLanguage, version?: string) {
  if (bibleBookLanguage(language, version) !== "sv") return reference;
  return reference.replace(bibleReferenceBookPattern, (_, prefix: string, book: string) => prefix + swedishBibleBookNames[book]);
}

const bibleReferenceBookPattern = new RegExp(
  `(^|[^\\p{L}\\p{N}])(${Object.keys(swedishBibleBookNames).sort((a, b) => b.length - a.length).join("|")})(?=\\s+\\d|$)`,
  "gu",
);
