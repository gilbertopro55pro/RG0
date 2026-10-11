import { notificationEmailFor } from "@/lib/notificationEmail";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Sender name for everything the system itself sends to a photographer (upload/selection/export
// notifications, signup, billing). Mail that goes to a photographer's OWN client (or print house)
// passes that photographer's name as `fromName` instead.
const SYSTEM_SENDER_NAME = "גילברטו";

// RESEND_FROM_EMAIL may be a bare address or `Name <address>` — only the address is kept, since
// that used to bake one fixed display name ("רועי גלברט - צילום") onto every email for every
// photographer, including a quote another photographer sent to their own client (found
// 2026-09-23). This is the system's own address, for mail to photographers.
export function senderAddress(): string {
  const configured = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  return configured.match(/<([^>]+)>/)?.[1]?.trim() ?? configured.trim();
}

// Mail sent on a photographer's behalf (to their client or print house, i.e. with `fromName`)
// comes from its own address on the same verified domain, not the system's notifications address
// (owner, 2026-10-11). Print-house mail landed under Gmail's "עדכונים", and one shared "updates@"
// sender for both automatic notices and personal notes was the likely reason.
// RESEND_CLIENT_FROM_EMAIL overrides it.
const CLIENT_LOCAL_PART = "studio";
export function clientSenderAddress(): string {
  const override = process.env.RESEND_CLIENT_FROM_EMAIL?.trim();
  if (override) return override;
  const system = senderAddress();
  const domain = system.split("@")[1];
  // resend.dev only sends from its one test address.
  return domain && domain !== "resend.dev" ? `${CLIENT_LOCAL_PART}@${domain}` : system;
}

function fromHeader(fromName: string | undefined, address: string): string {
  const name = (fromName ?? "").replace(/["<>\r\n]/g, "").trim().slice(0, 60) || SYSTEM_SENDER_NAME;
  return `"${name}" <${address}>`;
}

export async function sendEmail({
  to,
  subject,
  text,
  html,
  replyTo,
  attachments,
  fromName,
}: {
  to: string;
  subject: string;
  text: string;
  // Optional HTML body; `text` still goes along as the plain-text part.
  html?: string;
  replyTo?: string;
  attachments?: { filename: string; content: string }[];
  // The photographer's name, for mail going to their client. Omit for system mail.
  fromName?: string;
}): Promise<void> {
  const apiKey = requireEnv("RESEND_API_KEY");
  // Last line of defense: every send goes through here, so the known-dead address overrides
  // (notificationEmail.ts) apply even where a caller forgot to call notificationEmailFor itself.
  to = notificationEmailFor(to);
  if (replyTo) replyTo = notificationEmailFor(replyTo);

  const post = (address: string) =>
    fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromHeader(fromName, address),
        to,
        subject,
        text,
        ...(html ? { html } : {}),
        ...(replyTo ? { reply_to: replyTo } : {}),
        ...(attachments ? { attachments } : {}),
      }),
    });

  const system = senderAddress();
  const address = fromName ? clientSenderAddress() : system;
  let res = await post(address);
  // A client's email must never be lost to the sender address: if Resend refuses the client
  // address (403/422, e.g. not allowed for this domain), send it once more from the system's own.
  if (!res.ok && address !== system && (res.status === 403 || res.status === 422)) {
    const data = await res.json().catch(() => ({}));
    console.error("[resend] client sender refused, retrying from the system address", res.status, data?.message);
    res = await post(system);
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message ?? "שליחת המייל נכשלה");
  }
}
