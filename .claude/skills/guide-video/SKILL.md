---
name: guide-video
description: Record, re-record or add a Gilberto (myframeflow.com) guide/tutorial video — the mp4s in public/guides/ shown on each page's guide and in Settings → מדריכים. Use whenever the user asks for a new הדרכה/סרטון/מדריך video, to re-shoot videos after a design change, or to fix a guide video.
---

# Guide videos (סרטוני הדרכה)

Videos are recorded from the **live site** (myframeflow.com) in a 480x780 mobile viewport, logged in
as the test account ("סטודיו אור", photographer id `631b740d-…`), with an injected overlay:
big Hebrew captions, a brass pointer that moves and "taps", and a logo outro. Every video is a
scenario file in `scenarios/<key>.js`; the engine is `record.js`; `convert.py` cuts and encodes.

## Files
- `record.js` — engine. `node record.js <key>` runs `scenarios/<key>.js` and writes a raw .webm + `<key>.json` to `$GF_OUT`.
- `convert.py` — `python3 convert.py <key>` → `$GF_OUT/<key>.mp4` (480x768 H.264) + `<key>-strip.png` for review.
- `login.js` — creates the session file (`$GF_STATE`) the recorder logs in with.
- `scenarios/*.js` — overview, portfolio, settings, galleries, client-portals, leads, waitlist, analytics, intake-demo.
- `intake-demo` is the landing page's assistant demo (`public/guides/intake-demo.mp4`, the "עוזר פניות חכם" section of `LandingPage.tsx`), not a page guide. It holds a real conversation on `/chat/studio-or?src=demo` (live model replies, so they differ per run: review the frames), then settings › אוטומציה › שאלות נפוצות. `GF_CHAT_ONLY=1` records only the chat (no login needed; any `GF_STATE`, even `{"cookies":[],"origins":[]}`). Each run creates a lead "נועה" (0500000123, source `demo`) in the test account. Full version (chat + settings, 1:54) published 2026-09-28, recorded after the date-question prompt change.

## Quote flow video (`quote-flow`, 2026-10-01)
- 24s, on the landing page (`LandingQuoteSection`) and in Settings › מדריכים: lead → builder → "send a contract too?" → the WhatsApp message → client approves → questionnaire → signs → done.
- **Recorded locally, not from the live site.** Reaching myframeflow.com from the recorder needs a TLS exception for the proxy, which the environment refuses (2026-10-01). So it was recorded from the real components bundled with esbuild on `http://127.0.0.1` with demo data ("נועה ואיתי", סטודיו אור) and mocked fetch, with its own small caption/pointer overlay, then cut and sped up ×1.24 with ffmpeg. The scratch files are not in the repo; re-create the same way if the screens change.

## Leads video re-recorded locally (2026-10-01)
- `public/guides/leads.mp4` (0:40) was re-recorded the same local way as `quote-flow` (real `LeadsView`, demo leads, own overlay), because the live recorder is blocked. Captions match the new buttons: "שליחת הצעת מחיר", "עדכון הצעת מחיר", "הורדת PDF", and a lead that leaves the list after approval and signing. `scenarios/leads.js` was updated to the same captions for a future live re-shoot.

