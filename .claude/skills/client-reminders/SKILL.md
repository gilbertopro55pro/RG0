---
name: client-reminders
description: Adding or changing a reminder on myframeflow.com (Gilberto) — a reminder to the photographer to nudge a client (album approval, clip songs, payment, shoot day, quote follow-up, contact), a task in the to-do list, or the morning digest, with its on/off switch and days in Settings › "התראות ואוטומציה". Use whenever the user asks for a new reminder or "תזכורת", to change when one fires or what it says, or reports a reminder that didn't arrive, came twice or opened the wrong message. Holds the three patterns already in the code, the exact files of each, the settings card to copy, and the checklist that was verified to work.
---

# Reminders: how they're built here

Every reminder in the system is one of three patterns. Pick the pattern first, then copy the
closest existing reminder. Don't invent a fourth one.

## 1. Scheduled when something is sent (`scheduled_messages`, `pending` → `awaiting_confirmation`)

For "N days after X, if the client still hasn't done Y". The model: the album approval reminder
(`album_approval_reminder`, 2026-10-27).

1. **Schedule** at the moment X happens, from the route that records X:
   - `scheduled_messages` row: `event_id`, `kind`, `status: "pending"`, `send_at = now + days`.
   - Cancel any waiting row of the same kind for the event first, so a send again restarts the
     count. The helper is `replaceReminder` in `lib/clientReminders.ts`; for the album there's
     `scheduleAlbumApprovalReminder`.
   - Use the service role, after checking that the photographer owns the event.
2. **When it's due:** the daily cron `api/cron/send-scheduled-messages` (09:00 UTC, `vercel.json`)
   picks `pending` rows with `send_at <= now`, then for this kind (`processClientReminder`):
   - Checks again that it's still needed (`reminderStillNeeded`), and that the switch is still on.
     If not: `canceled`.
   - Otherwise sets `awaiting_confirmation`, writes a Hebrew line to `event_notifications`, and
     sends a push (`sendPushToPhotographer`, in the photographer's language through
     `photographerLang` + `makeT(messagesFor(lang))`, `tag: <kind>-<eventId>`).
3. **The photographer answers on the home screen:**
   - `app/page.tsx` loads `awaiting_confirmation` rows (add the kind to the `.in("kind", …)` list).
   - `PendingClientMessagePrompts` shows the window.
   - The confirm route builds the message with `dryRun` first, so WhatsApp opens on the tap itself:
     iPhone blocks opening it after waiting on the server. A POST that only reads sends
     `x-read-only: 1` (`READ_ONLY_HEADER`).
   - The route then records `sent` or `canceled`, and a log line.
4. **Done by the client = close it:** the route where the client does Y cancels waiting rows of
   the kind. For example, `markClientDone` cancels `album_approval_reminder` when the album is
   approved.

## 2. Found by a daily scan (the cron creates `awaiting_confirmation` rows itself)

For "1–3 days before the event" or "while stage S is open". Models:
- `shoot_day_reminder`: `processShootDayReminders`, with the rules in `lib/shootDayReminder.ts`.
- `song_stage_reminder`: `processSongStageReminders`, with the rules in `lib/songStageReminder.ts`.

The selection rules are a pure function with tests, and the cron only queries and calls it. Once
per event and date. The home window is `ClientMessageSheet` with the photographer's stage template.

## 3. Minute-precise, or the photographer's own to-do

- **"Remind me at a time I choose"** (lead reminder, quote follow-up, contact reminder):
  - `remind_at` / `remind_pushed_at` columns.
  - The cron runs every minute: `api/cron/lead-reminders`.
  - A popup in the layout.
- **A task in the to-do list** (`tasks` table): it shows on its day, in the count on the button
  and in the morning digest. The print-house check is a database trigger
  (`gallery_album_export_jobs_print_check`, migrations 0196–0197), so every way of sending is
  covered without touching the PDF worker.
