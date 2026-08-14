"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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
import ContractSection from "@/components/ContractSection";
import PortalLinkSection from "@/components/PortalLinkSection";
import GallerySection from "@/components/GallerySection";
import { useModalEntered } from "@/lib/useModalEntered";

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
}) {
  const router = useRouter();
  const supabase = createClient();
  const [stages, setStages] = useState(initialStages);
  const [notifications, setNotifications] = useState(initialNotifications);
  const [payments, setPayments] = useState(initialPayments);
  const [assignedIds, setAssignedIds] = useState(new Set(initialAssignedTeamMemberIds));
  const [showNav, setShowNav] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
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
      await refreshNotifications();
      if (done && key === "final_delivery" && isOwner) setShowReviewPrompt(true);
    } finally {
      pendingKeysRef.current.delete(key);
      setPendingStageKeys(new Set(pendingKeysRef.current));
    }
  };

  const toggleStage = (key: string) => setStageDone(key, true);
  const undoStage = (key: string) => setStageDone(key, false);

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

  const sendWhatsAppUpdate = async (key: string) => {
    const guardKey = `notify:${key}`;
    if (pendingKeysRef.current.has(guardKey)) return;
    pendingKeysRef.current.add(guardKey);
    setPendingStageKeys(new Set(pendingKeysRef.current));
    setError(null);
    try {
      const res = await fetch(`/api/events/${event.id}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parseStageKey(key)),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "שגיאה בשליחת ההודעה");
      await refreshNotifications();
    } finally {
      pendingKeysRef.current.delete(guardKey);
      setPendingStageKeys(new Set(pendingKeysRef.current));
    }
  };

  const togglePayment = async (field: "deposit_paid" | "balance_paid") => {
    if (!payments) return;
    const nextValue = !payments[field];
    const paidAtField = field === "deposit_paid" ? "deposit_paid_at" : "balance_paid_at";
    const paidAtValue = nextValue ? new Date().toISOString() : null;
    const { error: updateError } = await supabase
      .from("event_payments")
      .update({ [field]: nextValue, [paidAtField]: paidAtValue })
      .eq("event_id", event.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setPayments({ ...payments, [field]: nextValue, [paidAtField]: paidAtValue });
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
      <div className="flex items-center justify-between mb-5">
        <Link href="/" className="flex items-center gap-1 text-sm tracking-wide text-ink-soft">
          ← חזרה לאירועים
        </Link>
        {isOwner && (
          <button onClick={() => setShowEdit(true)} className="text-sm text-amber-deep underline">
            עריכת פרטי האירוע
          </button>
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
            background: "rgba(46,49,66,0.45)",
            backdropFilter: reviewPromptEntered ? "blur(16px)" : "blur(0px)",
            WebkitBackdropFilter: reviewPromptEntered ? "blur(16px)" : "blur(0px)",
            transition: "backdrop-filter 280ms ease, -webkit-backdrop-filter 280ms ease",
          }}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet">
            <h2 className="text-lg font-bold mb-2 font-display">האירוע נמסר! 🎉</h2>
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
      <h1 className="text-[26px] font-bold mb-1.5 font-display">{event.client_name}</h1>
      <div className="flex items-center gap-3 text-xs mb-4 flex-wrap text-ink-soft">
        <span>{new Date(event.event_date).toLocaleDateString("he-IL")}</span>
        <span>{packageLabel(event.package, customPackageName)}</span>
        {event.client_phone && <span className="font-data">📱 {event.client_phone}</span>}
      </div>

      {(event.event_location || event.arrival_time) && (
        <div className="rounded-xl px-3.5 py-2.5 mb-4 text-xs flex flex-wrap gap-x-4 gap-y-1.5 bg-[#F1EFE9] text-ink-soft">
          {event.event_location && (
            <button onClick={() => setShowNav(true)} className="underline decoration-dotted text-amber-deep">
              📍 {event.event_location}
            </button>
          )}
          {event.arrival_time && <span>🕐 הגעה לצילומי משפחה: {event.arrival_time.slice(0, 5)}</span>}
        </div>
      )}
      {showNav && event.event_location && (
        <NavAppSheet location={event.event_location} onClose={() => setShowNav(false)} />
      )}

      {event.notes && (
        <div className="rounded-xl px-3.5 py-2.5 mb-4 text-xs bg-[#F1EFE9] text-ink-soft whitespace-pre-wrap">
          📝 {event.notes}
        </div>
      )}

      {error && <p className="text-xs text-rose mb-3">{error}</p>}

      {isOwner && payments && (
        <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
          <div className="flex items-center gap-2 mb-3.5">
            <span className="text-sm font-semibold tracking-wide">תשלומים</span>
          </div>
          {payments.deposit_amount === 0 && payments.balance_amount === 0 && (
            <div className="rounded-xl px-3.5 py-2.5 mb-2 text-xs bg-amber-bg text-amber-deep">
              טרם הוגדר מחיר לאירוע — לחצו על &quot;עריכת פרטי האירוע&quot; למעלה כדי להוסיף מקדמה ויתרה.
            </div>
          )}
          <div className="space-y-2">
            <button
              onClick={() => togglePayment("deposit_paid")}
              className="w-full flex items-center justify-between text-sm rounded-xl px-3.5 py-2.5"
              style={{ background: payments.deposit_paid ? "var(--color-sage-bg)" : "var(--color-chip)" }}
            >
              <span>מקדמה — ₪{payments.deposit_amount}</span>
              <span style={{ color: payments.deposit_paid ? "var(--color-sage)" : "var(--color-ink-soft)", fontWeight: 600 }}>
                {payments.deposit_paid ? "שולם ✓" : "ממתין"}
              </span>
            </button>
            <button
              onClick={() => togglePayment("balance_paid")}
              className="w-full flex items-center justify-between text-sm rounded-xl px-3.5 py-2.5"
              style={{ background: payments.balance_paid ? "var(--color-sage-bg)" : "var(--color-chip)" }}
            >
              <span>יתרה — ₪{payments.balance_amount}</span>
              <span style={{ color: payments.balance_paid ? "var(--color-sage)" : "var(--color-ink-soft)", fontWeight: 600 }}>
                {payments.balance_paid
                  ? "שולם ✓"
                  : payments.balance_due_date
                    ? `עד ${new Date(payments.balance_due_date).toLocaleDateString("he-IL")}`
                    : "ממתין"}
              </span>
            </button>
          </div>
        </div>
      )}

      {isOwner && (
        <PortalLinkSection
          token={event.client_access_token}
          eventId={event.id}
          hasClientPhone={!!event.client_phone}
          onSent={refreshNotifications}
        />
      )}

      {isOwner && (
        <GallerySection
          eventId={event.id}
          initialGallery={initialGallery}
          photoCount={galleryPhotoCount}
          coverUrl={galleryCoverUrl}
        />
      )}

      {isOwner && <ContractSection eventId={event.id} initialContract={initialContract} />}

      {isOwner && teamMembers.length > 0 && (
        <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
          <div className="flex items-center gap-2 mb-3.5">
            <span className="text-sm font-semibold tracking-wide">צוות משוייך לאירוע</span>
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

      <div className="mb-2.5 text-sm font-semibold tracking-wide">מסלול התהליך</div>
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

      <div className="mt-7">
        <div className="flex items-center gap-2 mb-3.5">
          <span className="text-sm font-semibold tracking-wide">יומן התראות</span>
        </div>
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className="text-xs rounded-xl px-3.5 py-2.5 bg-chip text-ink-soft">
              {n.text}{" "}
              <span className="font-data">
                · {new Date(n.created_at).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}
              </span>
            </div>
          ))}
        </div>
      </div>
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
  onSendWhatsApp: (key: string) => void;
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
        const st = byKey.get(d.key)!;
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
              boxShadow: isCurrent ? "var(--shadow-card, 0 1px 2px rgba(46,49,66,0.04))" : "none",
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
                  background: st.done ? "var(--color-sage)" : isCurrent ? "var(--color-amber)" : "#fff",
                  border: `1px solid ${st.done ? "var(--color-sage)" : isCurrent ? "var(--color-amber)" : "var(--color-line)"}`,
                  color: st.done || isCurrent ? "#fff" : "var(--color-ink-soft)",
                }}
              >
                {st.done ? "✓" : i + 1}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate">{d.label}</span>
                <span className="block text-[11px] tracking-wide text-ink-soft font-data">
                  {d.isCheckpoint ? "מול הלקוח" : "שלב פנימי"}
                  {st.done_at ? ` · ${new Date(st.done_at).toLocaleDateString("he-IL")}` : ""}
                  {requiresAlbumPdf && st.done && albumDesignFilename ? ` · ${albumDesignFilename}` : ""}
                </span>
              </span>
              {isCurrent && !st.done && !requiresAlbumPdf && (
                <span className="text-[10px] px-2.5 py-1 rounded-full shrink-0 tracking-wide bg-amber text-white">
                  לסמן בוצע
                </span>
              )}
            </button>
            {requiresAlbumPdf && !st.done && (
              <div className="border-t border-line px-3.5 py-3 bg-white album-upload-panel">
                {albumPdfAttached && !uploadingAlbumDesign && (
                  <p className="text-[11px] mb-1.5 text-center" style={{ color: "var(--color-sage)" }}>
                    📄 {albumDesignFilename} — נשלח, ממתין לאישור הלקוח
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
                  <SendUpdateButton onSend={() => onSendWhatsApp(d.key)} pending={isNotifyPending} />
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

function SendUpdateButton({ onSend, pending }: { onSend: () => void; pending: boolean }) {
  const [sent, setSent] = useState(false);
  return (
    <button
      // `disabled={pending}` is the real guard against a duplicate WhatsApp send from a rapid
      // double-tap — it's driven by the actual fetch still being in flight, not just a cosmetic
      // timer. `sent` below is purely the "✓ sent" flash after it resolves.
      disabled={pending}
      onClick={() => {
        onSend();
        setSent(true);
        setTimeout(() => setSent(false), 2000);
      }}
      className={`whatsapp-update-btn w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2.5 disabled:opacity-60${sent ? " whatsapp-update-btn--sent" : ""}`}
      style={{ background: sent ? "var(--color-sage)" : "#fff", color: sent ? "#fff" : "var(--color-sage)" }}
    >
      {pending ? "שולח..." : sent ? "העדכון נשלח ✓" : "שליחת עדכון ללקוח בוואטסאפ"}
    </button>
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
        background: "rgba(46,49,66,0.45)",
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
            ✕
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
