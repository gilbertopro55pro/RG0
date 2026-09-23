"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { openWhatsApp } from "@/lib/waLink";
import { IconClose } from "@/components/icons/AlbumIcons";
import {
  PACKAGE_FLOWS,
  REVIEW_REQUEST_DELAY_DAYS,
  STAGE_LABELS,
  STAGE_TYPE,
  currentStageIndex,
  packageLabel,
} from "@/lib/stages";
import type {
  CustomPackageStageRow,
  EventContractRow,
  EventNotificationRow,
  EventPaymentRow,
  EventRow,
  EventStageRow,
  GalleryRow,
  TeamMember,
} from "@/lib/types";
import SendUpdateButton from "@/components/SendUpdateButton";
import ContractSection from "@/components/ContractSection";
import PortalLinkSection from "@/components/PortalLinkSection";
import GallerySection from "@/components/GallerySection";
import { useModalEntered } from "@/lib/useModalEntered";
import { buildClientMessageText } from "@/lib/clientMessage";
import CompactGuideModal from "@/components/CompactGuideModal";
import CloseEventConfirmModal from "@/components/CloseEventConfirmModal";

const EditEventModal = dynamic(() => import("@/components/EditEventModal"), { ssr: false });

// Unified stage descriptor — built-in flows come from PACKAGE_FLOWS/STAGE_LABELS, custom
// packages come from custom_package_stages rows. Everything downstream (FilmStrip, handlers)
// works off this shape so it doesn't need to know which kind of package the event has.
type StageDescriptor = {
  key: string; // StageKey, or `custom:${custom_stage_id}` for a custom-package stage
  label: string;
  isCheckpoint: boolean;
  requiresAlbumPdf: boolean;
};

const ROUND_BTN = "h-11 w-11 rounded-full flex items-center justify-center border border-line text-ink";
const ROUND_BTN_STYLE = { background: "var(--color-input-bg)" };

const WEEKDAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "שבת"];

function InfoIcon({ d }: { d: string }) {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="var(--color-brass)" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className="shrink-0" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// "חמישי, 15.10.2026"
function hebrewDateLine(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${weekday}, ${d}.${m}.${y}`;
}

// Only for upcoming dates — a past event's date speaks for itself.
function daysUntilLabel(iso: string): string | null {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Jerusalem" });
  const days = Math.round((Date.parse(iso) - Date.parse(today)) / 86_400_000);
  if (days < 0) return null;
  if (days === 0) return "היום";
  if (days === 1) return "מחר";
  return `בעוד ${days} ימים`;
}

// The event page's leading element (design stage 5): where the event stands in its process,
// with the one action that moves it forward. The full stage list stays further down (#stages).
function ProcessHero({
  descriptors,
  stages,
  curIdx,
  albumDesignFilename,
  pending,
  onDone,
}: {
  descriptors: StageDescriptor[];
  stages: EventStageRow[];
  curIdx: number;
  albumDesignFilename: string | null;
  pending: Set<string>;
  onDone: (key: string) => void;
}) {
  const total = descriptors.length;
  const allDone = curIdx >= total;
  const current = allDone ? null : descriptors[curIdx];
  const next = descriptors[curIdx + 1] ?? null;
  const doneByKey = new Map(stages.map((st) => [st.stage_key ?? `custom:${st.custom_stage_id}`, st.done]));
  // Same rules as the row toggle in FilmStrip: event_closing completes only via the opening
  // message, and an album-approval stage needs its PDF first.
  const canMark =
    !!current &&
    current.key !== "event_closing" &&
    !(current.requiresAlbumPdf && !(current.key === "album_approval" && albumDesignFilename)) &&
    !pending.has(current.key);

  return (
    <section aria-label="מצב האירוע" className="surface-hero p-[18px] mb-5">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <span className="text-[21px] font-extrabold leading-tight">{allDone ? "כל השלבים הושלמו" : current!.label}</span>
        {!allDone && (
          <span className="text-[13px] text-ink-soft font-data shrink-0">
            שלב {curIdx + 1} מתוך {total}
          </span>
        )}
      </div>
      <div className="grid gap-[3px] mb-3" style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }} aria-hidden="true">
        {descriptors.map((d, i) => {
          const done = doneByKey.get(d.key);
          const isCur = i === curIdx;
          return (
            <span
              key={d.key}
              className="h-1.5 rounded-full"
              style={{
                background: done ? "var(--color-brass)" : isCur ? "transparent" : "var(--color-chip)",
                boxShadow: isCur && !done ? "inset 0 0 0 1.5px var(--color-brass)" : "none",
              }}
            />
          );
        })}
      </div>
      <p className="text-[13px] text-ink-soft mb-3.5">
        {allDone
          ? "אפשר לסגור את האירוע בתחתית העמוד."
          : current!.key === "event_closing"
            ? "השלב הזה מסתיים כששולחים ללקוח את הודעת הפתיחה."
            : next
              ? `הבא אחריו: ${next.label}`
              : "זה השלב האחרון."}
      </p>
      <div className="flex gap-2">
        {canMark && (
          <button onClick={() => onDone(current!.key)} className="flex-1 h-11 rounded-xl text-sm font-bold bg-ink text-white">
            סימון כבוצע
          </button>
        )}
        <a
          href="#stages"
          className={`${canMark ? "" : "flex-1 "}h-11 px-4 rounded-xl border border-line text-sm font-semibold flex items-center justify-center`}
          style={{ background: "var(--color-input-bg)" }}
        >
          כל השלבים
        </a>
      </div>
    </section>
  );
}

function parseStageKey(key: string): { stageKey: string | null; customStageId: string | null } {
  return key.startsWith("custom:")
    ? { stageKey: null, customStageId: key.slice(7) }
    : { stageKey: key, customStageId: null };
}

// XMLHttpRequest is the only browser upload API with a real progress event, so this PUTs
// directly to a short-lived presigned R2 URL (minted server-side via /api/storage/upload-url,
// since the R2 credentials themselves are secret) purely to drive the 0–100% indicator during
// large PDF uploads.
async function uploadFileWithProgress(
  bucket: string,
  path: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  const urlRes = await fetch("/api/storage/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ bucket, path, contentType: file.type || "application/octet-stream" }),
  });
  const urlData = await urlRes.json();
  if (!urlRes.ok || !urlData.url) throw new Error(urlData.error ?? "יצירת קישור להעלאה נכשלה");

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", urlData.url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`העלאת הקובץ נכשלה (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("שגיאת רשת בהעלאת הקובץ"));
    xhr.send(file);
  });
}

