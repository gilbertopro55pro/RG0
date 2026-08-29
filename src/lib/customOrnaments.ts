// Client-side helpers for photographer-uploaded ornament tabs — same-origin fetch (the browser
// session's own cookies authenticate these calls automatically), hitting the same
// /api/desktop/ornament-tabs* routes the desktop app uses over a bearer token. See
// authenticateGalleryRequest in src/lib/desktopAuth.ts for the shared cookie-or-bearer auth.

export type CustomOrnamentTab = { id: string; name: string; sort_order: number; created_at: string };
export type CustomOrnament = { id: string; tab_id: string; original_filename: string; created_at: string };

export async function fetchCustomOrnaments(): Promise<{ tabs: CustomOrnamentTab[]; ornaments: CustomOrnament[] }> {
  const res = await fetch("/api/desktop/ornament-tabs");
  if (!res.ok) throw new Error(`שגיאה בטעינת לשוניות עיטורים (${res.status})`);
  return res.json();
}

export async function createCustomOrnamentTab(name: string): Promise<CustomOrnamentTab> {
  const res = await fetch("/api/desktop/ornament-tabs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error(`שגיאה ביצירת הלשונית (${res.status})`);
  const data = await res.json();
  return data.tab;
}

export async function uploadCustomOrnament(tabId: string, filename: string, bytes: ArrayBuffer, contentType: string): Promise<CustomOrnament> {
  const res = await fetch(`/api/desktop/ornament-tabs/${tabId}/ornaments`, {
    method: "POST",
    headers: { "Content-Type": contentType, "x-filename": encodeURIComponent(filename) },
    body: bytes,
  });
  if (!res.ok) throw new Error(`שגיאה בהעלאת העיטור (${res.status})`);
  const data = await res.json();
  return data.ornament;
}

export async function fetchCustomOrnamentBytes(ornamentId: string): Promise<ArrayBuffer> {
  const res = await fetch(`/api/desktop/ornaments/${ornamentId}`);
  if (!res.ok) throw new Error(`שגיאה בטעינת העיטור (${res.status})`);
  return res.arrayBuffer();
}

export async function deleteCustomOrnament(ornamentId: string): Promise<void> {
  const res = await fetch(`/api/desktop/ornaments/${ornamentId}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`שגיאה במחיקת העיטור (${res.status})`);
}
