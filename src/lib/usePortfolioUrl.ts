"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SITE_URL } from "@/lib/siteUrl";

// The photographer's public portfolio address, for the line "תיק העבודות שלי:" in the quote link
// message (owner, 2026-11-07, lib/quoteDefaults.ts). Only when the portfolio is on and has an
// address; null otherwise (and for a team member, who has no row of their own). Read once per page
// load, shared by every component that asks.
let cached: Promise<string | null> | null = null;

export function portfolioUrlFor(row: { portfolio_enabled?: boolean | null; portfolio_slug?: string | null } | null | undefined): string | null {
  return row?.portfolio_enabled && row.portfolio_slug ? `${SITE_URL}/p/${row.portfolio_slug}` : null;
}

function load(): Promise<string | null> {
  cached ??= (async () => {
    const sb = createClient();
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (!user) return null;
    const { data } = await sb
      .from("photographers")
      .select("portfolio_enabled, portfolio_slug")
      .eq("id", user.id)
      .maybeSingle<{ portfolio_enabled: boolean | null; portfolio_slug: string | null }>();
    return portfolioUrlFor(data);
  })().catch(() => {
    cached = null;
    return null;
  });
  return cached;
}

export function usePortfolioUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void load().then((u) => alive && setUrl(u));
    return () => {
      alive = false;
    };
  }, []);
  return url;
}
