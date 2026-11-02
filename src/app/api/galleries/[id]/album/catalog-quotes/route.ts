import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { ADMIN_EMAIL } from "@/lib/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { downloadObjectBuffer, getPublicPreviewUrl } from "@/lib/storage";
import { createClient } from "@/lib/supabase/server";
import { CATALOG_QUOTES, quotesFromPicks } from "@/lib/albumAuto/catalogQuotes";

export const runtime = "nodejs";
export const maxDuration = 60;

// The catalog style's line on a page (owner, 2026-11-02): a very short positive English quote that
// matches what the page's photos show. Claude looks at up to 3 small copies of each page's photos and
// picks from the list in catalogQuotes.ts (or writes a short line of its own when none fits). Only
// the photos go, small (512px), with no name or other detail. The auto designer is admin-only, and so
// is this route; release both together.

const MODEL = "claude-sonnet-5-5";
const MAX_SPREADS = 30;
const PHOTOS_PER_SPREAD = 3;

const SYSTEM = `You choose the one short line written on each page of a photo book (a bat/bar mitzvah photo session, or an event album).
For every page you see its photos. Pick the line that best matches what happens in them: the place (beach, sunset, nature, flowers, street art, a city), what the person does (playing music, with a dog, jumping, laughing, dreaming) and the mood.
Choose from the numbered list by its id. Use each id at most once in the book. Only when no line on the list fits the scene at all, write your own instead in "custom": a very short, positive, empowering English line (2-6 words), not a quote from a song, a film or a book.`;

const SCHEMA = {
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: { page: { type: "integer" }, quoteId: { type: "string" }, custom: { type: "string" } },
        required: ["page", "quoteId", "custom"],
        additionalProperties: false,
      },
    },
  },
  required: ["picks"],
  additionalProperties: false,
} as const;

type SpreadIn = { key: number; photoIds: string[]; tab?: string | null };

function parseSpreads(body: unknown): SpreadIn[] | null {
  const raw = (body as { spreads?: unknown })?.spreads;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_SPREADS) return null;
  const out: SpreadIn[] = [];
  for (const s of raw) {
    const { key, photoIds, tab } = (s ?? {}) as { key?: unknown; photoIds?: unknown; tab?: unknown };
    if (typeof key !== "number" || !Number.isInteger(key) || key < 0 || key > 200) return null;
    if (!Array.isArray(photoIds) || photoIds.length === 0) return null;
    const ids = photoIds.filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id)).slice(0, PHOTOS_PER_SPREAD);
    if (!ids.length) return null;
    out.push({ key, photoIds: ids, tab: typeof tab === "string" ? tab.slice(0, 80) : null });
  }
  return out;
}

// A small JPEG of the photo's preview (the whole camera file only when there's no preview).
async function smallJpeg(path: string | null, original: string): Promise<string | null> {
  try {
    let buf: Buffer | null = null;
    if (path?.endsWith(".webp")) {
      const res = await fetch(getPublicPreviewUrl(path));
      if (res.ok) buf = Buffer.from(await res.arrayBuffer());
    } else if (path) {
      buf = await downloadObjectBuffer("galleries", path);
    }
    if (!buf) buf = await downloadObjectBuffer("galleries", original);
    if (!buf) return null;
    const out = await sharp(buf).rotate().resize(512, 512, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 72 }).toBuffer();
    return out.toString("base64");
  } catch {
    return null;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: galleryId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  if (user.email?.toLowerCase() !== ADMIN_EMAIL) return NextResponse.json({ error: "לא נמצא" }, { status: 404 });

  const spreads = parseSpreads(await request.json().catch(() => null));
  if (!spreads) return NextResponse.json({ error: "בקשה לא תקינה" }, { status: 400 });

  // The photos must be in this gallery (RLS: the photographer's own).
  const ids = [...new Set(spreads.flatMap((s) => s.photoIds))];
  const { data: rows } = await supabase
    .from("gallery_photos")
    .select("id, storage_path, preview_storage_path")
    .eq("gallery_id", galleryId)
    .in("id", ids)
    .returns<{ id: string; storage_path: string; preview_storage_path: string | null }[]>();
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  if (!byId.size) return NextResponse.json({ error: "התמונות לא נמצאו" }, { status: 404 });

  const { allowed } = await checkRateLimit(`catalog-quotes:${user.id}`, { maxRequests: 40, windowSeconds: 86_400 });
  if (!allowed) return NextResponse.json({ quotes: Object.fromEntries(quotesFromPicks(null, spreads)), source: "fallback" });

  const images = new Map<string, string>();
  await Promise.all(
    [...byId.values()].map(async (r) => {
      const b64 = await smallJpeg(r.preview_storage_path, r.storage_path);
      if (b64) images.set(r.id, b64);
    })
  );

  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
  for (const s of spreads) {
    const pics = s.photoIds.filter((id) => images.has(id));
    if (!pics.length) continue;
    content.push({ type: "text", text: `Page ${s.key}:` });
    for (const id of pics) content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: images.get(id)! } });
  }
  content.push({ type: "text", text: `The lines (id: text):\n${CATALOG_QUOTES.map((q) => `${q.id}: ${q.text}`).join("\n")}\n\nAnswer with a pick for every page above.` });

  let picks: unknown = null;
  let source: "claude" | "fallback" = "fallback";
  if (content.length > 1) {
    try {
      const response = await new Anthropic().beta.messages.create({
        model: MODEL,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: "user", content }],
      });
      if (response.stop_reason === "refusal") throw new Error(`refusal: ${response.stop_details?.category ?? "unknown"}`);
      const text = response.content.find((b) => b.type === "text");
      picks = text && text.type === "text" ? (JSON.parse(text.text) as { picks?: unknown }).picks : null;
      source = "claude";
    } catch (e) {
      console.error("catalog quotes failed:", galleryId, e instanceof Anthropic.APIError ? `${e.status} ${e.message}` : e);
    }
  }
  return NextResponse.json({ quotes: Object.fromEntries(quotesFromPicks(picks, spreads)), source });
}
