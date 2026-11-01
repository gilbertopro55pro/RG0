import type { Lang } from "@/i18n/config";

// Every message to a client has the same shape (owner, 2026-11-01):
//
//   שלום {client's name},
//   {the body: what this message is about}
//   קישור: {the link this message is about}
//
//   {the photographer's signature}
//
// In refined, warm language, never cynical or pushy (no "הגיע הזמן", no "תזכורת קטנה: מחכים…").
// The link line only when the message has a link; the signature is the photographer's WhatsApp
// signature, or their name without one, never both (owner, 2026-10-19). Client-safe: no imports
// beyond types.

export const CLIENT_LINK_LABEL: Record<Lang, string> = { he: "קישור:", en: "Link:", ru: "Ссылка:" };

export function clientGreeting(name: string | null | undefined, lang: Lang): string {
  const n = name?.trim();
  if (lang === "en") return n ? `Hi ${n},` : "Hi,";
  if (lang === "ru") return n ? `Здравствуйте, ${n}!` : "Здравствуйте!";
  return n ? `שלום ${n},` : "שלום,";
}

export function clientSignature(signature: string | null | undefined, senderName: string | null | undefined): string | null {
  return signature?.trim() || senderName?.trim() || null;
}

export function formatClientMessage(p: {
  lang: Lang;
  name: string | null | undefined;
  body: string;
  link?: string | null;
  signature?: string | null;
  senderName?: string | null;
}): string {
  const lines = [clientGreeting(p.name, p.lang), p.body.trim()];
  if (p.link?.trim()) lines.push(`${CLIENT_LINK_LABEL[p.lang]} ${p.link.trim()}`);
  const signature = clientSignature(p.signature, p.senderName);
  return signature ? `${lines.join("\n")}\n\n${signature}` : lines.join("\n");
}
