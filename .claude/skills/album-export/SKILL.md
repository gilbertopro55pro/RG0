---
name: album-export
description: Album designer (עיצוב אלבום) exports on myframeflow.com — PDF, JPG, PSD and "שליחה לבית דפוס". Use whenever a user exports an album, reports an export that failed / is stuck / produced a wrong file, or before shipping any change to album export or rendering code (albumExportJobs, albumRaster, albumPdf, albumPsd, the export routes, the Fly worker). Holds the verified working procedure for each export, how to test it live, and how to diagnose a failure.
---

# Album exports (ייצוא אלבום)

Verified end to end on the live site on 2026-09-24 (test account "סטודיו אור", plan פרו monthly,
10-page 30×20 album built from the "תמונה ראשית ואשכול" template). Every procedure below is one
that actually passed. When something here stops being true, fix it and update this file.

## Who gets the tool

פרו and פרו+ (tier `standard` / `studio_pro`), plus the admin. Entry tier (`basic`, "פרו סטארט")
doesn't. The rule is `nonBasicTierAllowed` in `GalleryManageView.tsx` (album tab) and
`designToolsAllowed` (`src/lib/designTools.ts`, shared with the magnet tool) in `src/app/page.tsx`
(home quick-access card, `AlbumQuickAccessButton`).
Trial accounts run on `studio_pro_monthly`, so they have it. The tool refuses portrait screens.

## How each export works

All four create a row in `gallery_album_export_jobs` and return `{ jobId }` right away. The client
polls `GET /api/galleries/<gallery>/album/export-jobs/<jobId>` until `status` is `ready` (the
response then has a signed R2 `downloadUrl`) or `failed` (`errorMessage`). Limit: **one active
export per photographer**. A second request returns the running job with `alreadyActive: true`.
Every finished export also emails the photographer a download link (`notifyPhotographerExportReady`,
through `notificationEmailFor`).

| Format | Route | Renders on | Output | Verified result |
|---|---|---|---|---|
| PDF | `export-pdf` | **Fly worker** (`worker/src/index.ts` polls pending pdf jobs) | one PDF, a page per spread | 10 pages at 30.0×20.0 cm, about 180KB, 5s |
| JPG | `export-jpg` | Vercel (`after()` → `/api/internal/album-export-jobs/process`) | zip: `<album> - <gallery>/NN.jpg` | 3543×2362 px = 30×20 cm at 300 DPI, 13s |
| PSD | `export-psd` | Vercel, same path as JPG | zip of layered PSDs, 300 DPI in resolution info | valid `8BPS` v1, 3543×2362, 11s |
| בית דפוס | `send-to-print-house` | Vercel, same JPG job + `send_to_email` | email to the print house with a 7-day link; reply-to is the photographer | toast "נשלח בהצלחה ל-…", job `ready`; JPGs at 300 DPI; email confirmed delivered to the inbox (not spam) |

