---
name: billing-flow
description: Gilberto (myframeflow.com) signup, 14-day trial, subscription payment (PayPlus), renewals, cancellation, plan switch and payment receipts (Finbot). Use whenever the user asks to check or change anything in signup/billing/payments/receipts/subscriptions, reports a charge, double charge, missing receipt, or a stuck/locked account, and before shipping any change to api/auth/signup, api/payplus/*, lib/payplus.ts, lib/finbot.ts, lib/subscription.ts, /billing or the subscription-lifecycle cron.
---

# Signup → trial → payment → receipt

Checked on 2026-09-24. Everything under "Verified" actually passed on the live site. **Real money
flows through here.** Any action that charges, refunds, cancels a recurring or changes billing
data needs a short confirmation from the user first (CLAUDE.md).

## The flow

1. **Signup** (`/signup` → `POST /api/auth/signup`). You pick a plan, then name/phone/email/password.
   - Creates the auth user with an unconfirmed email. The photographer row comes from the auth trigger.
   - Sets the trial: `subscription_status='trialing'`, `trial_ends_at=+14d`, `plan='studio_pro_monthly'`
     (full פרו+), and the chosen plan in `signup_plan`.
   - One trial per phone: `phone_already_registered` RPC (service role), which returns 409.
   - Sends 2 emails: a welcome email, and login details with the confirmation link
     (`/api/auth/confirm-email?uid&ts&sig`, HMAC).
2. **Confirm email.** The link sets `email_confirm: true`, and until then login shows
   "כתובת המייל עדיין לא אומתה". First login goes to `/onboarding`.
3. **Trial.**
   - `hasAppAccess()` (`src/lib/subscription.ts`) gates every photographer page.
   - A banner appears in the last 4 days. The cron emails 36h before the end (`trial_reminder_sent_at`).
   - When the trial ends, every page redirects to `/billing`. Storage is capped at 5GB during the trial.
4. **Payment** (`/billing` → `BillingPlanSelector` → `POST /api/payplus/checkout`).
   - `createPayplusCheckoutLink` makes a PayPlus hosted page with a recurring charge
     (`charge_method: 3`, `instant_first_payment`, monthly cadence × `cycleMonths`,
     `more_info = photographer id`, `more_info_1 = plan`).
   - Checkout refuses an already-active subscription (409) and unknown plans (400).
   - Success returns to `/billing/success`, which polls `/api/payplus/status` until the webhook has
     landed.
5. **Webhook** (`POST /api/payplus/webhook`, HMAC-SHA256 of the raw body with the secret key, header `hash`):
   - One row per transaction in `payplus_webhook_events`. The unique `transaction_uid` means a
     retried callback stops before doing anything.
   - Success (`status_code "000"`) sets `active`, `plan`, `current_period_end` (+ cycle), and the
     customer/recurring uids. Failure sets `past_due`, which locks the app and sends them to /billing.
   - A new checkout (`transaction.type = "payment_page"`) cancels the account's previous recurring,
     so two recurrings never charge in parallel.
   - Receipt: Finbot `issueReceipt`, a **חשבונית מס קבלה** (the platform is עוסק מורשה, 18% VAT),
     for the amount PayPlus actually charged, emailed by Finbot to the customer. The result is
     recorded on the event row: `receipt_status` = issued/failed, plus `receipt_link` or `receipt_error`.
   - Admin alerts (email to ADMIN_EMAIL, which forwards to the real inbox) for: a charge on an
     account that doesn't exist, a second charge inside one billing cycle, or a failed receipt.
6. **Renewals** are charged by PayPlus itself (callback `type = "recurring"`, `more_info_1` is
   empty, so the plan comes from the DB row). The cron `subscription-lifecycle` (daily 07:00 UTC)
   handles several things:
   - renewal reminders (7 days before for monthly, 30 for annual)
   - finalizing cancellations at period end
   - due plan switches (cancel the old recurring and email a new checkout link)
   - trial reminders
7. **Cancel** (`/api/payplus/cancel`): deletes the PayPlus recurring and sets `cancel_at_period_end`.
   Access continues until `current_period_end`, then the cron sets `canceled`.

## Verified live (2026-09-24)

| Step | Result |
|---|---|
| Signup (פרו monthly) | 200, "נדרש אימות מייל" screen; DB: trialing, 14.00 days, plan studio_pro_monthly, signup_plan monthly |
| Same phone again | 409 "מספר הטלפון הזה כבר רשום" |
| Login before confirming | refused (message now in Hebrew) |
| Login after confirming | → /onboarding |
| /billing in trial | "נשארו 14 ימים", פרו monthly ₪59 preselected |
| Checkout | 200, real PayPlus payment link generated |
| Unsigned webhook | 401 |

**Not verifiable from the sandbox:**
- The PayPlus payment page itself: `payments.payplus.co.il` is blocked by the egress proxy.
- A real charge, the webhook's success path and the Finbot receipt. They need a real card, or the
  next real renewal. Check `payplus_webhook_events` afterwards (SQL below): `outcome='charged'`,
  `receipt_status='issued'`.
- PayPlus/Finbot keys are Vercel "sensitive" env vars, so they can't be read and neither API can
  be called from here. The PayPlus docs site is blocked too.

## Testing

`signup-billing-test.js` (this folder) runs steps 1–4 on a NEW account and stops before card entry:
1. `NODE_PATH=<playwright-core dir> node signup-billing-test.js <workDir>` (in the background).
2. When it prints `WAITING_FOR_CONFIRM`, confirm the email (this is exactly what the link does):
   ```sql
   update auth.users set email_confirmed_at = now()
   where email = 'gilbertopro55+qa-signup-<stamp>@gmail.com' and email_confirmed_at is null;
   ```
   then `touch <workDir>/confirmed.flag`.
3. Pass = every row of the table above. Leftover QA accounts are named "QA הרשמה <stamp>". The user
   keeps them (2026-09-24), so don't delete.

## Known history (money that already went wrong)

Found in `payplus_webhook_events` on 2026-09-24 (Israel times):
- Account `78a97d91…`: the checkout was charged at 01:39 on 2026-08-28, then **a recurring charge
  at 04:24 the same night**, so it was charged twice.
- Recurring `23934182…` (`more_info = "test-photographer-id"`, a leftover test): charged 2026-09-10
  **twice within 3 seconds**, and it's still active.
- Recurring `0b698301…` of account `cca6cfe0…`, **which no longer exists**: charged 2026-09-10 and
  2026-09-23 (13 days apart), with no receipt. There's no account-deletion flow in the code, so
  deleting an account by hand leaves its recurring running. **Always cancel the recurring before
  deleting an account.**
- Account `146ad19b…`: renewal 13 days after the first payment (expected about 30).

**Resolved 2026-09-25 (owner):**
- Both leftover recurrings (`0b698301…`, `23934182…`) no longer appear in the PayPlus account.
- The extra charges were refunded.
- The missing receipts were issued.

If a charge for an unknown account ever shows up again, the webhook now emails an alert.

Most likely cause: PayPlus's recurring engine. The `instant_first_payment` + `start_date_on_payment_date`
combination can produce a same-day second charge, but it didn't on every account. It wasn't
changed blind (the docs weren't reachable). Check it with PayPlus support or the dashboard
(the recurring's "next charge date").

## Diagnosis

```sql
-- every callback, newest first (no personal data)
select created_at, transaction_uid, photographer_id, outcome, receipt_status, receipt_error,
       payload->'transaction'->>'type' type, payload->'transaction'->>'amount' amount,
       payload->'transaction'->'recurring_charge_information'->>'recurring_uid' recurring_uid
from payplus_webhook_events order by created_at desc limit 20;

-- an account's billing state
select subscription_status, plan, signup_plan, trial_ends_at, current_period_end,
       cancel_at_period_end, pending_plan, payplus_recurring_uid is not null has_recurring
from photographers where id = '<id>';
```
- A customer is locked out: `past_due` means the last charge failed (they pay again at /billing,
  and the old recurring gets cancelled automatically). A `trialing` account with a past
  `trial_ends_at` means the trial ended.
- "I paid but I'm still locked": no callback row means PayPlus didn't reach the webhook (check
  the callback URL in PayPlus). A row with `outcome` null or an error means read the Vercel logs.
- A missing receipt: the `receipt_status/receipt_error` of that transaction. On `failed`, issue
  one manually in Finbot.

## Trial data retention (30 days, since 2026-09-25)

Owner's decision: an account whose trial ended without a payment is **deleted 30 days after the
trial end**.
- **Where:** `lib/accountDeletion.ts`, driven by the `subscription-lifecycle` cron (daily 07:00 UTC).
- **Warnings:** an email 7 days before (`trial_deletion_warned_at`) and 1 day before
  (`trial_deletion_final_warned_at`). Each step requires the previous one to have been sent, and
  the first warning is always at least 7 days before deletion, even if the cron skipped days.
- **What deletion does:**
  1. Removes every storage object under `<bucket>/<photographerId>/`.
  2. Removes the job, export and spread-preview files, and `previews/<galleryId>/` in the previews bucket.
  3. Deletes the auth user; everything in the DB cascades from `photographers`.
  4. Writes a row in `deleted_accounts_log` (no personal data).
  5. Emails the admin.
  - At most 5 deletions per run.
- **Never deleted:**
  - the admin
  - `keep_account = true` (the QA accounts, set by migration 0128)
  - anyone with a `payplus_recurring_uid`
  - anyone with a charged webhook event
  - any status other than `trialing` (the three old `incomplete` users are untouched, as the owner decided)
- The 30-day rule appears in the terms, cancellation policy, FAQ, /billing and the trial-end reminder.
- **To exempt an account:** `update photographers set keep_account = true where id = '<id>';`
- **Verified live (cron run 2026-09-26 07:00 UTC):**
  - "QA מחיקה (מוכן למחיקה)" was deleted from `photographers` and `auth.users`, with no rows left
    behind (its events are gone too), and a row was written to `deleted_accounts_log`.
  - "QA מחיקה (אזהרה ראשונה)" got `trial_deletion_warned_at`.
  - The 4 `keep_account` accounts were untouched, and no other account was deleted or warned.
  - "QA מחיקה (אזהרה ראשונה)" will reach its final warning and deletion over the next cron runs;
    delete it by hand if that's no longer wanted.
