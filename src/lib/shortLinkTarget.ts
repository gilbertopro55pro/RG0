import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { clientLangFor } from "@/lib/clientLang";
import { parseShortCode, SHORT_LINK_PATH, type ShortLinkKind } from "@/lib/shortLinks";
import type { Lang } from "@/i18n/config";

// What a short client link (lib/shortLinks.ts) points to: the full token, and the studio and the
// client's language for its link preview. Server-only (service role: these rows have no public
// read; the code itself is the access, like the token it stands for).

export type ShortLinkTarget = {
  kind: ShortLinkKind;
  // "/portal/<token>"
  path: string;
  studio: { name: string; logoPath: string | null };
  lang: Lang;
};

type Studio = { name: string | null; email: string | null; logo_storage_path: string | null } | null;
const STUDIO = "name, email, logo_storage_path";

// The one row whose token starts with the code's 16 hex digits (two would be a collision: no link).
async function one<T>(query: PromiseLike<{ data: T[] | null }>): Promise<T | null> {
  const { data } = await query;
  return data?.length === 1 ? data[0] : null;
}

export async function resolveShortLink(code: string): Promise<ShortLinkTarget | null> {
  const parsed = parseShortCode(code);
  if (!parsed) return null;
  const { kind, from, to } = parsed;
  const db = createServiceRoleClient();
  const target = (token: string, studio: Studio, lang: unknown): ShortLinkTarget => ({
    kind,
    path: `${SHORT_LINK_PATH[kind]}${token}`,
    studio: { name: studio?.name ?? "", logoPath: studio?.logo_storage_path ?? null },
    lang: clientLangFor(studio?.email, lang),
  });

  if (kind === "portal") {
    const row = await one(
      db.from("events").select(`client_access_token, client_lang, photographers(${STUDIO})`).gte("client_access_token", from).lte("client_access_token", to).limit(2)
        .returns<{ client_access_token: string; client_lang: string | null; photographers: Studio }[]>(),
    );
    return row ? target(row.client_access_token, row.photographers, row.client_lang) : null;
  }
  if (kind === "quote") {
    const row = await one(
      db.from("leads").select(`quote_token, client_lang, photographers(${STUDIO})`).gte("quote_token", from).lte("quote_token", to).limit(2)
        .returns<{ quote_token: string; client_lang: string | null; photographers: Studio }[]>(),
    );
    return row ? target(row.quote_token, row.photographers, row.client_lang) : null;
  }
  if (kind === "contract") {
    const row = await one(
      db.from("event_contracts").select(`sign_token, events(client_lang, photographers(${STUDIO}))`).gte("sign_token", from).lte("sign_token", to).limit(2)
        .returns<{ sign_token: string; events: { client_lang: string | null; photographers: Studio } | null }[]>(),
    );
    return row ? target(row.sign_token, row.events?.photographers ?? null, row.events?.client_lang) : null;
  }
  // A gallery: the client's own link, or a read-only share link made from it (lib/galleryAccess.ts).
  const gallery = await one(
    db.from("galleries").select(`access_token, photographers(${STUDIO})`).gte("access_token", from).lte("access_token", to).limit(2)
      .returns<{ access_token: string; photographers: Studio }[]>(),
  );
  if (gallery) return target(gallery.access_token, gallery.photographers, null);
  const shared = await one(
    db.from("gallery_share_links").select("token").gte("token", from).lte("token", to).limit(2).returns<{ token: string }[]>(),
  );
  return shared ? target(shared.token, null, null) : null;
}
