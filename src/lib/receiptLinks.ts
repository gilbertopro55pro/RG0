import { randomBytes } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { clientLangFor } from "@/lib/clientLang";
import type { Lang } from "@/i18n/config";

// Short links to issued receipts (owner, 2026-10-08): myframeflow.com/r/<token> instead of the
// invoicing provider's long URL. Tapping it goes straight to the receipt (app/r/[token]); WhatsApp
// shows it as a card with the studio's name and logo.
// Server-only: the table is read and written with the service role (no RLS policies).

export const RECEIPT_TOKEN_RE = /^[A-Za-z0-9_-]{6,32}$/;

export function appOrigin(request: Request): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || new URL(request.url).origin;
}

// One short link per receipt; null if it couldn't be saved (the message then carries the
// provider's own link, so sending never fails over this).
export async function createReceiptLink(
  request: Request,
  link: { photographerId: string; eventId: string; documentUrl: string; amount: number; customerName: string },
): Promise<string | null> {
  const admin = createServiceRoleClient();
  for (let attempt = 0; attempt < 3; attempt++) {
    const token = randomBytes(6).toString("base64url");
    const { error } = await admin.from("receipt_links").insert({
      token,
      photographer_id: link.photographerId,
      event_id: link.eventId,
      document_url: link.documentUrl,
      amount: link.amount,
      customer_name: link.customerName || null,
    });
    if (!error) return `${appOrigin(request)}/r/${token}`;
  }
  return null;
}

// The newest short link made for this receipt, or null.
export async function findReceiptLink(request: Request, photographerId: string, documentUrl: string): Promise<string | null> {
  const { data } = await createServiceRoleClient()
    .from("receipt_links")
    .select("token")
    .eq("document_url", documentUrl)
    .eq("photographer_id", photographerId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ token: string }>();
  return data ? `${appOrigin(request)}/r/${data.token}` : null;
}

export type ReceiptLink = {
  documentUrl: string;
  lang: Lang;
  studio: { name: string; logoPath: string | null };
};

export async function loadReceiptLink(token: string): Promise<ReceiptLink | null> {
  if (!RECEIPT_TOKEN_RE.test(token)) return null;
  const { data } = await createServiceRoleClient()
    .from("receipt_links")
    .select("document_url, photographers(name, email, logo_storage_path), events(client_lang)")
    .eq("token", token)
    .maybeSingle<{
      document_url: string;
      photographers: { name: string; email: string | null; logo_storage_path: string | null } | null;
      events: { client_lang: string | null } | null;
    }>();
  if (!data?.document_url) return null;
  const ph = data.photographers;
  return {
    documentUrl: data.document_url,
    lang: clientLangFor(ph?.email, data.events?.client_lang),
    studio: { name: ph?.name ?? "", logoPath: ph?.logo_storage_path ?? null },
  };
}
