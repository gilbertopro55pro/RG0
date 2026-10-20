import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { messagesFor } from "@/i18n/dict";
import type { AreaDict } from "@/i18n/types";

// Integrity of the translation dictionaries (CLAUDE.md, "שפות ממשק"): the Hebrew text is the key,
// and a key appears ONCE across all the area dictionaries — the areas are merged into one object
// per language, so a second copy silently overrides the first. Every Hebrew key translated to
// English also has a Russian translation, and the other way round.
//
// Every *.ts file in this folder (other than index.ts and tests) is checked, so a new area is
// covered without touching this test. A key repeated inside ONE file is a TypeScript error
// (TS1117), so the typecheck already catches that case.

const LANGS = ["en", "ru"] as const;
const DIR = fileURLToPath(new URL(".", import.meta.url));
const FILES = readdirSync(DIR)
  .filter((f) => f.endsWith(".ts") && f !== "index.ts" && !f.endsWith(".test.ts"))
  .map((f) => f.replace(/\.ts$/, ""))
  .sort();

let dicts: Record<string, AreaDict> = {};

beforeAll(async () => {
  const loaded = await Promise.all(FILES.map(async (name) => [name, (await import(/* @vite-ignore */ `./${name}.ts`)).default as AreaDict] as const));
  dicts = Object.fromEntries(loaded);
});

const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("translation dictionaries", () => {
  it("finds the area dictionaries", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(20);
    for (const name of FILES) {
      expect(dicts[name], name).toBeDefined();
      for (const lang of LANGS) expect(typeof dicts[name][lang], `${name}.${lang}`).toBe("object");
    }
  });

  it.each(LANGS)("has no Hebrew key in more than one dictionary (%s)", (lang) => {
    const where = new Map<string, string[]>();
    for (const name of FILES) for (const key of Object.keys(dicts[name][lang])) where.set(key, [...(where.get(key) ?? []), name]);
    const duplicates = [...where].filter(([, files]) => files.length > 1).map(([key, files]) => `${JSON.stringify(key)} in ${files.join(", ")}`);
    expect(duplicates).toEqual([]);
  });

  it("translates every English key to Russian, and every Russian key to English", () => {
    const allRu = new Set(FILES.flatMap((name) => Object.keys(dicts[name].ru)));
    const allEn = new Set(FILES.flatMap((name) => Object.keys(dicts[name].en)));
    const missingRu = FILES.flatMap((name) => Object.keys(dicts[name].en).filter((k) => !allRu.has(k)).map((k) => `${name}: ${JSON.stringify(k)}`));
    const missingEn = FILES.flatMap((name) => Object.keys(dicts[name].ru).filter((k) => !allEn.has(k)).map((k) => `${name}: ${JSON.stringify(k)}`));
    expect(missingRu).toEqual([]);
    expect(missingEn).toEqual([]);
  });

  it("keeps the key's {placeholders} in every translation, and no translation is empty", () => {
    const bad: string[] = [];
    for (const name of FILES) {
      for (const lang of LANGS) {
        for (const [key, value] of Object.entries(dicts[name][lang])) {
          if (typeof value !== "string" || value.trim() === "") bad.push(`${name}.${lang}: empty translation for ${JSON.stringify(key)}`);
          else if (placeholders(key).join() !== placeholders(value).join()) bad.push(`${name}.${lang}: ${JSON.stringify(key)} → ${JSON.stringify(value)}`);
        }
      }
    }
    expect(bad).toEqual([]);
  });

  it.each(LANGS)("serves every area's %s translations from messagesFor (every area is registered in index.ts)", (lang) => {
    const merged = messagesFor(lang);
    const missing = FILES.flatMap((name) =>
      Object.entries(dicts[name][lang])
        .filter(([key, value]) => merged[key] !== value)
        .map(([key]) => `${name}: ${JSON.stringify(key)}`)
    );
    expect(missing).toEqual([]);
  });

  it("has no dictionary for Hebrew, the source language", () => {
    expect(messagesFor("he")).toEqual({});
  });
});
