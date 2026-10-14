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

## Promo video (סרטון קידום, 2026-10-11)
- 40.6s, 1080x1920, H.264 + AAC, about 9.6MB (under WhatsApp's 16MB). Delivered to the owner as a
  file, not in `public/`.
- `promo.html` is the timeline, synced to the `energy` track (124 BPM, `public/reels/music`). Every
  scene starts on a bar: the hook during the quiet intro, the stamps on the drop (7.74s), the logo
  on the first accent (15.48s), the founder on the second (30.97s).
  - Scenes: hook "הצילום נגמר בחצות. הוואטסאפים לא.", night messages, stamps, 4.5 hours, "ומה אם כל זה
    היה קורה לבד?", logo, three product scenes from real footage, chips, founder, end card.
  - The end card shows `myframeflow.com/start` (a redirect to /signup in `next.config.ts`).
  - **The closing message (owner, 2026-10-11):** "פחות ניהול. יותר צילום." was dropped: it
    didn't say what the viewer gets. Each end card has one human sentence over two lines, white then
    gold, both lines the same size. Not "מילה. מילה.", and no period at the end of a line anywhere
    in the videos, to read more human (owner); "X. Y" inside a line became "X, Y":
    - Video 1: "אתם מצלמים, / וגילברטו דואגת לכל השאר"
    - Video 2: "בזמן שאתם מצלמים, / גילברטו עונה ללקוחות שלכם"
    - Video 3: "הבוקר שאחרי החתונה / חוזר להיות שלכם"
    - The button "נסו 14 יום בחינם" (a verb, not a label), and "ללא כרטיס אשראי וללא התחייבות".
- `promo.js <run folder>` renders it frame by frame and adds the music, with a fade out. Add
  `preview` for stills only. A template that syncs to a later bar of its track sets
  `window.MUSIC_START` (seconds into the track).
- Prepare a run folder (ffmpeg = imageio_ffmpeg, see Setup):
  - `fonts.css`: the live site's Rubik @font-face rules with their woff2 files, the same as for
    `scripts/landing-og`. Write `url()` as absolute `file://` paths.
  - `founder.jpg`: copy `public/landing/founder.jpg`.
  - Footage from `public/guides`. Each crop leaves out that video's burned-in caption:
    - `f-intake`: `-ss 24 -t 26 -i intake-demo.mp4 -vf "fps=6,crop=480:535:0:170,scale=900:-2"`
    - `f-quote`: `-ss 11.5 -t 5.2 -i quote-flow.mp4 -vf "fps=24,crop=480:690:0:76,scale=900:-2"`
    - `f-gallery`: `-ss 23.6 -t 6.4 -i galleries.mp4 -vf "fps=20,crop=480:652:0:0,scale=900:-2"`
    - Write each as `-q:v 2 <dir>/%05d.jpg`. If a guide video is re-recorded, check the crops
      again: the captions move.
- The brand mark in all three videos is the system logo, `public/icons/icon-512.png`. It shows in
  the logo moment, the end card, the small corner mark, and video 2's lead notification. `promo.js`
  copies it into the run folder as `logo.png`. It already carries the name, so the end card has no
  separate "גילברטו" text (owner, 2026-10-11). Run the repo's `promo.js` (not a copy in the run
  folder): it finds the logo relative to itself.
