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
`albumToolAllowed` in `src/app/page.tsx` (home quick-access card, `AlbumQuickAccessButton`).
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
| PDF | `export-pdf` | **Fly worker** (`worker/src/index.ts` polls pending pdf jobs) | one PDF, a page per spread | 10 pages, about 180KB, 5s |
| JPG | `export-jpg` | Vercel (`after()` → `/api/internal/album-export-jobs/process`) | zip: `<album> - <gallery>/NN.jpg` | 3543×2362 px = 30×20 cm at 300 DPI, 13s |
| PSD | `export-psd` | Vercel, same path as JPG | zip of layered PSDs, 300 DPI in resolution info | valid `8BPS` v1, 3543×2362, 11s |
| בית דפוס | `send-to-print-house` | Vercel, same JPG job + `send_to_email` | email to the print house with a 7-day link; reply-to is the photographer | toast "נשלח בהצלחה ל-…", job `ready`; JPGs at 300 DPI |

Fallback: the `retry-stuck-zip-jobs` cron (every minute) re-triggers album jobs left `pending`.

### Known behavior (not bugs, but know them before you answer a user)

- **PDF is a proof, not a print file.** Every page is a fixed 1600×1000 pt (56.4×35.3 cm, ratio
  1.6) no matter the album size (`PAGE_WIDTH/PAGE_HEIGHT` in `albumPdf.ts`). For print, send
  JPG/PSD, which use the album's real cm size at 300 DPI.
- **JPG/PSD skip empty pages.** A page with no photo, text or background returns `null` and
  isn't in the zip, so a 10-page album with 3 filled pages gives 3 files. The PDF keeps all pages.
- **PDF export blocks while the Fly worker is stale.** `checkRenderWorkerHealth` returns 503
  ("שרת הרינדור עדיין לא עודכן…") until the worker's `code_hash` matches this deploy. The client
  retries quietly for 2 minutes ("מכינים את השרת"). After any change to render code (anything in
  the import graph of `worker/src/index.ts`), wait for the "Deploy PDF worker" workflow before
  running `scripts/deploy.sh`.
- JPG/PSD carry `density: 300` (the JPG metadata was added 2026-09-24; before that labs read
  them as 72 DPI). Verified live after the fix: `dpi == (300, 300)` on every page.
- Checking that the worker is current from the sandbox: `bash scripts/flyWorkerIsCurrent.sh` with
  `FLY_API_TOKEN` cleaned of newlines/quotes **only**. The token has a space ("FlyV1 …"), so
  stripping all whitespace gives a 401 that looks like "stale".

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
