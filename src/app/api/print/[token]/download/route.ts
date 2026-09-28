import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { getSignedDownloadUrl } from "@/lib/storage";
import { loadPrintJob } from "@/lib/printHouseJob";

export const runtime = "nodejs";

// The print house pressed "הורדת הקבצים" on /print/<token>: count the download, notify the
// photographer on the first one, and send the browser to a short-lived signed link to the file.
// POST only, so a link scanner following URLs never counts as a download.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const page = new URL(`/print/${token}`, request.url);
  const supabase = createServiceRoleClient();
  const view = await loadPrintJob(supabase, token);
  const storagePath = view?.job.storage_path;
  if (!view || view.blocked || !storagePath) return NextResponse.redirect(page, 303);

  const { job, albumTitle, galleryTitle, eventId } = view;
  const safe = (s: string) => s.replace(/[\\/:*?"<>|]+/g, " ").trim();
  let url: string;
  try {
    url = await getSignedDownloadUrl("galleries", storagePath, 60 * 60, `${safe([albumTitle, galleryTitle].filter(Boolean).join(" - ")) || "album"}.zip`);
  } catch (e) {
    console.error("[print download] signing failed", e);
    page.searchParams.set("e", "1");
    return NextResponse.redirect(page, 303);
  }

  const { data: count, error } = await supabase.rpc("record_print_house_download", { p_job: job.id });
  if (error) console.error("[print download] count failed", error);
  if (count === 1 && eventId) {
    const { data: house } = await supabase
      .from("print_house_emails")
      .select("label")
      .eq("photographer_id", job.photographer_id)
      .eq("email", job.send_to_email!)
      .limit(1)
      .maybeSingle<{ label: string | null }>();
    const who = house?.label?.trim() || job.send_to_email;
    await supabase.from("event_notifications").insert({
      event_id: eventId,
      text: `בית הדפוס (${who}) הוריד את קובצי האלבום "${albumTitle}"`,
      is_client_action: true,
    });
  }

  return NextResponse.redirect(url, 303);
}

export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return NextResponse.redirect(new URL(`/print/${token}`, request.url), 303);
}
