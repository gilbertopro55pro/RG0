import { describe, expect, it } from "vitest";
import { CHANGELOG, CURRENT_VERSION, changesFor, type ChangelogEntry } from "@/lib/changelog";

// The "מה חדש" history (CLAUDE.md, code words "עדכון" / "עדכון ללא"): a new entry goes at the top
// and bumps the version, and since 2.12.0 (languages opened to every account) every entry carries
// `en` and `ru` lines matching the Hebrew `changes` one for one.

const semver = (v: string) => v.split(".").map(Number) as [number, number, number];
function compareVersions(a: string, b: string): number {
  const x = semver(a);
  const y = semver(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

describe("CHANGELOG", () => {
  it("uses x.y.z versions and real YYYY-MM-DD dates", () => {
    const bad = CHANGELOG.filter((e) => {
      if (!/^\d+\.\d+\.\d+$/.test(e.version)) return true;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return true;
      // A real calendar day (no 2026-02-30).
      return new Date(`${e.date}T00:00:00Z`).toISOString().slice(0, 10) !== e.date;
    }).map((e) => `${e.version} ${e.date}`);
    expect(bad).toEqual([]);
  });

  it("is newest first, with strictly decreasing versions", () => {
    const bad: string[] = [];
    for (let i = 1; i < CHANGELOG.length; i++) {
      if (compareVersions(CHANGELOG[i - 1].version, CHANGELOG[i].version) <= 0) bad.push(`${CHANGELOG[i - 1].version} before ${CHANGELOG[i].version}`);
    }
    expect(bad).toEqual([]);
  });

  it("has dates that never go forward down the list", () => {
    const bad: string[] = [];
    for (let i = 1; i < CHANGELOG.length; i++) {
      if (CHANGELOG[i - 1].date < CHANGELOG[i].date) bad.push(`${CHANGELOG[i - 1].version} (${CHANGELOG[i - 1].date}) before ${CHANGELOG[i].version} (${CHANGELOG[i].date})`);
    }
    expect(bad).toEqual([]);
  });

  it("has at least one non-empty line in every entry", () => {
    const bad = CHANGELOG.filter((e) => e.changes.length === 0 || [...e.changes, ...(e.en ?? []), ...(e.ru ?? [])].some((s) => s.trim() === "")).map((e) => e.version);
    expect(bad).toEqual([]);
  });

  it("translates every entry from 2.12.0 on into English and Russian, line for line", () => {
    const bad = CHANGELOG.filter((e) => compareVersions(e.version, "2.12.0") >= 0)
      .filter((e) => e.en?.length !== e.changes.length || e.ru?.length !== e.changes.length)
      .map((e) => `${e.version}: ${e.changes.length} he, ${e.en?.length ?? "no"} en, ${e.ru?.length ?? "no"} ru`);
    expect(bad).toEqual([]);
  });

  it("never has a translation that doesn't line up with the Hebrew (it would silently fall back to Hebrew)", () => {
    const bad = CHANGELOG.filter((e) => (e.en && e.en.length !== e.changes.length) || (e.ru && e.ru.length !== e.changes.length)).map((e) => e.version);
    expect(bad).toEqual([]);
  });

  it("derives CURRENT_VERSION from the newest entry", () => {
    expect(CURRENT_VERSION).toBe(CHANGELOG[0].version);
  });
});

describe("changesFor", () => {
  const entry: ChangelogEntry = {
    version: "9.9.9",
    date: "2026-10-20",
    changes: ["שורה אחת", "שורה שתיים"],
    en: ["Line one", "Line two"],
    ru: ["Строка один"],
  };

  it("gives the lines in the viewer's language", () => {
    expect(changesFor(entry, "he")).toEqual(["שורה אחת", "שורה שתיים"]);
    expect(changesFor(entry, "en")).toEqual(["Line one", "Line two"]);
  });

  it("falls back to Hebrew when the translation is missing or doesn't line up", () => {
    expect(changesFor(entry, "ru")).toEqual(["שורה אחת", "שורה שתיים"]);
    expect(changesFor({ ...entry, en: undefined }, "en")).toEqual(["שורה אחת", "שורה שתיים"]);
  });
});
