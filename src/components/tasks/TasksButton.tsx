"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useT } from "@/i18n/client";
import { useVivid } from "@/components/VividProvider";
import { VIVID_HEADER_BUTTON_STYLE } from "@/components/homeVividStyles";
import LazyTasksPanel from "@/components/tasks/LazyTasksPanel";
import TasksIcon from "@/components/tasks/TasksIcon";
import { publishTasksSummary, updateTasksSummary } from "@/components/tasks/tasksSummary";

// The daily to-do list's button in the home screen's header (owner, 2026-10-26, lib/tasks.ts), beside
// the calendar and settings buttons, with the number of open tasks for today and earlier days.
// ?tasks=1 (the daily tasks reminder, lib/morningDigest.ts) opens the panel; the parameter is then
// dropped from the address so a refresh doesn't open it again. What it knows from the server render
// goes to the shared summary (tasksSummary.ts), so the top nav on the next screen shows the same
// number without asking (TopNav is hidden on the home screen).
export default function TasksButton({
  initialOpenCount,
  photographerId,
  initialMorningDigest,
}: {
  initialOpenCount: number;
  photographerId: string;
  initialMorningDigest: { enabled: boolean; minutes: number };
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
  // A refresh of the home screen brings a new count (a task changed from the nav on another
  // screen, then back here): the button follows it.
  const [renderedCount, setRenderedCount] = useState(initialOpenCount);
  if (renderedCount !== initialOpenCount) {
    setRenderedCount(initialOpenCount);
    setCount(initialOpenCount);
  }
  const [changed, setChanged] = useState(false);

  const { enabled: digestEnabled, minutes: digestMinutes } = initialMorningDigest;
  useEffect(() => {
    publishTasksSummary({ photographer: true, photographerId, openCount: initialOpenCount, morningDigest: { enabled: digestEnabled, minutes: digestMinutes } });
  }, [photographerId, initialOpenCount, digestEnabled, digestMinutes]);

  const onCount = useCallback((n: number) => {
    setCount(n);
    updateTasksSummary({ openCount: n });
  }, []);
  const onMorningDigest = useCallback((next: { enabled: boolean; minutes: number }) => {
    setMorningDigest(next);
    updateTasksSummary({ morningDigest: next });
  }, []);

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
        <TasksIcon className="h-[19px] w-[19px] shrink-0" />
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
        <LazyTasksPanel
          photographerId={photographerId}
          morningDigest={morningDigest}
          onMorningDigest={onMorningDigest}
          onCount={onCount}
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
