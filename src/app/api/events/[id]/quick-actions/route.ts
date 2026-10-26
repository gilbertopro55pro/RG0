import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { STAGE_LABELS, packageLabel, type PackageType, type StageKey } from "@/lib/stages";
import { stageRole } from "@/lib/clientReminders";
import { buildClientMessageText, clientTemplateKey, galleryStageOf } from "@/lib/clientMessage";
import { clientLangFor } from "@/lib/clientLang";
import { shortClientUrl } from "@/lib/shortLinks";
import { SITE_URL } from "@/lib/siteUrl";
import { isInvoiceProviderConnected } from "@/lib/invoicing";
import { openAmount } from "@/lib/openBalances";
import { paymentReminderMessage } from "@/lib/paymentReminder";
import {
  PHOTO_SELECTION_REMINDER,
  QUICK_REMINDER_KINDS,
  legDocState,
  photoSelectionStageOf,
  quickReminderBlock,
  receiptLegs,
  type QuickActionsData,
} from "@/lib/eventQuickActions";
import type { EventPaymentRow, InvoiceProvider } from "@/lib/types";

type EventForActions = {
  id: string;
  photographer_id: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  event_type: string | null;
  event_date: string;
  event_location: string | null;
  package: PackageType | null;
  event_start_time: string | null;
  event_end_time: string | null;
  arrival_time: string | null;
  client_access_token: string;
  client_lang: string | null;
  closed_at: string | null;
  closed_balance_month: string | null;
  songs_chosen_at: string | null;
  custom_packages: { name: string } | null;
  event_stages: {
    stage_key: string | null;
    custom_stage_id: string | null;
    done: boolean;
    stage_order: number;
    custom_package_stages: { name: string; requires_album_pdf: boolean | null } | null;
  }[];
};

