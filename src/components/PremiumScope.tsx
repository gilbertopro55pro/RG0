"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { isClientFacingPath, PREMIUM_CLASS } from "@/lib/premiumScope";

// Keeps the premium class on <html> in step with client-side navigation (the root layout sets it
// on the first render from the request path, but doesn't re-render when the route changes).
export default function PremiumScope() {
  const pathname = usePathname();
  useEffect(() => {
    document.documentElement.classList.toggle(PREMIUM_CLASS, !isClientFacingPath(pathname ?? "/"));
  }, [pathname]);
  return null;
}
