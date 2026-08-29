import { createHmac, timingSafeEqual } from "node:crypto";

// Confirms a new signup's email address via our own link (in the "login details" email we
// already send through Resend) instead of Supabase's own confirmation email — that one goes
// through Supabase's mailer, which turned out to have real deliverability problems even after
// pointing it at our own SMTP. HMAC-signed rather than a random per-user token stored in the DB:
// no extra table/column, and the signature can't be forged without the service-role key (never
// sent to the browser). A week's expiry matches Supabase's own default confirmation link
// lifetime — long enough that a slow reader doesn't get a dead link, short enough that a link
// sitting in an old, unopened email eventually stops being usable.
const TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function sign(uid: string, ts: string): string {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY!).update(`${uid}.${ts}`).digest("hex");
}

export function createEmailConfirmToken(uid: string): { ts: string; sig: string } {
  const ts = Date.now().toString();
  return { ts, sig: sign(uid, ts) };
}

export function verifyEmailConfirmToken(uid: string, ts: string, sig: string): boolean {
  if (!uid || !ts || !sig) return false;
  const age = Date.now() - Number(ts);
  if (!Number.isFinite(age) || age < 0 || age > TOKEN_MAX_AGE_MS) return false;

  const expected = Buffer.from(sign(uid, ts), "hex");
  const actual = Buffer.from(sig, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
