"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/i18n/client";
import { useVivid } from "@/components/VividProvider";
import { VIVID_HEADER_BUTTON_STYLE } from "@/components/homeVividStyles";

// The panel loads only when opened.
const TasksPanel = dynamic(() => import("@/components/tasks/TasksPanel"), { ssr: false });

// The daily to-do list's button in the home screen's header (owner, 2026-10-26, lib/tasks.ts), beside
// the calendar and settings buttons, with the number of open tasks for today and earlier days.
// ?tasks=1 (the morning notification, lib/morningDigest.ts) opens the panel; the parameter is then
// dropped from the address so a refresh doesn't open it again.
export default function TasksButton({
  initialOpenCount,
  photographerId,
  initialMorningDigest,
}: {
  initialOpenCount: number;
  photographerId: string;
  initialMorningDigest: boolean;
}) {
  const t = useT();
  const vivid = useVivid();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(() => searchParams.get("tasks") === "1");
  const [morningDigest, setMorningDigest] = useState(initialMorningDigest);
  useEffect(() => {
    if (searchParams.get("tasks") !== "1") return;
    const url = new URL(window.location.href);
    url.searchParams.delete("tasks");
    window.history.replaceState(null, "", url.pathname + url.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [count, setCount] = useState(initialOpenCount);
  const [changed, setChanged] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={count > 0 ? t("משימות, {n} פתוחות", { n: count }) : t("משימות")}
        title={t("משימות")}
        className={`relative shrink-0 rounded-xl flex items-center justify-center gap-1.5 px-2.5 sm:px-3 ${vivid ? "h-[42px] min-w-[42px]" : "h-10 min-w-10 bg-card text-ink"}`}
        style={vivid ? VIVID_HEADER_BUTTON_STYLE : undefined}
      >
        <svg viewBox="0 0 24 24" className="h-[19px] w-[19px] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3.5" y="4" width="17" height="17" rx="2.5" />
          <path d="m7.5 9.5 1.5 1.5 3-3M14.5 10h2.5M7.5 15.5l1.5 1.5 3-3M14.5 16h2.5" />
        </svg>
        <span className="hidden sm:inline text-[13px] font-semibold">{t("משימות")}</span>
        {count > 0 && (
          <span
            className="absolute -top-1.5 -end-1.5 min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold flex items-center justify-center leading-none font-data"
            style={{ background: "var(--color-brass)", color: "#ffffff" }}
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>
      {open && (
        <TasksPanel
          photographerId={photographerId}
          morningDigest={morningDigest}
          onMorningDigest={setMorningDigest}
          onCount={setCount}
          onChanged={() => setChanged(true)}
          onClose={() => {
            setOpen(false);
            if (changed) {
              setChanged(false);
              router.refresh();
            }
          }}
        />
      )}
    </>
  );
}
