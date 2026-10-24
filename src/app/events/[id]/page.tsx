import type { Photographer } from "@/lib/types";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type {
  ClientMessageTemplateRow,
  CustomPackageStageRow,
  EventContractRow,
  EventNotificationRow,
  EventPaymentRow,
  EventRow,
  EventStageRow,
  GalleryPhotoRow,
  GalleryRow,
  TeamMember,
} from "@/lib/types";
import EventDetailView, { type EventMagnetFrame } from "@/components/EventDetailView";
import { getSignedDownloadUrl } from "@/lib/storage";
import { hasAppAccess } from "@/lib/subscription";
import { designToolsAllowed } from "@/lib/designTools";
import { canChooseClientLang, clientLangFor } from "@/lib/clientLang";
import { eventQuoteHistoryId, type EventQuote } from "@/lib/eventQuote";
import type { LeadQuoteDetails } from "@/lib/leadQuote";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getSessionUser();
  const serviceRole = createServiceRoleClient();

  // The whole page in one round trip (it used to be up to six, one after another). The owner-only
  // queries start right away as well and are dropped below for a team member; RLS scopes each of
  // them to the caller anyway.
  const [
    { data: eventRow },
    { data: stages },
    { data: notifications },
    { data: messageTemplates },
    { data: ownerRow },
    { data: allTeamMembers },
    { data: assignees },
    { data: paymentsRow },
    { data: contractRow },
    { data: galleryRow },
    { data: quoteLead },
    { data: magnetFrameRows },
  ] = await Promise.all([
    // The custom package's name and stages embedded (custom_package_id was only known after this
    // query, so they were a second round).
    supabase
      .from("events")
      .select("*, custom_packages(name, custom_package_stages(*))")
      .eq("id", id)
      .single<EventRow & { custom_packages: { name: string; custom_package_stages: CustomPackageStageRow[] } | null }>(),
    supabase
      .from("event_stages")
      .select("*")
      .eq("event_id", id)
      .order("stage_order", { ascending: true })
      .returns<EventStageRow[]>(),
    supabase
      .from("event_notifications")
      .select("*")
      .eq("event_id", id)
      .order("created_at", { ascending: false })
      .returns<EventNotificationRow[]>(),
    // RLS scopes this to the photographer's own templates, or (via team_members) the templates of
    // the photographer a team-member account is assigned to — no explicit filter needed here.
    supabase.from("client_message_templates").select("*").returns<ClientMessageTemplateRow[]>(),
    // Service-role, not the caller's own client: a team-member viewer can't read the owning
    // photographer's row under RLS (photographers_select_own), but still needs their signature to
    // send an on-brand client update. Just these fields, read-only, through the event id, and used
    // only once the event itself was read under RLS above (anyone else gets notFound first).
    serviceRole
      .from("events")
      .select("photographers(name, email, plan, whatsapp_signature, subscription_status, trial_ends_at)")
      .eq("id", id)
      .maybeSingle<{
        photographers:
          | ({ name: string | null; email: string | null; whatsapp_signature: string | null } & Pick<Photographer, "plan" | "subscription_status" | "trial_ends_at">)
          | null;
      }>(),
    supabase.from("team_members").select("*").order("created_at", { ascending: true }).returns<TeamMember[]>(),
    supabase.from("event_assignees").select("team_member_id").eq("event_id", id).returns<{ team_member_id: string }[]>(),
    supabase.from("event_payments").select("*").eq("event_id", id).maybeSingle<EventPaymentRow>(),
    supabase
      .from("event_contracts")
      .select("*")
      .eq("event_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<EventContractRow>(),
    // The gallery with its photo count and its cover (the chosen one through its own key, and the
    // first photo by order as the fallback), not every photo row of it.
    supabase
      .from("galleries")
      .select(
        "*, photo_count:gallery_photos!gallery_photos_gallery_id_fkey(count), cover:gallery_photos!galleries_cover_photo_fk(id, gallery_id, storage_path), first_photo:gallery_photos!gallery_photos_gallery_id_fkey(id, storage_path)"
      )
      .eq("event_id", id)
      .order("sort_order", { referencedTable: "first_photo", ascending: true, nullsFirst: false })
      .limit(1, { referencedTable: "first_photo" })
      .maybeSingle<
        GalleryRow & {
          photo_count: { count: number }[];
          cover: Pick<GalleryPhotoRow, "id" | "gallery_id" | "storage_path"> | null;
          first_photo: Pick<GalleryPhotoRow, "id" | "storage_path">[];
        }
      >(),
    // The quote the event was booked from (owner, 2026-10-22): the lead that closed into it, with
    // its quote history rows embedded.
    supabase
      .from("leads")
      .select("id, quote_token, quote_details, quoted_amount, quote_sent_at, quote_approved_at, quote_history(id, created_at, details)")
      .eq("converted_event_id", id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{
        id: string;
        quote_token: string | null;
        quote_details: LeadQuoteDetails | null;
        quoted_amount: number | null;
        quote_sent_at: string | null;
        quote_approved_at: string | null;
        quote_history: { id: string; created_at: string; details: { createdAt?: string } | null }[];
      }>(),
    // The magnet frames linked to this event (פרו / פרו+ only, like the tool itself, checked below).
    supabase
      .from("magnet_frame_designs")
      .select("id, name, updated_at, client_shared_at, client_approved_at, client_comment, client_comment_at")
      .eq("event_id", id)
      .order("updated_at", { ascending: false })
      .returns<EventMagnetFrame[]>(),
  ]);

  if (!eventRow) notFound();
  const { custom_packages: customPackage, ...event } = eventRow;

  const photographerSignatureRow = ownerRow?.photographers ?? null;
  const whatsappSignature = photographerSignatureRow?.whatsapp_signature ?? null;
  const senderName = photographerSignatureRow?.name ?? null;
  // The language of the client update messages (UI languages phase 3): the event owner's account
  // decides, so a team member sends the same language the owner would.
  const clientMessageLang = clientLangFor(photographerSignatureRow?.email, event.client_lang);
  // Owner or team member alike: no access once the owning account's subscription/trial lapsed.
  if (photographerSignatureRow && !hasAppAccess(photographerSignatureRow)) redirect("/billing");

  // Opening the event is what "reading" the progress badge means — clear any unread client-action
  // notifications so the dashboard badge reflects that the photographer has seen them. After the
  // response, not before it: only the ids read above under the caller's RLS (the owner or an
  // assigned team member, both allowed to update them), so the service role changes nothing more.
  const unreadIds = (notifications ?? []).filter((n) => n.is_client_action && !n.read_at).map((n) => n.id);
  if (unreadIds.length > 0) {
    after(async () => {
      await serviceRole.from("event_notifications").update({ read_at: new Date().toISOString() }).eq("event_id", id).in("id", unreadIds);
    });
  }

  // custom_package_stages has no order inside the embed; by sort_order as before.
  const customStages: CustomPackageStageRow[] = event.custom_package_id
    ? [...(customPackage?.custom_package_stages ?? [])].sort((a, b) => a.sort_order - b.sort_order)
    : [];
  const customPackageName: string | null = event.custom_package_id ? (customPackage?.name ?? null) : null;

  const isOwner = event.photographer_id === user!.id;

  let teamMembers: TeamMember[] = [];
  let assignedTeamMemberIds: string[] = [];
  let payments: EventPaymentRow | null = null;
  let contract: EventContractRow | null = null;
  let gallery: GalleryRow | null = null;
  let galleryPhotoCount = 0;
  let galleryCoverUrl: string | null = null;
  let eventQuote: EventQuote | null = null;
  if (isOwner) {
    if (quoteLead && (quoteLead.quote_details || quoteLead.quote_sent_at)) {
      eventQuote = {
        leadId: quoteLead.id,
        token: quoteLead.quote_token,
        details: quoteLead.quote_details,
        amount: quoteLead.quoted_amount,
        sentAt: quoteLead.quote_sent_at,
        approvedAt: quoteLead.quote_approved_at,
        historyId: eventQuoteHistoryId(quoteLead.quote_history ?? [], quoteLead.quote_details),
      };
    }
    teamMembers = allTeamMembers ?? [];
    assignedTeamMemberIds = assignees?.map((a) => a.team_member_id) ?? [];
    payments = paymentsRow;
    contract = contractRow;

    if (galleryRow) {
      const { photo_count, cover, first_photo, ...galleryOnly } = galleryRow;
      gallery = galleryOnly;
      galleryPhotoCount = photo_count[0]?.count ?? 0;
      const coverPhoto = cover && cover.gallery_id === galleryOnly.id ? cover : (first_photo[0] ?? null);
      if (coverPhoto) {
        galleryCoverUrl = await getSignedDownloadUrl("galleries", coverPhoto.storage_path, 3600);
      }
    }
  }

  const magnetFrames =
    isOwner && photographerSignatureRow && designToolsAllowed({ email: photographerSignatureRow.email ?? "", plan: photographerSignatureRow.plan })
      ? (magnetFrameRows ?? [])
      : null;

  const messageTemplateMap: Record<string, string> = {};
  for (const row of messageTemplates ?? []) messageTemplateMap[row.stage_key] = row.body;

  return (
    <div className="max-w-md sm:max-w-none sm:w-[85%] lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <EventDetailView
        event={event}
        initialStages={stages ?? []}
        initialNotifications={notifications ?? []}
        isOwner={isOwner}
        teamMembers={teamMembers}
        initialAssignedTeamMemberIds={assignedTeamMemberIds}
        initialPayments={payments}
        initialContract={contract}
        eventQuote={eventQuote}
        magnetFrames={magnetFrames}
        initialGallery={gallery}
        galleryPhotoCount={galleryPhotoCount}
        galleryCoverUrl={galleryCoverUrl}
        customStages={customStages}
        customPackageName={customPackageName}
        messageTemplates={messageTemplateMap}
        whatsappSignature={whatsappSignature}
        senderName={senderName}
        clientMessageLang={clientMessageLang}
        canChooseClientLang={isOwner && canChooseClientLang(user!.email)}
      />
    </div>
  );
}
