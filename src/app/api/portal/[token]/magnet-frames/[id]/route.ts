import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { checkRateLimit, clientIpFrom } from "@/lib/rateLimit";
import { sendEmail } from "@/lib/resend";
import { sendPushToPhotographer } from "@/lib/push";
import { notificationEmailFor } from "@/lib/notificationEmail";
import { photographerLang } from "@/lib/clientLang";
import { PAGE_LINK_TTL, shortPageUrl } from "@/lib/shortFileLinks";
import { magnetApprovalStatus, parsePortalMagnetAction, type MagnetApprovalFields } from "@/lib/magnetApproval";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";
import type { EventRow } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type PortalEvent = Pick<EventRow, "id" | "client_name" | "photographer_id"> & {
  photographers: { name: string | null; email: string | null; ui_lang: string | null } | null;
};
type DesignPick = MagnetApprovalFields & { id: string; name: string | null; event_id: string | null };

// The client approves a magnet frame in the portal, or leaves a comment (stage 3, owner 2026-10-22).
// Anonymous: the event comes from the portal token, and only a frame of that event that the
// photographer shared can be touched. A comment means changes are wanted, so it drops an approval.
// The photographer gets a line in the event's log, a phone notification (owner, 2026-10-23) and an
// email.
export async function POST(request: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  // Each answer emails the photographer; a ceiling per device stops a flood (like album comments).
  const { allowed } = await checkRateLimit(`magnet-approval:${clientIpFrom(request)}`, { maxRequests: 30, windowSeconds: 600 });
  if (!allowed) return NextResponse.json({ error: "יותר מדי בקשות. נסו שוב בעוד כמה דקות" }, { status: 429 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });
  }
  const action = parsePortalMagnetAction(body);
  if (!action) return NextResponse.json({ error: "בקשה לא חוקית" }, { status: 400 });
  if (!UUID.test(id) || !token) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });

  const supabase = createServiceRoleClient();
  const { data: event } = await supabase
    .from("events")
    .select("id, client_name, photographer_id, photographers(name, email, ui_lang)")
    .eq("client_access_token", token)
    .maybeSingle<PortalEvent>();
  if (!event) return NextResponse.json({ error: "הקישור שגוי או שפג תוקפו" }, { status: 404 });

  const { data: design } = await supabase
    .from("magnet_frame_designs")
    .select("id, name, event_id, updated_at, client_shared_at, client_approved_at, client_comment, client_comment_at")
    .eq("id", id)
    .eq("event_id", event.id)
    .eq("photographer_id", event.photographer_id)
    .maybeSingle<DesignPick>();
  if (!design || design.event_id !== event.id || !design.client_shared_at) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });

  const now = new Date().toISOString();
  const before = magnetApprovalStatus(design);
  let fields: MagnetApprovalFields;
  if (action.action === "approve") {
    // Approving the same design twice (a double tap) changes nothing and tells nobody.
    if (before === "approved") return NextResponse.json(answer(design));
    fields = { ...design, client_approved_at: now };
    const { error } = await supabase
      .from("magnet_frame_designs")
      .update({ client_approved_at: now })
      .eq("id", design.id)
      .eq("event_id", event.id)
      .eq("photographer_id", event.photographer_id);
    if (error) return NextResponse.json({ error: "השמירה נכשלה" }, { status: 500 });
  } else {
    if (before === "comment" && design.client_comment?.trim() === action.text) return NextResponse.json(answer(design));
    fields = { ...design, client_approved_at: null, client_comment: action.text, client_comment_at: now };
    const { error } = await supabase
      .from("magnet_frame_designs")
      .update({ client_approved_at: null, client_comment: action.text, client_comment_at: now })
      .eq("id", design.id)
      .eq("event_id", event.id)
      .eq("photographer_id", event.photographer_id);
    if (error) return NextResponse.json({ error: "השמירה נכשלה" }, { status: 500 });
  }

  const frameName = design.name?.trim() ? ` "${design.name.trim()}"` : "";
  await supabase.from("event_notifications").insert({
    event_id: event.id,
    text:
      action.action === "approve"
        ? `${event.client_name} אישרו את עיצוב המגנטים${frameName}`
        : `${event.client_name} השאירו הערה על עיצוב המגנטים${frameName}: ${action.text.length > 300 ? `${action.text.slice(0, 300)}…` : action.text}`,
    is_client_action: true,
  });
  // Every answer, the latest replacing the one before on the phone (one tag per frame).
  await pushPhotographer(event, design, action.action === "approve" ? null : action.text);
  // At most 3 emails per frame in 10 minutes, however many answers come in (the log line is always written).
  const { allowed: mailAllowed } = await checkRateLimit(`magnet-approval-mail:${design.id}`, { maxRequests: 3, windowSeconds: 600 });
  if (mailAllowed) await emailPhotographer(event, design, action.action === "approve" ? null : action.text);

  return NextResponse.json(answer(fields));
}

function answer(f: MagnetApprovalFields) {
  const status = magnetApprovalStatus(f);
  return { ok: true, status, approvedAt: f.client_approved_at, comment: f.client_comment, commentAt: f.client_comment_at };
}

// In the photographer's language: who answered, and the frame's name or the comment. Opens the frame
// in the editor. sendPushToPhotographer never throws.
async function pushPhotographer(event: PortalEvent, design: DesignPick, comment: string | null) {
  const t = makeT(messagesFor(photographerLang(event.photographers?.ui_lang)));
  const vars = { client: event.client_name, frame: design.name?.trim() || t("מסגרת ללא שם") };
  await sendPushToPhotographer(event.photographer_id, {
    title: comment === null ? t("{client} אישרו את עיצוב המגנטים", vars) : t("הערה על עיצוב המגנטים | {client}", vars),
    body: comment === null ? vars.frame : comment.length > 140 ? `${comment.slice(0, 140)}…` : comment,
    url: `/magnet-frames/${design.id}`,
    tag: `magnet-${design.id}`,
  });
}

// In the photographer's language, with a short link to the frame in the editor.
async function emailPhotographer(event: PortalEvent, design: DesignPick, comment: string | null) {
  const p = event.photographers;
  if (!p?.email) return;
  const t = makeT(messagesFor(photographerLang(p.ui_lang)));
  try {
    const link = await shortPageUrl(`/magnet-frames/${design.id}`, { photographerId: event.photographer_id, ttlSeconds: PAGE_LINK_TTL });
    const frame = design.name?.trim() || t("מסגרת ללא שם");
    const vars = { client: event.client_name, frame };
    await sendEmail({
      to: notificationEmailFor(p.email),
      subject: comment === null ? t("{client} אישרו את עיצוב המגנטים", vars) : t("הערה על עיצוב המגנטים | {client}", vars),
      text:
        `${t("שלום {name},", { name: p.name ?? "" })}\n\n` +
        (comment === null ? t("{client} אישרו בפורטל את עיצוב המגנטים \"{frame}\".", vars) : `${t("{client} השאירו בפורטל הערה על עיצוב המגנטים \"{frame}\":", vars)}\n\n${comment}`) +
        `\n\n${t("לפתיחת המסגרת: {link}", { link })}`,
    });
  } catch (e) {
    console.error("[portal magnet-frames] email failed", e);
  }
}