Print-house email wording (2026-10-06): Gmail put the old notification-style mail ("קבצי הדפסה | …",
no signature) under the Updates tab. It now reads as a personal note: subject "קבצים להדפסה: אלבום …",
a short body, "אפשר פשוט להשיב למייל הזה", and the photographer's signature (name, phone, email).
Gmail's tabs are its own classifier, so this improves the odds but can't guarantee the inbox; the
sure fix on the recipient side is moving one email to Primary ("do this for future messages").
Verified 2026-10-06 (test job 4b4b76a5, test account → the owner's Gmail): the new wording landed
in the inbox (Primary). The owner's earlier test to the print house, which landed in Updates, may
have been sent before this version went live.

Print-house notes (since 2026-09-28): the "שליחה לבית דפוס" sheet has an optional
"הנחיות והערות לבית הדפוס" textarea. It's sent as `notes` (trimmed, max 2000), stored on the job
as `send_notes` (migration 0139) and added to the print-house email under "הנחיות והערות:".
The home "עיצוב אלבום" quick access (`AlbumQuickAccessButton`) has the same "שליחה לבית דפוס" flow
(print-house emails, notes, whole album via `to: 9999`), polled with the same ProgressModal.

Print-house download tracking (since 2026-09-28, migration 0140). The email links to
`https://myframeflow.com/print/<share_token>`, not to R2. The page shows the album, the notes and
a "הורדת הקבצים" button. Only the button counts (a POST to `/api/print/<token>/download`), because
mail scanners open links on their own. The route calls the RPC `record_print_house_download`, adds
one `event_notifications` row (`is_client_action`, so it's a red badge on the event) on the
**first** download only, and redirects 303 to a signed URL valid for 1 hour.
- The link works 7 days from when the files are ready (`link_expires_at`, set in
  `processAlbumExportJob`). The file is kept 30 days (`expires_at`). The cron clears
  `storage_path` on print jobs instead of deleting the row, so the history stays.
- The send sheets (gallery + home quick access) show "שליחות קודמות" (`PrintHouseSendsHistory`,
  `GET …/album/print-sends`): downloaded at … (N), extend/renew the link by a week while the file
  exists (`POST …/print-sends/<job>/renew`, same link works again), copy the link, or send again
  once the file is gone.
- Jobs from before 0140 have no `share_token` and keep the direct signed link ("בלי מעקב הורדה").
- Verified live 2026-09-28 (test account, job 7b3cd568): processing set `link_expires_at`. Page
  GETs and a GET on the download route left the count at 0. POST ×2 gave count 2 and exactly one
  notification, and the zip held 10 JPGs. With `link_expires_at` in the past, the page shows "תוקף
  הקישור פג" and the POST doesn't count. With `expires_at` in the past, the cron deleted the file
  and kept the row. Not tested live: the renew/print-sends routes (no photographer session in the
  sandbox). The component was tested in Chromium against a stubbed API.
- Test without a UI session: insert a pending print job on the test account with SQL (with
  `share_token`, `link_expires_at`, `expires_at`, and the default `print_house_emails` address,
  which is the owner's inbox). The every-minute cron renders and emails it.

Fallback: the `retry-stuck-zip-jobs` cron (every minute) re-triggers album jobs left `pending`.

### Known behavior (not bugs, but know them before you answer a user)

- **PDF page = the album's real size** (since 2026-09-24). Pages are drawn 1600 "design points"
  wide with the height following the album's proportions, then each new page is scaled with
  `page.scale` to its physical cm size (a 30×20 album gives 30.0×20.0 cm pages). Before that,
  every page was a fixed 1600×1000 pt (56.4×35.3 cm, ratio 1.6), which squeezed any album that
  isn't 1.6. The batched (Vercel resume) path only scales the pages the current call added
  (`firstNewPageIndex`), so a page is never scaled twice. It's still a proof: no bleed or trim marks.
- **One output per page in every format** (since 2026-09-25). An empty page becomes a white page:
  a white JPG, a PSD with a white Solid Color fill layer (no pixel data, so no memory cost even at
  60×30 cm), and a blank page in the PDF. Page numbers match across formats. Before this, JPG and PSD
  skipped empty pages, and the PDF skipped preset-layout pages that had no first photo.
- **PDF export blocks while the Fly worker is stale.** `checkRenderWorkerHealth` returns 503
  ("שרת הרינדור עדיין לא עודכן…") until the worker's `code_hash` matches this deploy. The client
  retries quietly for 2 minutes ("מכינים את השרת"). After any change to render code (anything in
  the import graph of `worker/src/index.ts`), wait for the "Deploy PDF worker" workflow before
  running `scripts/deploy.sh`.
- JPG/PSD carry `density: 300` (the JPG metadata was added 2026-09-24; before that labs read
  them as 72 DPI). Verified live after the fix: `dpi == (300, 300)` on every page.
- **Automatic download after a long export fails on iPhone** (found live 2026-09-26: a 19-page PDF,
  5 min on the worker, "ההורדה נכשלה" in the home quick-export sheet while the email link worked).
  After minutes of polling, `navigator.share` no longer counts as the user's tap, and fetching the
  whole file into a blob is heavy on a phone. Both the home quick export (`AlbumQuickAccessButton`)
  and the gallery screen (`GalleryManageView`, toast `linkOnly`) now fall back to a plain
  "הורדת הקובץ" link to the signed URL: the user's own tap opens it, like the email.
- **Real albums used to render slowly on the worker**: 315s for 19 pages (about 120 originals of
  13MB), because each photo was downloaded and then decoded strictly one after another. Since
  2026-09-26 `generateAlbumPdf` prefetches the current and next page's originals (4 at a time,
  shared in-flight requests, cache 600MB) and the "web" PDF caps photos at 2400px (`PHOTO_MAX_PX`,
  "high" stays 3200). Local benchmark (the real renderer against a fake R2 with 150ms + 40MB/s,
  24 photos of 22MB): 37.9s → 14.3s (prefetch alone 17.2s), PDF 8.8MB → 3.4MB, pages still
  30×20cm. **Live on the worker the gain was smaller**: the same real 19-page album went 315s →
  201s (2026-09-26, job 477ebeaa). The local machine decodes faster than shared-cpu-2x, so on Fly
  most of the time is CPU (decoding originals), not download. The test album's 5s isn't
  representative of real albums.
- Checking that the worker is current from the sandbox: `bash scripts/flyWorkerIsCurrent.sh` with
  `FLY_API_TOKEN` cleaned of newlines/quotes **only**. The token has a space ("FlyV1 …"), so
  stripping all whitespace gives a 401 that looks like "stale".

Regions (since 2026-09-26): the Vercel functions run in `fra1` (vercel.json `regions`), next to
Supabase; the Fly render worker is in `iad`. If exports slow down or time out after that move,
check the Vercel→Fly leg first.

- **Text effects (since 2026-10-06):** shadow, glow and the new outline (`strokeWidth` in points of
  the 1600pt reference, `strokeColor`) are defined once in `textShadowSpecs` / `textEffectsCss`
  (albumRender.ts) and drawn by every renderer: the editor and client proofing (CSS), JPG/PSD
  (`svgTextLayer` `effects`: blurred offset copies + a `vector-effect="non-scaling-stroke"` outline;
  without non-scaling the per-glyph font-units scale shrank the outline to nothing), PDF (offset
  copies and a ring of copies, since pdf-lib has no blur or stroke). No shadow/glow set = the soft
  contrast shadow the editor always showed; before this, JPG/PSD drew no text shadow at all and the
  PDF a fixed 2pt one. Text fields must be copied in **both** text mappings of
  `resolvePageElements` (the preset-layout one and the custom-layout one) — missing the second is
  what first hid the outline in testing. Verified locally: JPG + PDF of a page with outline,
  shadow, outline+shadow and plain text.

## Testing live (the procedure that passed)

Run tests on the test account only, never on a real photographer's album. The script
`export-test.js` next to this file drives the real UI: it opens the gallery with `?openAlbum=1`,
clicks the export button, confirms the range dialog ("הורדה") and follows the job.

1. Session: `GF_STATE=<scratchpad>/qa-state.json` (the same session file as the guide-video
   skill; to create it see `../guide-video/login.js`, and never write the password anywhere).
   `NODE_PATH` must contain `playwright-core`.
2. Album: the test account's gallery "יעל ואיתי, חתונה" (`156b4f30-cb50-46a8-80ff-70febd8b996f`)
   already has one. For a new album: album tab → common size → template → "יצירת האלבום מהתבנית".
3. Run each format:
   `GF_STATE=… GF_GALLERY=156b4f30-cb50-46a8-80ff-70febd8b996f node export-test.js pdf <outDir>`
   (then `jpg`, `psd`). Pass = `final: { status: 'ready' }` plus a file.
4. Check the files, not just the status:
   - PDF: `pymupdf`, correct page count, pages render (`page.get_pixmap`).
   - JPG: `zipfile` + Pillow, size = `round(cm/2.54*300)` on each side, `dpi == (300, 300)`.
   - PSD: first bytes `8BPS`, version 1, same pixel size.
5. Print house: the account needs a row in `print_house_emails` (in settings, or in the send
   sheet itself). The test account already has one, "בדיקת מערכת (תיבת גילברטו)", as default. **This sends a real email**, so send only to the user's own inbox
   (gilbertopro55@gmail.com) and tell them. `node export-test.js print` → toast "נשלח בהצלחה ל-…".

Sandbox-only noise: the in-browser download from R2 sometimes fails with
`ERR_TOO_MANY_RETRIES`, and polling can hang for about a minute. That's the environment's proxy,
not the app. Check the timing in the DB (`updated_at - created_at`); the script falls back to the
signed URL.

## When a user reports an export problem

1. Find the job:
   ```sql
   select id, format, status, processed_count, total_count, error_message, send_to_email,
          created_at, updated_at from gallery_album_export_jobs
   where photographer_id = '<id>' order by created_at desc limit 10;
   ```
   - `pending` for more than about a minute: the trigger or worker never picked it up. PDF means
     the worker (`fly status`, `worker_status` row: `last_heartbeat_at`, `code_hash`). JPG/PSD means
     the cron and Vercel logs for `/api/internal/album-export-jobs/process`.
   - `processing` stuck: a render crashed mid-way. `error_message` of PDF jobs on the Vercel path
     holds heartbeats (`heartbeat #n … processed=k`), so the last k is the page that died.
   - `failed`: `error_message` names the page ("רינדור עמוד N נכשל: …"). Open that spread's
     `elements` in `gallery_album_spreads`.
   - A leftover `processing` job blocks every new export for that photographer (one active per
     photographer). Cancel it with `status = 'cancelled'`.
2. PDF 503 right after a deploy: the worker is stale. Check the "Deploy PDF worker" run on
   `main` and `scripts/flyWorkerIsCurrent.sh`. Don't deploy Fly from the cloud sandbox (see
   CLAUDE.md).
3. Reproduce on the test account with `export-test.js` before and after the fix, and check the
   files as in step 4 above.
4. Once a new procedure or fix is verified, add it to this file (what failed, why, what passed).
