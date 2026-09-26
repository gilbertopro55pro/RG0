import type { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { hasAppAccess } from "@/lib/subscription";
import { ADMIN_EMAIL } from "@/lib/admin";
import { intakeMonthlyCap, type IntakePhotographer } from "@/lib/intakeAssistant";
import type { Photographer } from "@/lib/types";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

type ChatPhotographer = IntakePhotographer & Pick<Photographer, "subscription_status" | "trial_ends_at" | "portfolio_slug" | "logo_storage_path" | "meta_pixel_id">;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The public chat link is /chat/<key>: the photographer's portfolio slug when they have one
// (readable to share), otherwise their private intake_chat_token.
export async function resolveChatPhotographer(supabase: ServiceClient, key: string): Promise<ChatPhotographer | null> {
  const fields =
    "id, name, email, plan, subscription_status, trial_ends_at, portfolio_slug, logo_storage_path, intake_bot_enabled, intake_bot_faq, intake_bot_reply_hours, intake_bot_extra_question, intake_allow_split_day, meta_pixel_id";
  const bySlug = await supabase.from("photographers").select(fields).eq("portfolio_slug", key).maybeSingle<ChatPhotographer>();
  if (bySlug.data) return bySlug.data;
  if (!UUID_RE.test(key)) return null;
  const byToken = await supabase.from("photographers").select(fields).eq("intake_chat_token", key).maybeSingle<ChatPhotographer>();
  return byToken.data ?? null;
}

// Why the assistant can't take this conversation — null means it can. When it can't, the page
// falls back to the plain inquiry form (no model call), so a client is never turned away.
export async function assistantUnavailableReason(supabase: ServiceClient, p: ChatPhotographer): Promise<"disabled" | "plan" | "cap" | null> {
  if (!p.intake_bot_enabled) return "disabled";
  if (p.email !== ADMIN_EMAIL && !hasAppAccess(p)) return "plan";
  const cap = intakeMonthlyCap(p);
  if (cap <= 0) return "plan";
  const { count } = await supabase
    .from("bot_conversations")
    .select("id", { count: "exact", head: true })
    .eq("photographer_id", p.id)
    .eq("channel", "web")
    .gt("client_turns", 0)
    .gte("created_at", monthStartIsrael().toISOString());
  return (count ?? 0) >= cap ? "cap" : null;
}

export function monthStartIsrael(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const y = parts.find((x) => x.type === "year")!.value;
  const m = parts.find((x) => x.type === "month")!.value;
  // Midnight Israel time ≈ 21:00/22:00 UTC the day before; the 3-hour margin only ever counts a
  // few extra hours of the previous month, never misses this month's conversations.
  return new Date(Date.UTC(Number(y), Number(m) - 1, 1) - 3 * 3600_000);
}
