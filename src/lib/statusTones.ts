import type { Tone } from "@/lib/tones";
import type { LeadStatus, SubscriptionStatus } from "@/lib/types";

// Which tone (lib/tones.ts) a status tag gets in the vivid look (admin only for now). One fixed
// meaning per tone across the app: paid = done/closed/approved, upcoming = sent/scheduled,
// attention = needs the photographer now, pending = waiting on someone, neutral = archived/lost.

// A lead's status: a new lead waits for the first reply (attention), "contacted" is under way,
// a sent quote waits for the client, converted is done, lost is out of play.
const LEAD_STATUS_TONES: Record<LeadStatus, Tone> = {
  new: "attention",
  contacted: "upcoming",
  quoted: "pending",
  won: "paid",
  lost: "neutral",
};

export function leadStatusTone(status: LeadStatus): Tone {
  return LEAD_STATUS_TONES[status] ?? "neutral";
}

// A photographer's subscription (settings › billing, the admin dashboard): active is paid up, a
// trial is running, a failed payment needs fixing, an unfinished payment waits, canceled is over.
const SUBSCRIPTION_STATUS_TONES: Record<SubscriptionStatus, Tone> = {
  active: "paid",
  trialing: "upcoming",
  past_due: "attention",
  incomplete: "pending",
  canceled: "neutral",
};

export function subscriptionStatusTone(status: string): Tone {
  return SUBSCRIPTION_STATUS_TONES[status as SubscriptionStatus] ?? "neutral";
}

// One album send to a print house (PrintHouseSendsHistory): files still being prepared wait, a
// failed or cancelled send needs the photographer, a download means the print house got it, and
// otherwise it's sent.
export function printSendTone(send: { status: string; downloadCount: number }): Tone {
  if (send.status === "pending" || send.status === "processing") return "pending";
  if (send.status === "failed" || send.status === "cancelled") return "attention";
  if (send.downloadCount > 0) return "paid";
  return "upcoming";
}
