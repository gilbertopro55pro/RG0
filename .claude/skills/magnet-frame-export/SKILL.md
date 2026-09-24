---
name: magnet-frame-export
description: Magnet frame designer (עיצוב מסגרת מגנט, /magnet-frames) on myframeflow.com — saving a design and downloading the landscape 20×15 / portrait 15×20 PNG. Use whenever a user downloads a magnet frame, reports a download that failed or came out wrong, or before shipping any change to the magnet tool (MagnetFrameEditor, magnetFrame.ts, magnetFrameShared.ts, api/magnet-frames). Holds the verified working procedure, how to test it live, and how to diagnose a failure.
---

# Magnet frame export (ייצוא מסגרת מגנט)

Verified end to end on the live site on 2026-09-24 (test account "סטודיו אור", plan פרו monthly).
Every procedure below actually passed. When something here stops being true, fix it and update
this file.

## Who gets the tool

פרו and פרו+ (and trials, which run on `studio_pro_monthly`), plus the admin. Entry tier (פרו סטארט)
doesn't. One shared rule in `src/lib/designTools.ts`, the same one the album designer uses:
- `designToolsAllowed(photographer)` decides the home card (`src/app/page.tsx`) and the page
  (`src/app/magnet-frames/page.tsx`, which redirects to `/`, or to `/billing` when the trial or
  subscription has ended).
- `requireDesignToolsUser()` gates all six `api/magnet-frames` routes (403 otherwise).

Verified: on a פרו סטארט account the card is hidden, `/magnet-frames` redirects to `/`, and every
API returns 403.

## How it works

- One design per photographer: `magnet_frame_designs` (the latest row). "שמירה" POSTs
  `/api/magnet-frames` with the landscape elements; the portrait layout is a deep copy (positions
  are percentages, so they carry over).
- The download buttons appear only after a save. They are synchronous GETs, with no job table:
  `/api/magnet-frames/<designId>/export?orientation=landscape|portrait` renders with sharp on
  Vercel (`magnetFrame.ts`: base mat → texture → elements) and returns the PNG, which the browser
  saves as `מגנט-לרוחב.png` / `מגנט-לאורך.png`.
- Custom textures and elements are uploaded to R2 buckets `magnet-frame-textures` /
  `magnet-frame-elements` (tables `magnet_frame_custom_textures` / `magnet_frame_custom_elements`).

| Download | Verified result |
|---|---|
| לרוחב (20×15) | 1600×1200 RGBA PNG, 203.2 DPI = 20.0×15.0 cm, transparent photo window, opaque mat |
| לאורך (15×20) | 1200×1600, same checks |

### Know before you answer a user

- **Resolution is 80 px/cm (203 DPI)**, fixed in `MAGNET_FRAME_DIMENSIONS`. That's fine for a
  20×15 magnet, but below 300 DPI. Since 2026-09-24 the PNG carries the matching density
  (`MAGNET_FRAME_DPI`), so it opens at 20×15 cm. Before that it opened as 72 DPI (about 56 cm).
- `magnetFrameShared.ts` is in the Fly worker's import graph, so changing it changes the render
  hash and redeploys the worker (see CLAUDE.md, deployment section).
- The default text sits low on the mat and can overlap the edge of the photo window. The
  photographer drags it, and the export shows it exactly where it was left.

## Testing live (the procedure that passed)

Run tests on the test account only: saving overwrites the account's design.
1. `GF_STATE=<scratchpad>/qa-state.json` (same session file as the guide-video and album-export
   skills). `NODE_PATH` must contain `playwright-core`.
2. `GF_STATE=… node export-test.js <outDir>`: closes the "install the app" card (it covers the
   editor buttons), adds a text and the first element, saves, then downloads both orientations.
   Pass = `save: 200` and two `download:` lines.
3. Check the files with Pillow: size 1600×1200 / 1200×1600, `info['dpi'] == (203.2, 203.2)`,
   alpha 0 in the center (photo window) and 255 at the edge (mat). Look at them over a colored
   background.
4. Access check: switch the test account to `basic_monthly` for a moment (SQL on `photographers.plan`),
   make sure the card is hidden, the page redirects and the APIs return 403, then **restore
   `monthly`**.

## When a user reports a problem

1. "שגיאה בהורדת הקובץ": the export GET failed. Check Vercel logs for
   `/api/magnet-frames/<id>/export`. Common causes are a custom texture or element whose R2 object
   is missing (`downloadObjectBuffer` returns null) or a malformed element in the design JSON:
   ```sql
   select id, updated_at, frame_settings, jsonb_array_length(landscape_elements) n
   from magnet_frame_designs where photographer_id = '<id>' order by updated_at desc limit 1;
   ```
2. "אין הרשאה" or a redirect to home: the account is פרו סטארט, or its subscription/trial ended
   (`plan`, `subscription_status`, `trial_ends_at`). That's expected, not a bug.
3. No download buttons: the design was never saved (the buttons need a `designId`).
4. Reproduce on the test account with `export-test.js` before and after the fix, and add what you
   learned to this file.
