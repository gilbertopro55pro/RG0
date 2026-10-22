import type { Lang } from "@/i18n/config";

// The client approves a magnet frame in the portal (stage 3 of the magnet tool, owner 2026-10-22),
// like the album design: the photographer sends the portal link, the client sees the frames of their
// event there and approves, or leaves a comment (a comment means changes are wanted). The columns
// are on magnet_frame_designs (migration 0191). Client-safe: no server imports.

export type MagnetApprovalStatus = "not_shared" | "waiting" | "approved" | "comment" | "changed_after_approval";

export type MagnetApprovalFields = {
  client_shared_at: string | null;
  client_approved_at: string | null;
  client_comment: string | null;
  client_comment_at: string | null;
  // Moved only by the editor's save (POST /api/magnet-frames), never by a rename, a link or a share.
  updated_at: string;
};

function ms(iso: string | null | undefined): number | null {
  const n = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(n) ? n : null;
}

// Where the frame stands with the client:
// - not_shared: the client doesn't see it in the portal.
// - waiting: shared, no answer yet (or sent again after the client's comment).
// - approved: the client approved this very design.
// - comment: the client asked for a change, and the frame wasn't sent again since.
// - changed_after_approval: the photographer edited the frame after the client approved it.
export function magnetApprovalStatus(row: MagnetApprovalFields): MagnetApprovalStatus {
  const shared = ms(row.client_shared_at);
  if (shared === null) return "not_shared";
  const approved = ms(row.client_approved_at);
  if (approved !== null) {
    const updated = ms(row.updated_at);
    return updated !== null && updated > approved ? "changed_after_approval" : "approved";
  }
  const commented = ms(row.client_comment_at);
  if (row.client_comment?.trim() && commented !== null && commented >= shared) return "comment";
  return "waiting";
}

// What sending the frame to the client writes (PATCH shareWithClient: true): shared now. An approval
// of an older version doesn't count for the new one, so a frame edited after the approval goes back
// to waiting; an approval of this very design stays (sending it again is only a reminder). The
// client's comment stays on the row, and the new share time puts it behind ("waiting" again).
export function shareWithClientPatch(row: MagnetApprovalFields, nowIso: string): { client_shared_at: string; client_approved_at?: null } {
  return magnetApprovalStatus(row) === "changed_after_approval" ? { client_shared_at: nowIso, client_approved_at: null } : { client_shared_at: nowIso };
}

// A frame moved to another event (or unlinked) isn't shared with anyone: its approval and comment
// belonged to the other event's client.
export const CLEARED_CLIENT_APPROVAL = { client_shared_at: null, client_approved_at: null, client_comment: null, client_comment_at: null } as const;

export const MAGNET_COMMENT_MAX = 1000;

// The portal's request: { action: "approve" } or { action: "comment", text } (trimmed, 1–1000
// characters). null = not a valid request.
export type PortalMagnetAction = { action: "approve" } | { action: "comment"; text: string };
export function parsePortalMagnetAction(body: unknown): PortalMagnetAction | null {
  if (!body || typeof body !== "object") return null;
  const b = body as { action?: unknown; text?: unknown };
  if (b.action === "approve") return { action: "approve" };
  if (b.action === "comment" && typeof b.text === "string") {
    const text = b.text.trim();
    if (text.length === 0 || text.length > MAGNET_COMMENT_MAX) return null;
    return { action: "comment", text };
  }
  return null;
}

// The name the message opens with: the first name ("דנה כהן" → "דנה"), but a couple or a family
// keeps the whole name ("רותם ודניאל", "Rotem & Daniel", "משפחת לוי"): "שלום רותם" would leave the
// other one out. A whole name is never wrong, only less personal.
export function clientGreetingName(clientName: string): string {
  const name = clientName.trim().replace(/\s+/g, " ");
  const words = name.split(" ");
  if (words.length < 2) return name;
  const together = words.slice(1).some((w) => /^ו\S/.test(w) || /^(&|\+|and|и)$/i.test(w)) || /^משפחת$/.test(words[0]) || /^(the|family)$/i.test(words[0]);
  return together ? name : words[0];
}

const TEXT: Record<Lang, { body: string; subject: string }> = {
  he: {
    body: "שלום {name},\nעיצוב המגנטים לאירוע מוכן. אפשר לראות ולאשר אותו כאן:\n{link}",
    subject: "עיצוב המגנטים לאירוע",
  },
  en: {
    body: "Hi {name},\nThe magnet design for your event is ready. You can see and approve it here:\n{link}",
    subject: "Your magnet design",
  },
  ru: {
    body: "Здравствуйте, {name}!\nДизайн магнитов для вашего мероприятия готов. Посмотреть и утвердить его можно здесь:\n{link}",
    subject: "Дизайн магнитов",
  },
};

// The message to the client, in the client's language, signed like every other client message: the
// photographer's signature, or their name without one, never both (lib/paymentReminder.ts).
export function magnetApprovalMessage(p: {
  clientName: string;
  link: string;
  signature: string | null | undefined;
  senderName: string | null | undefined;
  lang: Lang;
}): string {
  const body = TEXT[p.lang].body.replace("{name}", clientGreetingName(p.clientName)).replace("{link}", p.link);
  const signature = p.signature?.trim() || p.senderName?.trim();
  return signature ? `${body}\n\n${signature}` : body;
}

export function magnetApprovalSubject(lang: Lang): string {
  return TEXT[lang].subject;
}

// The portal section's anchor: the link in the message opens the portal right on the magnets.
export const PORTAL_MAGNETS_ANCHOR = "magnets";

// GET /api/magnet-frames/<id>/client: what the editor's approval bar and the list's "send to the
// client" need.
export type MagnetClientInfo = {
  status: MagnetApprovalStatus;
  sharedAt: string | null;
  approvedAt: string | null;
  comment: string | null;
  commentAt: string | null;
  // The linked event's client; null when the frame has no event.
  client: { eventId: string; name: string; firstName: string; phone: string | null; email: string | null; lang: Lang } | null;
  portalUrl: string | null;
  // The prefilled message, null without an event.
  message: string | null;
  subject: string;
};
