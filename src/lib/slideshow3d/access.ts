import { ADMIN_EMAIL } from "@/lib/admin";

// The 3D slideshow (random order, 3D transitions) is an admin update for now ("עדכון אדמין",
// 2026-11-02): only in the admin's galleries, for the admin and for the admin's clients. Every
// other gallery keeps the classic slideshow. To release it to everyone: return true.
export function slideshow3dFor(photographerEmail: string | null | undefined): boolean {
  return !!photographerEmail && photographerEmail === ADMIN_EMAIL;
}
