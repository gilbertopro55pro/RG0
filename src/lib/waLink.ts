"use client";

// Client-safe WhatsApp helpers — deliberately separate from src/lib/whatsapp.ts (which reads
// server-only secrets for the Meta Cloud API) so nothing server-oriented ever ships in a client
// bundle. Opens the photographer's OWN WhatsApp (app or Web) with the client's chat pre-filled —
// no Business API, no template approval, no 24h-window rule; the photographer just taps send.

export function normalizeIsraeliPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("972")) return digits;
  if (digits.startsWith("0")) return `972${digits.slice(1)}`;
  return digits;
}

export function buildWaMeLink(phone: string, text: string): string {
  return `https://wa.me/${normalizeIsraeliPhone(phone)}?text=${encodeURIComponent(text)}`;
}

export function openWhatsApp(phone: string, text: string): void {
  window.open(buildWaMeLink(phone, text), "_blank");
}
