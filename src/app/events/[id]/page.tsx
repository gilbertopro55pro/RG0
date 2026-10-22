import type { Photographer } from "@/lib/types";
import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: event }, { data: stages }, { data: notifications }, { data: messageTemplates }] = await Promise.all([
    supabase.from("events").select("*").eq("id", id).single<EventRow>(),
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
  ]);

  if (!event) notFound();

  // Service-role, not the caller's own client: a team-member viewer can't read the owning
  // photographer's row under RLS (photographers_select_own), but still needs their signature to
  // send an on-brand client update. Just the one field, read-only.
  const serviceRole = createServiceRoleClient();
  const { data: photographerSignatureRow } = await serviceRole
    .from("photographers")
    .select("name, email, plan, whatsapp_signature, subscription_status, trial_ends_at")
    .eq("id", event.photographer_id)
    .maybeSingle<{ name: string | null; email: string | null; whatsapp_signature: string | null } & Pick<Photographer, "plan" | "subscription_status" | "trial_ends_at">>();
  const whatsappSignature = photographerSignatureRow?.whatsapp_signature ?? null;
  const senderName = photographerSignatureRow?.name ?? null;
  // The language of the client update messages (UI languages phase 3): the event owner's account
  // decides, so a team member sends the same language the owner would.
  const clientMessageLang = clientLangFor(photographerSignatureRow?.email, event.client_lang);
  // Owner or team member alike: no access once the owning account's subscription/trial lapsed.
  if (photographerSignatureRow && !hasAppAccess(photographerSignatureRow)) redirect("/billing");

  // Opening the event is what "reading" the progress badge means — clear any unread client-action
  // notifications now so the dashboard badge reflects that the photographer has seen them.
  const unreadIds = (notifications ?? []).filter((n) => n.is_client_action && !n.read_at).map((n) => n.id);
  if (unreadIds.length > 0) {
    await supabase.from("event_notifications").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
  }

  let customStages: CustomPackageStageRow[] = [];
  let customPackageName: string | null = null;
  if (event.custom_package_id) {
    const [{ data: cs }, { data: cp }] = await Promise.all([
      supabase
        .from("custom_package_stages")
        .select("*")
        .eq("package_id", event.custom_package_id)
        .order("sort_order", { ascending: true })
        .returns<CustomPackageStageRow[]>(),
      supabase.from("custom_packages").select("name").eq("id", event.custom_package_id).maybeSingle<{ name: string }>(),
    ]);
    // Already parallel — kept as two queries rather than an embed on `events` above since
    // custom_package_id is only known after that query resolves.
    customStages = cs ?? [];
    customPackageName = cp?.name ?? null;
  }

  const isOwner = event.photographer_id === user!.id;

  // The magnet frames linked to this event (פרו / פרו+ only, like the tool itself). Started here so
  // it runs alongside the owner queries below.
  const magnetFramesLoad =
    isOwner && photographerSignatureRow && designToolsAllowed({ email: photographerSignatureRow.email ?? "", plan: photographerSignatureRow.plan })
      ? supabase
          .from("magnet_frame_designs")
          .select("id, name, updated_at")
          .eq("event_id", id)
          .order("updated_at", { ascending: false })
          .returns<EventMagnetFrame[]>()
          .then((res) => res.data ?? [])
      : null;

  let teamMembers: TeamMember[] = [];
  let assignedTeamMemberIds: string[] = [];
  let payments: EventPaymentRow | null = null;
  let contract: EventContractRow | null = null;
  let gallery: GalleryRow | null = null;
  let galleryPhotoCount = 0;
  let galleryCoverUrl: string | null = null;
  let eventQuote: EventQuote | null = null;
  if (isOwner) {
    const [{ data: allTeamMembers }, { data: assignees }, { data: paymentsRow }, { data: contractRow }, { data: galleryRow }] =
      await Promise.all([
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
        // Photos embedded directly on the gallery row (one round trip) instead of a separate
        // gallery_photos query keyed by gallery.id afterward.
        supabase
          .from("galleries")
          .select("*, gallery_photos!gallery_photos_gallery_id_fkey(id, storage_path, sort_order)")
          .eq("event_id", id)
          .maybeSingle<GalleryRow & { gallery_photos: Pick<GalleryPhotoRow, "id" | "storage_path" | "sort_order">[] }>(),
      ]);
    // The quote the event was booked from (owner, 2026-10-22): the lead that closed into it.
    const { data: quoteLead } = await supabase
      .from("leads")
      .select("id, quote_token, quote_details, quoted_amount, quote_sent_at, quote_approved_at")
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
      }>();
    if (quoteLead && (quoteLead.quote_details || quoteLead.quote_sent_at)) {
      const { data: historyRows } = await supabase
        .from("quote_history")
        .select("id, created_at, details")
        .eq("lead_id", quoteLead.id)
        .returns<{ id: string; created_at: string; details: { createdAt?: string } | null }[]>();
      eventQuote = {
        leadId: quoteLead.id,
        token: quoteLead.quote_token,
        details: quoteLead.quote_details,
        amount: quoteLead.quoted_amount,
        sentAt: quoteLead.quote_sent_at,
        approvedAt: quoteLead.quote_approved_at,
        historyId: eventQuoteHistoryId(historyRows ?? [], quoteLead.quote_details),
      };
    }
    teamMembers = allTeamMembers ?? [];
    assignedTeamMemberIds = assignees?.map((a) => a.team_member_id) ?? [];
    payments = paymentsRow;
    contract = contractRow;
    gallery = galleryRow;

    if (galleryRow) {
      const photos = [...galleryRow.gallery_photos].sort((a, b) => a.sort_order - b.sort_order);
      galleryPhotoCount = photos.length;
      const coverPhoto = galleryRow.cover_photo_id
        ? photos.find((p) => p.id === galleryRow.cover_photo_id) ?? photos[0]
        : photos[0];
      if (coverPhoto) {
        galleryCoverUrl = await getSignedDownloadUrl("galleries", coverPhoto.storage_path, 3600);
      }
    }
  }

  const magnetFrames = magnetFramesLoad ? await magnetFramesLoad : null;

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
