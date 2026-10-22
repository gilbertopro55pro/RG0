"use client";

import ToneTag from "@/components/ToneTag";
import type { Tone } from "@/lib/tones";
import type { MagnetApprovalStatus } from "@/lib/magnetApproval";
import { useT } from "@/i18n/client";

// Where a magnet frame stands with the client (stage 3): on the frames list, the editor's approval
// bar and the event page. Nothing for a frame that wasn't sent. The color says it: waiting on the
// client honey, approved green, a comment or a change after the approval (both need the
// photographer) red.
const LOOK: Record<Exclude<MagnetApprovalStatus, "not_shared">, { label: string; tone: Tone; legacy: { background: string; color: string } }> = {
  waiting: { label: "ממתין לאישור הלקוח", tone: "pending", legacy: { background: "var(--color-amber-bg)", color: "var(--color-amber-deep)" } },
  approved: { label: "הלקוח אישר", tone: "paid", legacy: { background: "var(--color-sage-bg)", color: "var(--color-sage)" } },
  comment: { label: "הערה מהלקוח", tone: "attention", legacy: { background: "var(--color-rose-bg)", color: "var(--color-rose)" } },
  changed_after_approval: { label: "שונה אחרי שהלקוח אישר", tone: "attention", legacy: { background: "var(--color-rose-bg)", color: "var(--color-rose)" } },
};

export default function MagnetApprovalChip({ status, title, className = "" }: { status: MagnetApprovalStatus; title?: string; className?: string }) {
  const t = useT();
  if (status === "not_shared") return null;
  const look = LOOK[status];
  return (
    <ToneTag
      tone={look.tone}
      title={title ?? (status === "changed_after_approval" ? t("שיניתם את המסגרת אחרי שהלקוח אישר. כדאי לשלוח לו אותה שוב לאישור.") : undefined)}
      className={`whitespace-nowrap ${className}`}
      legacyClassName={`inline-block whitespace-nowrap text-[11px] font-semibold px-2 py-0.5 rounded-full ${className}`}
      legacyStyle={look.legacy}
    >
      {t(look.label)}
    </ToneTag>
  );
}
