import { ADMIN_EMAIL } from "@/lib/admin";

// Campaign tracking is admin only for now (owner, 2026-10-14): the /leads/campaigns page, its link on
// the leads page, spend entry and the AI analysis. Capturing the campaign on new leads runs for every
// account (nothing to see), so the numbers are already there when it opens up. Kept apart from
// lib/campaigns.ts, which the public chat page loads, so the admin address stays out of that bundle.
export function campaignsAllowed(email: string | null | undefined): boolean {
  return email === ADMIN_EMAIL;
}
