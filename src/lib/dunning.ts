// Automatic follow-up on an unpaid subscription (owner's decision, 2026-10-28: "the messages go out on
// their own, and I step in only for a real problem, to unlock an account"). Replaces the admin-only
// "missed renewal" alert and the manual lock as the default path; the admin dashboard still locks and
// unlocks by hand.
//
// The due date: the end of the paid period for an account with nothing to renew it (no recurring),
// or 2 days after it for one with a recurring, since PayPlus sends no callback for a declined renewal
// and retries on its own (a late success moves current_period_end forward and ends all this).
// Stages, sent by the daily subscription-lifecycle cron, one per run:
//   1 upcoming  3 days before the period ends, no recurring only: nothing will renew it
//   2 due       on the due date: pay at /billing, or access is blocked on the lock date
//   3 final     the day before the lock date
//   4 locked    LOCK_AFTER_DAYS after the due date: past_due, the customer and the admin are told
// A payment moves current_period_end, so dunning_for no longer matches and everything starts over.

const DAY = 86_400_000;
export const UPCOMING_DAYS_BEFORE = 3;
export const RECURRING_GRACE_DAYS = 2;
export const LOCK_AFTER_DAYS = 7;

export type DunningStage = 1 | 2 | 3 | 4;

export type DunningFields = {
  subscription_status: string;
  cancel_at_period_end: boolean;
  current_period_end: string | null;
  payplus_recurring_uid: string | null;
  keep_account?: boolean | null;
  dunning_for: string | null;
  dunning_stage: number;
};

export function dunningDueDate(p: Pick<DunningFields, "current_period_end" | "payplus_recurring_uid">): Date | null {
  if (!p.current_period_end) return null;
  const end = new Date(p.current_period_end).getTime();
  return new Date(p.payplus_recurring_uid ? end + RECURRING_GRACE_DAYS * DAY : end);
}

export function dunningLockDate(p: Pick<DunningFields, "current_period_end" | "payplus_recurring_uid">): Date | null {
  const due = dunningDueDate(p);
  return due ? new Date(due.getTime() + LOCK_AFTER_DAYS * DAY) : null;
}

// The stage already reached for the current period (0 when the stored one is for an earlier period).
export function currentDunningStage(p: Pick<DunningFields, "current_period_end" | "dunning_for" | "dunning_stage">): number {
  if (!p.current_period_end || !p.dunning_for) return 0;
  return new Date(p.dunning_for).getTime() === new Date(p.current_period_end).getTime() ? p.dunning_stage : 0;
}

// The one stage this run should act on, or null. One step per run, so a customer always gets the
// final warning at least a day before the lock, even when the cron skipped days; the upcoming notice
// is skipped once the period has already ended (it would be wrong by then).
export function nextDunningStage(p: DunningFields, isAdmin: boolean, now = new Date()): DunningStage | null {
  if (isAdmin || p.keep_account || p.subscription_status !== "active" || p.cancel_at_period_end) return null;
  const due = dunningDueDate(p);
  if (!due) return null;
  const t = now.getTime();
  const dueMs = due.getTime();
  const lockMs = dueMs + LOCK_AFTER_DAYS * DAY;

  let target = 0;
  if (t >= lockMs) target = 4;
  else if (t >= lockMs - DAY) target = 3;
  else if (t >= dueMs) target = 2;
  else if (!p.payplus_recurring_uid && t >= dueMs - UPCOMING_DAYS_BEFORE * DAY) target = 1;

  const reached = currentDunningStage(p);
  if (target <= reached) return null;
  if (target === 1) return 1;
  return Math.min(target, Math.max(reached + 1, 2)) as DunningStage;
}