// Everything the event's quick actions need (lib/eventQuickActions.ts), read when the menu opens:
// one round of queries. The client messages are built here from the photographer's own templates,
// the way the event page and the home screen build them. The photographer only (payments are theirs).
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  const supabase = await createClient();

  const [{ data: event }, { data: payment }, { data: galleries }, { data: photographer }, { data: templates }] = await Promise.all([
    supabase
      .from("events")
      .select(
        "id, photographer_id, client_name, client_phone, client_email, event_type, event_date, event_location, package, event_start_time, event_end_time, arrival_time, client_access_token, client_lang, closed_at, closed_balance_month, songs_chosen_at, custom_packages(name), event_stages(stage_key, custom_stage_id, done, stage_order, custom_package_stages(name, requires_album_pdf))"
      )
      .eq("id", id)
      .maybeSingle<EventForActions>(),
    supabase.from("event_payments").select("*").eq("event_id", id).maybeSingle<EventPaymentRow>(),
    supabase
      .from("galleries")
      .select("access_token, published, archived_at, activated")
      .eq("event_id", id)
      .order("created_at", { ascending: true })
      .returns<{ access_token: string; published: boolean; archived_at: string | null; activated: boolean | null }[]>(),
    supabase
      .from("photographers")
      .select("name, whatsapp_signature, invoice_provider, finbot_api_key, green_invoice_api_id, green_invoice_api_secret")
      .eq("id", user.id)
      .maybeSingle<{
        name: string | null;
        whatsapp_signature: string | null;
        invoice_provider: InvoiceProvider;
        finbot_api_key: string | null;
        green_invoice_api_id: string | null;
        green_invoice_api_secret: string | null;
      }>(),
    supabase.from("client_message_templates").select("stage_key, body").returns<{ stage_key: string; body: string }[]>(),
  ]);
  if (!event || !photographer || event.photographer_id !== user.id) return NextResponse.json({ error: "האירוע לא נמצא" }, { status: 404 });

  const lang = clientLangFor(null, event.client_lang);
  const saved = new Map((templates ?? []).map((r) => [r.stage_key, r.body]));
  const stages = [...event.event_stages]
    .sort((a, b) => a.stage_order - b.stage_order)
    .map((s) => ({
      key: s.stage_key ?? `custom:${s.custom_stage_id}`,
      label: s.stage_key ? (STAGE_LABELS[s.stage_key as StageKey] ?? s.stage_key) : (s.custom_package_stages?.name ?? ""),
      done: s.done,
      role: stageRole(s.stage_key, s.custom_package_stages),
    }));

  // The gallery the event page shows: a linked gallery the photographer set up (activated).
  const gallery = (galleries ?? []).find((g) => g.activated) ?? null;
  const galleryReady = !!gallery && gallery.published && !gallery.archived_at;
  const galleryUrl = galleryReady ? shortClientUrl(SITE_URL, "gallery", gallery.access_token) : null;
  const portalUrl = shortClientUrl(SITE_URL, "portal", event.client_access_token);

  const message = (stage: { key: string; label: string }, linkUrl: string, opts: { fallback?: string; alwaysLink?: boolean } = {}) => {
    const own = saved.get(clientTemplateKey(stage.key, lang));
    // A custom stage without a message of its own gets the built-in stage's (`fallback` is its key),
    // and the photos reminder, with no saved message, its own wording.
    const templateKey = own ? stage.key : (opts.fallback ?? stage.key);
    return buildClientMessageText({
      stageKey: templateKey,
      stageLabel: stage.label,
      savedTemplate:
        own ?? saved.get(clientTemplateKey(templateKey, lang)) ?? (templateKey === "client_photo_selection" ? PHOTO_SELECTION_REMINDER[lang] : undefined),
      clientName: event.client_name,
      eventDateIso: event.event_date,
      eventLocation: event.event_location,
      packageLabelText: packageLabel(event.package, event.custom_packages?.name ?? null),
      eventStartTime: event.event_start_time,
      eventEndTime: event.event_end_time,
      arrivalTime: event.arrival_time,
      depositAmount: payment ? payment.deposit_amount : null,
      balanceAmount: payment ? payment.balance_amount : null,
      linkUrl,
      whatsappSignature: photographer.whatsapp_signature ?? null,
      senderName: photographer.name ?? null,
      lang,
      alwaysLink: opts.alwaysLink,
    });
  };

  const galleryStage = galleryStageOf(stages);
  const songStage = stages.find((s) => s.role === "client_song_selection") ?? null;
  const photoStage = photoSelectionStageOf(stages);
  // A balance recognized as revenue when the event was closed isn't open any more (lib/closeEvent.ts).
  const openTotal = payment ? openAmount(payment, !!(event.closed_at && event.closed_balance_month)).total : 0;
  const hasPhone = !!event.client_phone?.trim();
  const galleryState = !gallery ? "none" : gallery.archived_at ? "archived" : gallery.published ? "ready" : "draft";
  const facts = { hasPhone, openTotal, songStage, songsChosen: !!event.songs_chosen_at, photoStage, galleryState } as const;

  const reminders = Object.fromEntries(
    QUICK_REMINDER_KINDS.map((kind) => {
      const blocked = quickReminderBlock(kind, facts);
      if (blocked) return [kind, { blocked, message: null }];
      if (kind === "payment") {
        const text = paymentReminderMessage({
          clientName: event.client_name,
          amount: openTotal,
          portalUrl,
          signature: photographer.whatsapp_signature,
          senderName: photographer.name,
          lang,
        });
        return [kind, { blocked: null, message: text, amount: openTotal }];
      }
      // The songs are written in the portal; the photos are chosen in the gallery (published, above).
      if (kind === "songs") return [kind, { blocked: null, message: message(songStage!, portalUrl, { fallback: "client_song_selection", alwaysLink: true }) }];
      return [kind, { blocked: null, message: message(photoStage!, galleryUrl!, { fallback: "client_photo_selection", alwaysLink: true }) }];
    })
  ) as QuickActionsData["reminders"];

  const data: QuickActionsData = {
    clientName: event.client_name,
    clientPhone: event.client_phone,
    clientEmail: event.client_email,
    eventType: event.event_type,
    payments: payment
      ? {
          deposit: { amount: Number(payment.deposit_amount) || 0, paid: payment.deposit_paid, paidAmount: legDocState(payment, "deposit").paidAmount },
          balance: { amount: Number(payment.balance_amount) || 0, paid: payment.balance_paid, paidAmount: legDocState(payment, "balance").paidAmount },
        }
      : null,
    receipt: { connected: isInvoiceProviderConnected(photographer.invoice_provider, photographer), legs: receiptLegs(payment) },
    gallery: {
      state: galleryState,
      stageLabel: galleryStage.label,
      message: galleryUrl ? message(galleryStage, galleryUrl) : null,
    },
    reminders,
  };
  return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
}
