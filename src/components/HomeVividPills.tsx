"use client";

import type { ReactNode } from "react";
import { useT } from "@/i18n/client";
import { toneVars, type Tone } from "@/lib/tones";
import { HOME_LIST_FILTER_EVENT, type HomeListFilterRequest } from "@/lib/homeVivid";

// The two pills under the home heading in the vivid look (lib/tones.ts, admin only for now): the
// events of the coming week and the events that need the photographer (lib/homeVivid.ts
// homeHeaderCounts). A pill with nothing to count isn't shown. A tap shows those events in the list
// below and scrolls to it (EventsListView listens for HOME_LIST_FILTER_EVENT).
export default function HomeVividPills({ week, attention }: { week: number; attention: number }) {
  const t = useT();
  if (week <= 0 && attention <= 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {week > 0 && (
        <Pill tone="upcoming" show="week">
          {week === 1 ? t("אירוע אחד השבוע") : t("{n} אירועים השבוע", { n: week })}
        </Pill>
      )}
      {attention > 0 && (
        <Pill tone="attention" show="attention">
          {attention === 1 ? t("אירוע אחד דורש טיפול") : t("{n} דורשים טיפול", { n: attention })}
        </Pill>
      )}
    </div>
  );
}

function Pill({ tone, show, children }: { tone: Tone; show: HomeListFilterRequest; children: ReactNode }) {
  const v = toneVars(tone);
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent<HomeListFilterRequest>(HOME_LIST_FILTER_EVENT, { detail: show }))}
      className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full font-data"
      style={{ background: v.bg, color: v.ink }}
    >
      <span aria-hidden className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: v.solid }} />
      {children}
    </button>
  );
}
