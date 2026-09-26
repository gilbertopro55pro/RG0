import type { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { ADMIN_EMAIL } from "@/lib/admin";
import { sendWhatsAppMessage } from "@/lib/whatsapp";
import { runIntakeTurn, MAX_CLIENT_TURNS, type IntakeConversation, type IntakePhotographer } from "@/lib/intakeAssistant";

// Intake assistant, phase 2: WhatsApp through the same engine as the web chat (owner's decisions,
// 2026-09-25):
// - admin account only for now (ADMIN_EMAIL), on the number in photographers.whatsapp_bot_phone_number_id
// - starts only on a new conversation whose first message is the ad's opening text (fully or
//   partly), or that Meta marks as coming from an ad (message.referral)
// - never for a number that is already a contact (client, lead, event, quote, waitlist), and never
//   once the photographer replied by hand (coexistence echoes) — the conversation becomes 'human'
// - always answers in Hebrew
type ServiceClient = ReturnType<typeof createServiceRoleClient>;

type BotPhotographer = IntakePhotographer & { whatsapp_bot_phone_number_id: string | null };

type WaMessage = {
  from: string;
  id: string;
  type: string;
  text?: { body?: string };
  button?: { text?: string };
  referral?: { source_type?: string; headline?: string; body?: string };
};
type WaEcho = { from?: string; to?: string; id?: string };
export type WaChangeValue = {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  messages?: WaMessage[];
  message_echoes?: WaEcho[];
};

const CONV_FIELDS = "id, photographer_id, state, collected, messages, lead_id, client_turns, session_token, completed_at, usage, client_phone, referral_source";
const BOT_FIELDS =
  "id, name, email, plan, intake_bot_enabled, intake_bot_faq, intake_bot_reply_hours, intake_bot_extra_question, intake_allow_split_day, intake_shabbat_closed, whatsapp_bot_phone_number_id";
const ACTIVE_STATES = ["collecting_info", "completed", "waitlisted"];

const AD_OPENINGS = ["שלום! אפשר לקבל מידע נוסף על זה?", "Hello! Can I get more info on this?"];
const AD_KEY_PHRASES = ["מידע נוסף", "more info"];

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

// The ad's default opening message, whole or partial ("שלום אפשר לקבל מידע נוסף", "Can I get more
// info on this?"), possibly with more text after it.
export function isAdOpening(text: string): boolean {
  const n = normalize(text);
  if (!n) return false;
  return AD_OPENINGS.some((ad) => {
    const a = normalize(ad);
    return n.includes(a) || (n.length >= 8 && a.includes(n));
  }) || AD_KEY_PHRASES.some((k) => n.includes(normalize(k)));
}

function localPhone(waId: string): string {
  const digits = waId.replace(/\D/g, "");
  return digits.startsWith("972") ? `0${digits.slice(3)}` : `+${digits}`;
}

function messageText(m: WaMessage): string {
  if (m.type === "text") return (m.text?.body ?? "").trim();
  if (m.type === "button") return (m.button?.text ?? "").trim();
  return `(הלקוח שלח הודעה מסוג ${m.type}, שהעוזר לא יכול לקרוא)`;
}

async function findConversation(supabase: ServiceClient, photographerId: string, clientPhone: string) {
  const { data } = await supabase
    .from("bot_conversations")
    .select(CONV_FIELDS)
    .eq("photographer_id", photographerId)
    .eq("channel", "whatsapp")
    .eq("client_phone", clientPhone)
    .maybeSingle<IntakeConversation & { client_phone: string }>();
  return data ?? null;
}

async function createConversation(
  supabase: ServiceClient,
  photographerId: string,
  clientPhone: string,
  state: string,
  collected: Record<string, unknown>,
  referralSource: string | null = "whatsapp"
) {
  const { data, error } = await supabase
    .from("bot_conversations")
    .insert({ photographer_id: photographerId, channel: "whatsapp", client_phone: clientPhone, state, collected, referral_source: referralSource })
    .select(CONV_FIELDS)
    .single<IntakeConversation & { client_phone: string }>();
  // A parallel webhook for the same client created it first (unique index): use that one.
  if (error) return findConversation(supabase, photographerId, clientPhone);
  return data;
}

// Handles one webhook `change.value` for a bot number. Returns the conversations that got new
// messages, for processWhatsAppConversation (run after the webhook's 200).
export async function ingestWhatsAppChange(
  supabase: ServiceClient,
  value: WaChangeValue
): Promise<{ photographer: BotPhotographer; conversationIds: string[] } | null> {
  const phoneNumberId = value.metadata?.phone_number_id;
  if (!phoneNumberId) return null;
  const { data: p } = await supabase
    .from("photographers")
    .select(BOT_FIELDS)
    .eq("whatsapp_bot_phone_number_id", phoneNumberId)
    .maybeSingle<BotPhotographer>();
  // Admin only until the rollout; intake_bot_enabled is the kill switch.
  if (!p || p.email !== ADMIN_EMAIL || !p.intake_bot_enabled) return null;

  // The photographer answered from the WhatsApp Business app (coexistence): hands the conversation
  // over for good, and a number the photographer wrote to first never gets the bot.
  for (const echo of value.message_echoes ?? []) {
    if (!echo.to) continue;
    const conv = await findConversation(supabase, p.id, echo.to);
    if (!conv) await createConversation(supabase, p.id, echo.to, "human", {});
    else if (conv.state !== "human") await supabase.from("bot_conversations").update({ state: "human", updated_at: new Date().toISOString() }).eq("id", conv.id);
  }

  const touched = new Set<string>();
  for (const m of value.messages ?? []) {
    if (!m.from || !m.id) continue;
    let conv = await findConversation(supabase, p.id, m.from);
    if (!conv) {
      const text = messageText(m);
      const fromAd = m.referral?.source_type === "ad" || (m.type === "text" && isAdOpening(text));
      const { data: known } = await supabase.rpc("whatsapp_known_contact", { p_photographer: p.id, p_phone: m.from });
      const start = fromAd && !known;
      const adContext = [m.referral?.headline, m.referral?.body].filter(Boolean).join(" | ").slice(0, 300) || undefined;
      conv = await createConversation(supabase, p.id, m.from, start ? "collecting_info" : "ignored", start ? { phone: localPhone(m.from), ...(adContext ? { adContext } : {}) } : {}, m.referral?.source_type === "ad" ? "whatsapp_ad" : "whatsapp");
    }
    if (!conv || !ACTIVE_STATES.includes(conv.state)) continue;
    // Primary key = WhatsApp message id: Meta's retries of the same webhook are dropped here.
    const { error } = await supabase.from("whatsapp_inbound_messages").insert({ id: m.id, conversation_id: conv.id, body: messageText(m).slice(0, 1000) });
    if (!error) touched.add(conv.id);
  }
  return { photographer: p, conversationIds: [...touched] };
}

async function claim(supabase: ServiceClient, convId: string): Promise<boolean> {
  const now = new Date();
  const { data } = await supabase
    .from("bot_conversations")
    .update({ busy_until: new Date(now.getTime() + 90_000).toISOString() })
    .eq("id", convId)
    .or(`busy_until.is.null,busy_until.lt.${now.toISOString()}`)
    .select("id");
  return (data?.length ?? 0) > 0;
}

async function pendingMessages(supabase: ServiceClient, convId: string) {
  const { data } = await supabase
    .from("whatsapp_inbound_messages")
    .select("id, body")
    .eq("conversation_id", convId)
    .is("processed_at", null)
    .order("created_at")
    .limit(10);
  return data ?? [];
}

// Answers everything queued for one conversation. Only one worker per conversation runs at a time
// (busy_until); a burst of client messages is answered together in one turn. After releasing the
// lock it checks the queue again, so a message that arrived while it was finishing isn't dropped.
export async function processWhatsAppConversation(supabase: ServiceClient, p: BotPhotographer, convId: string, siteUrl: string) {
  for (let attempt = 0; attempt < 5; attempt++) {
    if (!(await claim(supabase, convId))) return;
    try {
      for (let turn = 0; turn < 5; turn++) {
        const pending = await pendingMessages(supabase, convId);
        if (!pending.length) break;
        const markDone = () =>
          supabase.from("whatsapp_inbound_messages").update({ processed_at: new Date().toISOString() }).in("id", pending.map((x) => x.id));
        const { data: conv } = await supabase.from("bot_conversations").select(CONV_FIELDS).eq("id", convId).single<IntakeConversation & { client_phone: string; collected: { adContext?: string } }>();
        if (!conv || !ACTIVE_STATES.includes(conv.state) || conv.client_turns >= MAX_CLIENT_TURNS) {
          await markDone();
          break;
        }
        const clientPhone = conv.client_phone;
        const reply = await runIntakeTurn(supabase, conv, p, pending.map((x) => x.body).join("\n"), siteUrl, {
          kind: "whatsapp",
          clientPhone: localPhone(clientPhone),
          adContext: conv.collected.adContext ?? null,
        });
        // .neq("state", "human"): the photographer may have taken over while the model was thinking.
        const { data: saved, error } = await supabase
          .from("bot_conversations")
          .update({
            messages: conv.messages,
            collected: conv.collected,
            state: conv.state,
            lead_id: conv.lead_id,
            client_turns: conv.client_turns + 1,
            completed_at: conv.completed_at,
            usage: conv.usage,
            updated_at: new Date().toISOString(),
          })
          .eq("id", convId)
          .neq("state", "human")
          .select("id");
        await markDone();
        if (error) console.error("WhatsApp intake save failed:", convId, error);
        if (!saved?.length) break;
        try {
          // A reply with a blank line goes out as separate short messages, the way people text.
          const parts = reply.split(/\n\s*\n/).map((t) => t.trim()).filter(Boolean);
          for (const part of parts.length ? parts : [reply]) {
            await sendWhatsAppMessage(clientPhone, part, p.whatsapp_bot_phone_number_id ?? undefined);
          }
        } catch (e) {
          console.error("WhatsApp intake reply failed:", convId, e);
        }
      }
    } finally {
      await supabase.from("bot_conversations").update({ busy_until: null }).eq("id", convId);
    }
    if (!(await pendingMessages(supabase, convId)).length) return;
  }
}
