// Real background progress for album JPG/PSD/PDF exports — mirrors zipJobs.ts's already-proven
// pattern exactly: the export route creates a job row and returns instantly, this file does the
// actual (page-by-page) rendering in a separate serverless invocation triggered right after, and
// the client polls the job row for real per-page progress instead of a client-side timer that has
// no idea how far the real work actually is.
import { ZipArchive } from "archiver";
import { Readable } from "node:stream";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { downloadObjectBuffer, uploadObjectStream, uploadObject, getSignedDownloadUrl, removeObjects } from "@/lib/storage";
import { renderAlbumPageJpeg, pxFromCm } from "@/lib/albumRaster";
import { renderAlbumPagePsd } from "@/lib/albumPsd";
import { generateAlbumPdf } from "@/lib/albumPdf";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";
import type { GalleryAlbumExportJobRow, GalleryAlbumRow, GalleryAlbumSpreadRow, GalleryPhotoRow } from "@/lib/types";

function sanitizeSegment(name: string): string {
  return name.replace(/[/\\:*?"<>|]/g, "-").trim() || "אלבום";
}

export function albumExportJobStoragePath(jobId: string, format: "jpg" | "psd" | "pdf"): string {
  const ext = format === "pdf" ? "pdf" : "zip";
  return `album-exports/${jobId}.${ext}`;
}

// Shared by all three export-create routes (export-pdf/jpg/psd) so "one active export at a time
// per photographer" is enforced at the one place every caller goes through, not duplicated as
// client-side state in each UI that can trigger an export — GalleryManageView's own
// openExportRangeModal already had its own client-side version of this guard, but that only
// protects the ONE mounted component instance; it does nothing for a second caller (a different
// tab, or the home-screen quick-export shortcut) hitting the create route directly. Per explicit
// request: once ANY export is active for a PHOTOGRAPHER (any format, any gallery/album), every
// export button they can reach — wherever it lives — must show THAT job's own progress instead of
// starting a competing one, until it's cancelled. Scoped by photographer_id, not gallery_id (a
// narrower per-gallery version of this same guard existed before) — a photographer with two
// galleries open in two tabs shouldn't be able to run two renders at once any more than one
// gallery with two tabs could. Returns the job's own gallery_id too, since the caller (a specific
// gallery's export route) can no longer assume the active job is ITS gallery's — see the matching
// change in export-jobs/[jobId]/route.ts, which now authorizes by the job's OWN gallery's owner
// instead of requiring the URL's :id to equal the job's gallery_id.
export async function findActiveExportJob(
  supabase: ReturnType<typeof createServiceRoleClient>,
  photographerId: string
): Promise<{ id: string; format: "pdf" | "jpg" | "psd"; galleryId: string } | null> {
  const { data } = await supabase
    .from("gallery_album_export_jobs")
    .select("id, format, gallery_id")
    .eq("photographer_id", photographerId)
    .in("status", ["pending", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ id: string; format: "pdf" | "jpg" | "psd"; gallery_id: string }>();
  return data ? { id: data.id, format: data.format, galleryId: data.gallery_id } : null;
}

// Same server-to-server fire-and-forget trigger as triggerZipJobProcessing — a fresh serverless
// invocation (its own maxDuration budget) instead of working through the render inline here.
export async function triggerAlbumExportProcessing(jobId: string, origin: string): Promise<void> {
  await fetch(`${origin}/api/internal/album-export-jobs/process`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.CRON_SECRET}` },
    body: JSON.stringify({ jobId }),
  }).catch(() => {
    // Best-effort — if lost (cold-start timing, network blip), the job stays "pending" and the
    // retry-stuck-zip-jobs cron's album-export housekeeping picks it up as a fallback.
  });
}

type ResolvedExportInputs = {
  gallery: { id: string; title: string };
  album: GalleryAlbumRow;
  rangedSpreads: GalleryAlbumSpreadRow[];
  includeCover: boolean;
  photosById: Map<string, Pick<GalleryPhotoRow, "id" | "storage_path">>;
  customOrnamentsById?: Map<string, { storage_path: string }>;
  rootDir: string;
};

// The album/spreads/range/photo-resolution logic every one of the three export routes used to
// duplicate inline — one shared version, since the export routes now only need it to build the
// job row (from_page/to_page/total_count) and the background processor needs the exact same
// resolution again once it actually renders.
// Exported so worker/src/index.ts (the Fly.io background worker — see its own top comment for why
// PDF rendering moved off Vercel) can reuse the exact same gallery/album/spreads/photo resolution
// instead of re-implementing it.
export async function resolveExportInputs(
  supabase: ReturnType<typeof createServiceRoleClient>,
  galleryId: string,
  fromPage: number,
  toPage: number
): Promise<ResolvedExportInputs | null> {
  const { data: gallery } = await supabase.from("galleries").select("id, title").eq("id", galleryId).maybeSingle<{ id: string; title: string }>();
  if (!gallery) return null;

  const { data: album } = await supabase.from("gallery_albums").select("*").eq("gallery_id", galleryId).maybeSingle<GalleryAlbumRow>();
  if (!album) return null;

  const { data: spreads } = await supabase
    .from("gallery_album_spreads")
    .select("*")
    .eq("album_id", album.id)
    .order("sort_order", { ascending: true })
    .returns<GalleryAlbumSpreadRow[]>();
  if (!spreads || spreads.length === 0) return null;

  const hasCover = !!album.cover_photo_id;
  const totalPages = (hasCover ? 1 : 0) + spreads.length;
  const rangeStart = Math.max(1, Math.min(fromPage, toPage, totalPages));
  const rangeEnd = Math.max(rangeStart, Math.min(Math.max(fromPage, toPage), totalPages));
  const includeCover = hasCover && rangeStart <= 1;
  const rangedSpreads = spreads
    .map((spread, i) => ({ spread, pageNumber: (hasCover ? 1 : 0) + i + 1 }))
    .filter(({ pageNumber }) => pageNumber >= rangeStart && pageNumber <= rangeEnd)
    .map(({ spread }) => spread);

  const photoIds = Array.from(
    new Set([
      ...(includeCover && album.cover_photo_id ? [album.cover_photo_id] : []),
      ...rangedSpreads.flatMap((s) => [s.photo_id_1, s.photo_id_2, s.background_photo_id].filter((id): id is string => !!id)),
      ...rangedSpreads.flatMap((s) =>
        s.elements.filter((el): el is typeof el & { type: "photo"; photoId: string } => el.type === "photo" && !!el.photoId).map((el) => el.photoId)
      ),
    ])
  );
  const { data: photos } = await supabase
    .from("gallery_photos")
    .select("id, storage_path")
    .in("id", photoIds)
    .returns<Pick<GalleryPhotoRow, "id" | "storage_path">[]>();
  const photosById = new Map((photos ?? []).map((p) => [p.id, p]));

  const customOrnamentIds = Array.from(
    new Set(
      rangedSpreads.flatMap((s) =>
        s.elements.filter((el): el is typeof el & { type: "ornament"; customOrnamentId: string } => el.type === "ornament" && !!el.customOrnamentId).map((el) => el.customOrnamentId)
      )
    )
  );
  let customOrnamentsById: Map<string, { storage_path: string }> | undefined;
  if (customOrnamentIds.length > 0) {
    const { data: customOrnaments } = await supabase
      .from("custom_ornaments")
      .select("id, storage_path")
      .in("id", customOrnamentIds)
      .returns<{ id: string; storage_path: string }[]>();
    customOrnamentsById = new Map((customOrnaments ?? []).map((o) => [o.id, { storage_path: o.storage_path }]));
  }

  const rootDir = sanitizeSegment(`${album.title} - ${gallery.title}`);
  return { gallery, album, rangedSpreads, includeCover, photosById, customOrnamentsById, rootDir };
}

// resolveExportInputs' own spreads/photos read happens ONCE, right when a job starts — fine for a
// quick render, but a real PDF pass has been measured taking up to 902s (see worker/src/index.ts),
// and PDF quality steps chain up to several such passes in one job. Any edit the photographer (or
// the separate desktop app, writing to the same rows) makes anywhere from a few seconds after that
// single read to the very end of the job was silently invisible to the export — the renderer kept
// using the one in-memory copy for the whole job regardless of how long it took. This re-reads ONE
// spread fresh, immediately before it's actually rendered, and — since an edit can also swap in a
// photo/custom ornament the original resolveExportInputs call never fetched — fills in any newly-
// referenced photo/ornament the caller's photosById/customOrnamentsById maps don't have yet
// (mutated in place; both maps are shared by reference with every render call in the same job, so
// this makes the new id embeddable for every subsequent page too, not just this one). Returns null
// (caller falls back to the last-known row) only if the page itself was deleted mid-export.
export async function refreshSpreadAndPhotos(
  supabase: ReturnType<typeof createServiceRoleClient>,
  spreadId: string,
  photosById: Map<string, Pick<GalleryPhotoRow, "id" | "storage_path">>,
  customOrnamentsById: Map<string, { storage_path: string }>
): Promise<GalleryAlbumSpreadRow | null> {
  const { data: spread } = await supabase.from("gallery_album_spreads").select("*").eq("id", spreadId).maybeSingle<GalleryAlbumSpreadRow>();
  if (!spread) return null;

  const photoIds = [spread.photo_id_1, spread.photo_id_2, spread.background_photo_id, ...spread.elements.map((el) => (el.type === "photo" ? el.photoId : null))].filter(
    (id): id is string => !!id && !photosById.has(id)
  );
  if (photoIds.length > 0) {
    const { data: photos } = await supabase.from("gallery_photos").select("id, storage_path").in("id", photoIds).returns<Pick<GalleryPhotoRow, "id" | "storage_path">[]>();
    for (const p of photos ?? []) photosById.set(p.id, p);
  }

  const ornamentIds = spread.elements
    .map((el) => (el.type === "ornament" ? el.customOrnamentId : null))
    .filter((id): id is string => !!id && !customOrnamentsById.has(id));
  if (ornamentIds.length > 0) {
    const { data: ornaments } = await supabase.from("custom_ornaments").select("id, storage_path").in("id", ornamentIds).returns<{ id: string; storage_path: string }[]>();
    for (const o of ornaments ?? []) customOrnamentsById.set(o.id, { storage_path: o.storage_path });
  }

  return spread;
}

// How many pages a range spans — used both to size the job's total_count when it's created (before
// any rendering starts) and, for PDF, as the per-pass page count (a size-fitting retry pass reports
// progress against the same total again, restarting rather than climbing past 100%, since it
// genuinely IS starting the page loop over — see the PDF branch below).
export async function countExportPages(galleryId: string, fromPage: number, toPage: number): Promise<number | null> {
  const supabase = createServiceRoleClient();
  const resolved = await resolveExportInputs(supabase, galleryId, fromPage, toPage);
  if (!resolved) return null;
  return (resolved.includeCover ? 1 : 0) + resolved.rangedSpreads.length;
}

const QUALITY_STEPS: Record<"high" | "web", number[]> = {
  high: [90, 75, 60, 45, 30],
  // Was [60, 45, 30, 20], then [45, 30, 20] — starting point lowered again to 35% per explicit
  // request (2026-09-03), alongside dropping the target back down to 100MB (see TARGET_MAX_BYTES
  // below) — a smaller target needs a lower starting quality to land under it on the first try.
  web: [35, 30, 20],
};
// "web" is now the ONLY quality PDF exports ever use (the "high"/print-quality choice was removed
// from the UI entirely — see GalleryManageView.tsx's own comment on exportRangeConfirm — since a
// PDF export never needs original-resolution images). Went 5MB → 80MB → 150MB → 100MB — the last
// move per explicit request (2026-09-03, alongside lowering the starting quality-step to 35% above)
// tightening back down from 150MB.
const TARGET_MAX_BYTES: Record<"high" | "web", number> = {
  high: 20 * 1024 * 1024,
  web: 100 * 1024 * 1024,
};

// Notifies the photographer's OWN email (already on file — photographers.email, nothing new to
// collect) the moment ANY export (PDF/JPG/PSD) finishes — per explicit request that a backgrounded
// export shouldn't be something the photographer can miss. The in-app toast only reaches someone
// whose browser tab is still open; this reaches them even if they closed it entirely. Separate
// from job.send_to_email below, which is the PRINT HOUSE's own external address for a
// send-to-print-house job, not the photographer's — every job gets this one regardless of whether
// it's also a print-house job. Best-effort: a failed notification email must never fail the export
// itself, which already succeeded and is sitting in storage regardless.
async function notifyPhotographerExportReady(
  supabase: ReturnType<typeof createServiceRoleClient>,
  job: Pick<GalleryAlbumExportJobRow, "photographer_id" | "format">,
  albumTitle: string,
  storagePath: string
): Promise<void> {
  try {
    const { data: photographer } = await supabase
      .from("photographers")
      .select("email")
      .eq("id", job.photographer_id)
      .maybeSingle<{ email: string | null }>();
    if (!photographer?.email) return;
    const formatLabel = job.format === "pdf" ? "PDF" : job.format === "jpg" ? "JPG" : "PSD";
    const filename = job.format === "pdf" ? `${sanitizeSegment(albumTitle)}.pdf` : `${sanitizeSegment(albumTitle)}-${job.format}.zip`;
    const downloadUrl = await getSignedDownloadUrl("galleries", storagePath, 60 * 60 * 24 * 7, filename);
    await sendEmail({
      to: notificationEmailFor(photographer.email),
      subject: `ייצוא ${formatLabel} מוכן להורדה — ${albumTitle}`,
      text: `שלום,\n\nייצוא ה-${formatLabel} של האלבום "${albumTitle}" הסתיים ומוכן להורדה:\n${downloadUrl}\n\nהקישור בתוקף לשבוע ימים.`,
    });
  } catch (e) {
    // Best-effort — a failed notification email must never fail the export itself (see the
    // function's own comment above) — but silently swallowing the error made a real failure here
    // completely undiagnosable. Logged so `fly logs` (PDF) / Vercel function logs (JPG/PSD) show
    // exactly why, instead of just "the email never arrived, no idea why."
    console.error("[notifyPhotographerExportReady] failed to send export-ready email", e);
  }
}

export async function processAlbumExportJob(jobId: string, origin: string): Promise<void> {
  const supabase = createServiceRoleClient();

  // Atomic claim, not a plain select-then-update — this job can legitimately be triggered twice
  // in close succession (the immediate trigger right after job creation, and retry-stuck-zip-jobs'
  // cron fallback picking up the same still-"pending" row if the immediate trigger is ever slow),
  // and two overlapping calls both racing past a non-atomic check would render the same export
  // twice in parallel. Scoping the UPDATE itself to `status = "pending"` makes this compare-and-
  // swap: only the caller whose update actually flips a row gets `claimed` back non-null.
  const { data: claimed } = await supabase
    .from("gallery_album_export_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle<GalleryAlbumExportJobRow>();
  if (!claimed) return;
  const job = claimed;

  try {
    const resolved = await resolveExportInputs(supabase, job.gallery_id, job.from_page, job.to_page);
    if (!resolved) throw new Error("האלבום לא נמצא");
    const { album, rangedSpreads, includeCover, photosById, rootDir } = resolved;
    // Always a real Map (not undefined) from here on — refreshSpreadAndPhotos mutates it in place
    // whenever a freshly-edited page turns out to reference a custom ornament this job didn't know
    // about yet, which needs somewhere to land even if the album had none at job-start.
    const customOrnamentsById = resolved.customOrnamentsById ?? new Map<string, { storage_path: string }>();

    const pageWidthPx = pxFromCm(album.width_cm);
    const pageHeightPx = pxFromCm(album.height_cm);
    const storagePath = albumExportJobStoragePath(jobId, job.format);

    let processed = 0;
    const persistProgress = async () => {
      await supabase.from("gallery_album_export_jobs").update({ processed_count: processed, updated_at: new Date().toISOString() }).eq("id", jobId);
    };

    if (job.format === "jpg" || job.format === "psd") {
      const archive = new ZipArchive({ zlib: { level: 6 } });
      const uploadPromise = uploadObjectStream("galleries", storagePath, Readable.toWeb(archive) as ReadableStream, "application/zip");

      const renderPage = job.format === "jpg" ? renderAlbumPageJpeg : renderAlbumPagePsd;
      const ext = job.format === "jpg" ? "jpg" : "psd";

      // THE BUG THIS FIXES: a page whose render threw used to be silently DROPPED from the zip —
      // the try/catch here just logged to console and moved on, with `processed` still incrementing
      // and no error_message ever recorded, so the job finished "ready" with a matching
      // processed_count/total_count even though 1+ pages were missing from the actual file. Confirmed
      // live: a 19-page JPG export reported fully "ready" (processed_count 19/19, error_message null)
      // but pages 16 and 19 were missing from the delivered zip. One retry now gives a genuinely
      // transient failure (a network blip fetching a photo, a momentary hiccup) a chance to self-heal
      // without losing the whole export over it; a page that STILL fails after the retry aborts the
      // whole archive and re-throws with the page identified, so the outer catch below marks the
      // JOB itself "failed" with a clear message — never again a silently incomplete "ready" zip.
      const renderWithRetry = async (render: () => Promise<Buffer | null>, pageLabel: string): Promise<Buffer | null> => {
        try {
          return await render();
        } catch (e) {
          console.error(`Album export job ${jobId}: ${pageLabel} failed, retrying once`, e);
          await new Promise((resolve) => setTimeout(resolve, 1500));
          try {
            return await render();
          } catch (e2) {
            throw new Error(`רינדור ${pageLabel} נכשל: ${e2 instanceof Error ? e2.message : "שגיאה לא ידועה"}`);
          }
        }
      };

      try {
        if (includeCover) {
          const buf = await renderWithRetry(
            () => renderPage({ album, spread: null, isCover: true, pageWidthPx, pageHeightPx, photosById, customOrnamentsById }),
            "עמוד השער"
          );
          if (buf) archive.append(buf, { name: `${rootDir}/01 - שער.${ext}` });
          processed++;
          await persistProgress();
        }
        for (const staleSpread of rangedSpreads) {
          // Checked fresh from the DB every page — a cancel (see the export-jobs/[jobId]/route.ts
          // DELETE handler) needs to actually stop the render, not just the client's own polling
          // loop, which is all it used to do. archive.abort() lets uploadPromise below settle
          // instead of hanging forever waiting for a finalize() that will now never come.
          const { data: freshJob } = await supabase.from("gallery_album_export_jobs").select("status").eq("id", jobId).maybeSingle<{ status: string }>();
          if (freshJob?.status === "cancelled") {
            archive.abort();
            return;
          }
          // Re-read right before rendering, not the copy resolveExportInputs fetched when the job
          // started — see refreshSpreadAndPhotos' own comment for why that copy can be stale by the
          // time a later page in a long export actually renders.
          const spread = (await refreshSpreadAndPhotos(supabase, staleSpread.id, photosById, customOrnamentsById)) ?? staleSpread;
          const pageNumber = (includeCover ? 1 : 0) + rangedSpreads.indexOf(staleSpread) + 1;
          const spreadWidthPx = spread.width_cm ? pxFromCm(spread.width_cm) : pageWidthPx;
          const spreadHeightPx = spread.height_cm ? pxFromCm(spread.height_cm) : pageHeightPx;
          const buf = await renderWithRetry(
            () => renderPage({ album, spread, isCover: false, pageWidthPx: spreadWidthPx, pageHeightPx: spreadHeightPx, photosById, customOrnamentsById }),
            `עמוד ${pageNumber}`
          );
          if (buf) archive.append(buf, { name: `${rootDir}/${String(pageNumber).padStart(2, "0")}.${ext}` });
          processed++;
          await persistProgress();
        }
      } catch (e) {
        archive.abort();
        throw e;
      }
      archive.finalize();
      await uploadPromise;
    } else {
      // PDF: up to several full re-render passes at descending JPEG quality until the file fits
      // under the target size, and each pass now renders a small BATCH of pages per invocation
      // (PDF_PAGE_BATCH_SIZE) instead of the whole pass in one call — chained via
      // triggerAlbumExportProcessing exactly like gallery_zip_jobs' own parts. The earlier
      // "one invocation per whole quality-step pass" version still died silently on real albums:
      // confirmed live (2026-09-01) via a diagnostic heartbeat ticking independently of page
      // progress — it kept ticking for a while after processed_count froze, then it ALSO stopped,
      // proving the invocation itself gets killed by the platform well before its declared 800s
      // maxDuration, even inside after() with Fluid Compute active. Whatever the platform's real
      // undocumented ceiling actually is, batching keeps each invocation's real work small enough
      // to reliably finish under it — a stalled batch only re-does that one small batch (using the
      // resumeFromDoc/pageRange support in generateAlbumPdf to continue the SAME in-progress PDF
      // across invocations), not the whole pass or the whole quality step.
      // Confirmed live (2026-09-01): batches of 5 got three batches (15 of 19 pages) further than
      // any single-invocation attempt ever managed; batches of 3 got further still but kept dying
      // on the SAME specific page every retry, even after downscaling that page's (locally fast to
      // process) photos — local timing of every individual step (download, sharp, PDFDocument.load,
      // .save()) on the exact same data came back well under a second each, so whatever the
      // platform's real per-invocation ceiling is, it isn't explained by the actual compute cost of
      // any one step measured in isolation. Dropped to 1 page per invocation as the most defensive
      // setting available short of finding the platform's real cause — the now-fixed
      // retry-stuck-jobs cron picks up a stalled batch and re-does only that one page, so even an
      // unlucky invocation isn't a dead end.
      const PDF_PAGE_BATCH_SIZE = 1;
      const quality = job.quality === "web" ? "web" : "high";
      const steps = QUALITY_STEPS[quality];
      const stepIndex = Math.min(job.pdf_quality_step_index, steps.length - 1);
      const jpegQuality = steps[stepIndex];
      const isLastStep = stepIndex >= steps.length - 1;
      const rangedAlbum: GalleryAlbumRow = includeCover ? album : { ...album, cover_photo_id: null };
      const partialStoragePath = `${storagePath}.partial-${stepIndex}`;
      const pageStart = job.pdf_page_index;
      const pageEnd = Math.min(pageStart + PDF_PAGE_BATCH_SIZE, rangedSpreads.length);
      const resumeFromDoc = pageStart > 0 ? (await downloadObjectBuffer("galleries", partialStoragePath)) ?? undefined : undefined;
      processed = pageStart;

      // Diagnostic heartbeat — separate from processed_count/persistProgress above, which only
      // advance once per PAGE. Ticks independently of page progress so a genuinely-killed
      // invocation (heartbeat also stops) can be told apart after the fact from one still slowly
      // working (heartbeat keeps ticking past where processed_count froze).
      let heartbeatTick = 0;
      const heartbeat = setInterval(() => {
        heartbeatTick++;
        supabase
          .from("gallery_album_export_jobs")
          .update({ error_message: `heartbeat #${heartbeatTick} · ${new Date().toISOString()} · processed=${processed}` })
          .eq("id", jobId)
          .then(() => {}, () => {});
      }, 5000);
      let bytes: Uint8Array;
      try {
        bytes = await generateAlbumPdf({
          album: rangedAlbum,
          spreads: rangedSpreads,
          photosById,
          customOrnamentsById,
          jpegQuality,
          downloadCache: new Map<string, Buffer | null>(),
          resumeFromDoc,
          pageRange: { start: pageStart, end: pageEnd },
          refetchSpread: (id) => refreshSpreadAndPhotos(supabase, id, photosById, customOrnamentsById),
          onPageRendered: () => {
            processed++;
            persistProgress().catch(() => {});
          },
        });
      } finally {
        clearInterval(heartbeat);
      }

      // Checked fresh from the DB (not the `job` read at the top of this function, which is now
      // stale) — a cancel (see the export-jobs/[jobId]/route.ts DELETE handler) can land at any
      // point while this batch was rendering. Stopping here, before uploading a partial or handing
      // off to another invocation, is what makes a cancel actually stop the job server-side instead
      // of it quietly continuing to consume invocations/R2 bandwidth for a file nobody will ever
      // download — confirmed live 2026-09-02 as the reason abandoned test jobs kept competing with
      // a real, unrelated export for the same gallery's resources days later.
      const { data: freshJob } = await supabase.from("gallery_album_export_jobs").select("status").eq("id", jobId).maybeSingle<{ status: string }>();
      if (freshJob?.status === "cancelled") {
        if (pageStart > 0) await removeObjects("galleries", [partialStoragePath]).catch(() => {});
        return;
      }

      if (pageEnd < rangedSpreads.length) {
        // More pages left in this quality-step pass — stash the in-progress document and hand off
        // to a fresh invocation for the next batch instead of continuing here.
        await uploadObject("galleries", partialStoragePath, Buffer.from(bytes), "application/pdf");
        await supabase
          .from("gallery_album_export_jobs")
          .update({ status: "pending", pdf_page_index: pageEnd, error_message: null, updated_at: new Date().toISOString() })
          .eq("id", jobId);
        await triggerAlbumExportProcessing(jobId, origin);
        return;
      }

      // Last batch of this pass — `bytes` is the complete document for this quality step. Drop the
      // partial file (either it never existed, or it's now superseded by the finished document).
      if (pageStart > 0) await removeObjects("galleries", [partialStoragePath]).catch(() => {});

      if (bytes.byteLength > TARGET_MAX_BYTES[quality] && !isLastStep) {
        // Doesn't fit yet and a smaller-quality step remains — hand off to a fresh invocation for
        // it, starting that step's own page batching from page 0.
        await supabase
          .from("gallery_album_export_jobs")
          .update({ status: "pending", pdf_quality_step_index: stepIndex + 1, pdf_page_index: 0, processed_count: 0, error_message: null, updated_at: new Date().toISOString() })
          .eq("id", jobId);
        await triggerAlbumExportProcessing(jobId, origin);
        return;
      }
      await uploadObject("galleries", storagePath, Buffer.from(bytes), "application/pdf");
      processed = job.total_count;
      await persistProgress();
    }

    await supabase
      .from("gallery_album_export_jobs")
      .update({ status: "ready", storage_path: storagePath, processed_count: job.total_count, error_message: null, updated_at: new Date().toISOString() })
      .eq("id", jobId);

    // Print-house jobs don't end in a client download — the deliverable IS the email, sent once
    // the file is actually ready rather than the old route's synchronous zip-then-email round trip.
    if (job.send_to_email) {
      const downloadUrl = await getSignedDownloadUrl("galleries", storagePath, 60 * 60 * 24 * 7, `${rootDir}.zip`);
      // Goes to the photographer's print house, so it's sent in the photographer's name.
      const { data: sender } = await supabase
        .from("photographers")
        .select("name, email")
        .eq("id", job.photographer_id)
        .maybeSingle<{ name: string | null; email: string | null }>();
      await sendEmail({
        to: job.send_to_email,
        fromName: sender?.name ?? undefined,
        replyTo: sender?.email ? notificationEmailFor(sender.email) : undefined,
        subject: `קבצי הדפסה — ${album.title}`,
        text: `שלום,\n\nמצורף קישור להורדת קובצי ה-JPG להדפסה עבור האלבום "${album.title}" (${resolved.gallery.title}):\n${downloadUrl}\n\nהקישור בתוקף לשבוע ימים.`,
      });
    }
    await notifyPhotographerExportReady(supabase, job, album.title, storagePath);
  } catch (e) {
    await supabase
      .from("gallery_album_export_jobs")
      .update({ status: "failed", error_message: e instanceof Error ? e.message : "שגיאה לא ידועה", updated_at: new Date().toISOString() })
      .eq("id", jobId);
  }
}

