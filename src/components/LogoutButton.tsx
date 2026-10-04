"use client";

import { createClient } from "@/lib/supabase/client";
import { useT } from "@/i18n/client";
import { ACTIVE_UPLOAD_STORAGE_KEY } from "@/lib/activeUploadLock";

// Browser storage that holds account data (a gallery's title, which gallery was open). Device
// preferences (theme, haptics, guides already seen) stay.
const ACCOUNT_STORAGE_KEYS = [ACTIVE_UPLOAD_STORAGE_KEY, "gf_album_rotate_resume"];

export default function LogoutButton() {
  const t = useT();
  const logout = async () => {
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
    window.location.replace("/login");
  };

  return (
    <button onClick={logout} className="text-xs text-ink-soft underline">
      {t("התנתקות")}
    </button>
  );
}
