"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { HIDDEN_PREFIXES } from "@/components/TopNav";

// "פנייה חדשה מהעוזר" (owner, 2026-10-01): every lead the intake assistant opens pops up on
// whatever screen of the app the photographer is on, until it's seen once (leads.assistant_seen_at,
// migration 0144; api/leads/assistant-new). Checked on load, every minute, and when the app comes
// back to the foreground. Not on the public / client-facing pages (the same list TopNav hides on).

type NewLead = {
  id: string;
  name: string;
  phone: string | null;
  event_type_name: string | null;
  event_date_interest: string | null;
  needs_details: boolean | null;
  created_at: string;
};

const POLL_MS = 60_000;

function dateLabel(iso: string | null): string | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return null;
  return `${d}.${m}.${y}`;
}

export default function AssistantLeadPopup() {
  const pathname = usePathname();
  const router = useRouter();
  const [leads, setLeads] = useState<NewLead[]>([]);
  const busy = useRef(false);
  const hidden = HIDDEN_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const check = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch("/api/leads/assistant-new", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { leads?: NewLead[] };
      setLeads(data.leads ?? []);
    } catch {
      // offline: try again on the next tick
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (hidden) return;
    const first = setTimeout(() => void check(), 0);
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearTimeout(first);
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [hidden, check]);

  if (hidden || leads.length === 0) return null;
  const lead = leads[0];
  const more = leads.length - 1;

  const markSeen = async (open: boolean) => {
    const ids = leads.map((l) => l.id);
    setLeads([]);
    fetch("/api/leads/assistant-new", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => {});
    if (open) router.push("/leads");
  };

  const facts = [lead.event_type_name, dateLabel(lead.event_date_interest)].filter(Boolean).join(" · ");

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" style={{ background: "rgba(28, 27, 25, 0.45)" }} role="dialog" aria-modal="true" aria-label="פנייה חדשה מהעוזר">
      <div className="w-full max-w-sm rounded-3xl p-5 bg-paper shadow-sheet">
        <div className="flex items-center gap-2 mb-3">
          <span className="h-2 w-2 rounded-full animate-pulse" style={{ background: "var(--color-amber-deep)" }} />
          <span className="text-xs font-semibold" style={{ color: "var(--color-amber-deep)" }}>
            פנייה חדשה מהעוזר
          </span>
        </div>
        <h2 className="text-lg font-bold font-display leading-snug">{lead.name}</h2>
        {facts && <p className="text-sm text-ink mt-1">{facts}</p>}
        {lead.phone && (
          <p className="text-sm text-ink-soft mt-0.5" dir="ltr" style={{ textAlign: "right" }}>
            {lead.phone}
          </p>
        )}
        {lead.needs_details && <p className="text-xs text-rose mt-2">השיחה עוד לא הסתיימה, חסרים חלק מהפרטים.</p>}
        {more > 0 && <p className="text-xs text-ink-soft mt-2">ועוד {more === 1 ? "פנייה חדשה אחת" : `${more} פניות חדשות`}</p>}
        <div className="flex gap-2 mt-5">
          <button type="button" onClick={() => markSeen(true)} className="flex-1 h-11 rounded-xl bg-ink text-white text-sm font-semibold">
            לצפייה בליד
          </button>
          <button type="button" onClick={() => markSeen(false)} className="h-11 px-4 rounded-xl border border-line bg-white text-sm font-semibold text-ink">
            אחר כך
          </button>
        </div>
      </div>
    </div>
  );
}
