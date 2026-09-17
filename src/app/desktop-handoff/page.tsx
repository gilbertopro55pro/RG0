"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Lets the native desktop app's embedded browser view inherit the session the photographer
// already established in the native login screen, so they only ever log in once — instead of
// being shown this same website's own separate login form a second time inside the app. The
// tokens travel in the URL HASH, never the query string or a request body: a hash fragment is
// never sent to the server in any HTTP request, only readable client-side via location.hash, so
// this is no more exposed than any other client-side-only piece of state — and this route is only
// ever navigated to from the desktop app's own main process, never linked to from anywhere else.
export default function DesktopHandoffPage() {
  const router = useRouter();
  const [status, setStatus] = useState<"working" | "error">("working");

  useEffect(() => {
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
    const params = new URLSearchParams(hash);
    const access_token = params.get("access_token");
    const refresh_token = params.get("refresh_token");
    if (!access_token || !refresh_token) {
      setStatus("error");
      return;
    }
    const supabase = createClient();
    supabase.auth
      .setSession({ access_token, refresh_token })
      .then(({ error }) => {
        if (error) {
          setStatus("error");
          return;
        }
        router.replace("/");
      })
      .catch(() => setStatus("error"));
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <p className="text-sm text-ink-soft">{status === "error" ? "שגיאה בהתחברות — נסו שוב" : "מתחבר..."}</p>
    </div>
  );
}
