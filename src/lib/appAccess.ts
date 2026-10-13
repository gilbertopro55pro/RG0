import { NextResponse } from "next/server";
import { hasAppAccess } from "@/lib/subscription";
import { ADMIN_EMAIL } from "@/lib/admin";
import type { Photographer } from "@/lib/types";

// The server-side lock (owner's decision, 2026-10-13). The pages already send an account whose
// trial ended, or whose subscription lapsed, to /billing (hasAppAccess). Until now its session could
// still write through the API directly: create events, upload photos (storage costs), export albums
// (worker time), send emails. Same rule as the pages, and the admin is never locked.
export type AccessRow = Pick<Photographer, "email" | "subscription_status" | "trial_ends_at">;
export const ACCESS_COLUMNS = "email, subscription_status, trial_ends_at";

// No row means the user isn't a photographer (a team member): those routes check access themselves.
export function isLockedOut(row: AccessRow | null | undefined, now = new Date()): boolean {
  if (!row) return false;
  return row.email !== ADMIN_EMAIL && !hasAppAccess(row, now);
}

// What a locked account may still do through the API: pay, switch the interface language, manage
// push devices, and send feedback.
export const LOCKED_ALLOWED_API = ["/api/payplus", "/api/ui-language", "/api/push", "/api/feedback"];

// Reads are left open: the pages keep a locked account out already, and a read costs nothing that
// would justify a database query on every request.
export function isWriteMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

// The message is inlined in three languages rather than taken from the dictionaries, so the proxy
// (which runs on every request) doesn't load them all.
const LOCKED_MESSAGE = {
  he: "המנוי לא פעיל, ולכן אי אפשר לבצע שינויים. אפשר לחדש אותו בעמוד התשלום.",
  en: "Your subscription isn't active, so changes can't be made. You can renew it on the payment page.",
  ru: "Подписка не активна, поэтому изменения недоступны. Продлить её можно на странице оплаты.",
};

export function lockedOutResponse(lang?: string | null): NextResponse {
  const l = lang === "en" || lang === "ru" ? lang : "he";
  return NextResponse.json({ error: LOCKED_MESSAGE[l], code: "subscription_inactive" }, { status: 402 });
}