export default function EventDetailView({
  event,
  initialStages,
  initialNotifications,
  isOwner,
  teamMembers,
  initialAssignedTeamMemberIds,
  initialPayments,
  initialContract,
  initialGallery,
  galleryPhotoCount,
  galleryCoverUrl,
  customStages,
  customPackageName,
  messageTemplates,
  whatsappSignature,
}: {
  event: EventRow;
  initialStages: EventStageRow[];
  initialNotifications: EventNotificationRow[];
  isOwner: boolean;
  teamMembers: TeamMember[];
  initialAssignedTeamMemberIds: string[];
  initialPayments: EventPaymentRow | null;
  initialContract: EventContractRow | null;
  initialGallery: GalleryRow | null;
  galleryPhotoCount: number;
  galleryCoverUrl: string | null;
  customStages: CustomPackageStageRow[];
  customPackageName: string | null;
  messageTemplates: Record<string, string>;
  whatsappSignature: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  // Landed here right after reconnecting Google Calendar from the "אירוע חדש" success screen's
  // "חיבור מחדש ליומן Google" button (see NewEventModal.tsx) — the event was saved without ever
  // reaching the calendar, so this interstitial offers one explicit tap to try the sync again
  // now that the connection is fresh, before the photographer moves on to the rest of the event
  // page. Only shown for this specific arrival — a normal visit to the event page never sets
  // these params. `google_connected` (set by /api/google/callback) confirms the reconnect itself
  // actually succeeded, not just that this flow was in progress when the OAuth redirect landed.
  const [showCalendarRetry, setShowCalendarRetry] = useState(
    () => searchParams.get("calendarRetry") === "1" && searchParams.get("google_connected") === "1"
  );
  const [calendarRetrySaving, setCalendarRetrySaving] = useState(false);
  const [calendarRetryDone, setCalendarRetryDone] = useState(false);
  const [calendarRetryError, setCalendarRetryError] = useState<string | null>(null);
  const [stages, setStages] = useState(initialStages);
  // The server re-derives the stage list on router.refresh() (a package change swaps stages in and
  // out) — useState(initialStages) alone would keep showing the old flow until a hard reload.
  useEffect(() => {
    setStages(initialStages);
  }, [initialStages]);
  // Closing is an explicit act (button + confirmation), never a side effect of finishing the last
  // stage. Kept in local state so the UI flips instantly, re-synced when the server prop changes.
  const [closedAt, setClosedAt] = useState<string | null>(event.closed_at);
  useEffect(() => {
    setClosedAt(event.closed_at);
  }, [event.closed_at]);
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closingEvent, setClosingEvent] = useState(false);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [payments, setPayments] = useState(initialPayments);
  // Per-row "click the row to choose full/partial" panel state — kept as two independent pairs
  // (not a keyed object) to match this component's existing style of one useState per concern.
  const [depositActionOpen, setDepositActionOpen] = useState(false);
  const [depositPartialOpen, setDepositPartialOpen] = useState(false);
  const [depositPartialDraft, setDepositPartialDraft] = useState("");
  const [balanceActionOpen, setBalanceActionOpen] = useState(false);
  const [balancePartialOpen, setBalancePartialOpen] = useState(false);
  const [balancePartialDraft, setBalancePartialDraft] = useState("");
  const [depositNotesDraft, setDepositNotesDraft] = useState(initialPayments?.deposit_notes ?? "");
  const [balanceNotesDraft, setBalanceNotesDraft] = useState(initialPayments?.balance_notes ?? "");
  const [savingNotesField, setSavingNotesField] = useState<"deposit" | "balance" | null>(null);
  // Shown inline, right next to the partial-amount input — the page-level error banner near the top
  // is easy to miss here since this panel sits lower on the page, especially on mobile where a
  // save that silently failed (or a validation guard that silently no-op'd) would otherwise look
  // exactly like "nothing happened" with no visible feedback at all.
  const [depositPaymentError, setDepositPaymentError] = useState<string | null>(null);
  const [balancePaymentError, setBalancePaymentError] = useState<string | null>(null);
  const [assignedIds, setAssignedIds] = useState(new Set(initialAssignedTeamMemberIds));
  const [showNav, setShowNav] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [showReviewPrompt, setShowReviewPrompt] = useState(false);
  const reviewPromptEntered = useModalEntered();
  const [error, setError] = useState<string | null>(null);
  const [albumDesignFilename, setAlbumDesignFilename] = useState(event.album_design_pdf_filename);
  const [uploadingAlbumDesign, setUploadingAlbumDesign] = useState(false);
  const [albumUploadProgress, setAlbumUploadProgress] = useState<number | null>(null);
  // Tracks which stage keys currently have an in-flight toggle/undo/notify request — a rapid
  // double-tap before the first request resolves used to fire a second real WhatsApp message and
  // a duplicate log entry for the same action, since neither button disabled itself meanwhile.
  // The check-and-set on `pendingKeysRef` is synchronous (a ref, not state), so two clicks fired
  // within the same tick — before React has flushed a state update — still can't both slip past
  // the guard; `pendingStageKeys` (state) exists only to drive the buttons' disabled/label UI.
  const pendingKeysRef = useRef<Set<string>>(new Set());
  const [pendingStageKeys, setPendingStageKeys] = useState<Set<string>>(new Set());

  const refreshNotifications = async () => {
    const { data } = await supabase
      .from("event_notifications")
      .select("*")
      .eq("event_id", event.id)
      .order("created_at", { ascending: false })
      .returns<EventNotificationRow[]>();
    if (data) setNotifications(data);
  };

  // Re-sends the event's own current details through PATCH /api/events/[id] — a no-op on the
  // event row itself (nothing actually changed), but that route already contains "create the
  // calendar event now if it's still missing" / "update it if already linked" logic (the same
  // path a normal edit uses to recover a sync that failed the first time), so this is a real
  // retry, not just a status check. Shared by the post-reconnect interstitial below
  // (retryGoogleCalendarSync) AND the always-visible "סנכרון מחדש ליומן" button in the page header
  // (manualSyncCalendar) — same recovery path, two different entry points into it.
  const syncEventCalendarNow = async (): Promise<{ ok: boolean; error?: string }> => {
    const res = await fetch(`/api/events/${event.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientName: event.client_name,
        clientPhone: event.client_phone,
        eventDate: event.event_date,
        eventStartTime: event.event_start_time,
        eventEndTime: event.event_end_time,
        eventLocation: event.event_location,
        arrivalTime: event.arrival_time,
        notes: event.notes,
        allowDoubleBooking: true,
      }),
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, error: data.error ?? "שגיאה בשמירת האירוע ביומן" };
    if (data.googleCalendarDisconnected || data.googleCalendarError) {
      return { ok: false, error: data.googleCalendarError ?? "החיבור ליומן עדיין לא תקין. נסו להתחבר מחדש שוב" };
    }
    await refreshNotifications();
    return { ok: true };
  };

  const retryGoogleCalendarSync = async () => {
    setCalendarRetrySaving(true);
    setCalendarRetryError(null);
    try {
      const result = await syncEventCalendarNow();
      if (!result.ok) {
        setCalendarRetryError(result.error ?? "שגיאה בשמירת האירוע ביומן");
        return;
      }
      setCalendarRetryDone(true);
    } catch {
      setCalendarRetryError("שגיאה בשמירת האירוע ביומן");
    } finally {
      setCalendarRetrySaving(false);
    }
  };

  const [calendarSyncing, setCalendarSyncing] = useState(false);

  // The manual "in case something went wrong" retry button in the page header — same recovery
  // path as the interstitial above, just reachable any time instead of only right after a
  // reconnect. Errors surface through the same generic `error` banner every other action on this
  // page already uses; success has no separate toast since the notifications feed refreshed by
  // syncEventCalendarNow already gets a "האירוע עודכן גם ביומן Google" entry from the PATCH route.
  const manualSyncCalendar = async () => {
    setCalendarSyncing(true);
    setError(null);
    try {
      const result = await syncEventCalendarNow();
      if (!result.ok) setError(result.error ?? "שגיאה בסנכרון היומן");
    } catch {
      setError("שגיאה בסנכרון היומן");
    } finally {
      setCalendarSyncing(false);
    }
  };

  const dismissCalendarRetry = () => {
    setShowCalendarRetry(false);
    // Clears calendarRetry/google_connected off the URL so refreshing the page never re-triggers
    // this interstitial once it's been handled (or explicitly skipped).
    router.replace(`/events/${event.id}`);
  };

  const curIdx = currentStageIndex(stages);

  const stageDescriptors: StageDescriptor[] = event.custom_package_id
    ? customStages.map((cs) => ({
        key: `custom:${cs.id}`,
        label: cs.name,
        isCheckpoint: cs.notify_client,
        requiresAlbumPdf: cs.requires_album_pdf,
      }))
    : PACKAGE_FLOWS[event.package!].map((key) => ({
        key,
        label: STAGE_LABELS[key],
        isCheckpoint: STAGE_TYPE[key] === "checkpoint",
        requiresAlbumPdf: key === "album_approval",
      }));

  // Resolves the photographer's own saved template (Settings → הודעות ללקוח/ה) for a stage and
  // substitutes every token — shared by the manual "שליחת עדכון" button AND (for the admin
  // account, see setStageDone) the automatic message fired the moment a stage is marked done, via
  // the same builder src/lib/clientMessage.ts also gives to the new-event booking-confirmation
  // message. Before this, each of the three built its own divergent text — a photographer's
  // customized wording only ever reliably reached the manual send.
  const buildClientUpdateMessage = (key: string, label: string): string => {
    // The gallery is what the client actually needs at almost every client-facing stage (photo
    // selection, viewing an uploaded album, etc.) — the portal is really just the fallback hub
    // page for whenever there's nothing more specific to send yet (no gallery, or one that isn't
    // published/is archived). Resolved here (not at component-body scope) since `window` doesn't
    // exist during this "use client" component's initial server-render pass.
    const galleryLink =
      initialGallery && initialGallery.published && !initialGallery.archived_at
        ? `${window.location.origin}/gallery/${initialGallery.access_token}`
        : null;
    return buildClientMessageText({
      stageKey: key,
      stageLabel: label,
      savedTemplate: messageTemplates[key],
      clientName: event.client_name,
      eventDateIso: event.event_date,
      eventLocation: event.event_location,
      packageLabelText: packageLabel(event.package, customPackageName),
      eventStartTime: event.event_start_time,
      eventEndTime: event.event_end_time,
      arrivalTime: event.arrival_time,
      depositAmount: payments ? payments.deposit_amount : null,
      balanceAmount: payments ? payments.balance_amount : null,
      linkUrl: galleryLink ?? `${window.location.origin}/portal/${event.client_access_token}`,
      whatsappSignature,
    });
  };

  // Opens the photographer's own WhatsApp with the client's chat pre-filled (see waLink.ts) and
  // logs that it happened — the same no-Business-API-template approach used for the initial
  // booking confirmation, now shared by every "stage complete" client update too.
  const notifyClientByWhatsApp = async (label: string, text: string) => {
    if (!event.client_phone) return;
    openWhatsApp(event.client_phone, text);
    await fetch(`/api/events/${event.id}/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label, clientPhone: event.client_phone }),
    }).catch(() => {});
  };

  const setStageDone = async (key: string, done: boolean, extra?: Record<string, unknown>) => {
    if (pendingKeysRef.current.has(key)) return;
    pendingKeysRef.current.add(key);
    setPendingStageKeys(new Set(pendingKeysRef.current));
    setError(null);
    try {
      const res = await fetch(`/api/events/${event.id}/stages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parseStageKey(key), done, ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "שגיאה בעדכון השלב");
        return;
      }
      setStages((prev) =>
        prev.map((s) =>
          (s.stage_key ?? `custom:${s.custom_stage_id}`) === key
            ? { ...s, done, done_at: done ? data.stage.done_at : null }
            : s
        )
      );
      if (data.notify) {
        const label = stageDescriptors.find((d) => d.key === key)?.label ?? "";
        // The photographer's own saved template (Settings → הודעות ללקוח/ה), exactly like the
        // manual "שליחת עדכון" button sends, instead of the old short hardcoded
        // STAGE_NOTIFY_CLIENT string.
        const text = buildClientUpdateMessage(key, label) + (data.notify.downloadUrl ? `\n${data.notify.downloadUrl}` : "");
        await notifyClientByWhatsApp(label, text);
      }
      await refreshNotifications();
      if (done && key === "final_delivery" && isOwner) setShowReviewPrompt(true);
    } finally {
      pendingKeysRef.current.delete(key);
      setPendingStageKeys(new Set(pendingKeysRef.current));
    }
  };

  const restoreEvent = async () => {
    setClosingEvent(true);
    setError(null);
    try {
      const res = await fetch(`/api/events/${event.id}/close`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closed: false }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "שגיאה בשחזור האירוע");
        return;
      }
      setClosedAt(data.closedAt);
      await refreshNotifications();
      router.refresh();
    } finally {
      setClosingEvent(false);
    }
  };

  const toggleStage = (key: string) => setStageDone(key, true);
  const undoStage = (key: string) => setStageDone(key, false);

  // Admin-only for now (see the standing "עדכון אדמין" staged-rollout process): the counterpart
  // to /api/events/route.ts and /api/contracts/[token]/sign leaving event_closing open at
  // creation — this is the OTHER way it can get marked done (the photographer sending the
  // opening message directly, e.g. after choosing to skip the contract step). Reuses setStageDone
  // rather than the disabled stage-row checkbox, which still blocks manual toggling of this
  // specific stage everywhere else.
  const sendEventClosingUpdate = async () => {
    const text = buildClientUpdateMessage("event_closing", "סגירת האירוע");
    await notifyClientByWhatsApp("סגירת האירוע", text);
    await setStageDone("event_closing", true);
  };

  const uploadAlbumDesign = async (key: string, file: File) => {
    setError(null);
    setUploadingAlbumDesign(true);
    setAlbumUploadProgress(0);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) throw new Error("יש להתחבר מחדש");
      const path = `${session.user.id}/${event.id}/${crypto.randomUUID()}-${file.name}`;
      await uploadFileWithProgress("album-designs", path, file, setAlbumUploadProgress);

      if (key === "album_approval") {
        // Standard checkpoint — attach the file and notify the client, but leave the stage for
        // the client to confirm via their portal (or the photographer can toggle it manually now
        // that a PDF exists).
        const res = await fetch(`/api/events/${event.id}/album-design`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ albumDesignPdfPath: path, albumDesignPdfFilename: file.name }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "שגיאה בשמירת קובץ העיצוב");
        setAlbumDesignFilename(file.name);
        if (data.notify) {
          await notifyClientByWhatsApp(
            STAGE_LABELS.album_approval,
            `שלום ${event.client_name},\n${data.notify.text} ✓\n${data.notify.downloadUrl}`
          );
        }
        await refreshNotifications();
      } else {
        // Custom-package stage — keeps the original combined upload+complete behavior.
        await setStageDone(key, true, { albumDesignPdfPath: path, albumDesignPdfFilename: file.name });
        setAlbumDesignFilename(file.name);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "שגיאה בהעלאת קובץ עיצוב האלבום");
    } finally {
      setUploadingAlbumDesign(false);
      setAlbumUploadProgress(null);
    }
  };

  const scheduleReviewRequest = async () => {
    setShowReviewPrompt(false);
    const res = await fetch(`/api/events/${event.id}/schedule-review-request`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error ?? "שגיאה בתזמון תזכורת הביקורת");
    }
    await refreshNotifications();
  };

  const sendWhatsAppUpdate = async (key: string, label: string) => {
    const guardKey = `notify:${key}`;
    if (pendingKeysRef.current.has(guardKey)) return;
    if (!event.client_phone) {
      setError("לא הוזן טלפון לקוח לאירוע זה");
      return;
    }
    pendingKeysRef.current.add(guardKey);
    setPendingStageKeys(new Set(pendingKeysRef.current));
    setError(null);
    try {
      const text = buildClientUpdateMessage(key, label);
      openWhatsApp(event.client_phone, text);
      await fetch(`/api/events/${event.id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, clientPhone: event.client_phone }),
      }).catch(() => {});
      await refreshNotifications();
    } finally {
      pendingKeysRef.current.delete(guardKey);
      setPendingStageKeys(new Set(pendingKeysRef.current));
    }
  };

  // Three payment states per leg (deposit/balance), not just the old binary paid/unpaid: unpaid,
  // fully paid (`{field}_paid`, unchanged meaning — still what the client portal and the analytics
  // revenue calc read), or partially paid (`{field}_paid_amount` set, `{field}_paid` stays false so
  // nothing downstream mistakes a partial payment for the full one). The remaining balance is never
  // stored — always `amount - paid_amount`, computed live wherever it's shown, so it can't go stale
  // if the declared amount itself is edited later via "עריכת פרטי האירוע".
  const setPaymentFieldError = (field: "deposit" | "balance", message: string | null) =>
    (field === "deposit" ? setDepositPaymentError : setBalancePaymentError)(message);

  const applyPaymentPatch = async (field: "deposit" | "balance", patch: Record<string, unknown>) => {
    if (!payments) return;
    const { error: updateError } = await supabase.from("event_payments").update(patch).eq("event_id", event.id);
    if (updateError) {
      // Shown inline right next to the action panel (see depositPaymentError/balancePaymentError
      // above) — the page-level banner near the top is easy to miss from all the way down here.
      setPaymentFieldError(field, updateError.message);
      return;
    }
    setPaymentFieldError(field, null);
    setPayments({ ...payments, ...patch } as typeof payments);
    if (field === "deposit") {
      setDepositActionOpen(false);
      setDepositPartialOpen(false);
    } else {
      setBalanceActionOpen(false);
      setBalancePartialOpen(false);
    }
    // Marking full/partial changes this month's realized revenue (the home dashboard's chart sums
    // deposit/balance amounts by *_paid_at's month) — without this, that page's Server Component
    // data stays cached until something else happens to invalidate it, so the chart would only
    // catch up on a hard reload instead of the very next visit. Same pattern as EditEventModal's
    // onSaved above.
    router.refresh();
  };

  const markPaymentFull = (field: "deposit" | "balance") =>
    applyPaymentPatch(field, {
      [`${field}_paid`]: true,
      [`${field}_paid_at`]: new Date().toISOString(),
      [`${field}_paid_amount`]: null,
    });

  const markPaymentUnpaid = (field: "deposit" | "balance") =>
    applyPaymentPatch(field, { [`${field}_paid`]: false, [`${field}_paid_at`]: null, [`${field}_paid_amount`]: null });

  // A partial amount that reaches (or somehow exceeds) the full declared amount is just the full
  // payment — snapping to markPaymentFull instead avoids a nonsensical negative/zero "balance
  // remaining" reading.
  const confirmPartialPayment = (field: "deposit" | "balance", amount: number) => {
    if (!payments) return;
    if (!(amount > 0)) {
      setPaymentFieldError(field, "יש להזין סכום גדול מ-0");
      return;
    }
    const owed = field === "deposit" ? Number(payments.deposit_amount) : Number(payments.balance_amount);
    if (amount >= owed) return markPaymentFull(field);
    // *_paid_at doubles as "when was money last received on this leg" (not only "became fully
    // paid") — the home dashboard's and analytics' revenue-by-month charts bucket by this date, so
    // a partial payment needs it set too or the amount actually received never shows up as
    // realized revenue anywhere, only ever as pending.
    return applyPaymentPatch(field, {
      [`${field}_paid`]: false,
      [`${field}_paid_at`]: new Date().toISOString(),
      [`${field}_paid_amount`]: amount,
    });
  };

  const saveNotes = async (field: "deposit" | "balance", text: string) => {
    if (!payments) return;
    setSavingNotesField(field);
    const column = `${field}_notes`;
    const { error: updateError } = await supabase.from("event_payments").update({ [column]: text || null }).eq("event_id", event.id);
    setSavingNotesField(null);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPayments({ ...payments, [column]: text || null } as typeof payments);
  };

  const [issuingDocument, setIssuingDocument] = useState<"deposit" | "balance" | null>(null);
  const [documentEmailPrompt, setDocumentEmailPrompt] = useState<"deposit" | "balance" | null>(null);
  const [documentEmailInput, setDocumentEmailInput] = useState(event.client_email ?? "");
  const [clientEmail, setClientEmail] = useState(event.client_email);

  const issueDocument = async (field: "deposit" | "balance", clientEmailOverride?: string) => {
    if (!clientEmailOverride && !clientEmail) {
      setDocumentEmailPrompt(field);
      return;
    }
    setIssuingDocument(field);
    setError(null);
    const res = await fetch(`/api/events/${event.id}/issue-document`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ field, clientEmail: clientEmailOverride }),
    });
    const data = await res.json();
    setIssuingDocument(null);
    if (!res.ok) {
      setError(data.error ?? "הפקת המסמך נכשלה");
      return;
    }
    if (clientEmailOverride) setClientEmail(clientEmailOverride);
    setDocumentEmailPrompt(null);
    if (payments) {
      const column = field === "deposit" ? "deposit_document_url" : "balance_document_url";
      setPayments({ ...payments, [column]: data.documentUrl });
    }
  };

  const toggleAssignee = async (teamMemberId: string) => {
    setError(null);
    const isAssigned = assignedIds.has(teamMemberId);
    const { error: updateError } = isAssigned
      ? await supabase
          .from("event_assignees")
          .delete()
          .eq("event_id", event.id)
          .eq("team_member_id", teamMemberId)
      : await supabase.from("event_assignees").insert({ event_id: event.id, team_member_id: teamMemberId });
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setAssignedIds((prev) => {
      const next = new Set(prev);
      if (isAssigned) next.delete(teamMemberId);
      else next.add(teamMemberId);
      return next;
    });
  };

  return (
    <div className="pb-8">
      {/* Design stage 5: a round back button and one "more" menu instead of three underlined
          text links across the top. */}
      <div className="flex items-center justify-between mb-5">
        <Link href="/" aria-label="חזרה לאירועים" className={ROUND_BTN} style={ROUND_BTN_STYLE}>
          <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </Link>
        {isOwner && (
          <div className="relative">
            <button
              onClick={() => setMoreOpen((v) => !v)}
              aria-label="עוד פעולות"
              aria-expanded={moreOpen}
              className={ROUND_BTN}
              style={ROUND_BTN_STYLE}
            >
              {calendarSyncing ? (
                <span className="text-[11px] font-semibold">...</span>
              ) : (
                <svg width={20} height={20} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <circle cx="5" cy="12" r="1.6" />
                  <circle cx="12" cy="12" r="1.6" />
                  <circle cx="19" cy="12" r="1.6" />
                </svg>
              )}
            </button>
            {moreOpen && (
              <>
                <div className="fixed inset-0 z-40 gf-no-enter" onClick={() => setMoreOpen(false)} />
                <div className="absolute end-0 top-12 z-50 w-56 rounded-2xl bg-paper shadow-sheet border border-line overflow-hidden text-sm">
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      setShowEdit(true);
                    }}
                    data-press="tint"
                    className="w-full text-start px-4 py-3"
                  >
                    עריכת פרטי האירוע
                  </button>
                  <button
                    onClick={() => {
                      setMoreOpen(false);
                      manualSyncCalendar();
                    }}
                    disabled={calendarSyncing}
                    data-press="tint"
                    className="w-full text-start px-4 py-3 border-t border-line disabled:opacity-60"
                  >
                    סנכרון מחדש ליומן
                    <span className="block text-xs text-ink-soft">אם האירוע לא נשמר ביומן</span>
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
      {showEdit && (
        <EditEventModal
          event={event}
          onClose={() => setShowEdit(false)}
          onSaved={async () => {
            setShowEdit(false);
            await refreshNotifications();
            router.refresh();
          }}
        />
      )}
      {showReviewPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{
            background: "rgba(28, 27, 25, 0.45)",
            backdropFilter: reviewPromptEntered ? "blur(16px)" : "blur(0px)",
            WebkitBackdropFilter: reviewPromptEntered ? "blur(16px)" : "blur(0px)",
            transition: "backdrop-filter 280ms ease, -webkit-backdrop-filter 280ms ease",
          }}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet">
            <h2 className="text-lg font-bold mb-2 font-display">האירוע נמסר</h2>
            <p className="text-sm text-ink-soft mb-5">
              לשלוח ללקוח תזכורת לכתוב לנו ביקורת, בעוד {REVIEW_REQUEST_DELAY_DAYS} ימים מהיום?
            </p>
            <div className="flex gap-2">
              <button
                onClick={scheduleReviewRequest}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white"
              >
                כן, תזמן תזכורת
              </button>
              <button
                onClick={() => setShowReviewPrompt(false)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                לא תודה
              </button>
            </div>
          </div>
        </div>
      )}
      {showCalendarRetry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(28, 27, 25, 0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
        >
          <div className="w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet">
            {calendarRetryDone ? (
              <>
                <div className="flex flex-col items-center text-center gap-2 py-2 mb-3">
                  <span
                    className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                    style={{ background: "var(--color-sage-bg)", color: "var(--color-sage)" }}
                  >
                    ✓
                  </span>
                  <div className="text-base font-bold font-display">האירוע נשמר ביומן Google בהצלחה</div>
                </div>
                <button onClick={dismissCalendarRetry} className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white">
                  המשך לכרטיס האירוע
                </button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold mb-2 font-display">שמירת האירוע ביומן Google</h2>
                <p className="text-sm text-ink-soft mb-5">
                  החיבור ליומן חודש בהצלחה. האירוע &quot;{event.client_name}&quot; עדיין לא נשמר ביומן, ללחוץ כדי לשמור אותו עכשיו.
                </p>
                {calendarRetryError && <p className="text-xs text-rose mb-3">{calendarRetryError}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={retryGoogleCalendarSync}
                    disabled={calendarRetrySaving}
                    className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
                  >
                    {calendarRetrySaving ? "שומר..." : "שמירת האירוע ביומן"}
                  </button>
                  <button
                    onClick={dismissCalendarRetry}
                    disabled={calendarRetrySaving}
                    className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60"
                  >
                    לא עכשיו
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <div className="flex items-start gap-2 mb-0.5">
        <h1 className="text-[28px] leading-tight font-extrabold font-display">{event.client_name}</h1>
        <div className="mt-2">
          <CompactGuideModal pageKey="event-card" />
        </div>
      </div>
      <div className="text-[15px] text-ink-soft mb-4">
        {[event.event_type?.trim(), packageLabel(event.package, customPackageName)].filter(Boolean).join(", ")}
      </div>
      {closedAt && isOwner && (
        <div className="flex items-center gap-2 flex-wrap mb-4">
          <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: "var(--color-sage-bg)", color: "var(--color-sage)" }}>
            האירוע סגור
          </span>
          <button
            onClick={() => restoreEvent()}
            disabled={closingEvent}
            className="text-xs font-semibold rounded-full px-3 py-1 border border-line text-ink disabled:opacity-60"
            style={{ background: "var(--color-input-bg)" }}
          >
            {closingEvent ? "משחזר..." : "שחזור אירוע"}
          </button>
        </div>
      )}

      {/* Event facts as icon lines (no "·" chain, no emoji): date, place (opens navigation), arrival
          time, phone (tap to call). */}
      <div className="flex flex-col gap-2.5 mb-5 text-[15px]">
        <div className="flex items-center gap-2.5">
          <InfoIcon d="M3.5 7.5a2.5 2.5 0 0 1 2.5-2.5h12a2.5 2.5 0 0 1 2.5 2.5v10.5a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5zM3.5 10h17M8 3v4M16 3v4" />
          <span className="font-data">{hebrewDateLine(event.event_date)}</span>
          {daysUntilLabel(event.event_date) && (
            <span className="text-[13px] font-bold" style={{ color: "var(--color-amber-deep)" }}>
              {daysUntilLabel(event.event_date)}
            </span>
          )}
        </div>
        {event.event_location && (
          <button onClick={() => setShowNav(true)} className="flex items-center gap-2.5 text-start">
            <InfoIcon d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11zM12 12.3a2.3 2.3 0 1 0 0-4.6 2.3 2.3 0 0 0 0 4.6z" />
            <span className="border-b border-line">{event.event_location}</span>
          </button>
        )}
        {event.arrival_time && (
          <div className="flex items-center gap-2.5">
            <InfoIcon d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" />
            <span>
              הגעה לצילומי משפחה: <span className="font-data">{event.arrival_time.slice(0, 5)}</span>
            </span>
          </div>
        )}
        {event.client_phone && (
          <a href={`tel:${event.client_phone}`} className="flex items-center gap-2.5">
            <InfoIcon d="M5 4h3.5l1.5 4-2 1.5a11 11 0 0 0 5.5 5.5l1.5-2 4 1.5V18a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2z" />
            <span className="font-data" dir="ltr">
              {event.client_phone}
            </span>
          </a>
        )}
      </div>

      {stageDescriptors.length > 0 && (
        <ProcessHero
          descriptors={stageDescriptors}
          stages={stages}
          curIdx={curIdx}
          albumDesignFilename={albumDesignFilename}
          pending={pendingStageKeys}
          onDone={toggleStage}
        />
      )}

      {showNav && event.event_location && (
        <NavAppSheet location={event.event_location} onClose={() => setShowNav(false)} />
      )}

      {event.notes && (
        <div className="rounded-xl px-3.5 py-2.5 mb-4 text-xs bg-chip text-ink-soft whitespace-pre-wrap">
          {event.notes}
        </div>
      )}

      {error && <p className="text-xs text-rose mb-3">{error}</p>}

      {/* Admin-only for now (see sendEventClosingUpdate's doc comment): shown whenever
          event_closing isn't done yet, regardless of contract status — this is the ONLY way to
          complete that stage (its row in the checklist below is permanently disabled for manual
          toggling). Used to also require a signed/skipped contract, but contract_skipped can only
          ever be set from the one-time post-creation interstitial — an event created any other
          way (calendar import, a converted lead, or just closing that interstitial without
          clicking "דלג") could leave event_closing stuck forever with no banner and no checkbox
          to complete it. Dropping that condition means this is always reachable. */}
      {isOwner && !stages.find((s) => s.stage_key === "event_closing")?.done && (
          <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
            <div className="flex items-center gap-2 mb-3.5">
              <span className="text-sm font-semibold">שליחת הודעת פתיחה ללקוח/ה</span>
            </div>
            {event.client_phone ? (
              <>
                <p className="text-xs text-ink-soft mb-2.5">
                  לחיצה תפתח את הוואטסאפ שלך עם הודעה מוכנה ללקוח/ה, פרטי האירוע, המקדמה והיתרה, וקישור
                  לפורטל האישי שלהם למעקב אחר האירוע והתשלומים. תישאר/י לבדוק ולשלוח בעצמך.
                </p>
                <SendUpdateButton onSend={sendEventClosingUpdate} pending={pendingStageKeys.has("event_closing")} label="שליחת עדכון ללקוח בוואטסאפ" />
              </>
            ) : (
              <p className="text-xs text-ink-soft">לא הוזן טלפון לקוח. לא ניתן לשלוח עדכון.</p>
            )}
          </div>
        )}

      {isOwner && payments && (
        <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-semibold">תשלומים</span>
          </div>
          {payments.deposit_amount === 0 && payments.balance_amount === 0 && (
            <div className="rounded-xl px-3.5 py-2.5 mb-2 text-xs bg-amber-bg text-amber-deep">
              טרם הוגדר מחיר לאירוע. בתפריט העוד (שלוש הנקודות למעלה) בוחרים &quot;עריכת פרטי האירוע&quot; ומוסיפים מקדמה ויתרה.
            </div>
          )}
          <div className="-mx-4 -mb-4 border-t border-line divide-y divide-[var(--color-line)]">
            <PaymentLegRow
              label="מקדמה"
              amount={payments.deposit_amount}
              paid={payments.deposit_paid}
              paidAmount={payments.deposit_paid_amount}
              documentUrl={payments.deposit_document_url}
              actionOpen={depositActionOpen}
              onToggleAction={() => {
                setDepositActionOpen((v) => !v);
                setDepositPaymentError(null);
              }}
              partialOpen={depositPartialOpen}
              partialDraft={depositPartialDraft}
              partialError={depositPaymentError}
              onOpenPartial={() => {
                setDepositPartialDraft(payments.deposit_paid_amount != null ? String(payments.deposit_paid_amount) : "");
                setDepositPaymentError(null);
                setDepositPartialOpen(true);
              }}
              onCancelPartial={() => {
                setDepositPartialOpen(false);
                setDepositPaymentError(null);
              }}
              onPartialDraftChange={setDepositPartialDraft}
              onConfirmPartial={() => confirmPartialPayment("deposit", Number(depositPartialDraft))}
              onMarkFull={() => markPaymentFull("deposit")}
              onMarkUnpaid={() => markPaymentUnpaid("deposit")}
              notesDraft={depositNotesDraft}
              onNotesDraftChange={setDepositNotesDraft}
              onNotesBlur={() => {
                if (depositNotesDraft !== (payments.deposit_notes ?? "")) saveNotes("deposit", depositNotesDraft);
              }}
              savingNotes={savingNotesField === "deposit"}
              onIssueDocument={() => issueDocument("deposit")}
              issuingDocument={issuingDocument === "deposit"}
            />
            <PaymentLegRow
              label="יתרה"
              amount={payments.balance_amount}
              paid={payments.balance_paid}
              paidAmount={payments.balance_paid_amount}
              dueDateText={payments.balance_due_date ? `עד ${new Date(payments.balance_due_date).toLocaleDateString("he-IL")}` : null}
              documentUrl={payments.balance_document_url}
              actionOpen={balanceActionOpen}
              onToggleAction={() => {
                setBalanceActionOpen((v) => !v);
                setBalancePaymentError(null);
              }}
              partialOpen={balancePartialOpen}
              partialDraft={balancePartialDraft}
              partialError={balancePaymentError}
              onOpenPartial={() => {
                setBalancePartialDraft(payments.balance_paid_amount != null ? String(payments.balance_paid_amount) : "");
                setBalancePaymentError(null);
                setBalancePartialOpen(true);
              }}
              onCancelPartial={() => {
                setBalancePartialOpen(false);
                setBalancePaymentError(null);
              }}
              onPartialDraftChange={setBalancePartialDraft}
              onConfirmPartial={() => confirmPartialPayment("balance", Number(balancePartialDraft))}
              onMarkFull={() => markPaymentFull("balance")}
              onMarkUnpaid={() => markPaymentUnpaid("balance")}
              notesDraft={balanceNotesDraft}
              onNotesDraftChange={setBalanceNotesDraft}
              onNotesBlur={() => {
                if (balanceNotesDraft !== (payments.balance_notes ?? "")) saveNotes("balance", balanceNotesDraft);
              }}
              savingNotes={savingNotesField === "balance"}
              onIssueDocument={() => issueDocument("balance")}
              issuingDocument={issuingDocument === "balance"}
            />
          </div>
        </div>
      )}

      {documentEmailPrompt && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
          onClick={() => setDocumentEmailPrompt(null)}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 font-display">אימייל הלקוח/ה</h2>
            <p className="text-sm text-ink-soft mb-3.5">נדרש אימייל כדי לשלוח את המסמך.</p>
            <input
              type="email"
              value={documentEmailInput}
              onChange={(e) => setDocumentEmailInput(e.target.value)}
              placeholder="example@gmail.com"
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white mb-3.5"
              autoFocus
            />
            <div className="flex gap-2">
              <button
                onClick={() => issueDocument(documentEmailPrompt, documentEmailInput.trim())}
                disabled={!documentEmailInput.trim() || issuingDocument !== null}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                {issuingDocument ? "מפיק..." : "הפקת מסמך"}
              </button>
              <button
                onClick={() => setDocumentEmailPrompt(null)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {isOwner && (
        <PortalLinkSection
          token={event.client_access_token}
          eventId={event.id}
          clientName={event.client_name}
          clientPhone={event.client_phone}
          onSent={refreshNotifications}
        />
      )}

      {isOwner && (
        <GallerySection
          eventId={event.id}
          initialGallery={initialGallery}
          photoCount={galleryPhotoCount}
          coverUrl={galleryCoverUrl}
          clientName={event.client_name}
          clientPhone={event.client_phone ?? ""}
          eventDate={event.event_date}
        />
      )}

      {isOwner && <ContractSection eventId={event.id} initialContract={initialContract} />}

      {isOwner && teamMembers.length > 0 && (
        <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
          <div className="flex items-center gap-2 mb-3.5">
            <span className="text-sm font-semibold">צוות משוייך לאירוע</span>
          </div>
          <div className="space-y-2">
            {teamMembers.map((m) => {
              const assigned = assignedIds.has(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleAssignee(m.id)}
                  className="w-full flex items-center justify-between text-sm rounded-xl px-3.5 py-2.5"
                  style={{ background: assigned ? "var(--color-amber-bg)" : "var(--color-chip)" }}
                >
                  <span>{m.name}</span>
                  <span style={{ color: assigned ? "var(--color-amber-deep)" : "var(--color-ink-soft)", fontWeight: 600 }}>
                    {assigned ? "משוייך ✓" : "לא משוייך"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div id="stages" className="mb-2.5 text-sm font-semibold scroll-mt-4">מסלול התהליך</div>
      <FilmStrip
        stageDescriptors={stageDescriptors}
        stages={stages}
        curIdx={curIdx}
        onToggle={toggleStage}
        onUndo={undoStage}
        onSendWhatsApp={sendWhatsAppUpdate}
        albumDesignFilename={albumDesignFilename}
        uploadingAlbumDesign={uploadingAlbumDesign}
        albumUploadProgress={albumUploadProgress}
        onUploadAlbumDesign={uploadAlbumDesign}
        pendingStageKeys={pendingStageKeys}
      />

      {isOwner && (
        <div className="mt-7 mb-1">
          {closedAt ? (
            <button
              onClick={() => restoreEvent()}
              disabled={closingEvent}
              className="w-full rounded-xl py-3 text-sm font-semibold bg-white border border-line text-ink disabled:opacity-60"
            >
              {closingEvent ? "משחזר..." : "שחזור אירוע"}
            </button>
          ) : (
            <button onClick={() => setCloseConfirmOpen(true)} className="w-full rounded-xl py-3 text-sm font-semibold bg-ink text-white">
              סגירת אירוע
            </button>
          )}
          <p className="text-[11px] text-ink-soft text-center mt-1.5">
            {closedAt ? "האירוע סגור: שחזור יחזיר אותו לרשימת האירועים הפעילים." : "סימון כל השלבים לא סוגר את האירוע. רק לחיצה כאן ואישור."}
          </p>
        </div>
      )}


      <div className="mt-7">
        <div className="flex items-center gap-2 mb-3.5">
          <span className="text-sm font-semibold">יומן התראות</span>
        </div>
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className="text-xs rounded-xl px-3.5 py-2.5 bg-chip text-ink-soft break-words flex items-start justify-between gap-3">
              <span>{n.text}</span>
              <span className="font-data shrink-0">
                {new Date(n.created_at).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      </div>
      {closeConfirmOpen && (
        <CloseEventConfirmModal
          eventId={event.id}
          onClosed={async (closedAtValue) => {
            setClosedAt(closedAtValue);
            setCloseConfirmOpen(false);
            await refreshNotifications();
            router.refresh();
          }}
          onCancel={() => setCloseConfirmOpen(false)}
        />
      )}
    </div>
  );
}

// One leg of the payments card (מקדמה or יתרה) — clicking the row opens a small choice between
// marking it fully or partially paid (see the hint line above the rows in the parent). Kept as its
// own component since the deposit/balance rows are otherwise identical, just fed different data and
// handlers already bound to their own field by the parent.
function PaymentLegRow({
  label,
  amount,
  paid,
  paidAmount,
  dueDateText,
  documentUrl,
  actionOpen,
  onToggleAction,
  partialOpen,
  partialDraft,
  partialError,
  onOpenPartial,
  onCancelPartial,
  onPartialDraftChange,
  onConfirmPartial,
  onMarkFull,
  onMarkUnpaid,
  notesDraft,
  onNotesDraftChange,
  onNotesBlur,
  savingNotes,
  onIssueDocument,
  issuingDocument,
}: {
  label: string;
  amount: number;
  paid: boolean;
  paidAmount: number | null;
  dueDateText?: string | null;
  documentUrl: string | null;
  actionOpen: boolean;
  onToggleAction: () => void;
  partialOpen: boolean;
  partialDraft: string;
  partialError: string | null;
  onOpenPartial: () => void;
  onCancelPartial: () => void;
  onPartialDraftChange: (v: string) => void;
  onConfirmPartial: () => void;
  onMarkFull: () => void;
  onMarkUnpaid: () => void;
  notesDraft: string;
  onNotesDraftChange: (v: string) => void;
  onNotesBlur: () => void;
  savingNotes: boolean;
  onIssueDocument: () => void;
  issuingDocument: boolean;
}) {
  const isPartial = !paid && paidAmount != null && paidAmount > 0;
  const remaining = isPartial ? Math.max(0, Number(amount) - Number(paidAmount)) : null;
  // Notes stay collapsed behind a link until there's something in them (design stage 5: no empty
  // textarea under every payment).
  const [notesOpen, setNotesOpen] = useState(!!notesDraft);
  const ils = (n: number) => `₪${Number(n).toLocaleString("he-IL")}`;
  return (
    <div className="px-4 py-3">
      <button onClick={onToggleAction} className="w-full flex items-center gap-2.5 text-start">
        <span className="flex-1 min-w-0">
          <span className="block text-[15px] font-bold">{label}</span>
          <span className="block text-xs text-ink-soft font-data">
            {paid ? "התקבל" : isPartial ? `שולם חלקית, נשאר ${ils(remaining ?? 0)}` : dueDateText ?? "ממתין לתשלום"}
          </span>
        </span>
        <span className="text-base font-extrabold font-data">{ils(amount)}</span>
        {paid ? (
          <span className="text-xs font-bold rounded-full px-2.5 py-1" style={{ background: "var(--color-sage-bg)", color: "var(--color-sage)" }}>
            שולם
          </span>
        ) : (
          <span className="text-xs font-bold rounded-lg px-2.5 py-1.5 border border-line" style={{ background: "var(--color-input-bg)" }}>
            סימון תשלום
          </span>
        )}
      </button>

      {actionOpen && !paid && (
        <div className="mt-2 rounded-xl border border-line p-2.5" style={{ background: "var(--color-input-bg)" }}>
          {partialOpen ? (
            <div>
              <div className="flex items-center gap-2">
                <input
                  value={partialDraft}
                  onChange={(e) => onPartialDraftChange(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") onConfirmPartial();
                  }}
                  type="number"
                  min={0}
                  placeholder="כמה שולם עד כה?"
                  autoFocus
                  className="flex-1 min-w-0 rounded-lg px-2.5 py-1.5 text-xs border border-line bg-white font-data"
                />
                <button onClick={onConfirmPartial} className="text-xs font-semibold text-amber-deep shrink-0">
                  אישור
                </button>
                <button onClick={onCancelPartial} className="text-xs text-ink-soft shrink-0">
                  ביטול
                </button>
              </div>
              {partialError && <p className="text-xs text-rose mt-1.5">{partialError}</p>}
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={onMarkFull} className="text-xs font-semibold rounded-lg px-2.5 py-1.5" style={{ background: "var(--color-sage-bg)", color: "var(--color-sage)" }}>
                תשלום מלא
              </button>
              <button onClick={onOpenPartial} className="text-xs font-semibold rounded-lg px-2.5 py-1.5" style={{ background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" }}>
                תשלום חלקי
              </button>
              {isPartial && (
                <button onClick={onMarkUnpaid} className="text-xs text-ink-soft underline">
                  איפוס לממתין
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center gap-4 mt-1.5 text-xs">
        {paid &&
          (documentUrl ? (
            <a href={documentUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-amber-deep">
              צפייה במסמך
            </a>
          ) : (
            <button onClick={onIssueDocument} disabled={issuingDocument} className="font-semibold text-amber-deep disabled:opacity-60">
              {issuingDocument ? "מפיק מסמך..." : "הפקת מסמך"}
            </button>
          ))}
        {!notesOpen && (
          <button onClick={() => setNotesOpen(true)} className="font-semibold text-amber-deep">
            + הערה
          </button>
        )}
        {paid && (
          <button onClick={onMarkUnpaid} className="text-ink-soft ms-auto">
            ביטול סימון
          </button>
        )}
      </div>

      {notesOpen && (
        <>
          <textarea
            value={notesDraft}
            onChange={(e) => onNotesDraftChange(e.target.value)}
            onBlur={onNotesBlur}
            rows={2}
            autoFocus={!notesDraft}
            placeholder={`הערה ל${label} (רק לך, הלקוח לא רואה)`}
            className="w-full mt-2 text-xs rounded-lg px-2.5 py-1.5 border border-line bg-white outline-none resize-none"
          />
          {savingNotes && <p className="text-[10px] text-ink-soft mt-0.5">שומר...</p>}
        </>
      )}
    </div>
  );
}

function FilmStrip({
  stageDescriptors,
  stages,
  curIdx,
  onToggle,
  onUndo,
  onSendWhatsApp,
  albumDesignFilename,
  uploadingAlbumDesign,
  albumUploadProgress,
  onUploadAlbumDesign,
  pendingStageKeys,
}: {
  stageDescriptors: StageDescriptor[];
  stages: EventStageRow[];
  curIdx: number;
  onToggle: (key: string) => void;
  onUndo: (key: string) => void;
  onSendWhatsApp: (key: string, label: string) => void;
  albumDesignFilename: string | null;
  uploadingAlbumDesign: boolean;
  albumUploadProgress: number | null;
  onUploadAlbumDesign: (key: string, file: File) => void;
  pendingStageKeys: Set<string>;
}) {
  const byKey = new Map(stages.map((s) => [s.stage_key ?? `custom:${s.custom_stage_id}`, s]));

  return (
    <div className="space-y-1.5">
      {stageDescriptors.map((d, i) => {
        // A descriptor with no matching row (missing event_stages data — shouldn't happen, but a
        // hard crash on the whole page is a much worse failure mode than one skipped row) is
        // simply skipped rather than crashing the entire timeline via a non-null assertion.
        const st = byKey.get(d.key);
        if (!st) return null;
        const isCurrent = i === curIdx;
        const requiresAlbumPdf = d.requiresAlbumPdf;
        const isTogglePending = pendingStageKeys.has(d.key);
        const isNotifyPending = pendingStageKeys.has(`notify:${d.key}`);
        // Stages can be marked done in any order — clients often pick photos before songs for
        // the clip, etc. "current" is only a suggestion for what's typically next, never a lock.
        // A stage requiring an album-design PDF can't be toggled directly from the header until a
        // PDF exists — for the standard "אישור עיצוב אלבום" checkpoint specifically, uploading no
        // longer auto-completes it (the client confirms via their portal), so once a file has been
        // attached the toggle opens up for a manual override too.
        const canUndo = st.done && d.key !== "event_closing";
        const albumPdfAttached = d.key === "album_approval" && !!albumDesignFilename;
        const disabled = d.key === "event_closing" || (requiresAlbumPdf && !st.done && !albumPdfAttached) || isTogglePending;

        return (
          <div
            key={d.key}
            className="rounded-xl overflow-hidden"
            style={{
              border: `1px solid ${st.done ? "#CFE0D1" : isCurrent ? "#E9D8AF" : "var(--color-line)"}`,
              boxShadow: isCurrent ? "var(--shadow-card, 0 1px 2px rgba(28, 27, 25, 0.04))" : "none",
            }}
          >
            <button
              disabled={disabled}
              onClick={() => onToggle(d.key)}
              className="w-full flex items-center gap-3 px-3.5 py-3 text-right disabled:cursor-not-allowed"
              style={{
                background: st.done ? "var(--color-sage-bg)" : isCurrent ? "var(--color-chip-tint)" : "var(--color-chip)",
              }}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs"
                style={{
                  background: st.done ? "var(--color-sage)" : isCurrent ? "var(--color-amber)" : "var(--color-input-bg)",
                  border: `1px solid ${st.done ? "var(--color-sage)" : isCurrent ? "var(--color-amber)" : "var(--color-line)"}`,
                  color: st.done ? "#fff" : isCurrent ? "var(--color-on-accent)" : "var(--color-ink-soft)",
                }}
              >
                {st.done ? "✓" : i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{d.label}</span>
                <span className="block text-[11px] text-ink-soft font-data">
                  {d.isCheckpoint ? "מול הלקוח" : "שלב פנימי"}
                  {st.done_at ? `, ${new Date(st.done_at).toLocaleDateString("he-IL")}` : ""}
                  {requiresAlbumPdf && st.done && albumDesignFilename ? `, ${albumDesignFilename}` : ""}
                </span>
              </span>
              {isCurrent && !st.done && !requiresAlbumPdf && (
                <span className="text-[10px] px-2.5 py-1 rounded-full shrink-0 bg-amber text-white">
                  לסמן בוצע
                </span>
              )}
            </button>
            {requiresAlbumPdf && !st.done && (
              <div className="border-t border-line px-3.5 py-3 bg-white album-upload-panel">
                {albumPdfAttached && !uploadingAlbumDesign && (
                  <p className="text-[11px] mb-1.5 text-center" style={{ color: "var(--color-sage)" }}>
                    {albumDesignFilename}, נשלח, ממתין לאישור הלקוח
                  </p>
                )}
                <label
                  className="flex items-center justify-center gap-1.5 text-xs font-medium py-2.5 rounded-lg cursor-pointer"
                  style={{
                    background: uploadingAlbumDesign ? "var(--color-line)" : "var(--color-amber)",
                    color: "#fff",
                    pointerEvents: uploadingAlbumDesign ? "none" : "auto",
                  }}
                >
                  {uploadingAlbumDesign
                    ? `מעלה... ${albumUploadProgress ?? 0}%`
                    : albumPdfAttached
                      ? "החלפת קובץ PDF"
                      : "העלאת קובץ PDF עם עיצוב האלבום"}
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    disabled={uploadingAlbumDesign}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onUploadAlbumDesign(d.key, file);
                      e.target.value = "";
                    }}
                  />
                </label>
                {uploadingAlbumDesign && (
                  <div className="h-1.5 rounded-full mt-2 overflow-hidden bg-line">
                    <div
                      className="h-1.5 rounded-full"
                      style={{ width: `${albumUploadProgress ?? 0}%`, background: "var(--color-amber)", transition: "width 150ms ease" }}
                    />
                  </div>
                )}
                <p className="text-[11px] text-ink-soft mt-1.5 text-center">
                  {d.key === "album_approval"
                    ? "לאחר ההעלאה הקובץ יישלח ללקוח בוואטסאפ, והלקוח יוכל לאשר את העיצוב דרך הפורטל שלו (או שאפשר לסמן כבוצע ידנית כאן)"
                    : "לאחר ההעלאה הקובץ יישלח אוטומטית ללקוח בוואטסאפ והשלב יסומן כבוצע"}
                </p>
              </div>
            )}
            {st.done && (
              <div className="flex border-t border-line">
                <div className="flex-1">
                  <SendUpdateButton onSend={() => onSendWhatsApp(d.key, d.label)} pending={isNotifyPending} />
                </div>
                {canUndo && (
                  <button
                    onClick={() => onUndo(d.key)}
                    disabled={isTogglePending}
                    className="flex items-center justify-center gap-1.5 text-xs font-medium px-3.5 shrink-0 bg-white text-rose border-r border-line disabled:opacity-50"
                  >
                    ↺ ביטול סימון
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NavAppSheet({ location, onClose }: { location: string; onClose: () => void }) {
  const encoded = encodeURIComponent(location);
  const entered = useModalEntered();
  const apps = [
    { key: "waze", label: "Waze", url: `https://waze.com/ul?q=${encoded}&navigate=yes` },
    { key: "gmaps", label: "Google Maps", url: `https://www.google.com/maps/search/?api=1&query=${encoded}` },
  ];
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        background: "rgba(28, 27, 25, 0.45)",
        backdropFilter: entered ? "blur(16px)" : "blur(0px)",
        WebkitBackdropFilter: entered ? "blur(16px)" : "blur(0px)",
        transition: "backdrop-filter 280ms ease, -webkit-backdrop-filter 280ms ease",
      }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-display">ניווט אל האירוע</h2>
          <button
            onClick={onClose}
            className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
          >
            <IconClose className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs mb-4 text-ink-soft">{location}</p>
        <div className="space-y-2">
          {apps.map((a) => (
            <a
              key={a.key}
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={onClose}
              className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium bg-white border border-line"
            >
              {a.label} ←
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