- **The morning digest:** `api/cron/morning-digest`, every 30 minutes, at each photographer's
  chosen time (`lib/morningDigest.ts`).

## The switch and the days in Settings

- **Columns on `photographers`:**
  - `<name> boolean not null default true`.
  - Days, when they can be chosen: `<name>_days smallint not null default N` with
    `check (… between A and B)`.
  - Writes from the browser pass the `photographers_guard_privileged` trigger, as long as the
    column isn't a billing field.
- **The card:**
  - A switch only: `ReminderToggleSettings` with `column="…"`.
  - A switch and days: copy `AlbumApprovalSettings` or `PrintCheckSettings` (uses `ToggleSwitch`;
    the days select shows only while on).
  - It goes in `app/settings/page.tsx`, the automation tab, next to the others. The page already
    selects `*`.
- **Read the setting where it fires, not only where it's scheduled:** the photographer may switch
  it off after a row was scheduled. See the `album_approval_reminder === false` check in the cron.
- **Text with a number of days:** the days are the photographer's, so don't write "3 ימים". Name
  the date of the send instead ("העיצוב נשלח ב-{date}"), formatted with
  `timeZone: "Asia/Jerusalem"`.

## Checklist (all of it, every time)

1. A migration through the Supabase connector (`apply_migration`):
   - No `DROP`/`DELETE`: they wait for an approval that never comes.
   - For a trigger use `create or replace trigger`.
   - Keep the file in `supabase/migrations/`.
2. The rules in a pure `lib/*.ts` with a `*.test.ts` next to it:
   - No network, DB or real clock.
   - Dates in Israel time and in another time zone.
3. Text through `t()`, with en + ru in `src/i18n/dict/*`. Each key once (`npx vitest run src/i18n`).
   Log lines in `event_notifications` stay Hebrew.
4. A push is a new notification type. CLAUDE.md says not to add one without the user's OK, unless
   the user asked for it. Add it to the list in CLAUDE.md under "התראות לטלפון".
5. Never in `lib/types.ts`: it's in the PDF worker's build. Put new fields in a local type in the
   reminder's lib (like `LeadReminderFields`). Check that `node scripts/computeRenderHash.js` is
   unchanged.
6. Checks before the PR:
   - `npx tsc --noEmit -p .`, `npm test`, and eslint on the touched files.
   - A local check of the settings card and the home window, on phone and desktop.
7. After the merge: deploy (`scripts/deploy.sh`). Then check the live data with the connector, for
   example that a row was scheduled with the right `send_at`.
8. The cron itself can't be run from here (it needs `CRON_SECRET` and runs on every account). Say
   so in the summary: "the cron wasn't run".
9. Document it in CLAUDE.md, in the feature's section: what, when, where the switch is, and what
   was checked.

## Where each existing reminder lives

| Reminder | Pattern | Rules | Switch |
| --- | --- | --- | --- |
| Album design not approved (`album_approval_reminder`) | 1 | `lib/clientReminders.ts`, `lib/albumApproval.ts` | `album_approval_reminder` + `_days` (1–14, 3) |
| Clip songs after the film (`song_selection_reminder`) | 1 | `lib/clientReminders.ts` | none (3 days) |
| Song stage open (`song_stage_reminder`) | 2 | `lib/songStageReminder.ts` | `song_stage_reminder` |
| Shoot day (`shoot_day_reminder`) | 2 | `lib/shootDayReminder.ts` | `shoot_day_reminder` |
| Payment / review request | 1 | the cron's generic branch | none |
| Lead / quote follow-up / contact | 3 | `lib/leadFollowUp.ts`, `lib/leadContactReminder.ts` | none |
| Check with the print house (task) | 3 (trigger) | `lib/printCheck.ts`, migration 0196 | `print_check` + `_days` (3–14, 5) |
| Morning digest | 3 | `lib/morningDigest.ts` | `morning_digest` + time |