- Review `<NAME>-strip.png` and the last frame (the link must show) before sending.
- **Music: the `energy` track in all three (owner, 2026-10-11: "המוזיקה חייבת להיות כמו בסרטון
  הראשון").** Videos 2 and 3 were retimed to its 124 BPM, so their scene changes land on its bars:
  its claps and bass come in at bar 4 and it drops at bar 12. Video 3 runs past the track's 24
  bars, so it uses `energy-28`, the same track rendered 4 bars longer
  (`node scripts/reel-music/tracks.mjs <dir> energy-28`, then AAC 192k; not in the reels library).
  Tried and dropped the same day:
  `acoustic` and `celebration` for videos 2 and 3, then an original "uplift" track for all three.
  The owner preferred the first video's music.
- **Three videos (2026-10-11).** `TEMPLATE` picks one and `NAME` the output file. The hooks are
  different on purpose, so they can be tested against each other:
  - `promo.html`, `gilberto-promo`: hook "הצילום נגמר בחצות". Track `energy.m4a`, 40.6s.
  - `promo2.html`, `gilberto-promo-2`: the lost lead, "כמה אירועים הפסדתם כי עניתם מאוחר מדי?".
    Track `energy.m4a`, 36.8s: the claps and bass on the 15:10 jump (bar 4), the drop on the lead
    card (bar 12).
    - **Midday, not night (owner, 2026-10-11):** a message at 12:40 in the middle of a shoot is
      still missed. 12:40, "שלישי, באמצע צילום ברית", "אתם באמצע צילום.". The clock jumps to 15:10
      where the claps and bass come in (7.74s), and a second message comes in: "תודה, בינתיים מצאנו צלם
      אחר". Then "מי שענה ראשון, קיבל את האירוע." and the turn "עם גילברטו, אתם עונים ראשונים.".
    - The notifications use a plain green messaging icon, not the Gilberto logo: before Gilberto
      the message reaches the phone, not the app.
    - **The chat is real (owner: "שיראה אמיתי"):** "12:40. אותה הודעה, והפעם עונים לה מיד." over
      screenshots of a live conversation with the assistant on the test account (`f-chat`). The
      client's first message is the same as the notification, and the lead card matches what was
      said (12.8.2027, כפר המכביה, כ-300).
    - No quote scene (cut to keep the video short); the quote is in videos 1 and 3.
  - **Capturing the chat** (`chat-capture.js`, header of the file):
    - Run it in the background, then write each client message to `in-<i>.txt` after reading the
      previous reply in `out-<i>.txt`. A scripted list of messages ignores what the assistant
      asked (it asked to confirm the year of "12.8", and the client answered something else).
    - Write the date with a year ("12.8.27"). Name a place OpenStreetMap knows (כפר המכביה). It
      didn't know "לאגו" and suggested "לאונרדו".
    - Never send a phone number, so there's no lead and no email.
    - Then crop off the top 15px (a rendering artifact) and copy the frames as
      `f-chat/%05d.jpg`. Map them to time in `chatFrame` in `promo2.html`: the dots cycle through
      their frames, and the real 4–6s waits are shortened.
    - Found while capturing (fixed 2026-10-11): the newest reply hid behind the input bar once the
      chat was taller than the screen (`scroll-mb-32` on the end marker in `IntakeChat.tsx`).
  - `promo3.html`, `gilberto-promo-3`: the morning after a wedding.
    - Track `energy-28.m4a`, 44.5s, from its 4th bar: the template sets `window.MUSIC_START` and
      `promo.js` seeks the music to it. The claps and bass come in on the second hook line (1.9s),
      and the drop with its crash on the turn to the morning with Gilberto (17.4s).
    - "00:00. החתונה נגמרה. ובבוקר מחכה לכם עוד משמרת.". The clock flies from 00:00 to 08:30,
      then runs over five client tasks to 11:00, "ועוד לא התחלתם לערוך.".
    - Then it rewinds to the same morning with everything done ("עוזר הפניות ענה להן עוד בזמן
      החתונה"), the home screen, and "08:45. מתחילים לערוך.". With Gilberto it takes 15 minutes
      (08:30 → 08:45); the owner found 5 minutes too much to believe.
    - **A real process, the quote fix (owner, 2026-10-11: "show at least one process").** "הלקוחות
      ביקשו שינוי בהצעה? מתקנים ושולחים תוך דקה" over eight real screens of the live app, with a
      tap mark where each next step is pressed. It replaced the home screen footage, and the video
      is now 44.5s (track `energy-28`, below).
      1. The lead card, ₪9,250, "עדכון הצעת מחיר".
      2. The builder.
      3. The extra videographer row removed.
      4. Video 2,400 → 2,000, total ₪7,050.
      5. The preview, "שליחה ללקוח/ה".
      6. "לא, רק הצעת המחיר".
      7. "נשלח בהצלחה".
      8. The client's page on the same link, ₪7,050, with the tag "אותו קישור, וההצעה כבר מעודכנת".
    - **How it was captured:** `live-drive.js`, logged in as the test account (Setup, step 4). The
      demo lead "נועה ואיתי" (050-0000123, 12.8.2027, כפר המכביה) was created in the app. Its
      `details` were then set with SQL so the full builder opens: only an assistant lead with
      details opens it, a bare lead gets a plain amount field.
      - The first send was ₪9,250 (with a 1,800 extra videographer), the fix ₪7,050.
      - Both sends used the same link (`/quotes/<token>`).
      - Frames: `f-fix/%05d.jpg`, each a 1080x1290 window (430 CSS px) of the 360x720 screen around
        its step. The lead card is padded below, so the other test leads (their phone numbers)
        don't show. The client page is cropped below its header, which shows the test account's
        email. Tap points are in `FIX` in `promo3.html`.
      - Found while capturing, fixed 2026-10-12: "עדכון הצעת מחיר" rebuilt the builder from the
        lead's assistant details, not from the quote that was sent, so a manual price (the 1,800)
        came back empty. It now reopens the sent quote (`buildPrefillFromSentQuote`).
    - **The words "בלי" and "עם" are emphasized, not the name (owner, 2026-10-12).** A marker
      stroke (`.hl`, `marker()` in `promo3.html`) is drawn behind the word, right to left, and the
      word pops as it lands.
      - "בלי": the marker is red and the word shakes briefly.
      - "עם": the marker is gold, the word turns navy, and a light sweep and a glow follow.
      - "גילברטו" next to it stays plain (white and bold in the grey "הבוקר שאחרי" labels).
      - In the small lines the word is 1.2× the line.
      - The first version highlighted the whole "בלי גילברטו"; the owner wanted only the word.
    - Owner, 2026-10-11: a wedding doesn't end at 22:00, and nobody messages clients at midnight.
      The client work belongs in the morning. Until then it was a 22:00 → 01:30 evening.
  - Extra footage for 2 and 3, in the same run folder:
    - `f-intake2`: `-ss 20 -t 37 -i intake-demo.mp4 -vf "fps=6,crop=480:535:0:170,scale=900:-2"`
    - `f-quote2`: `-ss 11.5 -t 6.2 -i quote-flow.mp4 -vf "fps=24,crop=480:690:0:76,scale=900:-2"`
    - `f-home`: `-ss 1.5 -t 6.5 -i overview.mp4 -vf "fps=30,crop=480:660:0:0,scale=900:-2"`

## Short ads (מודעות 6/12/20 שניות, 2026-10-13)
The owner asked for three paid-social ads: up to 6s (a hook and the invitation), up to 12s (pain,
solution, invitation), and up to 20s (pain, solution, features, invitation). They should look and
sound "like a professional video editor made them, with no sign of AI": effects and dynamic music.
They are delivered as files, not in `public/`.
- **Files.**
  - `ad1.html` (6.0s), `ad2.html` (12.0s), `ad3.html` (19.9s): the timelines.
  - `ad-lib.js`: the shared motion.
    - A camera: a slow push, a punch-in and a decaying shake on hits.
    - Words rising from behind their line (`[data-words]`), and the marker from promo3.
    - A whip pan, film grain and a light leak.
  - `ad.css`: the shared look.
    - The promo navy, gold and Rubik.
    - A 3D phone with the real footage on its screen.
    - The end card.
  - `ad.js`: renders a template frame by frame. It reads its `window.AUDIO`, builds the soundtrack with `ad-audio.mjs`, and muxes.
- **Run.** `PWC=… FF=… TEMPLATE=ad2.html NAME=gilberto-ad-12s node ad.js <run folder>` (add `preview` plus `TIMES=…` for stills).
  - The run folder needs `fonts.css`.
  - It needs the promo footage folders (`f-chat`, `f-quote2`, `f-gallery`, `f-home`), symlinked from the promo run folder.
  - It needs `ph/<pexels id>.jpg`: the demo gallery's Pexels wedding photos, license free for commercial use.
- **Sound (`ad-audio.mjs`).** It isn't a cut of the `energy` file: the track is re-arranged to each ad from the same patterns and seed as in `scripts/reel-music/tracks.mjs`, so it's the same music.
  - The build sits under the pain at about half the level, with a riser and a snare roll into the drop.
  - The drop lands on the turn ("עם גילברטו").
  - `breaks` drop the kick for a breath before a hit (ad 3, before "40 דקות").
  - It ends on a **button**: a last hit with a held chord, not a fade.
  - Sound effects are placed from the template's `cues`, all synthesized (none taken from apps): shutter (photo cuts), ping and buzz (notifications), whoosh, suck (a rise into a hit), impact, tap, tick (counters) and pop (words and cards).
  - The edit and the sound come from the same `B(n)` beats, so they can't drift.
- **The three ads.**
  - **6s:** "צלמים?" over four wedding photos, one per beat, each with a shutter and a short flash. Then "אתם מצלמים, / וגילברטו דואגת לכל השאר" over the phone, with a screen per beat (the gallery, its chapters, the chat, the quote). End: "בואו להתנסות / עם גילברטו", with the button "התחילו 14 יום בחינם" ("נסו" would repeat "להתנסות").
  - **12s:** 00:41 after 10 hours of shooting. Client messages pile up faster and faster; the first is the one the assistant answers in the real chat. "הצילום נגמר, / הוואטסאפים לא" (a red marker on "לא"). On the drop, "עם גילברטו". Then the real chat, with the labels "בדק ביומן: התאריך פנוי", "אוסף את כל הפרטים" and "ליד חדש מחכה לכם". The end card is video 2's ("בזמן שאתם מצלמים, / גילברטו עונה ללקוחות שלכם").
  - **20s:** "על כל אירוע יש בערך 4.5 שעות של עבודה מנהלית" (the landing page's figure, `lib/adminTime.ts`), counting up from 2. The tasks pile up as cards, and on the drop they are pulled into the logo: "את רוב העבודה הזאת / גילברטו עושה בשבילכם". Then four features, 5 beats each, on one phone that turns between them:
    1. The assistant.
    2. Quote and contract.
    3. Galleries.
    4. The home screen.
    
    Then "4.5 שעות" is struck out and "40 דקות" lands, and the end card ("אתם מצלמים, / וגילברטו דואגת לכל השאר").
- **Rules kept.** Same as the promos: no period at the end of a line, the logo already carries the name, and each end card has one sentence on two lines of the same size (`fitAll` shrinks both to the smaller).
  - All text sits between y 250 and 1450, clear of the Reels/TikTok interface.
  - The first frame already says something (it's the thumbnail).
  - The assistant never quotes prices, so the client messages ask about dates, packages and video, not "how much".
- **Encoding.** CRF 19 capped at 8 Mb/s by default (`MAXRATE`; the grain is noise and inflates the file; the first render was 12.5MB for 6s). For a 26.5s ad use `MAXRATE=4.3M` (15MB).
- **Review.** Before sending: stills at the transitions, real frames from the mp4 (`-ss`), and the audio envelope (RMS per beat). The hits and the button must land on the beats. The music can't be heard from here, so the owner judges it by ear.

## Short ads, round 2 (2026-10-13)
The owner asked for three more (6/12/20s), each with a hook at the start, pain and solution in the
12s and 20s, and **a different precise message in each**. The first round's messages (the
assistant, the brand line, the 4.5 hours) were not repeated; these come from the landing page's
own lines:
- **`ad4.html`, 6s, the automatic album** ("האלבום כולו מעוצב, בזמן שאתם שותים קפה"):
  - The hook is "עוד מעצבים / אלבומים לבד?" over an empty spread.
  - Its dashed frames are the real layout of the first spread. The photos drop into them one by one ("גילברטו מעצבת / את כל העמודים").
  - The pages turn on beats 5–7 in the Hebrew direction: the left page lifts over the spine to the right, and its back is the next spread's right page.
- **`ad5.html`, 12s, one link** ("מהצעת מחיר לאירוע סגור, בקישור אחד"):
  - The hook is "שלחתם הצעת מחיר, / ומתחיל ההלוך ושוב".
  - The pain is a chat that keeps scrolling faster: an updated quote, "צריך להדפיס אותו?", "אין לנו מדפסת". Then "ועדיין אין חוזה חתום" lands.
  - On the drop everything collapses into one link pill ("שולחים קישור אחד", with the marker on "אחד").
  - Then the real client page (`f-quote2` at 2.2×). The three steps light up when the footage reaches them: approve at frame 35, details at 105, signed at 149.
  - The stamp "האירוע נסגר" closes it.
  - No deposit talk: the client page doesn't take payments.
- **`ad6.html`, 26.5s, the whole process** (was 20s; owner, 2026-10-13: the stations and the turn moved too fast to read, so the turn is now a bar and each station 6 beats; then "ושום דבר לא נופל בין הכיסאות" got three more beats, ~3s on screen; render with `MAXRATE=4.3M` to stay under 16MB) ("מהפנייה ועד המסירה, הכל מסודר במקום אחד"):
  - The hook is "חתונה אחת, / 8 אפליקציות פתוחות": generic tool tiles with climbing badges, no brand marks or brand names. Then "ותמיד משהו נופל בין הכיסאות".
  - On the drop the tiles fly up into a five-step stepper.
  - The camera then travels along a track of five real screens, one per bar: the inquiry (`f-chat`), quote and contract (`f-quote2`), shoot day (`f-home`), the gallery (`f-gallery`) and the album (a spread from the auto-designer).
  - It pulls back over the whole track, each step gets a check, and "ושום דבר לא נופל / בין הכיסאות" lands after a break.
- **`ad7.html`, 18.5s (first cut 15s): ad6's message cut short** (owner, 2026-10-14: "תואם לטווח של מטא", with every line readable; then 18.5s, so each step can be read and seen). Third-party guides agree that a video of 5–15s qualifies for all Meta placements; Meta's own page wasn't checked from here.
  - The fix is less text, not faster cuts. Each caption stays up at least ~1.7s.
  - The hook and the pain share the first scene ("חתונה אחת, / 8 אפליקציות פתוחות", then "ותמיד משהו נופל בין הכיסאות" on the claps).
  - The turn is a bar ("עם גילברטו, / הכל בתהליך אחד").
  - The five real screens go by three or four beats each (3, 4, 3, 4, 3; two was too fast to read the step). Each card carries its step's name in a large gold label, and is checked off on the stepper and on its card as it leaves. The payoff line "ושום דבר לא נופל / בין הכיסאות" stays up over the whole montage (~5s).
  - A short pull-back, then the end card on the bar.
  - Rendered with `MAXRATE=6M` (14MB).
- **Real album spreads** (`alb/` in the run folder):
  - Run `planAlbum` + `layoutSpread` + `layoutCover` (style `clean`, 60×30, `targetSpreads` 10) on the photos with `npx tsx`.
  - Use a tsconfig whose `paths` map `@/lib/storage` to a local mock that reads the photo files.
  - Render with `renderAlbumPageJpeg` (2400×1200).
  - Write `alb/spNN.jpg` and `alb/plan.json` (the elements, for the empty-frame outlines). `ad.js` passes both as `cfg.alb` / `cfg.albPlan`.
  - The scratch script was `autoalb/auto.ts`; re-create it from this description.
  - With the stock photos the engine put several couples in one album; a photographer notices. **The right input is one real wedding gallery** (the owner's, with the couple's consent), the same way.

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
