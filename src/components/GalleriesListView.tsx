"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";

export type GalleryListItem = {
  id: string;
  title: string;
  clientName: string;
  eventDate: string | null;
  photoCount: number;
  published: boolean;
  archived: boolean;
  expiresAt: string | null;
  coverUrl: string | null;
  accessToken: string;
};

type SortKey = "event_date" | "name" | "expires";

export default function GalleriesListView({ items }: { items: GalleryListItem[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("event_date");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const copyLink = async (item: GalleryListItem, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `${window.location.origin}/gallery/${item.accessToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(item.id);
      setTimeout(() => setCopiedId((cur) => (cur === item.id ? null : cur)), 1500);
    } catch {
      // clipboard unavailable — nothing more we can do here
    }
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = items;
    if (q) {
      list = list.filter(
        (item) => item.clientName.toLowerCase().includes(q) || item.title.toLowerCase().includes(q)
      );
    }
    const sorted = [...list];
    if (sortKey === "name") {
      sorted.sort((a, b) => a.clientName.localeCompare(b.clientName, "he"));
    } else if (sortKey === "expires") {
      sorted.sort((a, b) => (a.expiresAt ?? "9999").localeCompare(b.expiresAt ?? "9999"));
    } else {
      sorted.sort((a, b) => (b.eventDate ?? "").localeCompare(a.eventDate ?? ""));
    }
    return sorted;
  }, [items, query, sortKey]);

  return (
    <div className="pb-8">
      <Link href="/" className="flex items-center gap-1 text-sm mb-5 tracking-wide text-ink-soft">
        ← חזרה לדף הבית
      </Link>
      <h1 className="text-[26px] font-bold mb-5 font-display">גלריות</h1>

      <div className="flex gap-2 mb-5">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש לפי שם לקוח..."
          className="flex-1 rounded-lg px-3 py-2 text-sm border border-line bg-white"
        />
        <select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-lg px-2 py-2 text-sm border border-line bg-white"
        >
          <option value="event_date">לפי תאריך אירוע</option>
          <option value="name">לפי שם</option>
          <option value="expires">לפי תוקף</option>
        </select>
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-16 text-sm text-ink-soft">
          {items.length === 0 ? "עדיין אין גלריות — ניתן ליצור גלריה מתוך כרטיס האירוע" : "לא נמצאו תוצאות"}
        </div>
      )}

      <div className="space-y-3">
        {filtered.map((item) => (
          <Link
            key={item.id}
            href={`/galleries/${item.id}`}
            className="flex items-center gap-3 rounded-2xl p-3 bg-card border border-line shadow-card"
          >
            <div className="relative h-16 w-16 rounded-xl overflow-hidden bg-line shrink-0">
              {item.coverUrl && (
                <Image src={item.coverUrl} alt={item.clientName} fill sizes="64px" className="object-cover" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold text-sm truncate">{item.clientName || item.title}</div>
              <div className="text-xs text-ink-soft font-data">
                {item.eventDate && new Date(item.eventDate).toLocaleDateString("he-IL")} · {item.photoCount} תמונות
              </div>
              <div className="text-[11px] mt-1">
                {item.archived ? (
                  <span className="text-rose">בארכיון</span>
                ) : item.published ? (
                  <span className="text-sage">פורסמה</span>
                ) : (
                  <span className="text-ink-soft">טיוטה</span>
                )}
              </div>
            </div>
            {item.published && !item.archived && (
              <button
                onClick={(e) => copyLink(item, e)}
                className="shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold"
                style={{
                  background: copiedId === item.id ? "var(--color-sage-bg)" : "var(--color-chip)",
                  color: copiedId === item.id ? "var(--color-sage)" : "var(--color-ink-soft)",
                }}
              >
                {copiedId === item.id ? "הועתק ✓" : "העתקת קישור"}
              </button>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
