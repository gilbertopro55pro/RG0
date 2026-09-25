const GRAPH = "https://graph.facebook.com/v21.0";

const STATUS_FIELDS =
  "display_phone_number,verified_name,name_status,new_name_status,status,code_verification_status,platform_type,quality_rating,account_mode,messaging_limit_tier";

export type NumberStatus = {
  display_phone_number?: string;
  verified_name?: string;
  name_status?: string;
  new_name_status?: string;
  status?: string;
  code_verification_status?: string;
  platform_type?: string;
  quality_rating?: string;
  account_mode?: string;
  messaging_limit_tier?: string;
  error?: { code?: number; subcode?: number; message?: string };
};

type GraphError = { code?: number; error_subcode?: number; message?: string; error_user_title?: string; error_user_msg?: string };

// Meta's short message ("Invalid parameter") hides the reason; the subcode and user message carry it.
function describeError(e: GraphError | undefined, fallback: string): string {
  if (!e) return fallback;
  const parts = [e.message, e.error_user_title, e.error_user_msg].filter(Boolean);
  return `${parts.join(" | ")}${e.error_subcode ? ` (subcode ${e.error_subcode})` : ""}` || fallback;
}

async function graph(path: string, init?: RequestInit): Promise<Record<string, unknown> & { error?: GraphError }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) return { error: { message: "WHATSAPP_ACCESS_TOKEN is not set" } };
  const res = await fetch(`${GRAPH}/${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    cache: "no-store",
  });
  return res.json().catch(() => ({ error: { message: `HTTP ${res.status}` } }));
}

// Status fields of one Cloud API number, or the Graph error when the token can't see it.
export async function whatsappNumberStatus(phoneNumberId: string): Promise<NumberStatus> {
  const data = await graph(`${phoneNumberId}?fields=${STATUS_FIELDS}`);
  if (data.error) return { error: { code: data.error.code, subcode: data.error.error_subcode, message: data.error.message } };
  delete data.id;
  return data as NumberStatus;
}

// The token itself (type, expiry, scopes, and the WhatsApp Business Accounts it's granted on) and,
// for each of those WABAs, whether this app is subscribed to its webhooks and which numbers it has.
// Never returns the token.
export async function whatsappTokenOverview() {
  const token = process.env.WHATSAPP_ACCESS_TOKEN ?? "";
  const debug = await graph(`debug_token?input_token=${encodeURIComponent(token)}`);
  const d = (debug.data ?? {}) as {
    type?: string;
    app_id?: string;
    is_valid?: boolean;
    expires_at?: number;
    scopes?: string[];
    granular_scopes?: { scope: string; target_ids?: string[] }[];
  };
  const wabaIds = Array.from(
    new Set((d.granular_scopes ?? []).filter((s) => s.scope.startsWith("whatsapp_business")).flatMap((s) => s.target_ids ?? []))
  );
  const wabas = [];
  for (const id of wabaIds) {
    const numbers = await graph(`${id}/phone_numbers?fields=id,display_phone_number,status`);
    const apps = await graph(`${id}/subscribed_apps`);
    const appIds = ((apps.data as { whatsapp_business_api_data?: { id?: string } }[] | undefined) ?? []).map((a) => a.whatsapp_business_api_data?.id);
    wabas.push({
      id,
      numbers: (numbers.data as { id: string; display_phone_number: string; status: string }[] | undefined) ?? [],
      appSubscribed: !!d.app_id && appIds.includes(d.app_id),
      error: numbers.error?.message ?? apps.error?.message ?? null,
    });
  }
  return {
    token: debug.error
      ? { error: debug.error.message ?? "debug_token failed" }
      : { type: d.type, valid: d.is_valid, expiresAt: d.expires_at || null, scopes: d.scopes ?? [] },
    wabas,
  };
}

// Plain-Hebrew reading of a number's status: what's blocking it and what to do.
export function diagnoseNumber(s: NumberStatus, inTokenWaba: boolean, wabaSubscribed: boolean): string[] {
  if (s.error) {
    if (s.error.code === 100 || s.error.code === 10 || s.error.code === 200) {
      return ["לאסימון (WHATSAPP_ACCESS_TOKEN) אין גישה למספר הזה. צריך לשייך את חשבון הוואטסאפ העסקי של המספר למשתמש המערכת שהאסימון שלו, עם הרשאת Full control."];
    }
    return [`Graph API החזיר שגיאה: ${s.error.message ?? "לא ידוע"}`];
  }
  const out: string[] = [];
  if (s.code_verification_status && s.code_verification_status !== "VERIFIED") {
    out.push("המספר עוד לא אומת בקוד (SMS או שיחה). צריך לאמת אותו ב-WhatsApp Manager לפני הרישום.");
  }
  if (s.status === "PENDING") {
    out.push("המספר אומת אבל לא נרשם ל-Cloud API. זה מה שמשאיר אותו ב-Pending: צריך רישום (register) עם קוד PIN בן 6 ספרות.");
  } else if (s.status === "CONNECTED") {
    out.push("המספר רשום ופעיל ב-Cloud API.");
  } else if (s.status) {
    out.push(`סטטוס המספר: ${s.status}. זה לא Pending רגיל, כדאי לבדוק ב-WhatsApp Manager אם יש הודעה על חסימה או הגבלה.`);
  }
  if (s.name_status === "PENDING_REVIEW" || s.new_name_status === "PENDING_REVIEW") {
    out.push("שם התצוגה בבדיקה של מטא. זה לא חוסם את הרישום, אבל עד האישור השם לא יוצג ללקוחות.");
  } else if (s.name_status === "DECLINED" || s.new_name_status === "DECLINED") {
    out.push("מטא דחו את שם התצוגה. צריך לבחור שם אחר ב-WhatsApp Manager.");
  }
  if (!inTokenWaba) {
    out.push("המספר לא מופיע באף חשבון וואטסאפ עסקי שהאסימון משויך אליו.");
  } else if (!wabaSubscribed) {
    out.push("האפליקציה לא רשומה ל-webhooks של חשבון הוואטסאפ העסקי של המספר, אז הודעות נכנסות לא יגיעו למערכת. אפשר לחבר בכפתור למטה.");
  }
  return out;
}

export async function registerWhatsAppNumber(phoneNumberId: string, pin: string): Promise<{ ok: boolean; error?: string }> {
  const data = await graph(`${phoneNumberId}/register`, {
    method: "POST",
    body: JSON.stringify({ messaging_product: "whatsapp", pin }),
  });
  if (data.error || !data.success) return { ok: false, error: describeError(data.error, "הרישום נכשל") };
  return { ok: true };
}

export async function subscribeAppToWaba(wabaId: string): Promise<{ ok: boolean; error?: string }> {
  const data = await graph(`${wabaId}/subscribed_apps`, { method: "POST" });
  if (data.error || !data.success) return { ok: false, error: describeError(data.error, "החיבור נכשל") };
  return { ok: true };
}
