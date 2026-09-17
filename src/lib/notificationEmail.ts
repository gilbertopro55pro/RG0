// Wraps `photographers.email` wherever it's used as an actual email RECIPIENT (never where it's
// compared against ADMIN_EMAIL for admin-gating — that comparison must keep using the raw stored
// value, since ADMIN_EMAIL is the account's real identifier regardless of whether it's a
// deliverable mailbox).
//
// Confirmed live 2026-09-05: "gilbertopro_admin@gmail.com" (the admin account's identifier —
// see src/lib/admin.ts) is used throughout the app for login/admin-gating, but is NOT a real
// Gmail mailbox — Gmail hard-bounces it with "550 5.1.1 The email account that you tried to
// reach does not exist" (Gmail doesn't even allow underscores in real account names, so this
// address could never have existed as one). This silently broke every notification email meant
// for this account (export-ready, contract-signed, subscription reminders, etc.) since whenever
// this address was first set — Resend auto-suppressed it after the first bounce, and every send
// after that failed the exact same way with zero visible symptom beyond "the email never
// arrived." The user confirmed their real, working address is "gilbertopro55@gmail.com".
const EMAIL_OVERRIDES: Record<string, string> = {
  "gilbertopro_admin@gmail.com": "gilbertopro55@gmail.com",
};

export function notificationEmailFor(storedEmail: string): string {
  return EMAIL_OVERRIDES[storedEmail] ?? storedEmail;
}
