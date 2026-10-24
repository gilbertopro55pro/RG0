"use client";

import { useState } from "react";
import { useT } from "@/i18n/client";
import UpdateEntryCard from "@/components/UpdateEntryCard";

type Entry = { version: string; date: string; changes: string[] };

// The versions before the latest few (UpdatesSettings), fetched only when asked for.
export default function OlderUpdates({ from, count }: { from: number; count: number }) {
  const t = useT();
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");

  const load = async () => {
    setState("loading");
    try {
      const res = await fetch(`/api/changelog?from=${from}`);
      if (!res.ok) throw new Error(String(res.status));
      const data = (await res.json()) as { entries: Entry[] };
      setEntries(data.entries);
      setState("idle");
    } catch {
      setState("error");
    }
  };

  if (entries) {
    return (
      <>
        {entries.map((entry) => (
          <UpdateEntryCard key={entry.version} label={t("גרסה {v}", { v: entry.version })} date={entry.date} changes={entry.changes} />
        ))}
      </>
    );
  }
  return (
    <div className="text-center pt-1">
      <button
        type="button"
        onClick={load}
        disabled={state === "loading"}
        className="rounded-full px-5 py-2.5 text-sm font-semibold bg-card border border-line shadow-card disabled:opacity-60"
      >
        {state === "loading" ? t("טוען...") : t("הצגת גרסאות קודמות ({n})", { n: count })}
      </button>
      {state === "error" && <p className="mt-2 text-xs text-ink-soft">{t("לא הצלחנו לטעון את הגרסאות הקודמות. נסו שוב")}</p>}
    </div>
  );
}
