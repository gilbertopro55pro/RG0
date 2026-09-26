// Where a lead came from: the chat link's ?src= (per-channel links in settings > automation),
// else utm_source, else a Facebook / Instagram click id. Stored on bot_conversations and leads
// (referral_source, migration 0133).
export const SOURCE_LABELS: Record<string, string> = {
  ad: "מודעה",
  facebook: "פייסבוק",
  instagram: "אינסטגרם",
  whatsapp: "וואטסאפ",
  whatsapp_ad: "מודעת וואטסאפ",
  qr: "QR",
  portfolio: "פורטפוליו",
};

// The links offered in settings, one per channel.
export const SOURCE_LINKS: { src: string; label: string }[] = [
  { src: "ad", label: "מודעה (יעד: אתר)" },
  { src: "instagram", label: "אינסטגרם (ביו וסטורי)" },
  { src: "facebook", label: "עמוד הפייסבוק" },
  { src: "qr", label: "קוד QR (כרטיס ביקור, דוכן)" },
];

export function cleanSource(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "insta" || v === "ig") return "instagram";
  if (v === "fb") return "facebook";
  return /^[a-z0-9_-]{1,30}$/.test(v) ? v : null;
}

export function sourceFromSearch(search: string): string | null {
  const q = new URLSearchParams(search);
  return cleanSource(q.get("src")) ?? cleanSource(q.get("utm_source")) ?? (q.get("fbclid") ? "facebook" : q.get("igshid") ? "instagram" : null);
}

export function sourceLabel(src: string | null | undefined): string | null {
  if (!src) return null;
  return SOURCE_LABELS[src] ?? src;
}
