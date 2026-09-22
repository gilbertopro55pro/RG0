# Desktop app parity — status checkpoint

**UPDATE (same session, later):** Items 3, 4, 5, 2 are DONE — implemented, typechecked
(`npm run typecheck`), and full-built (`npm run build`) successfully in the desktop repo. NOT yet
committed/pushed in the desktop repo (that repo's own git status hasn't been checked/touched this
round — only the web repo's git has been managed so far). Item 1 (TextFloatingMenu) is next, not
started yet. Details of what was actually changed for 2/3/4/5, in case this needs auditing later:

- **Item 3 (boundary clamp on drag)**: fixed in `src/components/AlbumSpreadCanvasEditor.tsx` —
  group-drag and single-drag clamps changed from flat `Math.min(95, ...)` to
  `Math.min(100 - widthPct/heightPct, ...)`. Also fixed a bonus bug found in the same code region:
  the focal-point pan-drag direction was `+` (wrong) instead of `-` (matches web's own fix) —
  ported that too since it was directly adjacent and tiny.
- **Item 4 (addText stacking bug)**: ported `src/lib/albumTextSizing.ts` (new file, copy of web's).
  Rewrote `addText()` to cascade position (`(count % 8) * 4` step) and compute `heightPct` via
  `textHeightPctForFontSize(40, album)` instead of a flat `heightPct: 15`. fontSize/fontFamily/
  color stay hardcoded (40/heebo/white) — desktop's add-text UI has no pickers for those yet
  (that's part of item 1's territory, not done).
- **Item 5 (sort dropdown)**: added `dragPanelSort` state + sort logic + `<select>` UI next to the
  existing "הצג הכל" toggle in the drag-panel header. Required adding `original_filename`/
  `created_at` to `PhotoWithUrl` type (both files that declare it — `AlbumPageEditor.tsx` and
  `AlbumSpreadCanvasEditor.tsx`), to `GalleryPhotoRow` type (`created_at` was missing), and to the
  `gallery_photos` select query in `AlbumPageEditor.tsx` (added `created_at` column — 
  `original_filename` was already selected but was being dropped during the `withUrls` mapping).
- **Item 2 (background zoom)**: added `backgroundZoom` state, CSS `transform: scale()` on the main
  canvas background `<img>`, and a `SliderControl` in the settings-panel background block. Wired
  `zoom` through the ENTIRE save chain: `onSave` prop type → `AlbumPageEditor.tsx`'s `handleSave`
  (now writes `background_zoom` to Supabase) → `GalleryAlbumSpreadRow` type (added
  `background_zoom: number`) → the spread SELECT query in `AlbumBrowser.tsx` (added the column).
  Also wired it into the NATIVE single-page PSD export path, which turned out to need very little
  work since `coverCropRaw` in `electron/psdWriter.ts` already supported a generic `zoom` param
  (used for regular photos) — just had to thread `zoom` through 4 type declarations
  (`ExportBackground` in psdWriter.ts, `WireBackground` in both `main.ts` and `preload.cts`,
  `AlbumPageBackgroundInput` in `api.d.ts`) and pass it at the two call sites (`AlbumPageEditor.tsx`
  constructing the background object, and the `coverCropRaw` call in `psdWriter.ts`). No DB
  migration needed — `background_zoom` column already exists in the shared Supabase project
  (added earlier this session for the web app, migration 0118).

**UPDATE 2:** Item 1 (TextFloatingMenu) done too — converted desktop's static always-shown sidebar
text-controls block (which already had all the functional content: color/align/font/size, just not
as a floating panel) into a real floating menu matching OrnamentFloatingMenu/ShapeFloatingMenu's
existing pattern (simple conditional render positioned via el.xPct/yPct, NOT web's newer
draggable/resizable lastSideSelection system — item 16 stays unported, deliberately not pulled in
as a dependency). No lock button (item 9 not ported). All 5 originally-requested items (1-5) done,
typechecked, and full-built successfully.

**UPDATE 3 — Round A done** (items 12, 17, 19, 22 from the "17 additional gaps" list, all
typechecked + full-built):
- **12 (Alt-key symmetric resize)**: `computeResize` gained a `symmetric` param (mirrors web
  exactly); wired via `e.altKey` at its one call site.
- **17 (right-click photo → set/unset background)**: added `photoContextMenu` state, `onContextMenu`
  handler on drag-panel thumbnails, and the dropdown menu UI (ported verbatim from web).
- **19 (margin-snap visual feedback)**: `computeResizeGuides` gained a `marginInsetPct` param and
  now returns `marginSnapX`/`marginSnapY`; added `marginSnap` state (reset on endDrag and on the
  group-resize branch, matching web). Kept desktop's existing SINGLE unified margin-guide div
  (not split into 4 edge divs like web's newer version) — brightens as one box on either-axis
  snap, a deliberately smaller/simpler port than web's exact per-edge version.
- **22 (Cmd/Ctrl+A select-all, bare T)**: new dedicated keydown effect, ported from web minus the
  Cmd/Ctrl+Z undo part (item 8, not ported — desktop has no `undo()` yet). Bare T calls
  `setTextDraftOpen(true)` directly (desktop's simpler add-text toggle, not web's
  `textButtonRef.current?.click()` pattern, which belongs to the fuller item-16 architecture that
  wasn't ported).

**Still not done, not started:** Round B onward (undo, exit-confirm dialog, photo adjustments
panel, shadow distance/blur split, shapeStyle, element lock, drag-panel hover-zoom + multi-select,
new-photo size picker, draggable/resizable panels, page-switcher thumbnail strip, help modal).

**UPDATE 4 — Git**: the desktop repo had NEVER been a git repository at all (no `.git` dir existed
despite ~1 month of work) — ran `git init`, staged, reviewed for secrets (clean, `.env` already
gitignored), and made an initial commit (64 files, root commit `961589e`). **No remote is
configured** — user was asked where to push (new GitHub repo under the same account as the web
app?) but hasn't answered yet. Round B's changes (below) are NOT committed yet either — ask before
committing again, same standing "never commit unless asked" rule as the web repo.

**UPDATE 5 — Round B done** (items 8, 18 — both typechecked + full-built):
- **8 (Undo, Cmd/Ctrl+Z)**: ported verbatim — renamed the base `useState` setter to
  `setElementsRaw`, added a wrapped `setElements` (records a snapshot into `undoHistoryRef` on
  every mutation except mid-drag), `undo()`, and a snapshot recorded once at `startDrag`'s start
  (so one undo reverts a whole drag gesture, not one pointermove tick). Skipped the `.locked` guard
  web's `startDrag` has (item 9 not ported). Wired into the Round-A keydown effect (now also
  handles Cmd/Ctrl+Z, not just Cmd/Ctrl+A and bare T).
- **18 (exit-confirm dialog)**: ported `isDirty`/`requestLeave`/`handleCloseAttempt` + the dialog
  UI verbatim, MINUS two web-specific things that don't apply to desktop: (a) the bottom
  page-switcher strip's `onSwitchSpread` gating (item 20 not ported, no such strip exists), (b) the
  `renderPreviewNow()` call (regenerates a cloud preview thumbnail for the web app's own gallery
  list view — no desktop equivalent). Widened the `onSave` prop type to `void | Promise<void>` so
  the dialog's "שמירה ויציאה" button can properly await it (`AlbumPageEditor.tsx`'s `handleSave` is
  async). Wired the existing X-close button through `handleCloseAttempt` instead of calling
  `onClose` directly — confirmed via grep it's the ONLY close path in desktop's editor (web has to
  gate several: X button, page-switcher strip, add-page button — desktop only needed the one).

**Next**: Round C (biggest remaining single item — advanced photo adjustments panel — paired with
photo shadow distance/blur split), pending user's go-ahead.

**UPDATE 6 — Round C done, committed** (both typechecked + full-built; committed to the desktop
repo's git as `7e1d9cb` per the standing "commit every round" authorization):
- **Photo adjustments panel**: ported `src/lib/albumAdjustments.ts` and `src/lib/albumSharpen.ts`
  verbatim (tone-curve + color-matrix math, `applyAdjustmentsToRgba`, `sharpSharpenOptions`), plus
  local duplicate copies at `electron/albumAdjustments.ts`/`electron/albumSharpen.ts` (Electron's
  `tsconfig.json` `include` can't reach `src/lib/`, same pattern as the existing `albumMasks.ts`
  duplication — added both filenames to its `include` array). Added a new `PhotoAdjustFloatingMenu`
  + `AdjustSectionLabel` + `IconAdjust` (mirroring `PhotoFloatingMenu`'s existing bare-positioned-div
  pattern, not web's newer draggable-panel system — item 16 still deliberately unported) with an
  `openPanel: "adjust"` toggle. Wired into the live preview via a new `<svg><defs>` block
  (`adjustmentsSvgFilter`/`sharpenSvgFilter`) feeding an extended `cssFilterFor(filter, blurPct,
  adjust, sharpness)`. Wired into the native PSD export: `AlbumPhotoElement` type gained all 10
  adjustment fields + `sharpness`; `AlbumPageEditor.tsx` threads them into the `ExportPhotoElement`
  object; `electron/psdWriter.ts`'s `coverCropRaw`/`composePhotoTile` apply `.sharpen()` before the
  first raw extract and `applyAdjustmentsToRgba` after the zoom re-extraction, matching web's order.
- **Shadow distance/blur split**: `AlbumPhotoElement` gained `shadowDistance?`/`shadowBlur?`.
  `boxShadowFor`/`combinedBoxShadowFor` (desktop's local copies, not imported from a shared module —
  see the architectural-drift note above) gained optional `distancePct`/`blurPct` params, ported
  verbatim from web's `albumRender.ts`. `PhotoFloatingMenu`'s existing "צל וקו מתאר" flyout gained
  two more sliders (מרחק צל / טשטוש צל), shown only once shadow is active, with the same
  materialize-on-activation `useEffect` web uses (so dragging the intensity slider doesn't visually
  drag distance/blur's thumbs along until they're touched independently). `applyShadowToAllPhotos`
  ("החל על כל התמונות בדף", which already existed in desktop) now also copies the two new fields.
  Export side: `electron/psdWriter.ts`'s `shadowLayerPng` gained the same `distancePct`/`blurPct`
  params web's raster exporter has, threaded through `ExportPhotoElement` → `api.d.ts` →
  `AlbumPageEditor.tsx`'s construction call.
- `main.ts`/`preload.cts`'s `WireElement`/`WirePhotoElement` needed NO manual edit — they derive
  via `Extract<ExportElement, {kind:"photo"}>`, so the new fields flowed through automatically.

**Newly discovered, NOT fixed (flagged for a future round, not in the original 23-item catalog)**:
- **Zoom algorithm divergence**: while porting the adjustments code, found that desktop's
  `coverCropRaw` in `electron/psdWriter.ts` still uses an OLDER two-step zoom approach (crop to
  target size, then a separate re-extraction pass for zoom) — web's `albumRaster.ts` fixed a real
  bug this session by baking zoom directly into the initial cover-fit resize
  (`drawW/drawH = Math.max(target, Math.round(base*zf))`), because the old two-step approach meant
  "panning only ever worked in one direction once zoomed in." Desktop's photo-zoom feature (not
  background-zoom, which is fine) likely still has that exact panning bug. Not fixed this round —
  out of scope for the adjustments/shadow work, but should be ported next since it's a known,
  already-fixed-once bug now silently reintroduced on desktop.
- **`shadowLayerPng` page-edge crop**: desktop's version only crops the shadow canvas's left/top
  overflow against the page bounds (`cropLeft`/`cropTop`); web's raster exporter also added a
  right/bottom crop against `pageWidth`/`pageHeight` this session, fixing a real crash
  (`sharp.composite()` throwing "Image to composite must have same dimensions or smaller") for any
  shadowed element spanning most of the page's width/height. Desktop's native PSD export can likely
  still hit this crash for a full-bleed shadowed photo/shape near the page's right or bottom edge.
  Not ported — out of scope for this round, flagged for a future fix.

**UPDATE 7 — Round D done, committed** (items 9 "element lock" + 10 "shapeStyle" from the
additional-gaps list; both typechecked + full-built; committed as `0a668bb`):
- **Element lock (`.locked`)**: added to all 4 element types (`AlbumPhotoElement`,
  `AlbumTextElement`, `AlbumOrnamentElement`, `AlbumShapeElement` in `src/types.ts`). `startDrag`
  now returns early for a locked element (still selectable — only move/resize are blocked) and
  filters locked elements out of a drag/resize group entirely, even mid-multi-selection. The 3
  `renderResizeHandles` call sites (photo/ornament/shape) gained `!el.locked`; text's own inline
  resize handle needed no extra guard since it already routes through the same `startDrag`. The
  arrow-key nudge handler also gained `!el.locked`. Added a lock toggle button to all 4 floating
  menus (`PhotoFloatingMenu` as a circle button next to aspect-lock; `OrnamentFloatingMenu`/
  `ShapeFloatingMenu`/`TextFloatingMenu` as a 4th footer button), reusing a new `IconLock` (same
  glyph web's own `IconLock` uses, kept separate from the existing `IconAspectLock` for semantic
  clarity even though they render identically).
- **shapeStyle (outline/line shape variants)**: `AlbumShapeElement` gained `shadow?`, `borderWidth?`,
  `borderColor?`, `shapeStyle?: "rect-outline" | "circle-outline" | "line"` (desktop's shape type had
  NONE of these before — a bigger starting gap than web's, which already had them). Added
  `addOutlineShape()` (ported verbatim) plus a "קו מתאר בלבד, ללא רקע" section to the shapes picker
  popover with 4 draggable presets (square/rectangle/circle/line), wired into the canvas's existing
  `shapeOutline:` drag-drop prefix. Shape rendering (the canvas's own `if (el.type === "shape")`
  branch) now branches on `isOutline` — stroke-only `border`/`outline` instead of a filled+masked
  div for the two true outline kinds, `boxShadowFor(el.shadow)` wired in for all shapes (was
  entirely missing before). `ShapeFloatingMenu` gained a conditional "עובי הקו" line-thickness
  slider (only for `shapeStyle: "line"`), plus the shadow/border-width/border-color sliders it was
  also missing. `computeResize` gained an `allowOverflow` param (outline/line shapes may resize past
  the page's 0-100% bounds; every other element still clamps) threaded through from a new
  `allowOverflow` check at the one resize call site. Export side: `electron/psdWriter.ts`'s
  `composeShapeTile` gained the same stroke-only-SVG branch web's raster exporter has, and the shape
  export call site now also renders a shadow layer via the existing `shadowLayerPng` — threaded
  through `ExportShapeElement` → `api.d.ts` → `AlbumPageEditor.tsx`'s construction call.
- Desktop's group-resize (2+ selected photos) uses its own simpler scale-factor math instead of a
  second `computeResize` call like web has — confirmed this path is only ever reached by
  multi-selected PHOTOS (shapes/outlines are never part of that group), so `allowOverflow` only
  needed wiring at the single-resize call site, no second call site to touch.

**Newly discovered, NOT fixed (flagged for a future round)**: desktop's canvas marquee-select
(`onPointerMove`'s drag-rectangle hit-test) only ever includes `el.type === "photo"` — web's
equivalent includes shapes too (`el.type === "photo" || el.type === "shape"`). A pre-existing,
unrelated divergence (shapes were never marquee-selectable in desktop, before or after this round);
noted here rather than fixed, since it wasn't part of items 9/10's own scope.

**Next**: Round E onward (drag-panel hover-zoom + multi-select, new-photo size picker,
draggable/resizable panels, page-switcher thumbnail strip, help modal), pending user's go-ahead.

**UPDATE 8 — two flagged bugs fixed, committed as `2351f5b`** (typechecked + full-built), per
explicit user request ("תתקן את הצל על אלמנט עכשיו" / "תתקן גם את הבאג של הזום"):
- **Shadow page-edge crash**: `electron/psdWriter.ts`'s `shadowLayerPng` gained the same
  `pageWidth`/`pageHeight` right/bottom crop web's raster exporter already had, threaded through
  both call sites (photo shadow, shape shadow) with the page's own `widthPx`/`heightPx`.
- **One-directional zoom panning**: `coverCropRaw`'s old crop-then-resize zoom step (extract a
  smaller sub-region THEN resize it back up) is replaced with baking zoom directly into the initial
  cover-fit resize (`drawW/drawH = Math.max(target, Math.round(base*zf))`) — matches web's own fix
  for the identical bug this session. The old approach threw away exactly the pixels panning needed
  on whichever axis had zero baseline cover slack.

**UPDATE 9 — Rounds E, F, G done, each committed separately** (all typechecked + full-built):
- **Round E (`6192572`) — drag-panel hover-zoom + multi-select bulk drag**: a toggleable magnified
  hover preview on favorite-photo thumbnails (with an always-visible info tooltip explaining the
  toggle, since the switch itself has no label), click-to-select multiple thumbnails (amber
  ring + checkmark badge, "X נבחרו — ניקוי" to clear), and the `multi:` bundle drag payload with
  full drop handling: fills existing empty frames by closest aspect-ratio match first, then falls
  back to a grid collage (`buildCollageLayout`, 2+ photos) or a single oriented frame
  (`buildOrientedPhotoFrames`, ported new to desktop — didn't exist before). Also fixed two
  bugs found while wiring this: (1) the canvas's main `onDrop` guard from Round D excluded
  `"shapeOutline:"`, so dragging an outline-shape preset onto the canvas silently did nothing —
  the drag-drop path was broken even though the click-to-add path worked; (2) dropping a single
  favorite photo on empty canvas (not onto an existing frame) did nothing at all — a real
  pre-existing gap, now creates an oriented frame like every other add-photo path.
- **Round F (`c0f9085`) — new-photo size picker + in-app user guide**: "+ תמונה" now opens a
  size-choice popover first (auto / rect 10×7.5cm / circle Ø5cm / square 5×5cm) before the photo
  picker, overriding the usual aspect-matched auto sizing via `pendingPhotoSize` (ported
  `confirmMultiPhotos`'s fixed-size branch). New `src/components/AlbumEditorGuideModal.tsx` — a
  "מדריך למשתמש" help modal — content is NOT a verbatim copy of web's guide; it was rewritten
  section-by-section against desktop's actual verified behavior (e.g. double-click enters pan
  mode here, not a direct re-center like web's guide claims; no multi-page flow was documented
  since Round G hadn't landed yet when this was written — see below) and documents every feature
  ported this session (adjustments panel, shadow distance/blur, outline/line shapes, locking,
  undo, multi-select bulk drag).
- **Round G (`efb6cd9`) — page-switcher thumbnail strip**: the biggest of the three — required
  restructuring `AlbumBrowser.tsx` to lift `album`/`spreads`/`previewUrls` state OUT of the grid
  screen (`AlbumPageGrid`, which used to own and fetch them itself) and up into `AlbumBrowser`
  proper, keyed on the currently-viewed gallery id so it survives the "album" ↔ "edit" screen
  transition instead of resetting on every switch. `AlbumSpreadCanvasEditor` gained optional
  `spreads`/`onSwitchSpread` props (omitted-safe, same pattern as `customOrnamentTabs` etc) and
  renders a bottom strip using the ALREADY-EXISTING `SpreadPreview` component (desktop's own
  read-only thumbnail renderer, `src/SpreadPreview.tsx` — reused as-is, not reimplemented) for
  each other page, gated behind the same `requestLeave` unsaved-changes confirmation as closing.
  A save now patches the lifted `spreads` array locally (mirrors web's own `saveSpreadElements`
  local-patch technique) so the strip — and switching back to a just-edited page — reflect the
  fresh save immediately without a re-fetch. Note: `SpreadPreview.tsx` already imports
  `ALBUM_BLUR_MAX_PX` FROM `AlbumSpreadCanvasEditor.tsx`; adding the reverse import creates a
  circular module reference — verified safe (the constant is only read inside function bodies that
  run during render, never at module top-level), and both `tsc` and the actual `vite build`
  confirm no runtime issue.

**All 23 originally-catalogued gaps are now closed.** Remaining, smaller, NOT-yet-fixed items
noted along the way (not in the original catalog, discovered incidentally, none blocking):
- `AlbumBrowser.tsx`'s canvas marquee-select only hit-tests `el.type === "photo"`, not shapes
  (web's does both) — shapes were never marquee-selectable in desktop.
- The in-app guide modal's content was written from directly-verified desktop behavior at the time
  of Round F, but hasn't been re-read against Round G's new page-switcher strip — likely accurate
  (the strip's existence just adds one more true capability, doesn't contradict anything already
  written) but worth a quick pass if the guide is user-facing-important.

**Next**: nothing outstanding from the original request. Future work would be net-new features
beyond parity (e.g. draggable/resizable floating panels — item 16 — was deliberately never
targeted for porting, a real architectural difference, not a gap).


**Context:** User asked (pre-launch readiness pass) to bring `photographer-flow-desktop`'s native
album editor up to date with the web app's `AlbumSpreadCanvasEditor.tsx`. Web file is 6288 lines;
desktop's copy is 2984 lines — genuinely large gap, not a quick sync. This file is a checkpoint so
a new session/turn can resume without re-deriving the gap analysis.

**Status: analysis done, ZERO porting work started yet.** The full gap report below was produced
by an Explore agent and has NOT been verified by hand line-by-line — treat line numbers as
approximate starting points, re-open the actual files before editing.

## Repos
- Web (source of truth): `/Users/gilbertoprophotography/Desktop/photographer-flow`
- Desktop (Electron, needs porting): `/Users/gilbertoprophotography/Desktop/photographer-flow-desktop`
- Desktop is a **hybrid app** — only the album editor is native code; everything else is an
  embedded BrowserView of the real website, so it's automatically current. See desktop's own
  `README.md` for the full architecture (session handoff via `/desktop-handoff`, native file
  access via `window.desktopApi`, batch PDF/JPG/PSD export goes through the **web app's own API
  routes**, not a local copy — confirmed this still works and now correctly includes
  ornaments/shapes, contradicting a stale line in desktop's README's "not built yet" section that
  should be corrected once porting starts).

## Confirmed NOT a gap (skip these)
- Element `type` support (photo/text/ornament/shape) — identical in both.
- `computeResize`'s core boundary-clamp math — already correct/identical in both files.
- Group-drag snap guides — already implemented in desktop.
- Mobile rotate-device gate — phone-only, not applicable to Electron.
- Native file picker vs browser file input — intentional, correct divergence.

## Gap list, in the priority order the user cares about (text styling → zoom → boundaries →
addText bug → sort dropdown), then everything else the agent found, roughly most-impactful first

| # | Feature | Web location (approx, re-verify) | Port size | One-line gist |
|---|---|---|---|---|
| 1 | TextFloatingMenu (floating text-style panel) | `1066-1169`, trigger `4776-4782` | Medium | Desktop has a static always-shown sidebar block instead of a floating toggleable panel; no lock button. Note: web's own panel has no shadow/glow controls despite the comment claiming it does — don't port UI that doesn't exist in web. |
| 2 | Background photo zoom | state `2023`, applied `4254`, slider `5746`, save call sites `3513,3989,5384,5393,5538,5547` | Small | Missing entirely in desktop (0 matches for `backgroundZoom`/`background_zoom`). Verify desktop's spread-row type/save payload can carry `background_zoom` too. |
| 3 | Hard canvas-boundary clamp on **drag** (not resize) | group drag `3317-3345`, single drag `3354-3361` | Small | Desktop still uses old `Math.min(95,...)` in both drag branches (desktop `1642-1657`, `1664-1665`) — mechanical fix, ~4 formula changes. Resize-time clamping is already correct in both files. |
| 4 | `addText()` cascade + font-proportional height | `3034-3071`; helper `src/lib/albumTextSizing.ts:6-11` | Small | Desktop's `addText` (desktop `1450-1460`) still has the EXACT bug web fixed this session — hardcoded `xPct:10,yPct:40,widthPct:80,heightPct:15,fontSize:40` every time, new text stacks exactly on top of old. Needs `albumTextSizing.ts` ported (~15 lines) + 3 missing draft-state fields (`textDraftFontSize/FontFamily/Color`) that desktop doesn't have at all. |
| 5 | `dragPanelSort` sort dropdown | state `2059`, logic `2401-2404`, UI `~5035` | Small | Missing entirely, no sort control in desktop's drag panel at all (not even the old cyclic button). |
| 6 | (was "group-drag snap guides") | — | — | **Not a real gap** — already present in desktop, functionally intact. Only its clamp formula is stale (= item 3). |

**Additional gaps found beyond the original 6** (full detail in the agent's report — worth
re-fetching by re-running the same analysis prompt if this file's summary isn't enough, since the
full report had precise line numbers per item): advanced photo adjustments panel (white
balance/tone/color/detail sliders — LARGE, needs new type fields + `albumAdjustments.ts`/
`albumSharpen.ts` ported), undo (Cmd/Ctrl+Z, 20-snapshot history — desktop's README even claims
"undo-free" as a deliberate design choice, now stale), element lock (`.locked` — missing at every
layer: type fields, all 4 FloatingMenus, drag/resize/nudge guards), outline/line shape variant
(`shapeStyle`), photo shadow distance/blur split + apply-to-all (desktop has the OLD single-slider
design), Alt-key symmetric resize, drag-panel hover-zoom preview, drag-panel multi-select + bulk
drag, new-photo size picker popover (auto/rect/circle/square), draggable+resizable floating
side-panels, right-click photo context menu (set/unset background), exit/leave confirmation
dialog with "don't ask again", margin-snap visual feedback on resize, in-editor page-switcher
thumbnail strip (architecturally absent — desktop editor doesn't even accept `spreads`/
`onSwitchSpread` props), in-app help/guide modal, Cmd/Ctrl+A select-all + bare `T` shortcut, and a
rollup note that desktop reimplements `cssFilterFor`/`boxShadowFor` inline instead of importing
the shared `albumRender.ts` module web now uses (architectural drift underlying several items
above).

## Recommended next step
Start with items 1-5 (the ones the user explicitly asked about) in the order listed — items 3 and
4 are small/mechanical and safe to do first to build momentum and confirm the desktop build/
typecheck toolchain works cleanly (Vite, not Next.js — check `package.json` scripts, likely
`npm run build` or a `tsc` step, NOT the web app's `npx tsc --noEmit` / `npm run build`). Verify
each port against the desktop app's own toolchain before moving to the next item. Do not attempt a
bulk file replace — desktop has real Electron-specific divergences (native file access, no
`imageOptimize.ts`/CDN thumbnails, its own inline `cssFilterFor`) that must be respected.

Given the scale (23 identified gaps, several Large), treat this as multi-session work. Re-confirm
with the user how much of the "everything else" list they actually want ported vs. just items 1-5,
before sinking effort into the Large items (photo adjustments panel, undo, locking, page-switcher
thumbnails) — those are substantial enough to warrant an explicit go-ahead.
