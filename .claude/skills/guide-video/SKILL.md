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
- `scenarios/*.js` — overview, portfolio, settings, galleries, client-portals, leads, waitlist, analytics.

## Setup (once per container)
1. Scratch dir outside the repo: `export GF_OUT=<scratchpad>/guide-video GF_STATE=<scratchpad>/qa-state.json`.
2. `playwright-core` is needed (`npm i playwright-core` in the scratchpad if missing; Chromium is at `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`). Run node with `NODE_PATH` pointing at that node_modules.
3. ffmpeg with libx264: `pip install imageio-ffmpeg --target <scratchpad>/pylib` then `PYTHONPATH=<scratchpad>/pylib`.
4. Session: if `$GF_STATE` doesn't exist, ask the user for the test account login **once** and run
   `GF_EMAIL=… GF_PASSWORD=… node login.js`. Never write the password to any file, commit, log or
   message, and never repeat it back. The session file stays outside the repo — never commit it.
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