## Galleries video and teaser re-recorded locally (2026-10-05)
After the gallery redesign (new default "פרימיום" theme: full-bleed cover, sticky bar, a chapter per folder, justified rows, black lightbox), both were recorded the local way (the live recorder is still blocked by the proxy's TLS):
- **Harness**: esbuild bundle of the real `GalleriesListView`, `GalleryManageView` and `GalleryPremiumCover` + `PublicGalleryView`, served by a small Python server on `http://127.0.0.1` (paths `/galleries`, `/galleries/<id>`, `/gallery/<token>` all serve the same page; the entry picks the view by path). Stubs: `next/navigation`, `next/link`, `next/image`, `next/font/*`, `@/lib/supabase/client` (every query resolves empty), a `process` shim; `fetch` to `/api/*` is mocked. CSS = the app's compiled Tailwind (`globals.css`, all of `src` scanned). The recorder is `record.js` with the base URL swapped, no proxy/session, `GF_TOUCH=1` for the client part (hearts show on every photo only with touch) and `GF_NOEND=1` for the first part. `convert.py` per part, then the two parts are joined and sped up ×1.3 with ffmpeg.
- **Photos**: real stock wedding photos under the Pexels license (free, commercial use, no attribution needed), resized to 1600px with sharp. Demo gallery "יעל ואיתי, חתונה", סטודיו אור, folders הכנות / טקס / צילומי זוג / מסיבה (28 photos), cover = Pexels 1801263. The same photos are in the live demo gallery.
- `public/guides/galleries.mp4` (0:46): galleries list → gallery → upload and folders → settings › עיצוב הגלריה → choose "פרימיום" and the live preview → share sheet → the client's gallery: cover, chapters, a heart, the lightbox, the bar (favorites, download all, share). Captions are in `scenarios/galleries.js` (updated for a live re-shoot; the client part needs `GF_GALLERY_TOKEN`).
- `galleries-1.png` (the guide text's image of the "גלריה חדשה" form) was not changed: that form didn't change.
- Teaser: `scenarios/teaser-galleries.js` clip (cover settles, chapters, a heart, the lightbox), `teasers.json` galleries speed 1.3 and two new feature lines. Output in `teasers-out/` (git-ignored), sent to the owner.

## Coming-soon teasers (סרטוני "בקרוב", 2026-09-29)
Vertical 1080x1920, 13s (owner: 10–15s), no audio (music is added on Instagram/TikTok), for social media, not the
site. Five exist: home, galleries, leads, quotes, assistant. Owner asked: every video ends on the
logo, in a "coming soon" reveal style.
- `teasers.json`: per teaser the clip scenario, `skip`/`speed`, the kicker, the headline (revealed
  word by word) and two feature lines. `teaser.html` is the frame template (navy, brass line,
  phone frame, "בקרוב.", logo end card); `teaser.js <key>` renders it frame by frame at a fixed t
  (deterministic, no dropped frames) → `$GF_OUT/coming-soon-<key>.mp4` + `-strip.png`.
- Clips: `scenarios/teaser-<key>.js` have no captions (only scrolling and the pointer). Record
  them the usual way (`node record.js teaser-<key> && python3 convert.py teaser-<key>`), then
  `node teaser.js <key>`. A clip needs about 8s of content (13s timeline, screen shown 1.9–9.0s
  at `speed`). `teaser-assistant` is a live chat without a phone number, so no lead is created.
- Delivered to the owner as files (not in `public/`). Review the strip and a frame at 6s and 16s.

## Setup (once per container)
1. Scratch dir outside the repo: `export GF_OUT=<scratchpad>/guide-video GF_STATE=<scratchpad>/qa-state.json`.
2. `playwright-core` is needed (`npm i playwright-core` in the scratchpad if missing; Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Run node with `NODE_PATH` pointing at that node_modules.
3. ffmpeg with libx264: `pip install imageio-ffmpeg --target <scratchpad>/pylib` then `PYTHONPATH=<scratchpad>/pylib`.
4. Session: nobody keeps the test account's password (owner's decision, 2026-09-28). If `$GF_STATE`
   doesn't exist, set a fresh one-session password: `pip install bcrypt --target <scratchpad>/pylib`,
   then `PYTHONPATH=<scratchpad>/pylib python3 test-password.py <scratchpad>/gf-pass > <scratchpad>/gf-hash`
   (the password goes to a mode-600 file outside the repo; only the bcrypt hash is printed). Put the
   hash on the test account with the Supabase connector (write it as `$2a$…`):
   `update auth.users set encrypted_password = '<hash>' where id = '631b740d-9f78-4e6b-9daa-ace853329cfc'`.
   Then `GF_EMAIL=<the test account's email, from auth.users> GF_PASSWORD="$(cat <scratchpad>/gf-pass)" node login.js`.
   Never print, commit or message the password, and never do this for any other account.
5. `export GF_VER=<CHANGELOG[0].version from src/lib/changelog.ts>` so the "what's new" modal stays closed.

## Record → review → publish
1. `node record.js <key> && python3 convert.py <key>`. If a run fails because of the network (proxy resets are common), just run it again.
2. **Always review before publishing**: Read `<key>-strip.png`. For detail, extract frames with ffmpeg (`-ss T -frames:v 1`), including the last frame (the logo outro must show).
   Look for: a caption that doesn't match the screen, a splash/skeleton, an open modal left behind, a long static stall (usually a locator that didn't match → 8s timeout per `point`), a caption covering the element being pointed at.
3. Copy `$GF_OUT/<key>.mp4` to `public/guides/<key>.mp4`. For a new video, add it to `GUIDES` in `src/components/GuidesSettings.tsx` (with its real duration); for a page video, `PageGuide` loads `/guides/<pageKey>.mp4` automatically.
4. Branch from origin/main → commit → PR → merge → deploy per CLAUDE.md, then verify the live file with `curl -sI https://myframeflow.com/guides/<key>.mp4` (content-length equals the local file).

## Writing a scenario
```js
module.exports = async ({ page, go, say, point, tap, scroll, sleep, navTap, capTop, on, off, OVERLAY, GID, PORTAL }) => {
  await go("/leads");                                   // hard navigation; loading is cut out automatically
  await say("משפט אחד קצר שמסביר מה רואים."); await sleep(4500);
  await point(page.locator("button", { hasText: "המרה לאירוע" })); await say("…"); await sleep(4800);
  await navTap(page.locator('a[href="/galleries"]').locator("visible=true"), page.locator("h1", { hasText: "גלריות" }));
};
```
- **Captions**: one short sentence each (up to about 70 chars, 2 lines at 20px), plain Hebrew, addressed to the user in plural ("מעלים", "שולחים"). Leave about 4.5–5.5s per caption. The user asked for big, readable captions, so don't shrink them.
- **Cutting**: only frames where the magenta marker (bottom 6px) is on are kept. `go()` and `navTap()` turn it off while a page loads and back on once it's ready. Wrap any other reload (a link that does a full page load, a filter that reloads) the same way (`await off(); …; await page.evaluate(OVERLAY); await on();`), or avoid clicking it.
- **Bottom sheets and modals**: call `await capTop(1)` before opening one, so the caption moves to the top and doesn't hide the buttons. Call `capTop(0)` afterwards. Captions don't capture clicks.
- **Locators**: prefer `locator("visible=true")`. Settings tabs are rendered with display:none, so a plain `.first()` often grabs a hidden element. A missed `point` doesn't crash; it prints `point miss` and costs 8 seconds.
- **Settings tabs**: `page.locator("select").first().selectOption("<tab id>")`. Before hydration the select changes but the content doesn't. Verify with a visible text from the tab and retry (see `scenarios/portfolio.js`).
- **Double click opens menus**: a gallery row opens the quick actions (add to portfolio / share / delete), and a photo in the gallery opens the photo actions. To leave a menu, it's simpler to `go()` to the next page than to hunt for its cancel button.
- **Data changes**: a scenario that changes data must be reversible. Example: `portfolio` adds IMG_4108 to the portfolio. Before re-recording, reset it through the Supabase connector: `update gallery_photos set in_portfolio=false, portfolio_category=null, portfolio_featured=false where id='650cbd9e-0f2d-4099-b885-8bd0efc8a3df'`.
- **Sample data**: the test account is seeded with realistic data (events, leads, a waitlist entry, the gallery "יעל ואיתי, חתונה" with 8 photos, the portfolio `studio-or`, and the portal of דנה ואורי). Don't record QA/test data. If something looks empty, fill it with realistic data through the connector (only in the test account).
- **Public pages** (`/p/…`, `/portal/…`, `/gallery/…`) do a full load. Enter them with `go()`.
