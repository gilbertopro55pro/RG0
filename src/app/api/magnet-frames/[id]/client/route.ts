import { NextResponse } from "next/server";
import { requireDesignToolsUser } from "@/lib/designTools";
import { clientLangFor } from "@/lib/clientLang";
import { shortClientUrl } from "@/lib/shortLinks";
import { SITE_URL } from "@/lib/siteUrl";
import {
  PORTAL_MAGNETS_ANCHOR,
  clientGreetingName,
  magnetApprovalMessage,
  magnetApprovalStatus,
  magnetApprovalSubject,
  type MagnetApprovalFields,
  type MagnetClientInfo,
} from "@/lib/magnetApproval";
import type { EventRow } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type EventPick = Pick<EventRow, "id" | "client_name" | "client_phone" | "client_email" | "client_lang" | "client_access_token">;

// The frame's client approval (stage 3): the status, the client's comment, and what sending it to
// the client takes (the linked event's client, the portal's short link, the message ready in the
// client's language). For the editor's approval bar and the list's "שליחה ללקוח לאישור".
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireDesignToolsUser();
  if (!auth) return NextResponse.json({ error: "אין הרשאה" }, { status: 403 });
  const { supabase, userId } = auth;
  if (!UUID.test(id)) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });

  const { data: design } = await supabase
    .from("magnet_frame_designs")
    .select("id, event_id, updated_at, client_shared_at, client_approved_at, client_comment, client_comment_at")
    .eq("id", id)
    .eq("photographer_id", userId)
    .maybeSingle<MagnetApprovalFields & { id: string; event_id: string | null }>();
  if (!design) return NextResponse.json({ error: "העיצוב לא נמצא" }, { status: 404 });

  const [{ data: event }, { data: photographer }] = await Promise.all([
    design.event_id
      ? supabase
          .from("events")
          .select("id, client_name, client_phone, client_email, client_lang, client_access_token")
          .eq("id", design.event_id)
          .eq("photographer_id", userId)
          .maybeSingle<EventPick>()
      : Promise.resolve({ data: null as EventPick | null }),
    supabase.from("photographers").select("name, email, whatsapp_signature").eq("id", userId).maybeSingle<{ name: string | null; email: string | null; whatsapp_signature: string | null }>(),
  ]);

  const lang = event ? clientLangFor(photographer?.email, event.client_lang) : "he";
  const portalUrl = event ? `${shortClientUrl(SITE_URL, "portal", event.client_access_token)}#${PORTAL_MAGNETS_ANCHOR}` : null;
  const info: MagnetClientInfo = {
    status: magnetApprovalStatus(design),
    sharedAt: design.client_shared_at,
    approvedAt: design.client_approved_at,
    comment: design.client_comment,
    commentAt: design.client_comment_at,
    client: event
      ? {
          eventId: event.id,
          name: event.client_name,
          firstName: clientGreetingName(event.client_name),
          phone: event.client_phone?.trim() || null,
          email: event.client_email?.trim() || null,
          lang,
        }
      : null,
    portalUrl,
    message:
      event && portalUrl
        ? magnetApprovalMessage({ clientName: event.client_name, link: portalUrl, signature: photographer?.whatsapp_signature, senderName: photographer?.name, lang })
        : null,
    subject: magnetApprovalSubject(lang),
  };
  return NextResponse.json(info);
}
