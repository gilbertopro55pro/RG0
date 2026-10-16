"use client";

import { useEffect, useRef, useState } from "react";
import BodyPortal from "@/components/BodyPortal";
import { useT } from "@/i18n/client";

// Photo culling labels: the original at 100%, scrolled to the point that was tapped. Judging focus
// needs the full resolution; the copy on screen is 2000px at most. A finger pans it on a phone.
export default function CullingZoom({ storagePath, x, y, onClose }: { storagePath: string; x: number; y: number; onClose: () => void }) {
  const t = useT();
  const [url, setUrl] = useState<string | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/storage/download-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "galleries", path: storagePath }),
      }).catch(() => null);
      const data = res?.ok ? await res.json() : null;
      if (cancelled) return;
      if (data?.url) setUrl(data.url);
      else closeRef.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [storagePath]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key.toLowerCase() === "z") {
        e.stopImmediatePropagation();
        closeRef.current();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  return (
    <BodyPortal>
      <div className="fixed inset-0 z-[90] bg-black" role="dialog" aria-modal="true" aria-label={t("הגדלה")}>
        <button
          onClick={onClose}
          className="absolute top-[calc(env(safe-area-inset-top)+12px)] end-3 z-10 h-10 px-4 rounded-full bg-white/90 text-sm font-semibold"
        >
          {t("סגירה")}
        </button>
        {!url ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">{t("טוען את המקור...")}</p>
        ) : (
          // ltr: in a right-to-left page scrollLeft counts from the right edge (0 and below), and the
          // positive offset below would be clamped to the right edge.
          <div
            dir="ltr"
            className="absolute inset-0 overflow-auto overscroll-contain"
            ref={(el) => {
              // Once the original has its size, scroll to the point that was tapped.
              const img = el?.querySelector("img");
              if (!el || !img) return;
              const center = () => {
                el.scrollLeft = img.naturalWidth * x - el.clientWidth / 2;
                el.scrollTop = img.naturalHeight * y - el.clientHeight / 2;
              };
              if (img.complete) center();
              else img.onload = center;
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="max-w-none" onClick={onClose} />
          </div>
        )}
      </div>
    </BodyPortal>
  );
}
