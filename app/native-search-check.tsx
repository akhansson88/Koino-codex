import { useEffect, useState } from "react";
import { ScrollView, Text } from "react-native";
import { Redirect } from "expo-router";
import Constants from "expo-constants";
import { BibleDatabaseBoundary } from "@/features/bible-database-provider";
import { searchScripture } from "@/features/bible-search";
import { getSemanticRuntimeStatus } from "@/features/bible-search/semantic-runtime";

// Development-only device acceptance check. Public Scripture queries only;
// results exercise the real bundled database, native model and vector extension.
export default function NativeSearchCheck() {
  const developmentApp = Constants.expoConfig?.android?.package === "com.akhansson.koinomvp.dev";
  if (!__DEV__ && !developmentApp) return <Redirect href="/" />;
  return <BibleDatabaseBoundary><NativeSearchCheckContent /></BibleDatabaseBoundary>;
}

function NativeSearchCheckContent() {
  const [status, setStatus] = useState("Preparing native search checks…");
  useEffect(() => {
    const controller = new AbortController();
    const targets = {
      donkey: [["Numbers", 22, 21, 33], ["2 Peter", 2, 16, 16]],
      axe: [["2 Kings", 6, 1, 7]],
      spirit: [["Acts", 8, 29, 29], ["Acts", 10, 19, 20], ["Acts", 13, 2, 2], ["Acts", 28, 25, 25], ["1 Timothy", 4, 1, 1], ["Hebrews", 3, 7, 7]],
      grace: [["Ephesians", 2, 8, 9], ["John", 1, 14, 17], ["2 Corinthians", 12, 9, 9], ["Romans", 3, 24, 24], ["Romans", 5, 20, 21], ["Titus", 2, 11, 11]],
    } as const;
    const cases = [
      ["speaking donkey", targets.donkey], ["en talande åsna", targets.donkey],
      ["an axe floating", targets.axe], ["en yxa som flyter", targets.axe],
      ["holy spirit speaking", targets.spirit], ["den helige Ande talar", targets.spirit],
      ["grace", targets.grace], ["nåd", targets.grace],
    ] as const;
    void (async () => {
      const samples: { query: string; translation: string; milliseconds: number; lexicalMs: number; references: string[]; pass: boolean }[] = [];
      for (const versionId of ["kjv", "reformationsbibeln2026"] as const) {
        for (const [query, expected] of cases) {
          const began = performance.now();
          let lexicalMs = 0;
          const response = await searchScripture({ query, versionId, language: "en", limit: 20, signal: controller.signal, onPartialResults: () => { lexicalMs = Math.round(performance.now() - began); } });
          if (response.mode !== "hybrid") throw new Error(`Native inference unavailable (${response.semanticState}): ${getSemanticRuntimeStatus().error ?? getSemanticRuntimeStatus().state}`);
          const top = response.results.slice(0, 5);
          const sample = { query, translation: versionId, milliseconds: Math.round(performance.now() - began), lexicalMs, references: top.map((item) => item.verse.reference), pass: expected.some(([book, chapter, first, last]) => top.some(({ verse }) => verse.book === book && verse.chapter === chapter && (verse.startVerse ?? 0) <= last && (verse.endVerse ?? verse.startVerse ?? 0) >= first)) };
          samples.push(sample);
          console.info("[native-search-check]", JSON.stringify(sample));
          if (!controller.signal.aborted) setStatus(samples.map((item) => `${item.pass ? "PASS" : "FAIL"} ${item.translation}: ${item.query}\n${item.milliseconds} ms · ${item.references.join(", ")}`).join("\n\n"));
        }
      }
      const reference = await searchScripture({ query: "Psaltaren3:9", versionId: "reformationsbibeln2026", language: "en", signal: controller.signal });
      if (reference.results[0]?.verse.startVerse !== 9) throw new Error("Swedish reference numbering failed");
      const warm = samples.slice(1).map((item) => item.milliseconds).sort((a,b) => a-b);
      const lexical = samples.slice(1).map((item) => item.lexicalMs).sort((a,b) => a-b);
      const summary = { passed: samples.every((item) => item.pass), samples: samples.length, coldMs: samples[0].milliseconds, warmP95ms: warm[Math.floor(warm.length * .95)], lexicalP95ms: lexical[Math.floor(lexical.length * .95)], swedishReference: reference.results[0].verse.reference };
      console.info("[native-search-check-summary]", JSON.stringify(summary));
      if (!controller.signal.aborted) setStatus((previous) => `${summary.passed ? "PASS" : "FAIL"}\nCold: ${summary.coldMs} ms; warm p95: ${summary.warmP95ms} ms\n\n${previous}`);
    })().catch((error: Error) => {
      if (controller.signal.aborted) return;
      console.error("[native-search-check]", error.message);
      setStatus(`FAIL: ${error.message}`);
    });
    return () => controller.abort();
  }, []);
  return <ScrollView contentContainerStyle={{ padding: 24, paddingTop: 70, gap: 24 }}>
    <Text style={{ fontSize: 24, fontWeight: "700" }}>Native Bible search check</Text>
    <Text selectable style={{ fontSize: 16, lineHeight: 25 }}>{status}</Text>
  </ScrollView>;
}
