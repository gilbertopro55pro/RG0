// Billing dates follow the Israeli calendar: PayPlus charges by the Israeli date and receipts are
// dated in Israel. The server runs in UTC, where a charge at 01:39 Israel time is still the day
// before, so plain Date getters gave a paid-through date and a receipt date one day early.
const TZ = "Asia/Jerusalem";

const partsFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "numeric",
  second: "numeric",
});

function israelParts(date: Date) {
  const parts = partsFormat.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour") % 24, min: get("minute"), s: get("second") };
}

// How far Israeli wall-clock time is ahead of UTC at a given moment (2 or 3 hours).
function israelOffsetMs(date: Date): number {
  const p = israelParts(date);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min, p.s) - Math.floor(date.getTime() / 1000) * 1000;
}

// `months` calendar months after (or before, when negative) `from`, counted on the Israeli calendar,
// at the same Israeli time of day. The day is clamped to the target month's last day, so Jan 31 +
// 1 month is Feb 28 and not Mar 3 (what `new Date(y, m + 1, 31)` gives).
export function addBillingMonths(from: Date, months: number): Date {
  const p = israelParts(from);
  const first = new Date(Date.UTC(p.y, p.m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const wall = Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(p.d, lastDay), p.h, p.min, p.s);
  // `wall` is the Israeli clock reading as if it were UTC; take Israel's offset at that moment off
  // it (twice, so a target on the other side of a daylight-saving change still lands right).
  let utc = wall - israelOffsetMs(new Date(wall));
  utc = wall - israelOffsetMs(new Date(utc));
  return new Date(utc);
}

// "dd/mm/yyyy" of a moment's Israeli date (Finbot's date format).
export function israelDateString(date: Date): string {
  const p = israelParts(date);
  return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`;
}

// "yyyy-mm-dd" of a moment's Israeli date (Green Invoice's date format).
export function israelIsoDateString(date: Date): string {
  const [dd, mm, yyyy] = israelDateString(date).split("/");
  return `${yyyy}-${mm}-${dd}`;
}

// When a monthly standing order must be cancelled before the switch to another price (a plan switch
// the customer scheduled, or an admin price change): 2 days before the paid month ends.
// PayPlus charges a renewal in the early morning of the renewal date (01:30–02:00 UTC in the charges
// so far), and the subscription-lifecycle cron that cancels it runs once a day at 07:00 UTC. With 1
// day, a period ending after 07:00 UTC made the switch due only after the cron of the day before had
// run, so the next run came after the renewal had already charged the old price.
export const MONTHLY_SWITCH_LEAD_DAYS = 2;

export function monthlySwitchDate(periodEnd: Date): Date {
  return new Date(periodEnd.getTime() - MONTHLY_SWITCH_LEAD_DAYS * 24 * 60 * 60 * 1000);
}
