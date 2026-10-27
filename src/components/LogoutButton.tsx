"use client";

import { createClient } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";
import { ACTIVE_UPLOAD_STORAGE_KEY } from "@/lib/activeUploadLock";

// Browser storage that holds account data (a gallery's title, which gallery was open). Device
// preferences (theme, haptics, guides already seen) stay.
const ACCOUNT_STORAGE_KEYS = [ACTIVE_UPLOAD_STORAGE_KEY, "gf_album_rotate_resume"];

// Signs out and loads `to` (the login page, or the login page that returns to a link: the 404 page's
// "sign in to another account").
export async function signOutTo(to: string) {
  const supabase = createClient();
  await supabase.auth.signOut();
  try {
    for (const key of ACCOUNT_STORAGE_KEYS) {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    }
  } catch {
    // storage blocked: nothing was saved there either
  }
  // A full page load, not router.push: drops the client router's in-memory cache of pages the
  // user already visited (leads, clients, payments), so Back after logout can't show them.
  window.location.replace(to);
}

export default function LogoutButton() {
  const t = useT();

  return (
    <button onClick={() => signOutTo("/login")} className="text-xs text-ink-soft underline">
      {t("התנתקות")}
    </button>
  );
}
