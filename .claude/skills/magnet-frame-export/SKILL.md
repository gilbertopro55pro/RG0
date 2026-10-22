---
name: magnet-frame-export
description: Magnet frame designer (עיצוב מסגרת מגנט, /magnet-frames) on myframeflow.com — the frames list and templates, the editor, and downloading each frame's PNG/PSD in 5 print sizes (20×15, 15×10, 10×7.5, 10×7, 9×9). Use whenever a user downloads a magnet frame, reports a download that failed or came out wrong, or before shipping any change to the magnet tool (MagnetFrameEditor, magnetFrame.ts, magnetFrameShared.ts, api/magnet-frames). Holds the verified working procedure, how to test it live, and how to diagnose a failure.
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

### Since 2026-10-22 (the owner: "מעולה ונח לתפעול", stages 1–2 of the improvement plan)

- **Several frames per account.** `/magnet-frames` is a list (`MagnetFramesList`): upcoming events'
  frames first, then the rest by last edit; menu per card: open, rename, duplicate, link to an
  event, delete. `/magnet-frames/<id>` is the editor. `magnet_frame_designs.name` (migration 0190);
  the write policy also checks that `event_id` is the photographer's own event. API:
  `GET/POST /api/magnet-frames` (list / create, or save with `id`), `GET/PATCH/DELETE
  /api/magnet-frames/<id>`, `POST …/<id>/duplicate`. DELETE also removes that frame's PSDs.
- **A frame per event:** the event page has a "מסגרות מגנט" card (when the event has frames, or its
  package/type/quote mentions magnets) with `?new=1&event=<id>`.
- **"מסגרת חדשה":** name, event, size, and 13 templates by event kind (`lib/magnetFrameTemplates.ts`,
  `instantiateTemplate(key, sizeKey, {names, date})`), filled with the event's names and date and
  fitted to the size. A test checks every template at every size: no text over the window, inside
  the 3 mm margin, no overlap with decorations, every glyph in the export's font.
- **Sizes** (`MAGNET_FRAME_SIZES` in `magnetFrameShared.ts`, `frame_settings.sizeKey`, missing =
  20x15): 20×15, 15×10, 10×7.5, 10×7, 9×9. Design units keep the long side at 1600 px for every
  size (`magnetDesignDimensions`), so a layout keeps its proportions when the size changes. The
  export is the size at 300 DPI (`magnetExportDimensions`, `magnetExportScale`). 9×9 has a single
  frame: no step 2, and the export ignores the orientation (`loadMagnetDesign` returns landscape).
