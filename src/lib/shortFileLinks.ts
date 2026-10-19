import { randomBytes } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { SITE_URL } from "@/lib/siteUrl";

// Short links to a file or a one-off page (owner, 2026-10-19: "כל קישור שהמערכת שולחת צריך להיות קצר
// ונעים לעין"). A file in a message (a quote PDF, the album design, a conversation summary, an
// export for the print house) used to be the storage's signed URL, a few hundred characters; now it
// is myframeflow.com/l/<10 characters>. app/l/[code] signs a fresh short-lived URL on every open,
// until the link's own expiry: the same lifetime the long link had. A link to a page (the signup
// confirmation) redirects to the stored path. Server-only (short_links, migration 0185, service role).

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const CODE_LEN = 10; // ~59 random bits
export const SHORT_FILE_CODE_RE = /^[0-9A-Za-z]{10}$/;

function newCode(): string {
  const bytes = randomBytes(CODE_LEN * 2);
  let out = "";
  // Rejection sampling keeps every character equally likely (62 doesn't divide 256).
  for (const b of bytes) {
    if (b >= 248) continue;
    out += ALPHABET[b % 62];
    if (out.length === CODE_LEN) return out;
  }
  return out.length === CODE_LEN ? out : newCode();
}

type FileLink = { bucket: string; path: string; filename?: string | null };
type PageLink = { target: string };

// The short link, or null if it couldn't be saved (the caller then sends its long link as before).
export async function createShortLink(
  link: (FileLink | PageLink) & { photographerId?: string | null; ttlSeconds: number },
): Promise<string | null> {
  const admin = createServiceRoleClient();
  const expiresAt = new Date(Date.now() + link.ttlSeconds * 1000).toISOString();
  const fields =
    "target" in link
      ? { target: link.target, bucket: null, path: null, filename: null }
      : { target: null, bucket: link.bucket, path: link.path, filename: link.filename ?? null };
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newCode();
    const { error } = await admin.from("short_links").insert({ code, photographer_id: link.photographerId ?? null, expires_at: expiresAt, ...fields });
    if (!error) return `${SITE_URL}/l/${code}`;
    if (error.code !== "23505") {
      console.error("[shortFileLinks] insert failed", error);
      return null;
    }
  }
  return null;
}

// A file's short link, falling back to the long signed URL so a message is never left without one.
export async function shortFileUrl(
  file: FileLink & { photographerId?: string | null; ttlSeconds: number },
  longUrl: () => Promise<string>,
): Promise<string> {
  return (await createShortLink(file)) ?? (await longUrl());
}

// A page on this site ("/events/<id>?closing=1"), falling back to its full address.
export async function shortPageUrl(path: string, opts: { photographerId?: string | null; ttlSeconds: number }): Promise<string> {
  return (await createShortLink({ target: path, ...opts })) ?? `${SITE_URL}${path}`;
}

// How long a link to a page in the app lasts in an email or a notification: it opens a page that
// asks to sign in anyway, so it only needs to outlive the email being looked at again.
export const PAGE_LINK_TTL = 60 * 60 * 24 * 365;
