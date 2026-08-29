import { NextResponse, after, type NextRequest } from "next/server";
import { processZipJobPart } from "@/lib/zipJobs";

export const runtime = "nodejs";
// As generous as Vercel allows — a part is now sized up to ~16GB of source photos (see
// MAX_PART_SOURCE_BYTES in zipJobs.ts) specifically so a realistic "download everything" request
// finishes as ONE file instead of several; that only holds if this has enough headroom to
// actually get through it. Falls back to whatever the account's plan caps this at if 800 isn't
// available.
export const maxDuration = 800;

// Server-to-server only (the CRON_SECRET bearer check below, same mechanism the cron routes use)
// — triggered by triggerZipJobProcessing, never called from the browser. Responds immediately and
// does the actual zip-part work in the background via after(), so the caller's fire-and-forget
// fetch isn't left waiting on a multi-minute response.
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { jobId }: { jobId: string } = await request.json();
  if (!jobId) {
    return NextResponse.json({ error: "jobId חסר" }, { status: 400 });
  }

  const origin = new URL(request.url).origin;
  after(() => processZipJobPart(jobId, origin));

  return NextResponse.json({ ok: true });
}
