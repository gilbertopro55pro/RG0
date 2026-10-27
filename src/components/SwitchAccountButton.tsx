"use client";

import { useState } from "react";
import { signOutTo } from "@/components/LogoutButton";

// The 404 page's "sign in to another account": signs out, and the login page brings the photographer
// back to the same link once they sign in to the account it belongs to (/login?next=…).
export default function SwitchAccountButton({ label }: { label: string }) {
  const [busy, setBusy] = useState(false);
  const go = () => {
    setBusy(true);
    const here = `${window.location.pathname}${window.location.search}`;
    signOutTo(`/login?next=${encodeURIComponent(here)}`).catch(() => setBusy(false));
  };
  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="block w-full rounded-xl py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
    >
      {label}
    </button>
  );
}
