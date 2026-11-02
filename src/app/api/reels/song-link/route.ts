import { NextResponse } from "next/server";
import { lookup } from "node:dns/promises";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import { checkRateLimit } from "@/lib/rateLimit";
import { SONG_LINK_MAX_BYTES, isMediaResponse, isPrivateAddress, parseSongLink, songLinkFileName } from "@/lib/songLink";

export const runtime = "nodejs";
export const maxDuration = 60;

// POST { url }: the song file behind a direct link, for the reel's beat (lib/songLink.ts). The bytes
// go straight back to the browser, which finds the beat and plays it in the preview; nothing is
// stored. The reels are the admin's for now, and so is this.
//
// The server fetches a link someone pasted, so every hop is checked: http(s), a public address
// (never this machine, a private network or the cloud's metadata), at most 3 redirects, a media file
// (not a web page), and at most 60MB.
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  if (user.email !== ADMIN_EMAIL) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { allowed } = await checkRateLimit(`song-link:${user.id}`, { maxRequests: 20, windowSeconds: 600 });
  if (!allowed) return NextResponse.json({ problem: "busy" }, { status: 429 });

  const body: { url?: unknown } = await request.json().catch(() => ({}));
  const parsed = parseSongLink(body.url);
  if ("problem" in parsed) return NextResponse.json({ problem: parsed.problem }, { status: 422 });

  let url = parsed.url;
  let res: Response | null = null;
  const timeout = AbortSignal.timeout(40_000);
  for (let hop = 0; hop <= 3; hop++) {
    const addresses = await lookup(url.hostname, { all: true }).catch(() => []);
    if (!addresses.length) return NextResponse.json({ problem: "unreachable" }, { status: 422 });
    if (addresses.some((a) => isPrivateAddress(a.address))) return NextResponse.json({ problem: "invalid" }, { status: 422 });
    res = await fetch(url, { redirect: "manual", signal: timeout, headers: { "User-Agent": "Mozilla/5.0 (compatible; GilbertoReels/1.0)" } }).catch(() => null);
    if (!res) return NextResponse.json({ problem: "unreachable" }, { status: 422 });
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      const next = parseSongLink(new URL(res.headers.get("location")!, url).toString());
      if ("problem" in next) return NextResponse.json({ problem: next.problem }, { status: 422 });
      url = next.url;
      res = null;
      continue;
    }
    break;
  }
  if (!res) return NextResponse.json({ problem: "unreachable" }, { status: 422 });
  if (!res.ok || !res.body) return NextResponse.json({ problem: "unreachable" }, { status: 422 });
  const type = res.headers.get("content-type");
  if (!isMediaResponse(type, url)) {
    await res.body.cancel().catch(() => {});
    return NextResponse.json({ problem: (type ?? "").includes("html") ? "page" : "type" }, { status: 422 });
  }
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > SONG_LINK_MAX_BYTES) {
    await res.body.cancel().catch(() => {});
    return NextResponse.json({ problem: "large" }, { status: 413 });
  }

  // Streamed through, stopped past the limit (a server that didn't say its size).
  let seen = 0;
  const capped = res.body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > SONG_LINK_MAX_BYTES) controller.error(new Error("too large"));
        else controller.enqueue(chunk);
      },
    })
  );
  return new Response(capped, {
    headers: {
      "Content-Type": (type ?? "application/octet-stream").split(";")[0],
      "Cache-Control": "no-store",
      "X-Song-Name": encodeURIComponent(songLinkFileName(url, type)),
    },
  });
}
