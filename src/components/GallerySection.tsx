"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import type { GalleryRow } from "@/lib/types";
import { createClient } from "@/lib/supabase/client";
import NewGalleryModal from "@/components/NewGalleryModal";
import LinkExistingGalleryModal from "@/components/LinkExistingGalleryModal";
import { useT } from "@/i18n/client";

export default function GallerySection({
  eventId,
  initialGallery,
  photoCount,
  coverUrl,
  clientName,
  clientPhone,
  eventDate,
}: {
  eventId: string;
  initialGallery: GalleryRow | null;
  photoCount: number;
  coverUrl: string | null;
  clientName: string;
  clientPhone: string;
  eventDate: string;
}) {
  const t = useT();
  const router = useRouter();
  const supabase = createClient();
  const [gallery, setGallery] = useState(initialGallery);
  const [picker, setPicker] = useState<"new" | "link" | null>(null);
  // A gallery already linked but not yet set up by the photographer (activated: false — see
  // migration 0120_gallery_activated.sql) is treated the same as no gallery at all for display
  // purposes: the event card still offers "פתיחת גלריה לאירוע", which then UPDATEs this same row
  // (via existingGalleryId below) instead of creating a second, orphaned one.
  const isActivated = !!gallery?.activated;
  const [unlinkStep, setUnlinkStep] = useState<"idle" | "confirm1" | "confirm2">("idle");
  const [unlinking, setUnlinking] = useState(false);

  const isArchived = !!gallery?.archived_at;

  const unlink = async () => {
    if (!gallery) return;
    setUnlinking(true);
    const { error } = await supabase.from("galleries").update({ event_id: null }).eq("id", gallery.id);
    setUnlinking(false);
    if (!error) {
      setGallery(null);
      setUnlinkStep("idle");
      router.refresh();
    }
  };

  return (
    <div className="rounded-2xl p-4 mb-5 bg-card border border-line shadow-card">
      <div className="flex items-center justify-between mb-3.5">
        <span className="text-sm font-semibold">{t("גלריית תמונות")}</span>
        {isActivated && <span className="text-xs text-ink-soft font-data">{t("{n} תמונות", { n: photoCount })}</span>}
      </div>

      {isActivated && gallery ? (
        <>
          <Link href={`/galleries/${gallery.id}`} className="flex items-center gap-3">
            <div className="relative h-14 w-14 rounded-xl overflow-hidden bg-line shrink-0">
              {coverUrl && <Image src={coverUrl} alt="" fill sizes="56px" className="object-cover" />}
            </div>
            <div className="flex-1">
              <div className="text-sm font-medium">
                {isArchived ? (
                  <span className="text-rose">{t("בארכיון")}</span>
                ) : gallery.published ? (
                  <span className="text-sage">{t("פורסמה ✓")}</span>
                ) : (
                  <span className="text-ink-soft">{t("טיוטה. עדיין לא פורסמה")}</span>
                )}
              </div>
              <div className="text-xs text-amber-deep underline mt-0.5">{t("ניהול גלריה")} <span className="inline-block ltr:rotate-180">←</span></div>
            </div>
          </Link>

          {unlinkStep === "idle" && (
            <button onClick={() => setUnlinkStep("confirm1")} className="text-xs text-ink-soft underline mt-3">
              {t("ניתוק גלריה מהאירוע")}
            </button>
          )}
          {unlinkStep === "confirm1" && (
            <div className="rounded-xl p-3.5 space-y-2.5 mt-3" style={{ background: "var(--color-chip)" }}>
              <p className="text-xs text-ink">{t("לנתק את הגלריה מהאירוע הזה? הגלריה עצמה לא תימחק, רק הקישור אליו.")}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setUnlinkStep("idle")}
                  className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft"
                >
                  {t("ביטול")}
                </button>
                <button onClick={() => setUnlinkStep("confirm2")} className="flex-1 rounded-lg py-2 text-xs font-semibold bg-rose text-white">
                  {t("כן, המשך")}
                </button>
              </div>
            </div>
          )}
          {unlinkStep === "confirm2" && (
            <div className="rounded-xl p-3.5 space-y-2.5 mt-3" style={{ background: "var(--color-chip)" }}>
              <p className="text-xs font-semibold text-rose">{t("אישור אחרון")}</p>
              <p className="text-xs text-ink">{t("כרטיס האירוע יחזור להציג \"פתיחת גלריה לאירוע\". אפשר לקשר את הגלריה בחזרה בכל שלב.")}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setUnlinkStep("idle")}
                  disabled={unlinking}
                  className="flex-1 rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink-soft disabled:opacity-60"
                >
                  {t("ביטול")}
                </button>
                <button
                  onClick={unlink}
                  disabled={unlinking}
                  className="flex-1 rounded-lg py-2 text-xs font-semibold bg-rose text-white disabled:opacity-60"
                >
                  {unlinking ? t("מנתק...") : t("כן, לנתק")}
                </button>
              </div>
            </div>
          )}
        </>
      ) : (
        <>
          <button
            onClick={() => setPicker("new")}
            className="w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white"
          >
            {t("פתיחת גלריה לאירוע")}
          </button>
          <button onClick={() => setPicker("link")} className="w-full text-xs text-ink-soft underline mt-2.5">
            {t("קישור לגלריה קיימת")}
          </button>
        </>
      )}

      {picker === "new" && (
        <NewGalleryModal
          eventId={eventId}
          eventClientName={clientName}
          eventClientPhone={clientPhone}
          eventDate={eventDate}
          existingGalleryId={gallery && !isActivated ? gallery.id : undefined}
          onClose={() => setPicker(null)}
          onCreated={(created) => setGallery(created)}
        />
      )}
      {picker === "link" && (
        <LinkExistingGalleryModal
          eventId={eventId}
          existingGalleryId={gallery && !isActivated ? gallery.id : undefined}
          onClose={() => setPicker(null)}
          onLinked={(linked) => {
            setGallery(linked);
            setPicker(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
