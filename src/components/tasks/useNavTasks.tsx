"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import LazyTasksPanel from "@/components/tasks/LazyTasksPanel";
import {
  currentTasksSummary,
  loadTasksSummary,
  refreshTasksSummaryIfStale,
  updateTasksSummary,
  useTasksSummary,
} from "@/components/tasks/tasksSummary";
import type { MorningDigestPref } from "@/lib/tasks";

// The to-do list from every main screen (owner, 2026-11-01: "גישה מהירה מכל מסך ראשי במערכת
// למשימות מבלי לחזור למסך הבית"): an entry in the top nav (TopNav) that opens the same panel in
// place, with the open count. The home screen keeps its own button (TopNav is hidden there).
// - Only for a photographer: a team member's entry goes away once api/tasks/summary says so. Until
//   the first answer it's shown, so a photographer's nav never shifts when it arrives.
// - The count comes after the page is up (no query while a page renders): from the home screen's
//   render when coming from there, else from api/tasks/summary, asked again when a minute old.
// - Opening asks again for the daily reminder's settings (they may have changed in Settings); the
//   panel's reminder card waits for that answer.
// - Closing doesn't refresh the screen: no other screen shows tasks, and a change marks the
//   router's saved copies stale for the next navigation anyway (lib/dataChanges.ts).
// - ?tasks=1 opens it on any screen with the nav, like on the home screen.
export function useNavTasks(visible: boolean): {
  show: boolean;
  count: number;
  openPanel: () => void;
  panel: ReactNode;
} {
  const pathname = usePathname();
  const summary = useTasksSummary();
  const [open, setOpen] = useState(false);
  const [digestReady, setDigestReady] = useState(false);
  // Moving to another screen closes it (also through a screen without the nav, like the home
  // screen, so it doesn't pop up again on the way back).
  const [shownPath, setShownPath] = useState(pathname);
  if (shownPath !== pathname) {
    setShownPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!visible) return;
    const refresh = () => {
      if (document.visibilityState === "visible") refreshTasksSummaryIfStale();
    };
    refresh();
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, [visible, pathname]);

  const openPanel = useCallback(() => {
    setOpen(true);
    setDigestReady(false);
    void loadTasksSummary().then(() => {
      setDigestReady(true);
      // Not a photographer, or unknown and the server couldn't tell: nothing to open.
      if (!currentTasksSummary()?.photographer) setOpen(false);
    });
  }, []);

  // ?tasks=1: opened once the screen is up, and the parameter dropped so a refresh doesn't open it
  // again.
  useEffect(() => {
    if (!visible || new URL(window.location.href).searchParams.get("tasks") !== "1") return;
    const timer = setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.delete("tasks");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      openPanel();
    }, 0);
    return () => clearTimeout(timer);
  }, [visible, pathname, openPanel]);

  const onCount = useCallback((n: number) => updateTasksSummary({ openCount: n }), []);
  const onMorningDigest = useCallback((next: MorningDigestPref) => updateTasksSummary({ morningDigest: next }), []);
  const onClose = useCallback(() => setOpen(false), []);
  const noop = useCallback(() => {}, []);

  const photographer = summary?.photographer ? summary : null;
  const panel =
    visible && open && photographer ? (
      <LazyTasksPanel
        photographerId={photographer.photographerId}
        morningDigest={digestReady ? photographer.morningDigest : null}
        onMorningDigest={onMorningDigest}
        onCount={onCount}
        onChanged={noop}
        onClose={onClose}
      />
    ) : null;

  return {
    show: summary === null || summary.photographer,
    count: photographer?.openCount ?? 0,
    openPanel,
    panel,
  };
}
