"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { GalleryFolderRow, GalleryPhotoRow } from "@/lib/types";
import { withViewTransition, BTN_PRESS } from "@/lib/viewTransition";
import { usePinchSize } from "@/lib/usePinchColumns";
import { optimizedImageUrl } from "@/lib/imageOptimize";
import { IconGallery } from "@/components/icons/NavIcons";

type PhotoWithUrl = GalleryPhotoRow & { url: string };

const CELL_SIZE_MIN = 90;
const CELL_SIZE_MAX = 260;
const CELL_SIZE_DEFAULT = 160;
const LONG_PRESS_MS = 480;
const DOUBLE_TAP_MS = 280;

export default function PublicGalleryView({
  token,
  initialPhotos,
  initialFolders,
  initiallyConfirmed,
  allowDownloads,
}: {
  token: string;
  initialPhotos: PhotoWithUrl[];
  initialFolders: GalleryFolderRow[];
  initiallyConfirmed: boolean;
  allowDownloads: boolean;
}) {
  const [photos, setPhotos] = useState(initialPhotos);
  const [savedFavoriteIds, setSavedFavoriteIds] = useState(
    () => new Set(initialPhotos.filter((p) => p.is_favorite).map((p) => p.id))
  );
  const [saving, setSaving] = useState(false);
  const {
    size: cellSize,
    setSize: setCellSize,
    containerRef: pinchContainerRef,
  } = usePinchSize(CELL_SIZE_DEFAULT, CELL_SIZE_MIN, CELL_SIZE_MAX);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [favoritesPanelOpen, setFavoritesPanelOpen] = useState(false);
  const [hasAutoOpenedPanel, setHasAutoOpenedPanel] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(initiallyConfirmed);
  const [selectionMode, setSelectionMode] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [downloadSelectedConfirmOpen, setDownloadSelectedConfirmOpen] = useState(false);
  const [shareMenuPhoto, setShareMenuPhoto] = useState<PhotoWithUrl | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef<{ id: string; time: number } | null>(null);

  // One-time hint explaining the three tap gestures on a photo — none of them are discoverable
  // on their own, and this gallery is often opened by people with no reason to expect a photo
  // grid to do anything beyond "tap to zoom". Dismissed state persists per-browser so it only
  // shows once, not on every visit.
  const [hintDismissed, setHintDismissed] = useState(true);
  useEffect(() => {
    setHintDismissed(localStorage.getItem("gallery-gesture-hint-dismissed") === "1");
  }, []);
  const dismissHint = () => {
    localStorage.setItem("gallery-gesture-hint-dismissed", "1");
    setHintDismissed(true);
  };

  const favoriteCount = photos.filter((p) => p.is_favorite).length;
  const currentFavoriteIds = new Set(photos.filter((p) => p.is_favorite).map((p) => p.id));
  const hasUnsavedChanges =
    currentFavoriteIds.size !== savedFavoriteIds.size ||
    [...currentFavoriteIds].some((id) => !savedFavoriteIds.has(id));

  const openLightbox = (index: number) => withViewTransition(() => setLightboxIndex(index));
  const closeLightbox = () => withViewTransition(() => setLightboxIndex(null));

  // Toggling only updates local state — no request per click. Everything gets synced to the
  // server in one batched call (saveFavorites) when the client explicitly saves, instead of one
  // write per heart tap. That's the difference between O(1) and O(photos-tapped) writes per
  // client session, which matters once several photographers' clients are browsing at once.
  const toggleFavorite = (photo: PhotoWithUrl) => {
    const next = !photo.is_favorite;
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, is_favorite: next } : p)));
    if (next && favoriteCount === 0 && !hasAutoOpenedPanel) {
      setHasAutoOpenedPanel(true);
      setFavoritesPanelOpen(true);
    }
  };

  // Long-press (pointer held ~480ms) enters multi-select mode and immediately favorites the
  // pressed photo — selecting IS favoriting, there's no separate staged list, so the favorites
  // count never has to jump between two different numbers depending on mode. Pointer events
  // unify mouse + touch, so the same handlers work with a click-and-hold on desktop and a real
  // long-press on mobile.
  const handlePointerDown = (photo: PhotoWithUrl) => {
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      setSelectionMode(true);
      if (!photo.is_favorite) toggleFavorite(photo);
    }, LONG_PRESS_MS);
  };

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // Single tap is held back by DOUBLE_TAP_MS to see whether a second tap on the same photo
  // follows — if it does, that's a double-tap and opens the share/download menu instead. This is
  // the standard tradeoff for supporting double-tap: a small delay before the single-tap action
  // (open lightbox / toggle favorite) actually runs.
  const handleTileClick = (photo: PhotoWithUrl, index: number) => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    const now = Date.now();
    const last = lastTap.current;
    if (last && last.id === photo.id && now - last.time < DOUBLE_TAP_MS) {
      if (singleTapTimer.current) {
        clearTimeout(singleTapTimer.current);
        singleTapTimer.current = null;
      }
      lastTap.current = null;
      setShareMenuPhoto(photo);
      return;
    }
    lastTap.current = { id: photo.id, time: now };
    singleTapTimer.current = setTimeout(() => {
      lastTap.current = null;
      if (selectionMode) {
        toggleFavorite(photo);
      } else {
        openLightbox(index);
      }
    }, DOUBLE_TAP_MS);
  };

  const exitSelectionMode = () => setSelectionMode(false);

  const downloadZip = async (photoIds: string[]) => {
    if (photoIds.length === 0 || zipping) return;
    setZipping(true);
    try {
      const res = await fetch(`/api/gallery/${token}/download-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds }),
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "gallery-photos.zip";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZipping(false);
    }
  };

  const sharePhoto = async (photo: PhotoWithUrl) => {
    if (navigator.share) {
      try {
        await navigator.share({ url: photo.url, title: photo.original_filename });
      } catch {
        // user closed the share sheet — nothing to do
      }
      setShareMenuPhoto(null);
      return;
    }
    try {
      await navigator.clipboard.writeText(photo.url);
      setShareFeedback("הקישור הועתק ✓");
      setTimeout(() => setShareFeedback(null), 1500);
    } catch {
      // clipboard unavailable — no fallback beyond the download option already in this menu
    }
  };

  const saveFavorites = async () => {
    setSaving(true);
    await fetch(`/api/gallery/${token}/favorite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ favoritePhotoIds: [...currentFavoriteIds] }),
    });
    setSavedFavoriteIds(currentFavoriteIds);
    setSaving(false);
  };

  const confirmSelection = async () => {
    setSubmitting(true);
    await saveFavorites();
    await fetch(`/api/gallery/${token}/confirm-selection`, { method: "POST" });
    setSubmitting(false);
    setConfirmOpen(false);
    setSubmitted(true);
    setFavoritesPanelOpen(false);
  };

  const downloadPhoto = async (photo: PhotoWithUrl) => {
    const res = await fetch(`/api/gallery/${token}/download?photoId=${photo.id}`);
    const data = await res.json();
    if (!res.ok || !data.url) return;
    const a = document.createElement("a");
    a.href = data.url;
    a.download = photo.original_filename;
    a.click();
  };

  const favorites = photos.filter((p) => p.is_favorite);
  const visiblePhotos = activeFolderId ? photos.filter((p) => p.folder_id === activeFolderId) : photos;

  return (
    <>
      {!hintDismissed && (
        <div className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 mb-4 text-xs bg-amber-bg text-amber-deep">
          <span className="flex-1">
            ❤️ לחיצה לתמונה בגודל מלא · לחיצה ארוכה לבחירה מרובה · לחיצה כפולה לשיתוף/הורדה של תמונה בודדת
          </span>
          <button onClick={dismissHint} className="shrink-0 font-bold leading-none" aria-label="סגירה">
            ✕
          </button>
        </div>
      )}

      {submitted && (
        <div className="rounded-xl px-3.5 py-2.5 mb-4 text-sm bg-sage-bg text-sage font-medium text-center">
          תודה! הבחירה שלכם ({favoriteCount} תמונות) נשלחה לצלם/ת ✓ אפשר עדיין לשנות ולעדכן בכל שלב.
        </div>
      )}

      {initialFolders.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto">
          <button
            onClick={() => setActiveFolderId(null)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${BTN_PRESS}`}
            style={{
              background: activeFolderId === null ? "var(--color-ink)" : "var(--color-chip)",
              color: activeFolderId === null ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            הכל
          </button>
          {initialFolders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => setActiveFolderId(folder.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${BTN_PRESS}`}
              style={{
                background: activeFolderId === folder.id ? "var(--color-ink)" : "var(--color-chip)",
                color: activeFolderId === folder.id ? "#fff" : "var(--color-ink-soft)",
              }}
            >
              {folder.name}
            </button>
          ))}
        </div>
      )}

      {visiblePhotos.length === 0 ? (
        <p className="text-sm text-ink-soft text-center py-16">אין עדיין תמונות בגלריה.</p>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <IconGallery className="h-3 w-3 shrink-0 text-ink-soft" />
            <input
              type="range"
              min={CELL_SIZE_MIN}
              max={CELL_SIZE_MAX}
              step={1}
              value={cellSize}
              onChange={(e) => setCellSize(Number(e.target.value))}
              className="w-full accent-[var(--color-amber-deep)]"
              aria-label="גודל תמונות בגלריה"
            />
            <IconGallery className="h-5 w-5 shrink-0 text-ink-soft" />
          </div>
          {allowDownloads && (
            <button
              onClick={() => downloadZip(photos.map((p) => p.id))}
              disabled={zipping}
              className={`w-full flex items-center justify-center gap-2 rounded-xl py-2.5 mb-4 text-sm font-semibold bg-card border border-line shadow-card disabled:opacity-60 ${BTN_PRESS}`}
            >
              <DownloadIcon size={16} />
              {zipping ? "מכין הורדה..." : `הורדת כל התמונות (${photos.length})`}
            </button>
          )}
          <div ref={pinchContainerRef} style={{ touchAction: "pan-y", columnWidth: `${cellSize}px`, columnGap: "10px" }}>
          {visiblePhotos.map((photo, i) => {
            const isSelected = photo.is_favorite;
            return (
              <div key={photo.id} className="relative mb-2.5 block break-inside-avoid rounded-xl overflow-hidden bg-line">
                <button
                  onPointerDown={() => handlePointerDown(photo)}
                  onPointerUp={clearLongPressTimer}
                  onPointerLeave={clearLongPressTimer}
                  onContextMenu={(e) => e.preventDefault()}
                  onClick={() => handleTileClick(photo, i)}
                  className="relative block w-full select-none"
                  style={{ WebkitTouchCallout: "none" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={optimizedImageUrl(photo.url, 640)}
                    alt={photo.original_filename}
                    className="w-full h-auto block"
                    style={lightboxIndex !== i ? { viewTransitionName: `photo-${photo.id}` } : undefined}
                  />
                  {selectionMode && (
                    <div
                      className="absolute inset-0"
                      style={{ background: isSelected ? "rgba(74,95,217,0.3)" : "transparent" }}
                    />
                  )}
                </button>
                {selectionMode && (
                  <div
                    className={`absolute top-1.5 left-1.5 h-7 w-7 rounded-full flex items-center justify-center border-2 backdrop-blur-md pointer-events-none ${
                      isSelected ? "border-amber-deep" : "border-white/70"
                    }`}
                    style={{ background: isSelected ? "var(--color-amber-deep)" : "rgba(255,255,255,0.25)" }}
                  >
                    {isSelected && <CheckIcon />}
                  </div>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleFavorite(photo);
                  }}
                  className={`absolute top-1.5 right-1.5 h-8 w-8 rounded-full flex items-center justify-center backdrop-blur-md ${
                    photo.is_favorite ? "bg-black/30" : "bg-white/20"
                  } ${BTN_PRESS}`}
                  aria-label="סמן כמועדף"
                >
                  <HeartIcon filled={photo.is_favorite} />
                </button>
              </div>
            );
          })}
          </div>
        </>
      )}

      {/* Floating favorites/selection bar — anchored to the bottom of the screen so it doesn't
          cover the gallery header, and stays available even after the client has already
          confirmed once (they can keep changing their mind). While multi-select mode (long-press)
          is active, tapping a photo favorites it directly, so this always shows one unified
          favorites count instead of a separate "selected" count. Sized up with bigger text on
          both mobile and desktop so it can't be missed. */}
      {(favoriteCount > 0 || selectionMode) && (
        <div className="fixed bottom-3 right-3 left-3 md:left-auto z-40 flex flex-col gap-2 rounded-2xl px-4 py-3 md:py-3.5 md:min-w-[240px] bg-white shadow-sheet border border-line">
          <button
            onClick={() => setFavoritesPanelOpen(true)}
            className={`flex items-center gap-2 text-sm md:text-base font-bold ${BTN_PRESS}`}
          >
            <HeartIcon filled size={18} />
            {favoriteCount} מועדפים
          </button>

          {favoriteCount > 0 && allowDownloads && (
            <button
              onClick={() => setDownloadSelectedConfirmOpen(true)}
              disabled={zipping}
              className={`w-full flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm md:text-base font-semibold bg-white border border-line text-ink disabled:opacity-60 ${BTN_PRESS}`}
            >
              <DownloadIcon size={16} />
              הורדת התמונות שנבחרו
            </button>
          )}

          {!selectionMode && !submitted && (
            <button
              onClick={() => setConfirmOpen(true)}
              className={`w-full rounded-lg py-2.5 text-sm md:text-base font-semibold bg-amber-deep text-white ${BTN_PRESS}`}
            >
              סיימת לבחור
            </button>
          )}
          {!selectionMode && submitted && hasUnsavedChanges && (
            <button
              onClick={saveFavorites}
              disabled={saving}
              className={`w-full rounded-lg py-2.5 text-sm md:text-base font-semibold bg-amber-deep text-white disabled:opacity-60 ${BTN_PRESS}`}
            >
              {saving ? "שומר..." : "עדכון הבחירה"}
            </button>
          )}
          {!selectionMode && submitted && !hasUnsavedChanges && (
            <span className="text-xs md:text-sm font-semibold text-sage">נשמר ✓</span>
          )}

          {selectionMode && (
            <button
              onClick={exitSelectionMode}
              className={`w-full text-xs md:text-sm font-semibold text-ink-soft ${BTN_PRESS}`}
            >
              סיום בחירה מרובה
            </button>
          )}
        </div>
      )}

      {/* Favorites panel */}
      {favoritesPanelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(46,49,66,0.45)" }}
          onClick={() => setFavoritesPanelOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[80vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold font-display">התמונות שבחרתם ({favoriteCount})</h2>
              <button
                onClick={() => setFavoritesPanelOpen(false)}
                className={`h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line ${BTN_PRESS}`}
              >
                ✕
              </button>
            </div>
            {favorites.length === 0 ? (
              <p className="text-sm text-ink-soft text-center py-8">עדיין לא נבחרו תמונות.</p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 mb-4">
                {favorites.map((photo) => (
                  <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-line">
                    <Image src={photo.url} alt={photo.original_filename} fill sizes="33vw" className="object-cover" />
                  </div>
                ))}
              </div>
            )}
            {!submitted ? (
              <button
                onClick={() => setConfirmOpen(true)}
                className={`w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white ${BTN_PRESS}`}
              >
                סיימת לבחור
              </button>
            ) : hasUnsavedChanges ? (
              <button
                onClick={saveFavorites}
                disabled={saving}
                className={`w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60 ${BTN_PRESS}`}
              >
                {saving ? "שומר..." : "עדכון הבחירה"}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Confirm dialog */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(46,49,66,0.45)" }}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2 font-display">לאשר את הבחירה?</h2>
            <p className="text-sm text-ink-soft mb-5">
              נבחרו {favoriteCount} תמונות. הבחירה תישלח לצלם/ת — ותמיד אפשר לחזור ולעדכן אותה אחר כך.
            </p>
            <div className="flex gap-2">
              <button
                onClick={confirmSelection}
                disabled={submitting}
                className={`flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60 ${BTN_PRESS}`}
              >
                {submitting ? "שולח..." : "כן, זו הבחירה הסופית"}
              </button>
              <button
                onClick={() => setConfirmOpen(false)}
                className={`flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft ${BTN_PRESS}`}
              >
                חזרה
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download-selected confirm dialog */}
      {downloadSelectedConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(46,49,66,0.45)" }}
          onClick={() => setDownloadSelectedConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2 font-display">להוריד את התמונות המסומנות?</h2>
            <p className="text-sm text-ink-soft mb-5">
              יורדו {favoriteCount} תמונות כקובץ ZIP אחד.
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setDownloadSelectedConfirmOpen(false);
                  await downloadZip([...currentFavoriteIds]);
                }}
                disabled={zipping}
                className={`flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60 ${BTN_PRESS}`}
              >
                {zipping ? "מכין הורדה..." : "כן, הורד"}
              </button>
              <button
                onClick={() => setDownloadSelectedConfirmOpen(false)}
                className={`flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft ${BTN_PRESS}`}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share/download menu — opened by double-tap/double-click on a photo */}
      {shareMenuPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(46,49,66,0.45)" }}
          onClick={() => setShareMenuPhoto(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold font-display">אפשרויות תמונה</h2>
              <button
                onClick={() => setShareMenuPhoto(null)}
                className={`h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line ${BTN_PRESS}`}
              >
                ✕
              </button>
            </div>
            <div className={`grid gap-3 ${allowDownloads ? "grid-cols-2" : "grid-cols-1"}`}>
              <button
                onClick={() => sharePhoto(shareMenuPhoto)}
                className={`flex flex-col items-center gap-2 rounded-2xl py-5 bg-card border border-line shadow-card ${BTN_PRESS}`}
              >
                <ShareIcon />
                <span className="text-sm font-semibold">שיתוף</span>
              </button>
              {allowDownloads && (
                <button
                  onClick={() => {
                    downloadPhoto(shareMenuPhoto);
                    setShareMenuPhoto(null);
                  }}
                  className={`flex flex-col items-center gap-2 rounded-2xl py-5 bg-card border border-line shadow-card ${BTN_PRESS}`}
                >
                  <DownloadIcon />
                  <span className="text-sm font-semibold">הורדה</span>
                </button>
              )}
            </div>
            {shareFeedback && (
              <p className="text-xs text-sage text-center mt-3 font-medium">{shareFeedback}</p>
            )}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && visiblePhotos[lightboxIndex] && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={closeLightbox}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
            className={`absolute top-4 left-4 h-9 w-9 rounded-full bg-white/10 text-white flex items-center justify-center ${BTN_PRESS}`}
          >
            ✕
          </button>
          {allowDownloads && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                downloadPhoto(visiblePhotos[lightboxIndex]);
              }}
              className={`absolute top-4 right-4 h-9 px-3 rounded-full bg-white/10 text-white flex items-center justify-center text-xs font-semibold ${BTN_PRESS}`}
            >
              ⬇ הורדה
            </button>
          )}
          {lightboxIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openLightbox(lightboxIndex - 1);
              }}
              className={`absolute right-3 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center text-lg ${BTN_PRESS}`}
            >
              ›
            </button>
          )}
          {lightboxIndex < visiblePhotos.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                openLightbox(lightboxIndex + 1);
              }}
              className={`absolute left-3 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center text-lg ${BTN_PRESS}`}
            >
              ‹
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={optimizedImageUrl(visiblePhotos[lightboxIndex].url, 1920)}
            alt={visiblePhotos[lightboxIndex].original_filename}
            className="max-w-[90vw] max-h-[85vh] object-contain"
            style={{ viewTransitionName: `photo-${visiblePhotos[lightboxIndex].id}` }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

function ShareIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3m0 0l-4 4m4-4l4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function DownloadIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="var(--color-ink)" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <path d="M5 13l5 5L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function HeartIcon({ filled, size = 20 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 20.5s-7.5-4.6-10-9.2C0.4 8.1 1.7 4.5 5 3.4c2.1-0.7 4.3 0.1 5.6 1.9l1.4 1.9 1.4-1.9c1.3-1.8 3.5-2.6 5.6-1.9 3.3 1.1 4.6 4.7 3 7.9-2.5 4.6-10 9.2-10 9.2z"
        fill={filled ? "var(--color-coral)" : "none"}
        stroke="var(--color-coral)"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
