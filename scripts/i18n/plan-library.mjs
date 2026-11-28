#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { mapWithConcurrency, projectRoot, translateTexts } from "./lib.mjs";

const sourceFile = path.join(projectRoot, "features", "bible-plan-library.ts");
const outputFile = path.join(projectRoot, "ui", "translations", "plan-library.ts");
const targetLanguages = ["de", "es", "fr", "fi", "nb", "da", "is", "pt", "ms", "ar", "ja", "it", "pl"];

function literal(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  return undefined;
}

function property(object, name) {
  for (const item of object.properties) {
    if (!ts.isPropertyAssignment(item)) continue;
    const key = ts.isStringLiteral(item.name) || ts.isIdentifier(item.name) ? item.name.text : undefined;
    if (key === name) return item.initializer;
  }
  return undefined;
}

function readTemplates() {
  const source = ts.createSourceFile(sourceFile, fs.readFileSync(sourceFile, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  let templates;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === "biblePlanTemplates") {
      let initializer = node.initializer;
      while (initializer && (ts.isAsExpression(initializer) || ts.isSatisfiesExpression(initializer))) initializer = initializer.expression;
      if (initializer && ts.isArrayLiteralExpression(initializer)) {
        templates = [];
        for (const element of initializer.elements) {
          const object = ts.isCallExpression(element) && ts.isObjectLiteralExpression(element.arguments[0])
            ? element.arguments[0]
            : element;
          if (!ts.isObjectLiteralExpression(object)) continue;
          const id = literal(property(object, "id"));
          const title = property(object, "title");
          const description = property(object, "description");
          if (!id || !title || !description || !ts.isObjectLiteralExpression(title) || !ts.isObjectLiteralExpression(description)) continue;
          const template = {
            id,
            title: { en: literal(property(title, "en")), sv: literal(property(title, "sv")) },
            description: { en: literal(property(description, "en")), sv: literal(property(description, "sv")) },
          };
          if (!template.title.en || !template.title.sv || !template.description.en || !template.description.sv) continue;
          templates.push(template);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return templates ?? [];
}

const templates = readTemplates();
if (!templates.length) {
  console.error("Could not read any plan templates.");
  process.exit(2);
}

const check = process.argv.includes("--check");
if (check) {
  if (!fs.existsSync(outputFile)) {
    console.error("ui/translations/plan-library.ts is missing. Run npm run i18n:sync:plans.");
    process.exit(1);
  }
  const generated = fs.readFileSync(outputFile, "utf8");
  const problems = [];
  for (const template of templates) {
    if (!generated.includes(JSON.stringify(template.title.en)) || !generated.includes(JSON.stringify(template.description.en))) {
      problems.push(`${template.id}: English copy is stale`);
    }
    if (!generated.includes(JSON.stringify(template.title.sv)) || !generated.includes(JSON.stringify(template.description.sv))) {
      problems.push(`${template.id}: Swedish copy is stale`);
    }
  }
  for (const language of targetLanguages) {
    if (!generated.includes(`  ${language}: {`)) problems.push(`${language}: missing language block`);
    const blockStart = generated.indexOf(`  ${language}: {`);
    const blockEnd = generated.indexOf("\n  },", blockStart);
    const block = blockStart >= 0 ? generated.slice(blockStart, blockEnd) : "";
    const missing = templates.filter((template) => !block.includes(`"${template.id}"`));
    if (missing.length) problems.push(`${language}: ${missing.length} plan(s) missing`);
  }
  if (problems.length) {
    console.error(`Plan library translations are out of date:\n- ${problems.join("\n- ")}\nRun npm run i18n:sync:plans.`);
    process.exit(1);
  }
  console.log(`Plan library is up to date (${templates.length} plans in ${targetLanguages.length + 2} languages).`);
  process.exit(0);
}

const catalog = {
  en: Object.fromEntries(templates.map((template) => [template.id, { title: template.title.en, description: template.description.en }])),
  sv: Object.fromEntries(templates.map((template) => [template.id, { title: template.title.sv, description: template.description.sv }])),
};

const started = Date.now();
const results = await mapWithConcurrency(targetLanguages, 3, async (language) => {
  const values = templates.flatMap((template) => [template.title.en, template.description.en]);
  const translated = await translateTexts(values, language);
  const entries = templates.map((template, index) => [
    template.id,
    { title: translated[index * 2], description: translated[index * 2 + 1] },
  ]);
  console.log(`${language}: ${entries.length} plans (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  return [language, Object.fromEntries(entries)];
});

for (const [language, entries] of results) catalog[language] = entries;

const lines = [
  "// Generated by `npm run i18n:sync:plans`. The English and Swedish copy in",
  "// features/bible-plan-library.ts remains the source; every other language is",
  "// read from here with a fallback to English.",
  'import type { AppLanguage } from "@/ui/translations/languages";',
  "",
  "export type PlanLibraryTranslation = {",
  "  title: string;",
  "  description: string;",
  "};",
  "",
  "export const planLibraryTranslations: Partial<",
  "  Record<AppLanguage, Record<string, PlanLibraryTranslation>>",
  "> = {",
];
for (const [language, entries] of Object.entries(catalog)) {
  lines.push(`  ${language}: {`);
  for (const [id, copy] of Object.entries(entries)) {
    lines.push(`    ${JSON.stringify(id)}: { title: ${JSON.stringify(copy.title)}, description: ${JSON.stringify(copy.description)} },`);
  }
  lines.push("  },");
}
lines.push("};", "");

fs.writeFileSync(outputFile, lines.join("\n"), "utf8");
console.log(`Wrote ${outputFile} with ${templates.length} plans in ${Object.keys(catalog).length} languages.`);
