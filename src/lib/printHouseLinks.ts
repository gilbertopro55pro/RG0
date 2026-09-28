// Print-house links (migration 0140). The print-house email links to /print/<share_token> on our
// own site instead of straight to the file, so we can record the download (and notify the
// photographer) and renew an expired link without re-rendering the album.
import { randomBytes } from "node:crypto";

// How long a print-house link works, and how long the file itself is kept (the gap is what makes
// "renew the link" possible without rendering the album again).
export const PRINT_LINK_DAYS = 7;
export const PRINT_FILE_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;
export const daysFromNow = (days: number) => new Date(Date.now() + days * DAY_MS).toISOString();

export const newPrintShareToken = () => randomBytes(24).toString("base64url");

export const printLinkUrl = (token: string) => `https://myframeflow.com/print/${token}`;

export const formatPrintDate = (iso: string) =>
  new Date(iso).toLocaleString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });

export const formatPrintDay = (iso: string) =>
  new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem", day: "numeric", month: "numeric", year: "numeric" });
