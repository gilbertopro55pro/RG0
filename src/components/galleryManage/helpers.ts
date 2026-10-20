import type { AlbumElement } from "@/lib/types";

// Attached to the document before click — a detached anchor's click() is a silent no-op on some
// engines (WebKit especially), which reads as "nothing happens, no save dialog".
export function triggerZipAnchorDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// Auto album design: bleed elements (a full half-page photo, a full cover photo) run to the page
// edge on purpose, so they're left as laid out; everything else is pulled into the safe margin.
export function fitAutoElements(elements: AlbumElement[], inset: { x: number; y: number } | null, bleedIds: string[] = []): AlbumElement[] {
  if (!inset) return elements;
  const safeW = 100 - 2 * inset.x;
  const safeH = 100 - 2 * inset.y;
  if (safeW <= 0 || safeH <= 0) return elements;
  const bleed = new Set(bleedIds);
  return elements.map((el) =>
    bleed.has(el.id)
      ? el
      : {
          ...el,
          xPct: inset.x + (el.xPct / 100) * safeW,
          yPct: inset.y + (el.yPct / 100) * safeH,
          widthPct: (el.widthPct / 100) * safeW,
          ...(el.heightPct !== undefined ? { heightPct: (el.heightPct / 100) * safeH } : {}),
        }
  ) as AlbumElement[];
}
