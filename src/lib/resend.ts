import { notificationEmailFor } from "@/lib/notificationEmail";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Sender name for everything the system itself sends to a photographer (upload/selection/export
// notifications, signup, billing). Mail that goes to a photographer's OWN client passes that
// photographer's name as `fromName` instead.
const SYSTEM_SENDER_NAME = "גילברטו";

// RESEND_FROM_EMAIL may be a bare address or `Name <address>` — only the address is kept, since
// that used to bake one fixed display name ("רועי גלברט - צילום") onto every email for every
// photographer, including a quote another photographer sent to their own client (found
// 2026-09-23). The verified sending address itself never changes, only the name shown.
function fromHeader(fromName: string | undefined): string {
  const configured = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const address = configured.match(/<([^>]+)>/)?.[1]?.trim() ?? configured.trim();
  const name = (fromName ?? "").replace(/["<>\r\n]/g, "").trim().slice(0, 60) || SYSTEM_SENDER_NAME;
  return `"${name}" <${address}>`;
}

export async function sendEmail({
  to,
  subject,
  text,
  replyTo,
  attachments,
  fromName,
}: {
  to: string;
  subject: string;
  text: string;
  replyTo?: string;
  attachments?: { filename: string; content: string }[];
  // The photographer's name, for mail going to their client. Omit for system mail.
  fromName?: string;
}): Promise<void> {
  const apiKey = requireEnv("RESEND_API_KEY");
  const from = fromHeader(fromName);
  // Last line of defense: every send goes through here, so the known-dead address overrides
  // (notificationEmail.ts) apply even where a caller forgot to call notificationEmailFor itself.
  to = notificationEmailFor(to);
  if (replyTo) replyTo = notificationEmailFor(replyTo);

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
      ...(replyTo ? { reply_to: replyTo } : {}),
      ...(attachments ? { attachments } : {}),
    }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data?.message ?? "שליחת המייל נכשלה");
  }
}
