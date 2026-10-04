import { NextResponse } from "next/server";
import { sendPushToPhotographer } from "@/lib/push";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import type { LeadRow } from "@/lib/types";
import { photographerLang } from "@/lib/clientLang";
import { messagesFor } from "@/i18n/dict";
import { makeT } from "@/i18n/translate";

// Public, token-authenticated (the client has no login) — admin-gated for now, same staged-rollout
// pattern as every other "עדכון אדמין" feature this app has shipped: the tool needs to be flawless
// on the real account before it goes out to every photographer's clients.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("*, photographers(email, ui_lang)")
    .eq("quote_token", token)
    .maybeSingle<LeadRow & { photographers: { email: string; ui_lang: string | null } | null }>();

  if (!lead || !lead.quoted_amount) {
    return NextResponse.json({ error: "הצעת המחיר לא נמצאה" }, { status: 404 });
  }
  if (lead.quote_approved_at) {
    return NextResponse.json({ ok: true, alreadyApproved: true });
  }

  const { error } = await supabase.from("leads").update({ quote_approved_at: new Date().toISOString() }).eq("id", lead.id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // To the photographer, in their own language (photographers.ui_lang).
  const t = makeT(messagesFor(photographerLang(lead.photographers?.ui_lang)));
  await sendPushToPhotographer(lead.photographer_id, {
    title: t("{name} אישרו את הצעת המחיר", { name: lead.name }),
    body: t("לחצו לפתיחת הלידים"),
    url: "/leads",
    tag: `quote-${lead.id}`,
  });

  // No event_notifications entry here — that table's event_id is NOT NULL (no event exists yet at
  // this point). The photographer finds out once the questionnaire step actually creates the
  // event and its own email fires.
  return NextResponse.json({ ok: true });
}
