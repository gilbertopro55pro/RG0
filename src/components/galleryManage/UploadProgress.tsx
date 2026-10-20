"use client";

import type { ReactNode } from "react";
import { useT } from "@/i18n/client";
import { useUploadValue } from "@/lib/galleryUploads";

// "מעלה תמונות... (120/2000)": redraws by itself as the count moves, not the whole gallery page.
export function UploadCount({ uploadKey: key }: { uploadKey: string }) {
  const t = useT();
  const count = useUploadValue((list) => {
    const u = list.find((x) => x.key === key);
    return u ? `${u.done}/${u.total}` : "";
  });
  return <>{`${t("מעלה תמונות...")} (${count})`}</>;
}

// The upload's percent for the progress modal, read here so only the modal redraws as it moves.
// `live` false (another operation's modal): `fallback`.
export function UploadPct({ uploadKey: key, live, fallback, children }: { uploadKey: string; live: boolean; fallback: number; children: (pct: number) => ReactNode }) {
  const pct = useUploadValue((list) => {
    if (!live) return -1;
    const u = list.find((x) => x.key === key);
    return u ? Math.round(u.pct) : 0;
  });
  return <>{children(live ? pct : fallback)}</>;
}