- **Editor tools** (`MagnetFrameEditor`, pure helpers in `lib/magnetFrameEditing.ts`, the frame
  drawing in `magnetFrame/MagnetFramePreview.tsx`):
  - Autosave a second after the last change, with a "נשמר / שומר... / השמירה נכשלה · ניסיון חוזר"
    chip; downloads await the save. No "שמירה" button any more.
  - Undo/redo (buttons, Ctrl/⌘+Z, Ctrl+Shift+Z / Ctrl+Y): changes under 450ms apart and one pointer
    drag are one step.
  - Snapping while dragging: the frame's middle, the window's edges and middle, the middle of each
    mat strip, other elements' centers; gold guide lines. Alt turns it off.
  - On the selected element: a corner handle resizes, a top handle rotates (snaps to 45°, Shift =
    15° steps). Double-click a text edits it in place.
  - Duplicate, forward/backward, lock (a locked element doesn't move and can't be deleted), delete.
    Keys: Delete, arrows (Shift ×4), Ctrl+D, Esc.
  - Text: outline (width, color), shadow color, letter spacing, size 10–320.
  - A sample photo in the window (from the device, or from a gallery — the linked event's first);
    never saved or exported. "אזור בטוח להדפסה" draws the 3 mm margin.
- **Export changes:** the text's shadow color, outline (`strokeWidth`/`strokeColor`) and letter
  spacing (`letterSpacingPx` in `svgTextLayer`, default 0, album output unchanged) in the PNG and
  the PSD (live Stroke "outside", tracking). PSD name: `magnet-frame-<size>.psd` (ASCII: Chromium
  drops a Hebrew `filename*`).
- **The file now matches the editor (fixed 2026-10-22, both were older gaps):** the text sat
  ~0.18em lower in the file (baseline at anchor + 0.5em; now the line box is centered like CSS,
  `heightPx` in `svgTextLayer`), and the shadow was twice as blurry (sigma = blur; now blur/2, a CSS
  radius). Checked against Chromium's CSS: Heebo matches to the pixel, Montserrat within 7 px at
  300 DPI (0.6 mm).
- **Verified live 2026-10-22** (`export-test.js`, test account, after deploy 251d3a8): created from
  "קלאסי אלגנטי" at 20×15 → autosave 200 → PNG 2362×1772 / 1772×2362 and PSD (~7.5MB each) for
  both orientations, 300 DPI, transparent window, opaque mat; then 9×9 → one frame, PNG 1063×1063.
  Both test frames deleted (DELETE 200). The file matched the editor on screen.
- **Not done, on purpose:** bleed and a print sheet of several magnets. The files go to the
  photographer's printing software, which places them; bleed would change the file size it expects,
  and a sheet needs the photos.

### Stage 3 (2026-10-22, later the same day)

- **QR code element** (`type: "qr"`, `lib/magnetQr.ts`, `QrPanel`, drawn by `MagnetFramePreview` and
  the export from the same `qrMatrix`, EC "M", 2-module quiet zone on a `bgColor` square). Targets:
  - "gallery": `myframeflow.com/m/<code>`, a stable link per EVENT (`magnetGuestUrl`, first 64 bits of
    the event id), so a magnet printed before the gallery exists works later. `app/m/[code]/route.ts`
    (`magnetGuestState` in `lib/magnetGuest.ts`): live only while one of the event's frames has a
    gallery QR; then the newest published, non-archived gallery → a view-only share link
    (`gallery_share_links.purpose = 'magnet_guests'`, all tabs, web quality, migration 0191) → 307.
    No gallery yet: `/m/<code>/info` ("התמונות יעלו לכאן בקרוב", studio logo, portfolio link, client
    language). The client's own `access_token` is never used.
  - "portfolio": `/p/<slug>`, only when the portfolio is on (`magnetPortfolioSlug`; the editor, list,
    portal and export all use it). "url": a typed http(s) link (`normalizeQrUrl`).
  - A QR without a link is a dashed placeholder on screen and left out of the files.
  - Size: hard minimum 2 cm, warning under 2.5 cm (`qrMinSizePct`). jsQR (devDependency) decodes the
    exported PNG in `magnetFrame.test.ts` (10×7 and 20×15 at 2 cm, rotated, over black and white).
- **Client approval in the portal** (`lib/magnetApproval.ts`, `PortalMagnetFrames`, migration 0191
  columns `client_shared_at / client_approved_at / client_comment / client_comment_at`):
  - Photographer: "שליחה ללקוח לאישור" in the card menu and the editor bar (`ClientApprovalBar`)
    opens `ClientMessageSheet` with the portal short link (`#magnets`) and sets `client_shared_at`
    (PATCH `shareWithClient`). Status chips: waiting / approved / comment / changed after approval.
  - Client: a "המגנטים לאירוע" card in the portal with the frames, "אישור העיצוב" and "יש לי הערה"
    (`POST /api/portal/<token>/magnet-frames/<id>`). A comment clears the approval. The photographer
    gets an event-log line and an email. **No push notification** (a new push type needs the owner).
  - Changing a frame's event clears the four client columns.
- **Colors from the invitation** (`lib/magnetPalette.ts`, `InvitationPalette` in הגדרות מסגרת): the
  image stays in the browser; median-cut palette → `frame_settings.palette`, shown after the fixed
  swatches in every color row; "התאמת המסגרת לצבעי ההזמנה" sets the mat (100%), the texts and the
  recolorable ornaments. Fonts from the invitation: not done (no reliable way to recognize a font).
- **A new text goes to a clear spot** (`freeTextSpot`): the bottom mat's middle, else its thirds, the
  top mat, the bottom corners, away from existing elements (a text added to a template used to land
  on its names).

### Before 2026-10-22

- **Layout (since 2026-10-05, the owner's design):** two sides. Right (65% on desktop): accordion
  panels, one open at a time (טקסט, אלמנטים, ספרות, טקסטורה, הגדרות מסגרת). Opening one closes the
  other, but its sub-tab, choices and scroll position are kept. "שמירה" sits at the top. Left
  (35%, sticky): both frames rendered as exported (`renderFrame("landscape" | "portrait")`, same
  elements, each orientation's own mat insets and scale). Both are draggable (they share xPct/yPct),
  and each has its download button under it. Picking an element on a preview opens its panel.
  Mobile: the two previews side by side on top, the panels below. Verified live 2026-10-05: panels,
  kept state, save 200, both downloads (2362×1772 / 1772×2362, 300 DPI), no sideways scroll at 390px.
- **Since 2026-10-06:** title row = title, "?" help, bold "שמירה". Panels are a horizontal tab row
  (solo, each keeps its scroll). The editor measures the space under the title row and fills it,
  so the page never scrolls; only the panels side does. Under 500px tall (phone sideways) the
  title row is compact with its own back arrow. A phone held upright gets a "rotate" card instead
  (CSS only, the editor stays mounted).
- **Two steps (2026-10-06):** step 1 = landscape frame (all panels; the portrait preview is
  read-only). Step 2 = portrait frame, pre-filled: each element mapped region by region (`mapAxis`:
  mat / window / mat per axis) and a text wider than 90% of 1200px scaled down (widths measured
  from the landscape preview). Only placement is edited there (drag, nudge, size, rotation, back to
  automatic); adjustments are `portraitOverrides` and the POST sends `portraitElements`. On load,
  portrait positions that differ from the landscape ones are taken as overrides.
- **Rotation (2026-10-06):** `rotation` (degrees, clockwise) on text and decorations. The export
  rotates each element around its own visible center (`rotateLayerAroundContent` / `placeCentered`
  in magnetFrame.ts; text + its shadow turn together, like the CSS). Verified locally: text −20°,
  a digit 30°, an ornament 45° at the corner (cropped at the edge, no error).
- **Texture on the mat only:** masked by the plain mat (`shadowEnabled: false`), not by the shadowed
  base, whose shadow pixels inside the window used to let the texture show there. In the editor
  the window's checker has a white base under it.
- The portrait preview is the point of the layout: a text centered on the landscape bottom mat can
  sit partly over the photo window in portrait (the portrait mat is a smaller share of the height).

- Until 2026-10-22: one design per photographer (the latest row) and a "שמירה" button. Now
  several frames and autosave (see above).
- The download buttons ("הורדת מסגרת רוחב (20×15)" / "הורדת מסגרת אורך (15×20)") are always shown
  and **save first** (since 2026-09-28): `download()` awaits `save()` and exports the returned id, so
  the file always matches the screen (before that, an edit after the last save was missing from the
  download). Checked in Chromium with a stubbed API: `POST /api/magnet-frames` then `GET …/export`.
  The export itself is a synchronous GET, with no job table:
  `/api/magnet-frames/<designId>/export?orientation=landscape|portrait` renders with sharp on
  Vercel (`magnetFrame.ts`: base mat → texture → elements) and returns the PNG, which the browser
  saves as `מגנט-לרוחב.png` / `מגנט-לאורך.png`.
- Custom textures and elements are uploaded to R2 buckets `magnet-frame-textures` /
  `magnet-frame-elements` (tables `magnet_frame_custom_textures` / `magnet_frame_custom_elements`).

| Download | Verified result |
|---|---|
| לרוחב (20×15) | 2362×1772 RGBA PNG, 300 DPI = 20.0×15.0 cm, transparent photo window, opaque mat (verified 2026-09-25) |
| לאורך (15×20) | 1772×2362, same checks |

### PSD download (since 2026-10-05)

- "הורדת PSD" under each preview: saves first, then `GET /api/magnet-frames/<id>/psd?orientation=…`
  builds the file (`renderMagnetFramePsd` in `src/lib/magnetFramePsd.ts`), uploads it to R2
  (`magnet-frame-exports/<userId>/<designId>-<orientation>.psd`, overwritten each time) and returns
  `{ url }`, a signed link that downloads it. Not streamed back: a PSD with a rich texture can pass
  Vercel's 4.5MB response limit.
- Layers, bottom to top: "מקום לתמונה" (hidden, the window's shape, to clip a photo to), "מסגרת"
  (inner shadow = live Drop Shadow, distance 0), "טקסטורה" (clipping), then one layer per text /
  element (named by its text; a text's shadow = live Drop Shadow, angle 135). Plus the flattened
  composite. 300 DPI. The effects use the same descriptor and `lrFX` removal that albumPsd.ts verified
  in real Photoshop. Text is pixels, not editable type (a Hebrew type layer can't be checked from
  here).
- Verified live 2026-10-05: both files download (~2MB, ~10s each), 2362×1772 / 1772×2362, 300 DPI,
  all layers present, effects on the mat and texts. Not yet opened in real Photoshop by the owner.
- Time is mostly the texture render (~8.5s at 300 DPI); the PSD renders it once and reuses it for the
  composite. The PNG download pays the same cost.
- Hebrew download names: `getSignedDownloadUrl` writes `filename*=UTF-8''…` (RFC 6266). A plain
  `filename="%D7…"` made Chrome save the file as "download" with no extension.

### Know before you answer a user

- **Two coordinate systems.** Designs are stored and edited in design units: `MAGNET_FRAME_DIMENSIONS`,
  1600×1200 at 80 px/cm. Positions are percentages, and font sizes, shadows and texture tiles are
  in design pixels. The export renders at 300 DPI: `magnetExportDimensions()` gives 2362×1772, and
  `magnetFrame.ts` multiplies every pixel size by `MAGNET_EXPORT_SCALE` (≈1.476). A new pixel-sized
  setting has to be multiplied by `S` in `magnetFrame.ts` too, or it will look smaller in the
  export than in the editor.
  - History: until 2026-09-24 the export was 1600×1200 with no DPI tag, so it opened as 72 DPI
    (about 56 cm wide). On 2026-09-24 it got a 203 DPI tag, and since 2026-09-25 it renders at 300 DPI.
- `magnetFrameShared.ts` is in the Fly worker's import graph, so changing it changes the render
  hash and redeploys the worker (see CLAUDE.md, deployment section).
- Sizes in Hebrew UI text must be wrapped in `<Dim>` (a `dir="ltr"` isolate): a bare "20×15" in
  an RTL line renders as "15×20" (the owner read the landscape button as "(15X20)", 2026-09-28).
- The "ספרות" element tab (0–10 in קומיקס / מלכותי / אלגנטי / נקי) adds text elements in Permanent
  Marker / Cinzel Decorative / Playfair Display italic / Montserrat. Latin-subset fonts only: the
  Hebrew-subset fonts (Rubik Bubbles, Fredoka) have no digit glyphs.
- Illustrated numbers (since 2026-09-28), in the same "ספרות" tab above the font rows: זהב וכסף /
  מסיבה / בת מצווה / בר מצווה × 0–10, 12, 13, and מסולסל / צבע מתחלף / תלת מימד × 0–10.
  תלת מימד comes in 8 colors, picked with swatches next to the row label
  (`threeD-<color>-<n>.png`, id `digit-threeD-<color>-<n>`). The "חיות" and "עוגה" styles were
  removed at the owner's request; no saved design used either one. These are static PNGs in
  `public/magnet-elements/digits/<style>-<n>.png`, generated by `scripts/magnet-digits/generate.mjs`
  (digit outlines from the bundled fonts plus SVG artwork, rasterized with sharp; re-run it after
  editing a style). They're listed in `src/lib/magnetFrameDigits.ts` and added as decoration elements
  with `floralId = digit-<style>-<n>`. `findMagnetFrameFloral` also resolves these ids, so the export
  takes the same path as the watercolor florals. Verified: `composeMagnetFrameElements` with
  `digit-gold-12` and `digit-animals-3` renders both. Glyph outlines from
  Montserrat have overlapping contours: fill them only, since a stroke draws the overlaps as lines inside the digit.
- A new text starts centered on the bottom mat: `yPct = 100 − bottomPct/2`, from the current
  mat settings (since 2026-09-25). Texts already saved keep their position.

## Testing live (the procedure that passed)

Run tests on the test account only.
1. `GF_STATE=<scratchpad>/qa-state.json` (same session file as the guide-video and album-export
   skills). `NODE_PATH` must contain `playwright-core`. In the cloud environment, don't use the
   script's `ignoreHTTPSErrors`: route requests through Node's fetch (`ctx.route`) instead, which
   keeps TLS verification on.
2. `GF_STATE=… [GF_SIZE=9x9] [GF_PSD=1] node export-test.js <outDir>`: from the list, creates a frame
   ("מסגרת חדשה", size, template "קלאסי אלגנטי"), adds a text and the first element, waits for the
   autosave, downloads each orientation (one for 9×9), then deletes the frame (`GF_KEEP=1` keeps it).
   Pass = `created:`, `autosave: 200`, a `download:` line per orientation, `deleted test frame: 200`.
3. Check the files with Pillow: size 2362×1772 / 1772×2362 (15×10: 1772×1181, 10×7.5: 1181×886,
   10×7: 1181×827, 9×9: 1063×1063), `info['dpi'] ≈ (300, 300)`,
   alpha 0 in the center (photo window) and 255 at the edge (mat). Look at them over a colored
   background.
4. Access check: switch the test account to `basic_monthly` for a moment (SQL on `photographers.plan`),
   make sure the card is hidden, the page redirects and the APIs return 403, then **restore
   `monthly`**.

Next.js 16.4.0 / sharp 0.35.5 (2026-10-13): `export-test.js` passed live after the upgrade (save 200, both
orientations 2362×1772 / 1772×2362, 300 dpi, transparent window, opaque mat). The only code
change in the tool was a type annotation in `composeMagnetFrameElements` (sharp 0.35 types
`toBuffer()` as `Buffer<ArrayBuffer>`).

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