// PDF-only, called ONLY from the Fly.io background worker (worker/src/index.ts) — never from any
// Vercel route. Moved off Vercel entirely 2026-09-03: a persistent worker process has no
// serverless-style execution ceiling at all (Vercel's turned out to silently kill an invocation
// around ~90-100s regardless of its declared maxDuration — see feedback_background_job_after_
// chaining's own memory note), which is exactly what forced processAlbumExportJob's PDF branch
// into rendering one page per invocation with a whole chained hand-off system just to survive that
// wall. None of that is needed here: a single call renders every page of every quality-step attempt
// in one straight shot, same shape as the very first version of this feature before any of that
// complexity existed. JPG/PSD stay on Vercel via processAlbumExportJob above — they never needed
// the workaround in the first place.
export async function processAlbumPdfJobOnWorker(jobId: string): Promise<void> {
  const supabase = createServiceRoleClient();

  // Atomic claim, not a plain select-then-update: with more than one Fly.io machine polling the
  // same "pending" queue (see worker/src/index.ts), two machines could both select the SAME job
  // as pending before either's update lands, and render it twice in parallel — wasteful, and
  // whichever finishes last silently clobbers the other's output/storage path. Scoping the UPDATE
  // itself to `status = "pending"` makes the claim compare-and-swap: only the machine whose
  // update actually flips a row gets `claimed` back non-null, so exactly one machine proceeds.
  const { data: claimed } = await supabase
    .from("gallery_album_export_jobs")
    .update({ status: "processing", updated_at: new Date().toISOString() })
    .eq("id", jobId)
    .eq("status", "pending")
    .select("*")
    .maybeSingle<GalleryAlbumExportJobRow>();
  if (!claimed || claimed.format !== "pdf") return;
  const job = claimed;

  try {
    const resolved = await resolveExportInputs(supabase, job.gallery_id, job.from_page, job.to_page);
    if (!resolved) throw new Error("האלבום לא נמצא");
    const { album, rangedSpreads, includeCover, photosById } = resolved;
    // Always a real Map (not undefined) — see the identical comment in processAlbumExportJob above.
    const customOrnamentsById = resolved.customOrnamentsById ?? new Map<string, { storage_path: string }>();

    const pageWidthPx = pxFromCm(album.width_cm);
    const pageHeightPx = pxFromCm(album.height_cm);
    const storagePath = albumExportJobStoragePath(jobId, "pdf");

    const isCancelled = async (): Promise<boolean> => {
      const { data: fresh } = await supabase.from("gallery_album_export_jobs").select("status").eq("id", jobId).maybeSingle<{ status: string }>();
      return fresh?.status === "cancelled";
    };

    const quality = job.quality === "web" ? "web" : "high";
    const steps = QUALITY_STEPS[quality];
    const rangedAlbum: GalleryAlbumRow = includeCover ? album : { ...album, cover_photo_id: null };
    let best: Uint8Array | null = null;
    for (let stepIndex = 0; stepIndex < steps.length; stepIndex++) {
      if (await isCancelled()) return;
      const jpegQuality = steps[stepIndex];
      let processed = 0;
      let lastPersist = 0;
      const bytes = await generateAlbumPdf({
        album: rangedAlbum,
        spreads: rangedSpreads,
        photosById,
        customOrnamentsById,
        jpegQuality,
        downloadCache: new Map<string, Buffer | null>(),
        refetchSpread: (id) => refreshSpreadAndPhotos(supabase, id, photosById, customOrnamentsById),
        onPageRendered: () => {
          processed++;
          // Throttled to at most once/second — this fires once per PAGE, and with no per-invocation
          // execution ceiling to survive there's no need for the aggressive per-page persistence
          // processAlbumExportJob's Vercel path relies on; this is purely for the client's own
          // polling progress bar.
          const now = Date.now();
          if (now - lastPersist > 1000) {
            lastPersist = now;
            supabase
              .from("gallery_album_export_jobs")
              .update({ processed_count: processed, pdf_quality_step_index: stepIndex, updated_at: new Date().toISOString() })
              .eq("id", jobId)
              .then(() => {}, () => {});
          }
        },
      });
      best = bytes;
      await supabase
        .from("gallery_album_export_jobs")
        .update({ processed_count: job.total_count, pdf_quality_step_index: stepIndex, updated_at: new Date().toISOString() })
        .eq("id", jobId);
      if (bytes.byteLength <= TARGET_MAX_BYTES[quality]) break;
    }

    if (await isCancelled()) return;

    await uploadObject("galleries", storagePath, Buffer.from(best!), "application/pdf");
    await supabase
      .from("gallery_album_export_jobs")
      .update({ status: "ready", storage_path: storagePath, processed_count: job.total_count, error_message: null, updated_at: new Date().toISOString() })
      .eq("id", jobId);
    await notifyPhotographerExportReady(supabase, job, album.title, storagePath);
  } catch (e) {
    await supabase
      .from("gallery_album_export_jobs")
      .update({ status: "failed", error_message: e instanceof Error ? e.message : "שגיאה לא ידועה", updated_at: new Date().toISOString() })
      .eq("id", jobId);
  }
}
