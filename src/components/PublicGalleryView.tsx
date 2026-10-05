"use client";

import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import Image from "next/image";
import type { GalleryFolderRow, GalleryPhotoRow } from "@/lib/types";
import { withViewTransition, BTN_PRESS } from "@/lib/viewTransition";
import { usePinchSize } from "@/lib/usePinchColumns";
import { optimizedImageUrl } from "@/lib/imageOptimize";
import { IconGallery } from "@/components/icons/NavIcons";
import { IconClose } from "@/components/icons/AlbumIcons";
import { resolveGalleryTheme } from "@/lib/galleryTheme";
import GallerySlideshow from "@/components/GallerySlideshow";
import GalleryAlbumProofing, { type ClientAlbumElement } from "@/components/GalleryAlbumProofing";
import { ALLOWED_ACCEPT, isAllowedImageFile, convertHeicIfNeeded } from "@/lib/imageUpload";
import { readDataTransferItems, folderNameFromPath, isHiddenFileName } from "@/lib/fileDrop";
import { useLang, useT } from "@/i18n/client";
import { dirOf } from "@/i18n/config";

type PhotoWithUrl = GalleryPhotoRow & { url: string; previewUrl?: string | null };

// Same ring geometry as GalleryManageView.tsx's ProgressModal (radius 42 on a 100×100 viewBox).
const UPLOAD_RING_RADIUS = 42;
const UPLOAD_RING_CIRCUMFERENCE = 2 * Math.PI * UPLOAD_RING_RADIUS;

type ZipJobPart = {
  partIndex: number;
  partCount: number;
  status: "pending" | "processing" | "ready" | "failed";
  errorMessage: string | null;
  downloadUrl: string | null;
  processedCount: number;
  totalCount: number;
};
type ZipBatchState = { batchId: string; parts: ZipJobPart[] };

const CELL_SIZE_MIN = 90;
const CELL_SIZE_MAX = 260;
const CELL_SIZE_DEFAULT = 160;
const LONG_PRESS_MS = 480;
const DOUBLE_TAP_MS = 280;
const NO_FOLDER_KEY = "none";
// Selections up to this many photos still use the instant download-zip route; anything larger is
// built by the background zip-job system (see downloadZip below).
const INLINE_ZIP_MAX_PHOTOS = 12;

// Some engines (WebKit especially) don't reliably fire an <a>'s default navigation from .click()
// unless the element is actually attached to the document — a detached anchor's click() can be a
// silent no-op there, which is exactly "nothing happens, no save dialog" with no error to catch.
// Matches the append/remove pattern the plain-form zip download below already uses.
function triggerAnchorDownload(url: string, filename?: string) {
  const a = document.createElement("a");
  a.href = url;
  if (filename) a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export default function PublicGalleryView({
  token,
  initialPhotos,
  initialFolders,
  initiallyConfirmed,
  allowDownloads,
  allowClientUpload = false,
  themeId = "classic",
  titleFontOverride = null,
  gridStyleOverride = null,
  slideshowPhotoIds = [],
  album = null,
  albumSpreads = [],
  restrictedQuality = null,
  studioName = null,
  brandLogoUrl = null,
  contactUrl = null,
  leadContent = null,
}: {
  token: string;
  initialPhotos: PhotoWithUrl[];
  initialFolders: GalleryFolderRow[];
  initiallyConfirmed: boolean;
  allowDownloads: boolean;
  allowClientUpload?: boolean;
  // Set when this link was shared with a quality cap (?quality=web) — locks the download and
  // re-share quality choices to "web" instead of offering the full-resolution originals.
  restrictedQuality?: "web" | null;
  themeId?: string;
  titleFontOverride?: string | null;
  gridStyleOverride?: string | null;
  slideshowPhotoIds?: string[];
  album?: { status: "sent" | "approved" | "changes_requested"; title: string; coverUrl: string | null } | null;
  albumSpreads?: {
    id: string;
    photo1: { id: string; url: string };
    photo2: { id: string; url: string } | null;
    layout: "split" | "feature" | "stack" | "custom";
    focalX1: number;
    focalY1: number;
    focalX2: number;
    focalY2: number;
    elements: ClientAlbumElement[];
    background: { url: string; blur: number; opacity: number } | null;
    comments: { id: string; text: string }[];
  }[];
  // Alt text for the logo in the premium theme's sticky bar and footer. Without a logo nothing shows there.
  studioName?: string | null;
  brandLogoUrl?: string | null;
  contactUrl?: string | null;
  // Shown above the photos inside the premium layout (the gallery's videos).
  leadContent?: ReactNode;
}) {
  const theme = resolveGalleryTheme(themeId, { titleFontOverride, gridStyleOverride });
  // The premium theme's layout: sticky action bar, chapter titles, footer, black lightbox.
  const premium = !!theme.stickyBar;
  // Premium: the floating favorites bar waits until the client scrolls past the full-screen cover,
  // so a returning client (favorites already saved) sees the cover clean (owner, 2026-10-05).
  const [pastCover, setPastCover] = useState(!premium);
  useEffect(() => {
    if (!premium) return;
    const onScroll = () => setPastCover(window.scrollY > window.innerHeight * 0.6);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [premium]);
  const t = useT();
  // The client's language (ClientLangScope), not <html dir> (the photographer's own cookie).
  const isRtl = dirOf(useLang()) === "rtl";
  const [photos, setPhotos] = useState(initialPhotos);
  const [folders, setFolders] = useState(initialFolders);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [uploadTotal, setUploadTotal] = useState(0);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Byte-level, not just a per-file counter — a PUT of one large photo can take several seconds
  // on a slow mobile connection, and "מעלה... (1/1)" sitting frozen for that whole stretch reads
  // as stuck. uploadTotalBytes/uploadDoneBytes/uploadCurrentBytes together drive a smooth 0–100%
  // reading across the whole batch (see uploadPct below).
  const [uploadTotalBytes, setUploadTotalBytes] = useState(0);
  const [uploadDoneBytes, setUploadDoneBytes] = useState(0);
  const [uploadCurrentBytes, setUploadCurrentBytes] = useState(0);
  const uploadPct = uploadTotalBytes > 0 ? Math.min(100, ((uploadDoneBytes + uploadCurrentBytes) / uploadTotalBytes) * 100) : 0;
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const uploadDirInputRef = useRef<HTMLInputElement>(null);

  // fetch() has no upload-progress event at all — only XHR exposes upload.onprogress — so the PUT
  // to the signed R2 URL goes through XHR here instead of fetch, unlike everywhere else in this
  // file that talks to our own API routes.
  const putFileWithProgress = (url: string, file: File, onProgress: (loadedBytes: number) => void): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("PUT", url);
      xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) onProgress(e.loaded);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error("שגיאה בהעלאה"));
      };
      xhr.onerror = () => reject(new Error("שגיאה בהעלאה"));
      xhr.send(file);
    });
  };

  // Client-facing counterpart to GalleryManageView.tsx's ensureFolderId — same get-or-create
  // pattern, just via the token-scoped route since there's no photographer session here.
  const ensureFolderId = async (folderName: string, cache: Map<string, string>): Promise<string | null> => {
    const existing = cache.get(folderName);
    if (existing) return existing;
    const res = await fetch(`/api/gallery/${token}/ensure-folder`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ folderName }),
    });
    const data = await res.json();
    if (!res.ok || !data.folder) return null;
    cache.set(folderName, data.folder.id);
    setFolders((prev) => (prev.some((f) => f.id === data.folder.id) ? prev : [...prev, data.folder]));
    return data.folder.id;
  };

  // Mirrors the photographer's own upload flow (GalleryManageView.tsx) one-for-one — same
  // signed-URL-then-PUT-then-record pattern, just against the token-scoped routes instead of the
  // photographer-authenticated ones, since this runs from an anonymous client session.
  const uploadResolvedItems = async (items: { file: File; folderId: string | null }[]) => {
    if (items.length === 0) return;
    setUploadError(null);
    setUploadTotal(items.length);
    setUploadingCount(0);
    // Measured against the ORIGINAL file sizes, not the post-HEIC-conversion ones — the total is
    // fixed once at the start of the batch, so switching basis mid-flight (a HEIC file becomes a
    // differently-sized JPEG) would make the running total drift and the percentage jump oddly.
    setUploadTotalBytes(items.reduce((sum, it) => sum + it.file.size, 0));
    setUploadDoneBytes(0);
    setUploadCurrentBytes(0);
    for (const { file: rawFile, folderId } of items) {
      try {
        const file = await convertHeicIfNeeded(rawFile);
        const urlRes = await fetch(`/api/gallery/${token}/upload-url`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size }),
        });
        const urlData = await urlRes.json();
        if (!urlRes.ok || !urlData.url) throw new Error(urlData.error ?? "שגיאה בהעלאה");

        await putFileWithProgress(urlData.url, file, (loaded) => setUploadCurrentBytes(loaded));

        const completeRes = await fetch(`/api/gallery/${token}/upload-complete`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path: urlData.path, originalFilename: file.name, fileSizeBytes: file.size, folderId }),
        });
        const completeData = await completeRes.json();
        if (!completeRes.ok || !completeData.photo) throw new Error(completeData.error ?? "שגיאה בהעלאה");

        setPhotos((prev) => [...prev, { ...completeData.photo, url: URL.createObjectURL(file) }]);
      } catch (e) {
        setUploadError(e instanceof Error ? e.message : "שגיאה בהעלאה");
      } finally {
        setUploadDoneBytes((d) => d + rawFile.size);
        setUploadCurrentBytes(0);
        setUploadingCount((c) => c + 1);
      }
    }
    setUploadTotal(0);
    setUploadingCount(0);
    setUploadTotalBytes(0);
    setUploadDoneBytes(0);
  };

  const handleUploadFiles = (fileList: FileList | null) => {
    if (!fileList) return;
    const items = Array.from(fileList)
      .filter((f) => !isHiddenFileName(f.name) && isAllowedImageFile(f))
      .map((file) => ({ file, folderId: activeFolderId }));
    uploadResolvedItems(items);
  };

  const handleUploadDirectory = async (fileList: FileList | null) => {
    if (!fileList) return;
    const cache = new Map(folders.map((f) => [f.name, f.id]));
    const items: { file: File; folderId: string | null }[] = [];
    for (const file of Array.from(fileList)) {
      if (isHiddenFileName(file.name) || !isAllowedImageFile(file)) continue;
      const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
      const folderName = relPath ? folderNameFromPath(relPath) : null;
      const folderId = folderName ? await ensureFolderId(folderName, cache) : activeFolderId;
      items.push({ file, folderId });
    }
    await uploadResolvedItems(items);
  };

  const handleUploadDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = await readDataTransferItems(e.dataTransfer.items);
    if (dropped.length === 0) return;
    const allowed = dropped.filter((d) => isAllowedImageFile(d.file));
    const cache = new Map(folders.map((f) => [f.name, f.id]));
    const items: { file: File; folderId: string | null }[] = [];
    for (const { file, relativePath } of allowed) {
      const folderName = folderNameFromPath(relativePath);
      const folderId = folderName ? await ensureFolderId(folderName, cache) : activeFolderId;
      items.push({ file, folderId });
    }
    await uploadResolvedItems(items);
  };
  const [slideshowOpen, setSlideshowOpen] = useState(false);
  const [albumOpen, setAlbumOpen] = useState(false);
  const [aspectRatios, setAspectRatios] = useState<Record<string, number>>({});
  const [savedFavoriteIds, setSavedFavoriteIds] = useState(
    () => new Set(initialPhotos.filter((p) => p.is_favorite).map((p) => p.id))
  );
  const [saving, setSaving] = useState(false);
  const {
    size: cellSize,
    setSize: setCellSize,
    containerRef: pinchContainerRef,
  } = usePinchSize(CELL_SIZE_DEFAULT, CELL_SIZE_MIN, CELL_SIZE_MAX);
  // Desktop only, per explicit request — starts the size slider at its largest photos-fill-more-
  // space setting instead of the touch-friendly mobile default, which looked comparatively tiny
  // on a wide screen. Applied post-mount (not as the initial useState value) so server-rendered
  // HTML and the client's first paint still match — same pattern this app already uses everywhere
  // else it needs a viewport-width check (window isn't available during SSR).
  useEffect(() => {
    if (window.innerWidth >= 1024) setCellSize(CELL_SIZE_MAX);
  }, [setCellSize]);
  // Same device check GalleryManageView already uses for its own share flow. A zip download of
  // hundreds of full-res photos reliably fails on mobile (memory-constrained browser), so "download
  // everything" is desktop-only; smaller selections (favorites, a folder tab, a shared set) still
  // work on mobile via individual downloads instead of a zip — see downloadZip below.
  const [isMobileDevice, setIsMobileDevice] = useState(false);
  useEffect(() => {
    setIsMobileDevice(/iPhone|iPad|iPod|Android/i.test(navigator.userAgent));
  }, []);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Which single photo's grid thumbnail is allowed to carry a view-transition-name at any given
  // moment — see openLightbox/closeLightbox below for why this has to be scoped to exactly one
  // photo instead of "every thumbnail that isn't the open one".
  const [transitionPhotoId, setTransitionPhotoId] = useState<string | null>(null);
  const [favoritesPanelOpen, setFavoritesPanelOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(initiallyConfirmed);
  const [selectionMode, setSelectionMode] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [downloadSelectedConfirmOpen, setDownloadSelectedConfirmOpen] = useState(false);
  // "Download all" on a large gallery goes through the background zip-job system instead of the
  // instant download-zip route (which can't finish downloading+zipping hundreds/thousands of
  // source photos within one request) — this tracks that job's progress for the panel below.
  // zipBatch and zipPanelOpen are deliberately separate: closing the panel only hides it, it does
  // NOT cancel the job or stop the auto-download-on-ready polling, which keeps running in the
  // background regardless of whether the panel is visible. Clicking "download all" again while a
  // batch is still active just reopens the same panel instead of starting a second job.
  const [zipBatch, setZipBatch] = useState<ZipBatchState | null>(null);
  const [zipPanelOpen, setZipPanelOpen] = useState(false);
  const downloadedZipPartsRef = useRef<Set<number>>(new Set());
  const [downloadOptionsOpen, setDownloadOptionsOpen] = useState(false);
  const [downloadSelectedFolders, setDownloadSelectedFolders] = useState<Set<string>>(new Set());
  const [downloadQuality, setDownloadQuality] = useState<"full" | "web">(restrictedQuality ?? "full");
  // An array even for the single-photo case (length 1) — double-tapping a favorited photo while
  // more than one is favorited targets the whole favorites set instead of just the tapped one.
  const [shareMenuPhotos, setShareMenuPhotos] = useState<PhotoWithUrl[] | null>(null);
  const [shareFeedback, setShareFeedback] = useState<string | null>(null);
  const [galleryShareOpen, setGalleryShareOpen] = useState(false);
  const [galleryShareView, setGalleryShareView] = useState<"main" | "qr">("main");
  const [gQrDataUrl, setGQrDataUrl] = useState<string | null>(null);
  // What the share panel below currently points at — the whole gallery (optionally narrowed by
  // the folder checkboxes) or one exact set of photo ids (double-tap on a marked photo/selection).
  const [galleryShareScope, setGalleryShareScope] = useState<{ kind: "gallery" } | { kind: "photos"; ids: string[] } | null>(null);
  const [shareSelectedFolders, setShareSelectedFolders] = useState<Set<string>>(new Set());
  const [shareQuality, setShareQuality] = useState<"full" | "web">("full");
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [thumbsReady, setThumbsReady] = useState(false);
  const loadedThumbIdsRef = useRef<Set<string>>(new Set());
  const fullImagePrefetchedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
      setShowScrollTop(pct >= 15);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const singleTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lightboxTouchStart = useRef<{ x: number; y: number } | null>(null);
  const lightboxSwiped = useRef(false);
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

  // Giving every grid thumbnail a view-transition-name (the previous version of this code did,
  // via "lightboxIndex !== i") makes the browser snapshot ALL of them on every open/close/nav —
  // fine for a folder tab with a few dozen photos, but on "הכל" with 900+ photos that's hundreds
  // of full-tile snapshots taken at once, which is what was crashing the tab on mobile. Only the
  // one photo actually involved in the transition needs a name at all.
  const openLightbox = (index: number) =>
    withViewTransition(() => {
      setTransitionPhotoId(visiblePhotos[index]?.id ?? null);
      setLightboxIndex(index);
    });
  const closeLightbox = () => withViewTransition(() => setLightboxIndex(null));
  // Stepping to the next/previous photo while already inside the lightbox is a plain state
  // update, not wrapped in a view transition — there's no grid thumbnail involved in this move
  // (the "grow from its place" effect only makes sense for the initial open/close), and chaining
  // startViewTransition calls back-to-back on quick repeated taps risks stalling the update
  // entirely instead of just skipping the animation.
  const navigateLightbox = (index: number) => setLightboxIndex(index);

  // Swipe navigation in the lightbox — right advances to the previous photo and left to the
  // next, matching the arrow buttons/keyboard shortcuts (RTL reading direction, so "forward" is
  // visually right-to-left). A real swipe is flagged via the ref so the container's tap-to-close
  // onClick doesn't also fire right after — a swipe still ends with a touchend/click sequence.
  const SWIPE_THRESHOLD_PX = 50;
  const handleLightboxTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    lightboxTouchStart.current = { x: touch.clientX, y: touch.clientY };
  };
  const handleLightboxTouchEnd = (e: React.TouchEvent) => {
    const start = lightboxTouchStart.current;
    lightboxTouchStart.current = null;
    if (!start || lightboxIndex === null) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) < Math.abs(dy)) return;
    lightboxSwiped.current = true;
    if (dx > 0 && lightboxIndex > 0) navigateLightbox(lightboxIndex - 1);
    else if (dx < 0 && lightboxIndex < visiblePhotos.length - 1) navigateLightbox(lightboxIndex + 1);
  };

  // Toggling only updates local state — no request per click. Everything gets synced to the
  // server in one batched call (saveFavorites) when the client explicitly saves, instead of one
  // write per heart tap. That's the difference between O(1) and O(photos-tapped) writes per
  // client session, which matters once several photographers' clients are browsing at once.
  //
  // Deliberately never auto-opens the favorites panel (used to, on the very first favorite) — that
  // made the floating bar render at a different size/content for exactly one tap before settling
  // into its normal compact form, which read as an inconsistent flicker. The compact bar is now
  // what shows from the first favorite onward; opening the full panel is always an explicit tap.
  const toggleFavorite = (photo: PhotoWithUrl) => {
    const next = !photo.is_favorite;
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, is_favorite: next } : p)));
  };

  // The diamond-icon label editor — unlike favorites (batched, saved on an explicit action), a
  // label save happens immediately when the client confirms it in the modal, since there's no
  // natural "unsaved until you leave" moment for a single free-text field the way there is for the
  // whole favorites set.
  const [labelEditPhoto, setLabelEditPhoto] = useState<PhotoWithUrl | null>(null);
  const [savingLabel, setSavingLabel] = useState(false);
  const saveLabel = async (photo: PhotoWithUrl, label: string) => {
    setSavingLabel(true);
    const trimmed = label.trim() || null;
    await fetch(`/api/gallery/${token}/photo-label`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ photoId: photo.id, label: trimmed }),
    });
    setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, custom_label: trimmed } : p)));
    setSavingLabel(false);
    setLabelEditPhoto(null);
  };
  // Every distinct label currently in use, for the favorites-panel filter chips below — sorted so
  // the chip order doesn't jump around as photos get relabeled. Independent of favorite status: a
  // client can attach a diamond-icon label ("קנבס" etc.) to a photo without also favoriting it, and
  // that label still needs its own tab — it isn't only a sub-filter of the favorites set.
  const usedLabels = Array.from(new Set(photos.filter((p) => p.custom_label).map((p) => p.custom_label as string))).sort();
  const [activeLabelFilter, setActiveLabelFilter] = useState<string | null>(null);

  // "נקה הכל" — unfavorites every currently-favorited photo in one action, same local-state-only
  // pattern as toggleFavorite (no per-photo request; synced on the next explicit save).
  const clearFavorites = () => {
    setPhotos((prev) => prev.map((p) => (p.is_favorite ? { ...p, is_favorite: false } : p)));
  };

  // "בחר הכל" — the mirror action: favorites every photo in one tap, for a client who basically
  // wants the whole gallery rather than picking one by one.
  const selectAllFavorites = () => {
    setPhotos((prev) => prev.map((p) => (p.is_favorite ? p : { ...p, is_favorite: true })));
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
      // Double-tapping a photo that's part of a multi-favorite selection targets the whole
      // selection, not just the one tapped — otherwise there'd be no way to share/download a
      // batch at once from the grid itself (only the separate "download all favorites" button).
      setShareMenuPhotos(photo.is_favorite && favorites.length > 1 ? favorites : [photo]);
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

  // A hidden-form POST navigation (not fetch()+blob()+object-URL) so the browser streams the zip
  // straight to disk via the server's Content-Disposition:attachment header, instead of buffering
  // the whole thing in JS memory first — necessary for a large gallery's zip, which can run into
  // the gigabytes. In real-world testing this still doesn't complete reliably on mobile Safari
  // (a form POST submitted from JS appears to get dropped/emptied there rather than actually
  // downloading), so mobile skips the zip entirely and downloads each photo individually instead
  // — the same signed-URL mechanism downloadPhoto already uses, which does work there. That's
  // fine for a bounded selection (favorites, a folder, a shared set); "download everything" stays
  // desktop-only (see the button below) since sequentially downloading hundreds of files one at a
  // time on a phone isn't a real alternative.
  const MOBILE_SEQUENTIAL_DOWNLOAD_LIMIT = 60;

  const downloadZip = async (photoIds: string[]) => {
    if (photoIds.length === 0 || zipping) return;
    setZipping(true);
    try {
      if (isMobileDevice) {
        if (photoIds.length > MOBILE_SEQUENTIAL_DOWNLOAD_LIMIT) {
          alert(t("יש יותר מדי תמונות להורדה מהטלפון ({n}). יש להוריד ממחשב", { n: photoIds.length }));
          return;
        }
        const byId = new Map(photos.map((p) => [p.id, p]));
        for (const id of photoIds) {
          const photo = byId.get(id);
          if (!photo) continue;
          await downloadPhoto(photo);
          // iOS Safari drops all but the first download when several are triggered in quick
          // succession — spacing them out is what makes each one actually land.
          await new Promise((resolve) => setTimeout(resolve, 600));
        }
        return;
      }
      // A big selection can't be streamed back inside one request (the server drops the connection
      // partway and the person is left with a truncated, unopenable ZIP) — those go through the
      // background zip-job system instead, at the quality this link allows.
      if (photoIds.length > INLINE_ZIP_MAX_PHOTOS) {
        await startZipJob(photoIds, restrictedQuality ?? "full");
        return;
      }
      const form = document.createElement("form");
      form.method = "POST";
      form.action = `/api/gallery/${token}/download-zip`;
      form.style.display = "none";
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = "photoIds";
      input.value = JSON.stringify(photoIds);
      form.appendChild(input);
      document.body.appendChild(form);
      form.submit();
      form.remove();
    } finally {
      // There's no completion signal from a form submit — the OS/browser's own download UI takes
      // over from here, so this just clears the button's busy state after a moment instead of
      // hanging on it indefinitely. The mobile branch above already awaited every real download.
      if (isMobileDevice) setZipping(false);
      else setTimeout(() => setZipping(false), 2000);
    }
  };

  // "Download all" on a large gallery: the source photos can genuinely add up to gigabytes, and
  // downloading+zipping them all can't reliably finish inside one request — the connection
  // just gets cut mid-stream, which is what was producing a truncated, corrupted zip file. This
  // instead queues a background job (split into parts server-side) and polls for parts to
  // download as they finish, each as a plain signed-URL link — no blob/streaming involved, so it
  // works the same reliable way on any device, including mobile.
  const startZipJob = async (photoIds: string[], quality: "full" | "web") => {
    if (photoIds.length === 0 || zipping) return;
    setZipping(true);
    try {
      const res = await fetch(`/api/gallery/${token}/zip-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds, quality }),
      });
      const data: { batchId?: string; partCount?: number; error?: string } = await res.json();
      if (!res.ok || !data.batchId || !data.partCount) return;
      downloadedZipPartsRef.current = new Set();
      setZipBatch({
        batchId: data.batchId,
        parts: Array.from({ length: data.partCount }, (_, i) => ({
          partIndex: i,
          partCount: data.partCount!,
          status: "pending",
          errorMessage: null,
          downloadUrl: null,
          processedCount: 0,
          totalCount: 0,
        })),
      });
      setZipPanelOpen(true);
    } finally {
      setZipping(false);
    }
  };

  // Polls while a batch is open and not every part has reached a final state yet. Each part that
  // just became ready triggers its own download automatically (a plain link click — the browser
  // handles it exactly like clicking a normal download link, so this is reliable on mobile too),
  // once per part.
  useEffect(() => {
    if (!zipBatch) return;
    const stillWorking = zipBatch.parts.some((p) => p.status === "pending" || p.status === "processing");
    if (!stillWorking) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/gallery/${token}/zip-jobs/${zipBatch.batchId}`);
      if (!res.ok) return;
      const data: { parts: ZipJobPart[] } = await res.json();
      setZipBatch((prev) => (prev ? { ...prev, parts: data.parts } : prev));
      const readyParts = data.parts.filter(
        (part) => part.status === "ready" && part.downloadUrl && !downloadedZipPartsRef.current.has(part.partIndex)
      );
      // Several browsers (iOS Safari especially — same behavior already noted for the mobile
      // sequential fallback below) silently drop every download after the first one when a few
      // are triggered back to back with no gap, since none of them carry a fresh user gesture at
      // this point (they're firing from a poll, not a click). Spacing them out is what makes each
      // one actually land — this only matters once a gallery is big enough to span multiple parts.
      readyParts.forEach((part, i) => {
        downloadedZipPartsRef.current.add(part.partIndex);
        setTimeout(() => triggerAnchorDownload(part.downloadUrl!), i * 700);
      });
    }, 3000);
    return () => clearTimeout(timer);
  }, [zipBatch, token]);

  // Overall progress across every part — a ready/failed part counts as fully done even before its
  // own processedCount catches up to totalCount (a part reports partial counts while working, but
  // jumps straight to "done" once it's actually finished).
  const zipDone = zipBatch ? zipBatch.parts.every((p) => p.status === "ready" || p.status === "failed") : false;
  const zipProgressPercent = (() => {
    if (!zipBatch) return 0;
    let done = 0;
    let total = 0;
    for (const part of zipBatch.parts) {
      const partTotal = part.totalCount || 1;
      done += part.status === "ready" || part.status === "failed" ? partTotal : part.processedCount;
      total += partTotal;
    }
    return total > 0 ? Math.round((done / total) * 100) : 0;
  })();

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

  // Auto-save, on top of (not instead of) the explicit "עדכון הבחירה" button below — per explicit
  // request, to close the real risk of a client tapping through their favorites and then just
  // closing the tab without ever pressing that button, silently losing every selection. Debounced
  // (not one write per tap) so a client rapidly tapping through a dozen photos still only fires one
  // request shortly after they pause, not a dozen — the O(1)-vs-O(taps) trade-off from
  // toggleFavorite's own comment above still holds, this only shortens how long "unsaved" can last
  // from "however long the client takes to notice/click save" to about a second of inactivity.
  // Runs from the very first tap, before the client's initial "סיימת לבחור" confirmation too — data
  // loss doesn't care whether they've confirmed yet.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const timer = setTimeout(() => {
      saveFavorites();
    }, 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentFavoriteIds.size, [...currentFavoriteIds].sort().join(",")]);

  const confirmSelection = async () => {
    setSubmitting(true);
    await saveFavorites();
    const res = await fetch(`/api/gallery/${token}/confirm-selection`, { method: "POST" }).catch(() => null);
    setSubmitting(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setConfirmError(data?.error ?? "שליחת הבחירה נכשלה. נסו שוב");
      return;
    }
    setConfirmOpen(false);
    setSubmitted(true);
    setFavoritesPanelOpen(false);
  };

  const downloadPhoto = async (photo: PhotoWithUrl) => {
    const res = await fetch(`/api/gallery/${token}/download?photoId=${photo.id}`);
    const data = await res.json();
    if (!res.ok || !data.url) return;
    triggerAnchorDownload(data.url, photo.original_filename);
  };

  // Mirrors GalleryManageView's own share-link builder: a link scoped to specific photo ids wins
  // over the folder checkboxes (the two scopes are never active together), and the folder
  // checkboxes only narrow the link when not everything is checked — checking every box is the
  // same as sharing the whole gallery, so it collapses back to the plain base URL.
  const hasUnfoldered = photos.some((p) => !p.folder_id);
  const allShareFolderKeys = [...folders.map((f) => f.id), ...(hasUnfoldered ? [NO_FOLDER_KEY] : [])];
  const showFolderPicker = galleryShareScope?.kind === "gallery" && folders.length > 0;
  const shareDisabled = showFolderPicker && shareSelectedFolders.size === 0;

  const galleryShareUrl = () => {
    const base = `${window.location.origin}/gallery/${token}`;
    const params = new URLSearchParams();
    if (galleryShareScope?.kind === "photos") {
      params.set("photos", galleryShareScope.ids.join(","));
    } else if (showFolderPicker && !allShareFolderKeys.every((k) => shareSelectedFolders.has(k))) {
      params.set("folders", [...shareSelectedFolders].join(","));
    }
    // A link the recipient received already restricted to web quality can't be re-shared at full
    // quality — the cap only ever narrows, never widens.
    if (shareQuality === "web" || restrictedQuality === "web") params.set("quality", "web");
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };
  const galleryShareMessage = () => `הגלריה שלי מוכנה לצפייה 📸\n${galleryShareUrl()}`;

  const openGalleryShare = () => {
    setGalleryShareScope({ kind: "gallery" });
    setShareSelectedFolders(new Set(allShareFolderKeys));
    setShareQuality(restrictedQuality ?? "full");
    setGalleryShareView("main");
    setGQrDataUrl(null);
    setGalleryShareOpen(true);
  };

  // Opens the exact same rich share panel (WhatsApp/Instagram/TikTok/QR/other), but scoped to one
  // curated set of photo ids instead of the whole gallery — used by the double-tap share/download
  // menu below, for both a single photo and a multi-favorite selection alike.
  const openPhotosShare = (ids: string[]) => {
    setGalleryShareScope({ kind: "photos", ids });
    setShareQuality(restrictedQuality ?? "full");
    setGalleryShareView("main");
    setGQrDataUrl(null);
    setGalleryShareOpen(true);
  };

  const toggleShareFolder = (key: string) => {
    setShareSelectedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleDownloadFolder = (key: string) => {
    setDownloadSelectedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const downloadSelectedFolderPhotoIds = photos
    .filter((p) => (p.folder_id ? downloadSelectedFolders.has(p.folder_id) : downloadSelectedFolders.has(NO_FOLDER_KEY)))
    .map((p) => p.id);

  const shareGalleryViaWhatsapp = () => {
    window.open(`https://wa.me/?text=${encodeURIComponent(galleryShareMessage())}`, "_blank");
    setGalleryShareOpen(false);
  };

  // Instagram/TikTok have no public "share this URL" web link the way WhatsApp's wa.me does — the
  // honest, always-working pattern is copy the link and tell people to paste it themselves, rather
  // than gambling on a deep link that dead-ends if the app isn't installed or on desktop.
  const shareGalleryViaInstagram = async () => {
    await navigator.clipboard.writeText(galleryShareUrl());
    setShareFeedback(t("הקישור הועתק: פתחו את אינסטגרם והדביקו אותו בסטורי או בהודעה"));
    setTimeout(() => setShareFeedback(null), 3000);
    setGalleryShareOpen(false);
  };

  const shareGalleryViaTiktok = async () => {
    await navigator.clipboard.writeText(galleryShareUrl());
    setShareFeedback(t("הקישור הועתק: פתחו את טיקטוק והדביקו אותו"));
    setTimeout(() => setShareFeedback(null), 3000);
    setGalleryShareOpen(false);
  };

  const shareGalleryViaQr = async () => {
    const QRCode = (await import("qrcode")).default;
    const dataUrl = await QRCode.toDataURL(galleryShareUrl(), { width: 280, margin: 1 });
    setGQrDataUrl(dataUrl);
    setGalleryShareView("qr");
  };

  const shareGalleryViaOther = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: "גלריה", text: galleryShareMessage(), url: galleryShareUrl() });
      } catch {
        // user canceled the native share sheet — nothing to do
      }
    } else {
      await navigator.clipboard.writeText(galleryShareMessage());
      setShareFeedback(t("הקישור הועתק ✓"));
      setTimeout(() => setShareFeedback(null), 2000);
    }
    setGalleryShareOpen(false);
  };

  const favorites = photos.filter((p) => p.is_favorite);
  // The favorites panel's own grid: with no label filter it's just the favorites picks (as
  // before); filtering by a diamond-icon label switches to every photo carrying that label,
  // favorited or not — a label is its own tag, not just a sub-filter of the favorites set.
  const panelPhotos = activeLabelFilter ? photos.filter((p) => p.custom_label === activeLabelFilter) : favorites;
  const folderPhotos = activeFolderId ? photos.filter((p) => p.folder_id === activeFolderId) : photos;
  // Premium shows each folder as a chapter with its own title, so the photos are ordered folder by
  // folder (photos outside any folder first, untitled) — and the lightbox steps through them in
  // that same order. Other themes keep the plain sort order.
  const chapters: { key: string; name: string | null; photos: PhotoWithUrl[] }[] =
    theme.chapterHeaders && folders.length > 0
      ? [
          ...(activeFolderId
            ? []
            : [{ key: NO_FOLDER_KEY, name: null, photos: photos.filter((p) => !p.folder_id || !folders.some((f) => f.id === p.folder_id)) }]),
          ...folders
            .filter((f) => !activeFolderId || f.id === activeFolderId)
            .map((f) => ({ key: f.id, name: f.name, photos: photos.filter((p) => p.folder_id === f.id) })),
        ].filter((c) => c.photos.length > 0)
      : [{ key: "all", name: null, photos: folderPhotos }];
  const visiblePhotos = theme.chapterHeaders && folders.length > 0 ? chapters.flatMap((c) => c.photos) : folderPhotos;
  const photoById = new Map(photos.map((p) => [p.id, p]));

  const visiblePhotoIdsKey = visiblePhotos.map((p) => p.id).join(",");
  useEffect(() => {
    loadedThumbIdsRef.current = new Set();
    setThumbsReady(visiblePhotoIdsKey.length === 0);
    const timeout = setTimeout(() => setThumbsReady(true), 2500);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visiblePhotoIdsKey]);

  const markThumbLoaded = (photoId: string) => {
    loadedThumbIdsRef.current.add(photoId);
    if (loadedThumbIdsRef.current.size >= visiblePhotos.length) setThumbsReady(true);
  };

  // Opening a photo full-size quietly warms the browser cache for the few NEARBY photos too, so
  // stepping to the next/previous photo is instant instead of waiting on a fresh fetch. Only a
  // small window around the current index — this used to eagerly load every visible photo's
  // full-size image at once, which meant 900+ simultaneous full-res fetches+decodes on the "הכל"
  // tab of a large gallery. That's exactly what was crashing the tab on mobile (limited per-tab
  // memory), forcing a reload that just re-triggered the same runaway prefetch on next open.
  useEffect(() => {
    if (lightboxIndex === null) return;
    const PREFETCH_WINDOW = 3;
    const start = Math.max(0, lightboxIndex - PREFETCH_WINDOW);
    const end = Math.min(visiblePhotos.length - 1, lightboxIndex + PREFETCH_WINDOW);
    for (let i = start; i <= end; i++) {
      const photo = visiblePhotos[i];
      if (!photo || fullImagePrefetchedIdsRef.current.has(photo.id)) continue;
      fullImagePrefetchedIdsRef.current.add(photo.id);
      const src = photo.previewUrl ?? `/api/gallery/${token}/photos/${photo.id}/preview`;
      const img = new window.Image();
      img.src = src;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex, visiblePhotoIdsKey]);

  // Arrow-key navigation while the lightbox is open — follows the page's reading direction, so the
  // visual "forward" direction (left in Hebrew, right in English/Russian) advances to the next
  // photo, matching how the prev/next arrow buttons are laid out on screen.
  useEffect(() => {
    if (lightboxIndex === null) return;
    const forwardKey = isRtl ? "ArrowLeft" : "ArrowRight";
    const backKey = isRtl ? "ArrowRight" : "ArrowLeft";
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === forwardKey && lightboxIndex < visiblePhotos.length - 1) navigateLightbox(lightboxIndex + 1);
      else if (e.key === backKey && lightboxIndex > 0) navigateLightbox(lightboxIndex - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxIndex, visiblePhotos.length, isRtl]);

  const slideshowPhotos = slideshowPhotoIds
    .map((id) => photoById.get(id))
    .filter((p): p is PhotoWithUrl => !!p);

  const openDownloadAll = () => {
    if (zipBatch) {
      setZipPanelOpen(true);
      return;
    }
    setDownloadSelectedFolders(new Set(allShareFolderKeys));
    setDownloadQuality(restrictedQuality ?? "full");
    setDownloadOptionsOpen(true);
  };

  const bottomBarVisible = favoriteCount > 0 || selectionMode || usedLabels.length > 0;

  // Premium: picking a chapter shows just that folder (like the tabs of the other themes) and
  // brings the reader back to the top of the photos if they had scrolled past it.
  const selectChapter = (folderId: string | null) => {
    setActiveFolderId(folderId);
    const anchor = document.getElementById("gallery-content");
    if (anchor) {
      const top = anchor.getBoundingClientRect().top + window.scrollY;
      if (window.scrollY > top) window.scrollTo({ top });
    }
  };

  const renderChapterNav = (className: string) =>
    folders.length > 0 ? (
      <nav aria-label={t("פרקים בגלריה")} className={`${className} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
        {[{ id: null as string | null, name: t("הכל") }, ...folders.map((f) => ({ id: f.id as string | null, name: f.name }))].map((f) => {
          const active = activeFolderId === f.id;
          return (
            <button
              key={f.id ?? "all"}
              onClick={() => selectChapter(f.id)}
              aria-current={active ? "true" : undefined}
              className="shrink-0 whitespace-nowrap py-1.5 text-[13px] sm:text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gt-ink)]"
              style={{
                color: active ? "var(--gt-ink)" : "var(--gt-ink-soft)",
                boxShadow: active ? "inset 0 -1px 0 var(--gt-ink)" : undefined,
              }}
            >
              {f.name}
            </button>
          );
        })}
      </nav>
    ) : null;

  const barBtn =
    "h-10 min-w-10 px-2 lg:px-3 flex items-center justify-center gap-2 text-sm rounded-[2px] transition-colors hover:bg-black/[0.045] focus-visible:outline-2 focus-visible:outline-[var(--gt-ink)] disabled:opacity-50";

  const renderStickyBar = () => (
    <>
      {/* Anchor for the cover's scroll cue and for returning to the top of the photos. */}
      <div id="gallery-content" aria-hidden="true" />
      <div
        className="sticky top-0 z-30"
        style={{
          background: "color-mix(in srgb, var(--gt-bg) 97%, transparent)",
          backdropFilter: "blur(10px)",
          WebkitBackdropFilter: "blur(10px)",
          borderBottom: "1px solid var(--gt-border)",
          color: "var(--gt-ink)",
        }}
      >
        <div className="mx-auto max-w-[1600px] h-14 px-3 sm:px-6 lg:px-10 flex items-center gap-6">
          <div className="min-w-0 shrink">
            {brandLogoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandLogoUrl} alt={studioName ?? ""} className="h-7 w-auto max-w-[140px] object-contain" />
            ) : null}
          </div>
          {renderChapterNav("hidden md:flex min-w-0 flex-1 items-center gap-6 overflow-x-auto")}
          <div className="ms-auto flex shrink-0 items-center gap-0.5 lg:gap-1">
            <button onClick={() => setFavoritesPanelOpen(true)} className={barBtn} aria-label={t("{n} מועדפים", { n: favoriteCount })}>
              <HeartIcon filled={favoriteCount > 0} size={19} color="var(--gt-ink)" />
              <span className="hidden lg:inline">{t("מועדפים")}</span>
              {favoriteCount > 0 && <span className="tabular-nums">{favoriteCount}</span>}
            </button>
            {allowDownloads && photos.length > 0 && (
              <button onClick={openDownloadAll} disabled={zipping} className={barBtn} aria-label={t("הורדת כל התמונות ({n})", { n: photos.length })}>
                <DownloadIcon size={19} stroke="currentColor" />
                {zipping || zipBatch ? (
                  <span className="text-[13px] tabular-nums">
                    {zipping ? t("מתחילים...") : zipDone ? t("ההורדה הושלמה") : t("מכינים... {pct}%", { pct: zipProgressPercent })}
                  </span>
                ) : (
                  <span className="hidden lg:inline">{t("הורדה")}</span>
                )}
              </button>
            )}
            <button onClick={openGalleryShare} className={barBtn} aria-label={t("שיתוף הגלריה")}>
              <ShareIcon size={19} stroke="currentColor" />
              <span className="hidden lg:inline">{t("שיתוף")}</span>
            </button>
            {slideshowPhotos.length > 0 && (
              <button onClick={() => setSlideshowOpen(true)} className={barBtn} aria-label={t("מצגת תמונות")}>
                <PlayIcon size={19} />
                <span className="hidden lg:inline">{t("מצגת")}</span>
              </button>
            )}
          </div>
        </div>
        {renderChapterNav("md:hidden flex h-11 items-center gap-5 overflow-x-auto px-4 border-t border-[var(--gt-border)]")}
      </div>
    </>
  );

  // Premium lightbox: pure black, the photo as large as the screen allows, and only the controls
  // that matter — close, position, favorite, download. Same swipe/keyboard/tap-to-close behavior.
  const lbBtn =
    "h-11 min-w-11 px-2 flex items-center justify-center gap-2 text-white/85 hover:text-white transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-white";
  const renderPremiumLightbox = (index: number) => {
    const photo = visiblePhotos[index];
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={photo.original_filename}
        className="gf-no-enter fixed inset-0 z-50 flex items-center justify-center"
        style={{ background: "#000" }}
        onClick={() => {
          if (lightboxSwiped.current) {
            lightboxSwiped.current = false;
            return;
          }
          closeLightbox();
        }}
        onTouchStart={handleLightboxTouchStart}
        onTouchEnd={handleLightboxTouchEnd}
      >
        <div className="absolute inset-x-0 top-0 z-10 flex h-14 items-center justify-between px-2 sm:px-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center">
            <button
              onClick={() => toggleFavorite(photo)}
              className={lbBtn}
              aria-label={photo.is_favorite ? t("הסרה מהמועדפים") : t("הוספה למועדפים")}
              aria-pressed={photo.is_favorite}
            >
              <HeartIcon filled={photo.is_favorite} size={21} color="#fff" />
            </button>
            {allowDownloads && (
              <button onClick={() => downloadPhoto(photo)} className={lbBtn} aria-label={t("הורדת התמונה")}>
                <DownloadIcon size={21} stroke="currentColor" />
                <span className="hidden sm:inline text-sm">{t("הורדה")}</span>
              </button>
            )}
          </div>
          <span dir="ltr" className="absolute left-1/2 -translate-x-1/2 text-[13px] tabular-nums text-white/60">
            {index + 1} / {visiblePhotos.length}
          </span>
          <button onClick={closeLightbox} aria-label={t("סגירה")} className={lbBtn}>
            <IconClose className="h-[18px] w-[18px]" />
          </button>
        </div>
        {index > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigateLightbox(index - 1);
            }}
            aria-label={t("התמונה הקודמת")}
            className={`absolute start-0 z-10 h-24 w-12 sm:w-16 ${lbBtn}`}
          >
            <ChevronIcon direction={isRtl ? "right" : "left"} />
          </button>
        )}
        {index < visiblePhotos.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              navigateLightbox(index + 1);
            }}
            aria-label={t("התמונה הבאה")}
            className={`absolute end-0 z-10 h-24 w-12 sm:w-16 ${lbBtn}`}
          >
            <ChevronIcon direction={isRtl ? "left" : "right"} />
          </button>
        )}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={photo.previewUrl ?? `/api/gallery/${token}/photos/${photo.id}/preview`}
          alt={photo.original_filename}
          className="max-w-full max-h-[calc(100svh-112px)] sm:max-w-[calc(100vw-144px)] sm:max-h-[calc(100svh-120px)] object-contain"
          style={{ viewTransitionName: `photo-${photo.id}` }}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  };

  const chapterStarts = chapters.map((_, i) => chapters.slice(0, i).reduce((sum, c) => sum + c.photos.length, 0));

  const renderPremiumBody = () => (
    <>
      {album && albumSpreads.length > 0 && (
        <div
          className="mx-3 sm:mx-0 mb-8 sm:mb-12 flex flex-wrap items-center gap-x-5 gap-y-3 border p-3 sm:p-4"
          style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)" }}
        >
          {album.coverUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={optimizedImageUrl(album.coverUrl, 384)} alt="" className="h-14 w-20 sm:h-16 sm:w-24 shrink-0 object-cover" />
          )}
          <p className="min-w-0 flex-1 text-xl sm:text-2xl leading-tight" style={{ fontFamily: "var(--font-gallery-serif), serif", fontWeight: 400 }}>
            {album.title || t("עיצוב האלבום")}
          </p>
          <button
            onClick={() => setAlbumOpen(true)}
            className={`h-11 px-5 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gt-ink)] ${BTN_PRESS}`}
            style={{ background: "var(--gt-accent)", color: "var(--gt-accent-ink)", borderRadius: "var(--gt-radius)" }}
          >
            {album.status === "approved"
              ? t("צפייה באלבום המאושר")
              : album.status === "changes_requested"
                ? t("עיצוב האלבום")
                : t("אישור עיצוב האלבום")}
          </button>
        </div>
      )}
      <div ref={pinchContainerRef} className="md:[--gt-gap:8px]">
        {chapters.map((c, ci) => (
          <section key={c.key} aria-labelledby={c.name ? `chapter-${c.key}` : undefined}>
            {c.name && (
              <div className={`px-3 sm:px-0 flex flex-wrap items-baseline gap-x-4 gap-y-1 pb-4 sm:pb-7 ${ci === 0 ? "pt-6 sm:pt-6" : "pt-16 sm:pt-28"}`}>
                <h2
                  id={`chapter-${c.key}`}
                  style={{
                    fontFamily: "var(--font-gallery-serif), serif",
                    fontWeight: 300,
                    fontSize: "clamp(30px, 4.4vw, 52px)",
                    lineHeight: 1.05,
                    letterSpacing: "-0.01em",
                  }}
                >
                  {c.name}
                </h2>
                <span className="text-sm tabular-nums" style={{ color: "var(--gt-ink-soft)" }}>
                  {c.photos.length === 1 ? t("תמונה אחת") : t("{n} תמונות", { n: c.photos.length })}
                </span>
              </div>
            )}
            {renderGrid(c.photos, chapterStarts[ci], false)}
          </section>
        ))}
      </div>
    </>
  );

  const renderFooter = () => (
    <footer className="mt-20 sm:mt-32 border-t" style={{ borderColor: "var(--gt-border)", color: "var(--gt-ink)" }}>
      <div className={`mx-auto max-w-[1600px] px-6 pt-10 text-center ${bottomBarVisible ? "pb-40" : "pb-14"}`}>
        {brandLogoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={brandLogoUrl} alt={studioName ?? ""} className="mx-auto h-10 w-auto max-w-[180px] object-contain" />
        )}
        {contactUrl && (
          <a
            href={contactUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-block text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gt-ink)]"
            style={{ color: "var(--gt-ink-soft)" }}
          >
            {t("יצירת קשר")}
          </a>
        )}
      </div>
    </footer>
  );

  // Premium's justified rows: every photo keeps its full shape (no cropping) and a row's photos
  // share one height — each tile grows in proportion to its aspect ratio, and the filler at the end
  // only partly fills the last row, so a lone last photo isn't blown up to full width. Each photo fades in on its
  // own as it arrives, instead of the whole grid waiting for every thumbnail.
  const renderPremiumRows = (list: PhotoWithUrl[], offset: number, attachRef: boolean) => (
    <div ref={attachRef ? pinchContainerRef : undefined} className="flex flex-wrap" style={{ touchAction: "pan-y", gap: "var(--gt-gap)" }}>
      {list.map((photo, i) => {
        const isSelected = photo.is_favorite;
        const ratio = aspectRatios[photo.id] ?? photo.preview_aspect_ratio ?? 1.5;
        return (
          <div
            key={photo.id}
            className="group relative min-w-0 overflow-hidden"
            style={{
              flexGrow: ratio,
              flexBasis: ratio * cellSize,
              aspectRatio: `${ratio}`,
              background: "var(--gt-surface-soft)",
              ...(photo.preview_blur_data_url ? { backgroundImage: `url(${photo.preview_blur_data_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
            }}
          >
            <button
              onPointerDown={() => handlePointerDown(photo)}
              onPointerUp={clearLongPressTimer}
              onPointerLeave={clearLongPressTimer}
              onContextMenu={(e) => e.preventDefault()}
              onClick={() => handleTileClick(photo, offset + i)}
              className="relative block w-full h-full select-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--gt-ink)]"
              style={{ WebkitTouchCallout: "none" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={(el) => {
                  if (el?.complete && el.naturalWidth > 0) el.style.opacity = "1";
                }}
                src={photo.previewUrl ?? optimizedImageUrl(photo.url, 640)}
                alt={photo.original_filename}
                loading={offset + i < 12 ? "eager" : "lazy"}
                decoding="async"
                className="absolute inset-0 w-full h-full object-cover block transition-opacity duration-500 motion-reduce:transition-none"
                style={{ opacity: 0, ...(photo.id === transitionPhotoId && lightboxIndex !== offset + i ? { viewTransitionName: `photo-${photo.id}` } : undefined) }}
                onLoad={(e) => {
                  const img = e.currentTarget;
                  img.style.opacity = "1";
                  const r = img.naturalWidth / img.naturalHeight;
                  setAspectRatios((prev) => (prev[photo.id] ? prev : { ...prev, [photo.id]: r }));
                  markThumbLoaded(photo.id);
                }}
                onError={(e) => {
                  e.currentTarget.style.opacity = "1";
                  markThumbLoaded(photo.id);
                }}
              />
              {selectionMode && (
                <div className="absolute inset-0" style={{ background: isSelected ? "rgba(35,36,39,0.28)" : "transparent" }} />
              )}
            </button>
            <PhotoTileOverlays
              photo={photo}
              selectionMode={selectionMode}
              isSelected={isSelected}
              toggleFavorite={toggleFavorite}
              onOpenLabel={setLabelEditPhoto}
              onDownload={allowDownloads ? downloadPhoto : undefined}
              premium
            />
          </div>
        );
      })}
      <div aria-hidden="true" style={{ flexGrow: 3, flexBasis: 0, height: 0 }} />
    </div>
  );

  // One block of photos in the theme's grid style. offset = index of list[0] within visiblePhotos
  // (the lightbox's list), so chapters rendered as separate blocks still open the right photo.
  const renderGrid = (list: PhotoWithUrl[], offset: number, attachRef: boolean) =>
    premium && theme.gridStyle === "justified" ? (
      renderPremiumRows(list, offset, attachRef)
    ) : theme.gridStyle === "grid" ? (
      <div
        ref={attachRef ? pinchContainerRef : undefined}
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(auto-fill, minmax(${cellSize}px, 1fr))`,
          gap: "var(--gt-gap)",
          touchAction: "pan-y",
        }}
      >
        {list.map((photo, i) => {
          const isSelected = photo.is_favorite;
          return (
            <div
              key={photo.id}
              className="relative aspect-square overflow-hidden"
              style={{
                background: "var(--gt-surface-soft)",
                borderRadius: "var(--gt-photo-radius)",
                ...(photo.preview_blur_data_url ? { backgroundImage: `url(${photo.preview_blur_data_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
              }}
            >
              <button
                onPointerDown={() => handlePointerDown(photo)}
                onPointerUp={clearLongPressTimer}
                onPointerLeave={clearLongPressTimer}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => handleTileClick(photo, offset + i)}
                className="relative block w-full h-full select-none"
                style={{ WebkitTouchCallout: "none" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.previewUrl ?? optimizedImageUrl(photo.url, 640)}
                  alt={photo.original_filename}
                  className="absolute inset-0 w-full h-full object-cover block transition-opacity duration-300"
                  style={{ opacity: thumbsReady ? 1 : 0, ...(photo.id === transitionPhotoId && lightboxIndex !== offset + i ? { viewTransitionName: `photo-${photo.id}` } : undefined) }}
                  onLoad={() => markThumbLoaded(photo.id)}
                  onError={() => markThumbLoaded(photo.id)}
                />
                {selectionMode && (
                  <div className="absolute inset-0" style={{ background: isSelected ? "color-mix(in srgb, var(--gt-accent) 30%, transparent)" : "transparent" }} />
                )}
              </button>
              <PhotoTileOverlays photo={photo} selectionMode={selectionMode} isSelected={isSelected} toggleFavorite={toggleFavorite} onOpenLabel={setLabelEditPhoto} onDownload={premium && !allowDownloads ? undefined : downloadPhoto} premium={premium} />
            </div>
          );
        })}
      </div>
    ) : theme.gridStyle === "justified" ? (
      <div
        ref={attachRef ? pinchContainerRef : undefined}
        style={{ touchAction: "pan-y", display: "flex", flexWrap: "wrap", gap: "var(--gt-gap)" }}
      >
        {list.map((photo, i) => {
          const isSelected = photo.is_favorite;
          const ratio = aspectRatios[photo.id] ?? photo.preview_aspect_ratio ?? 1.5;
          return (
            <div
              key={photo.id}
              className="relative overflow-hidden"
              style={{
                height: cellSize,
                width: ratio * cellSize,
                flexGrow: 1,
                flexShrink: 1,
                background: "var(--gt-surface-soft)",
                borderRadius: "var(--gt-photo-radius)",
                ...(photo.preview_blur_data_url ? { backgroundImage: `url(${photo.preview_blur_data_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
              }}
            >
              <button
                onPointerDown={() => handlePointerDown(photo)}
                onPointerUp={clearLongPressTimer}
                onPointerLeave={clearLongPressTimer}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => handleTileClick(photo, offset + i)}
                className="relative block w-full h-full select-none"
                style={{ WebkitTouchCallout: "none" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.previewUrl ?? optimizedImageUrl(photo.url, 640)}
                  alt={photo.original_filename}
                  className="absolute inset-0 w-full h-full object-cover block transition-opacity duration-300"
                  style={{ opacity: thumbsReady ? 1 : 0, ...(photo.id === transitionPhotoId && lightboxIndex !== offset + i ? { viewTransitionName: `photo-${photo.id}` } : undefined) }}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    const r = img.naturalWidth / img.naturalHeight;
                    setAspectRatios((prev) => (prev[photo.id] ? prev : { ...prev, [photo.id]: r }));
                    markThumbLoaded(photo.id);
                  }}
                  onError={() => markThumbLoaded(photo.id)}
                />
                {selectionMode && (
                  <div className="absolute inset-0" style={{ background: isSelected ? "color-mix(in srgb, var(--gt-accent) 30%, transparent)" : "transparent" }} />
                )}
              </button>
              <PhotoTileOverlays photo={photo} selectionMode={selectionMode} isSelected={isSelected} toggleFavorite={toggleFavorite} onOpenLabel={setLabelEditPhoto} onDownload={premium && !allowDownloads ? undefined : downloadPhoto} premium={premium} />
            </div>
          );
        })}
      </div>
    ) : (
      <div
        ref={attachRef ? pinchContainerRef : undefined}
        style={{ touchAction: "pan-y", columnWidth: `${cellSize}px`, columnGap: "var(--gt-gap)" }}
      >
        {list.map((photo, i) => {
          const isSelected = photo.is_favorite;
          const framed = theme.gridStyle === "framed";
          const knownShape = photo.preview_aspect_ratio != null;
          return (
            <div
              key={photo.id}
              className="relative block break-inside-avoid overflow-hidden"
              style={{
                marginBottom: "var(--gt-gap)",
                background: "var(--gt-surface-soft)",
                borderRadius: "var(--gt-photo-radius)",
                ...(framed ? { padding: "8px", border: "1px solid var(--gt-border)" } : {}),
                ...(knownShape ? { aspectRatio: `${photo.preview_aspect_ratio}` } : {}),
                ...(photo.preview_blur_data_url ? { backgroundImage: `url(${photo.preview_blur_data_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
              }}
            >
              <button
                onPointerDown={() => handlePointerDown(photo)}
                onPointerUp={clearLongPressTimer}
                onPointerLeave={clearLongPressTimer}
                onContextMenu={(e) => e.preventDefault()}
                onClick={() => handleTileClick(photo, offset + i)}
                className="relative block w-full h-full select-none"
                style={{ WebkitTouchCallout: "none" }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.previewUrl ?? optimizedImageUrl(photo.url, 640)}
                  alt={photo.original_filename}
                  className={knownShape ? "absolute inset-0 w-full h-full object-cover transition-opacity duration-300" : "w-full h-auto block"}
                  style={{
                    opacity: knownShape ? (thumbsReady ? 1 : 0) : 1,
                    borderRadius: framed ? "calc(var(--gt-photo-radius) - 6px)" : undefined,
                    ...(photo.id === transitionPhotoId && lightboxIndex !== offset + i ? { viewTransitionName: `photo-${photo.id}` } : undefined),
                  }}
                  onLoad={() => markThumbLoaded(photo.id)}
                  onError={() => markThumbLoaded(photo.id)}
                />
                {selectionMode && (
                  <div className="absolute inset-0" style={{ background: isSelected ? "color-mix(in srgb, var(--gt-accent) 30%, transparent)" : "transparent", borderRadius: framed ? "calc(var(--gt-photo-radius) - 6px)" : undefined }} />
                )}
              </button>
              <PhotoTileOverlays photo={photo} selectionMode={selectionMode} isSelected={isSelected} toggleFavorite={toggleFavorite} onOpenLabel={setLabelEditPhoto} onDownload={premium && !allowDownloads ? undefined : downloadPhoto} inset={framed ? 8 : 0} premium={premium} />
            </div>
          );
        })}
      </div>
    );

  return (
    <>
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label={t("חזרה לראש העמוד")}
          className={`fixed end-5 z-40 h-11 w-11 rounded-full flex items-center justify-center shadow-sheet ${BTN_PRESS} ${favoriteCount > 0 || selectionMode || usedLabels.length > 0 ? "bottom-28" : "bottom-5"}`}
          style={{ background: "var(--gt-accent)", color: "var(--gt-accent-ink)" }}
        >
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      )}
      {!premium && (
      <button
        onClick={openGalleryShare}
        className={`fixed start-5 md:rtl:translate-x-[5cm] md:ltr:-translate-x-[5cm] z-40 h-11 px-4 rounded-full flex items-center gap-1.5 shadow-sheet text-sm font-semibold ${BTN_PRESS} ${favoriteCount > 0 || selectionMode || usedLabels.length > 0 ? "bottom-28" : "bottom-5"}`}
        style={{ background: "var(--gt-surface)", border: "1px solid var(--gt-border)", color: "var(--gt-ink)" }}
      >
        <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <circle cx={18} cy={5} r={3} />
          <circle cx={6} cy={12} r={3} />
          <circle cx={18} cy={19} r={3} />
          <path d="M8.6 10.5l6.8-3.8M8.6 13.5l6.8 3.8" />
        </svg>
        {t("שיתוף")}
      </button>
      )}
      {premium && renderStickyBar()}
      <ContentFrame premium={premium}>
      {premium && leadContent && <div className="mx-3 sm:mx-0">{leadContent}</div>}
      {!hintDismissed && (
        <div
          className={`flex items-start gap-2 px-3.5 py-2.5 mb-4 text-xs ${premium ? "mx-3 sm:mx-0" : ""}`}
          style={{ background: "var(--gt-surface-soft)", color: "var(--gt-ink)", borderRadius: "var(--gt-radius)" }}
        >
          <span className="flex-1">
            {t("לחיצה לתמונה בגודל מלא. לחיצה ארוכה לבחירה מרובה. לחיצה כפולה לשיתוף/הורדה (של כל התמונות המסומנות, אם יש כמה)")}
          </span>
          <button onClick={dismissHint} className="shrink-0 font-bold leading-none" aria-label={t("סגירה")}>
            <IconClose className="h-3 w-3" />
          </button>
        </div>
      )}

      {submitted && (
        <div
          className={`px-3.5 py-2.5 mb-4 text-sm font-medium text-center ${premium ? "mx-3 sm:mx-0" : ""}`}
          style={{ background: "var(--gt-surface-soft)", color: "var(--gt-accent)", borderRadius: "var(--gt-radius)" }}
        >
          {t("תודה! הבחירה שלכם ({n} תמונות) נשלחה לצלם/ת. אפשר עדיין לשנות ולעדכן בכל שלב.", { n: favoriteCount })}
        </div>
      )}

      {!premium && folders.length > 0 && (
        <div className="flex items-center gap-1.5 mb-4 overflow-x-auto">
          <button
            onClick={() => setActiveFolderId(null)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${BTN_PRESS}`}
            style={{
              background: activeFolderId === null ? "var(--gt-accent)" : "var(--gt-surface-soft)",
              color: activeFolderId === null ? "var(--gt-accent-ink)" : "var(--gt-ink-soft)",
            }}
          >
            {t("הכל")}
          </button>
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => setActiveFolderId(folder.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${BTN_PRESS}`}
              style={{
                background: activeFolderId === folder.id ? "var(--gt-accent)" : "var(--gt-surface-soft)",
                color: activeFolderId === folder.id ? "var(--gt-accent-ink)" : "var(--gt-ink-soft)",
              }}
            >
              {folder.name}
            </button>
          ))}
        </div>
      )}

      <input
        ref={uploadInputRef}
        type="file"
        accept={ALLOWED_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          handleUploadFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={uploadDirInputRef}
        type="file"
        accept={ALLOWED_ACCEPT}
        multiple
        className="hidden"
        onChange={(e) => {
          handleUploadDirectory(e.target.files);
          e.target.value = "";
        }}
        {...({ webkitdirectory: "true", directory: "true" } as unknown as Record<string, string>)}
      />
      {allowClientUpload && (
        <div className={premium ? "mb-4 mx-3 sm:mx-0" : "mb-4"}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleUploadDrop}
            style={{
              minHeight: "15cm",
              borderRadius: "var(--gt-radius)",
              borderColor: isDragging ? "var(--gt-accent)" : "var(--gt-border)",
              background: isDragging ? "var(--gt-surface-soft)" : "var(--gt-surface)",
            }}
            className={`flex border-2 border-dashed transition-colors ${uploadTotal > 0 ? "pointer-events-none opacity-60" : ""}`}
          >
            <button
              onClick={() => uploadInputRef.current?.click()}
              disabled={uploadTotal > 0}
              className="w-full flex items-center justify-center px-6 text-base font-semibold text-center"
              style={{ color: "var(--gt-ink)" }}
            >
              {uploadTotal > 0
                ? t("מעלה... ({done}/{total})", { done: uploadingCount, total: uploadTotal })
                : isDragging
                  ? t("שחררו כאן להעלאה")
                  : t("העלאת תמונות, או גררו לכאן תמונות ותיקיות")}
            </button>
          </div>
          <button
            onClick={() => uploadDirInputRef.current?.click()}
            disabled={uploadTotal > 0}
            className={`w-full flex items-center justify-center py-2 mt-1.5 text-xs font-semibold border disabled:opacity-60 ${BTN_PRESS}`}
            style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)", color: "var(--gt-ink-soft)", borderRadius: "var(--gt-radius)" }}
          >
            {t("העלאת תיקייה שלמה מהמחשב")}
          </button>
          {uploadError && (
            <p className="text-xs text-center mt-2" style={{ color: "var(--gt-ink-soft)" }}>
              {t(uploadError)}
            </p>
          )}
        </div>
      )}
      {uploadTotal > 0 && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: "rgba(28, 27, 25, 0.55)" }}>
          <div
            className="w-64 rounded-3xl overflow-hidden shadow-sheet flex flex-col items-center gap-3 px-6 py-9 text-center"
            style={{ background: "var(--gt-surface)", color: "var(--gt-ink)" }}
          >
            <div className="relative" style={{ width: 112, height: 112 }}>
              {/* Soft ambient glow behind the ring — purely decorative (aria-hidden), same green as
                  the ring's own stroke so it reads as a halo rather than a mismatched second color.
                  Static, not animated — the ring's own progress motion is already the thing to
                  watch; a second, independently-pulsing element made the screen feel busier. */}
              <div
                aria-hidden="true"
                className="absolute inset-0 rounded-full"
                style={{ background: "radial-gradient(circle, rgba(34,197,94,0.55), rgba(34,197,94,0) 70%)", filter: "blur(16px)" }}
              />
              <svg viewBox="0 0 100 100" width={112} height={112} style={{ position: "relative", transform: "rotate(-90deg)" }}>
                <circle cx={50} cy={50} r={UPLOAD_RING_RADIUS} fill="none" stroke="rgba(34,197,94,0.2)" strokeWidth={8} />
                <circle
                  cx={50}
                  cy={50}
                  r={UPLOAD_RING_RADIUS}
                  fill="none"
                  stroke="#22c55e"
                  strokeWidth={8}
                  strokeLinecap="round"
                  strokeDasharray={UPLOAD_RING_CIRCUMFERENCE}
                  strokeDashoffset={UPLOAD_RING_CIRCUMFERENCE * (1 - uploadPct / 100)}
                  style={{ transition: "stroke-dashoffset 150ms linear" }}
                />
                <text
                  x={50}
                  y={51}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={18}
                  fontWeight={700}
                  fill="#22c55e"
                  style={{ transform: "rotate(90deg)", transformOrigin: "50px 50px" }}
                  className="font-data"
                >
                  {uploadPct.toFixed(2)}%
                </text>
              </svg>
            </div>
            <div>
              <div className="text-sm font-semibold">{t("מעלה תמונות ({done}/{total})", { done: uploadingCount, total: uploadTotal })}</div>
              <div className="text-xs mt-1" style={{ color: "var(--gt-ink-soft)" }}>
                {t("החלון ייסגר אוטומטית בסיום ההעלאה")}
              </div>
            </div>
          </div>
        </div>
      )}
      {visiblePhotos.length === 0 ? (
        <p className="text-sm text-center py-16" style={{ color: "var(--gt-ink-soft)" }}>
          {allowClientUpload ? t("אין עדיין תמונות בגלריה. אפשר להעלות תמונות משלכם למעלה.") : t("אין עדיין תמונות בגלריה.")}
        </p>
      ) : premium ? (
        renderPremiumBody()
      ) : (
        <>
          <div className="flex items-center gap-2 mb-3">
            <IconGallery className="h-3 w-3 shrink-0 text-[var(--gt-ink-soft)]" />
            <input
              type="range"
              min={CELL_SIZE_MIN}
              max={CELL_SIZE_MAX}
              step={1}
              value={cellSize}
              onChange={(e) => setCellSize(Number(e.target.value))}
              className="w-full"
              style={{ accentColor: "var(--gt-accent)" }}
              aria-label={t("גודל תמונות בגלריה")}
            />
            <IconGallery className="h-5 w-5 shrink-0 text-[var(--gt-ink-soft)]" />
          </div>
          {slideshowPhotos.length > 0 && (
            <button
              onClick={() => setSlideshowOpen(true)}
              className={`w-full flex items-center justify-center gap-2 py-2.5 mb-3 text-sm font-semibold ${BTN_PRESS}`}
              style={{ background: "var(--gt-accent)", color: "var(--gt-accent-ink)", borderRadius: "var(--gt-radius)" }}
            >
              ▶ {t("מצגת תמונות")}
            </button>
          )}
          {album && albumSpreads.length > 0 && (
            <button
              onClick={() => setAlbumOpen(true)}
              className={`w-full flex items-center justify-center gap-2 py-2.5 mb-3 text-sm font-semibold border ${BTN_PRESS}`}
              style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)", color: "var(--gt-ink)", borderRadius: "var(--gt-radius)" }}
            >
              📖{" "}
              {album.status === "approved"
                ? t("צפייה באלבום המאושר")
                : album.status === "changes_requested"
                  ? t("עיצוב האלבום")
                  : t("אישור עיצוב האלבום")}
            </button>
          )}
          {allowDownloads && (
            <button
              onClick={openDownloadAll}
              disabled={zipping}
              className={`w-full flex items-center justify-center gap-2 py-2.5 mb-4 text-sm font-semibold border disabled:opacity-60 ${BTN_PRESS}`}
              style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)", color: "var(--gt-ink)", borderRadius: "var(--gt-radius)" }}
            >
              <DownloadIcon size={16} />
              {zipping
                ? t("מתחילים...")
                : zipBatch
                  ? zipDone
                    ? t("ההורדה הושלמה")
                    : t("מכינים... {pct}%", { pct: zipProgressPercent })
                  : t("הורדת כל התמונות ({n})", { n: photos.length })}
            </button>
          )}
          <div className="relative">
          {renderGrid(visiblePhotos, 0, true)}
          </div>
        </>
      )}

      </ContentFrame>
      {premium && renderFooter()}

      {/* Floating favorites/selection bar — anchored to the bottom of the screen so it doesn't
          cover the gallery header, and stays available even after the client has already
          confirmed once (they can keep changing their mind). While multi-select mode (long-press)
          is active, tapping a photo favorites it directly, so this always shows one unified
          favorites count instead of a separate "selected" count. Sized up with bigger text on
          both mobile and desktop so it can't be missed. */}
      {(favoriteCount > 0 || selectionMode || usedLabels.length > 0) && (pastCover || selectionMode) && (
        <div
          className={`fixed bottom-3 right-3 left-3 md:right-auto md:left-1/2 md:-translate-x-1/2 z-40 flex flex-col gap-2 ${premium ? "rounded-[4px]" : "rounded-2xl"} px-4 py-3 md:py-3.5 md:min-w-[240px] shadow-sheet border`}
          style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)", color: "var(--gt-ink)" }}
        >
          <div className="flex items-center justify-between gap-2">
            <button
              onClick={() => setFavoritesPanelOpen(true)}
              className={`flex items-center gap-2 text-sm md:text-base font-bold ${BTN_PRESS}`}
            >
              <HeartIcon filled size={18} />
              {t("{n} מועדפים", { n: favoriteCount })}
            </button>
            {!selectionMode && (
              <div className="flex items-center gap-3">
                {favoriteCount < photos.length && (
                  <button
                    onClick={selectAllFavorites}
                    className={`text-xs md:text-sm font-semibold whitespace-nowrap ${BTN_PRESS}`}
                    style={{ color: "var(--gt-ink-soft)" }}
                  >
                    {t("בחר הכל")}
                  </button>
                )}
                {favoriteCount > 0 && (
                  <button
                    onClick={clearFavorites}
                    className={`text-xs md:text-sm font-semibold whitespace-nowrap ${BTN_PRESS}`}
                    style={{ color: "var(--gt-ink-soft)" }}
                  >
                    {t("ניקוי הכל")}
                  </button>
                )}
              </div>
            )}
          </div>

          {!selectionMode && !submitted && (
            <button
              onClick={() => {
                setConfirmError(null);
                setConfirmOpen(true);
              }}
              className={`w-full py-2.5 text-sm md:text-base font-semibold ${BTN_PRESS}`}
              style={{ background: "var(--gt-accent)", color: "var(--gt-accent-ink)", borderRadius: "var(--gt-radius)" }}
            >
              {t("סיימת לבחור")}
            </button>
          )}
          {!selectionMode && submitted && hasUnsavedChanges && (
            <button
              onClick={saveFavorites}
              disabled={saving}
              className={`w-full py-2.5 text-sm md:text-base font-semibold disabled:opacity-60 ${BTN_PRESS}`}
              style={{ background: "var(--gt-accent)", color: "var(--gt-accent-ink)", borderRadius: "var(--gt-radius)" }}
            >
              {saving ? t("שומר...") : t("עדכון הבחירה")}
            </button>
          )}
          {!selectionMode && submitted && !hasUnsavedChanges && (
            <span className="text-xs md:text-sm font-semibold" style={{ color: "var(--gt-accent)" }}>{t("נשמר ✓")}</span>
          )}

          {selectionMode && (
            <button
              onClick={exitSelectionMode}
              className={`w-full text-xs md:text-sm font-semibold ${BTN_PRESS}`}
              style={{ color: "var(--gt-ink-soft)" }}
            >
              {t("סיום בחירה מרובה")}
            </button>
          )}
        </div>
      )}

      {/* Favorites panel */}
      {favoritesPanelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
          onClick={() => setFavoritesPanelOpen(false)}
        >
          <div
            className="relative w-full max-w-md rounded-t-3xl p-5 pb-8 shadow-sheet max-h-[80vh] overflow-y-auto"
            style={{ background: "var(--gt-surface)", color: "var(--gt-ink)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-bold font-display">{t("התמונות שבחרתם ({n})", { n: favoriteCount })}</h2>
              <button
                onClick={() => setFavoritesPanelOpen(false)}
                className={`h-8 w-8 rounded-full flex items-center justify-center border ${BTN_PRESS}`}
                style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)" }}
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>
            {(favorites.length > 0 || favoriteCount < photos.length) && (
              <div className="flex justify-start gap-3 mb-3">
                {favoriteCount < photos.length && (
                  <button
                    onClick={selectAllFavorites}
                    className={`text-xs font-semibold ${BTN_PRESS}`}
                    style={{ color: "var(--gt-ink-soft)" }}
                  >
                    {t("בחר הכל")}
                  </button>
                )}
                {favorites.length > 0 && (
                  <button
                    onClick={clearFavorites}
                    className={`text-xs font-semibold ${BTN_PRESS}`}
                    style={{ color: "var(--gt-ink-soft)" }}
                  >
                    {t("ניקוי הכל")}
                  </button>
                )}
              </div>
            )}
            {usedLabels.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                <button
                  onClick={() => setActiveLabelFilter(null)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${BTN_PRESS}`}
                  style={
                    activeLabelFilter === null
                      ? { background: "var(--gt-accent)", color: "var(--gt-accent-ink)" }
                      : { background: "var(--gt-surface-soft)", color: "var(--gt-ink-soft)" }
                  }
                >
                  {t("הכל")}
                </button>
                {usedLabels.map((label) => (
                  <button
                    key={label}
                    onClick={() => setActiveLabelFilter(label)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${BTN_PRESS}`}
                    style={
                      activeLabelFilter === label
                        ? { background: "var(--gt-accent)", color: "var(--gt-accent-ink)" }
                        : { background: "var(--gt-surface-soft)", color: "var(--gt-ink-soft)" }
                    }
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {panelPhotos.length === 0 ? (
              <p className="text-sm text-center py-8" style={{ color: "var(--gt-ink-soft)" }}>
                {activeLabelFilter ? t("אין תמונות עם התווית הזו.") : t("עדיין לא נבחרו תמונות.")}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-1.5 mb-4">
                {panelPhotos.map((photo) => (
                  <div key={photo.id} className="relative aspect-square overflow-hidden" style={{ background: "var(--gt-surface-soft)", borderRadius: "var(--gt-radius)" }}>
                    <Image src={photo.url} alt={photo.original_filename} fill sizes="33vw" className="object-cover" />
                    {/* A label-filtered view can include photos that aren't favorited yet — the
                        heart here reflects and toggles THIS photo's actual favorite state, not
                        just "remove", so tapping it on a labeled-but-unfavorited photo favorites
                        it instead of silently doing the opposite of what the filled-heart icon
                        implied. */}
                    <button
                      onClick={() => toggleFavorite(photo)}
                      aria-label={photo.is_favorite ? t("הסרה מהמועדפים") : t("הוספה למועדפים")}
                      title={photo.is_favorite ? t("הסרה מהמועדפים") : t("הוספה למועדפים")}
                      className={`absolute top-1.5 start-1.5 h-7 w-7 rounded-full flex items-center justify-center bg-black/30 backdrop-blur-md ${BTN_PRESS}`}
                    >
                      <HeartIcon filled={photo.is_favorite} size={14} />
                    </button>
                    {photo.custom_label && (
                      <span
                        className="absolute bottom-1.5 right-1.5 left-1.5 truncate rounded-full px-2 py-0.5 text-[10px] font-semibold text-center bg-black/40 text-white backdrop-blur-md"
                      >
                        {photo.custom_label}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
            {/* Floating download button — the outer bottom bar's download button is hidden
                behind this panel while it's open, so browsing favorites here needs its own. */}
            {allowDownloads && favorites.length > 0 && (
              <button
                onClick={() => setDownloadSelectedConfirmOpen(true)}
                disabled={zipping}
                aria-label={t("הורדת כל התמונות המועדפות")}
                title={t("הורדת כל התמונות המועדפות")}
                className={`absolute bottom-24 end-5 h-12 w-12 rounded-full shadow-sheet flex items-center justify-center disabled:opacity-60 ${BTN_PRESS}`}
                style={{ background: "var(--gt-accent)", color: "var(--gt-accent-ink)" }}
              >
                <svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                  <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
                </svg>
              </button>
            )}
            {!submitted ? (
              <button
                onClick={() => {
                setConfirmError(null);
                setConfirmOpen(true);
              }}
                className={`w-full py-3 text-sm font-semibold ${BTN_PRESS}`}
                style={{ background: "var(--gt-accent)", color: "var(--gt-accent-ink)", borderRadius: "var(--gt-radius)" }}
              >
                {t("סיימת לבחור")}
              </button>
            ) : hasUnsavedChanges ? (
              <button
                onClick={saveFavorites}
                disabled={saving}
                className={`w-full py-3 text-sm font-semibold disabled:opacity-60 ${BTN_PRESS}`}
                style={{ background: "var(--gt-accent)", color: "var(--gt-accent-ink)", borderRadius: "var(--gt-radius)" }}
              >
                {saving ? t("שומר...") : t("עדכון הבחירה")}
              </button>
            ) : null}
          </div>
        </div>
      )}

      {/* Diamond-icon label editor — free text the client attaches to one photo (e.g. "קנבס")
          to tell the photographer what they want done with it; also becomes a filter chip in the
          favorites panel above. */}
      {labelEditPhoto && (
        <LabelEditModal
          photo={labelEditPhoto}
          saving={savingLabel}
          onSave={(label) => saveLabel(labelEditPhoto, label)}
          onClose={() => setLabelEditPhoto(null)}
        />
      )}

      {/* Confirm dialog */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 shadow-sheet"
            style={{ background: "var(--gt-surface)", color: "var(--gt-ink)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2 font-display">{t("לאשר את הבחירה?")}</h2>
            <p className="text-sm mb-5" style={{ color: "var(--gt-ink-soft)" }}>
              {favoriteCount === 0
                ? t("עדיין לא סומנו תמונות. סמנו לפחות תמונה אחת כדי לשלוח את הבחירה לצלם/ת.")
                : t("נבחרו {n} תמונות. הבחירה תישלח לצלם/ת, ותמיד אפשר לחזור ולעדכן אותה אחר כך.", { n: favoriteCount })}
            </p>
            {confirmError && <p className="text-sm mb-3 text-rose">{t(confirmError)}</p>}
            <div className="flex gap-2">
              <button
                onClick={confirmSelection}
                disabled={submitting || favoriteCount === 0}
                className={`flex-1 py-3 text-sm font-semibold disabled:opacity-60 ${BTN_PRESS}`}
                style={{ background: "var(--gt-accent)", color: "var(--gt-accent-ink)", borderRadius: "var(--gt-radius)" }}
              >
                {submitting ? t("שולח...") : t("כן, זו הבחירה הסופית")}
              </button>
              <button
                onClick={() => setConfirmOpen(false)}
                className={`flex-1 py-3 text-sm font-semibold border ${BTN_PRESS}`}
                style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)", color: "var(--gt-ink-soft)", borderRadius: "var(--gt-radius)" }}
              >
                {t("חזרה")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download-selected confirm dialog */}
      {downloadSelectedConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
          onClick={() => setDownloadSelectedConfirmOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 shadow-sheet"
            style={{ background: "var(--gt-surface)", color: "var(--gt-ink)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2 font-display">{t("להוריד את התמונות המסומנות?")}</h2>
            <p className="text-sm mb-5" style={{ color: "var(--gt-ink-soft)" }}>
              {t("יורדו {n} תמונות כקובץ ZIP אחד.", { n: favoriteCount })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={async () => {
                  setDownloadSelectedConfirmOpen(false);
                  await downloadZip([...currentFavoriteIds]);
                }}
                disabled={zipping}
                className={`flex-1 py-3 text-sm font-semibold disabled:opacity-60 ${BTN_PRESS}`}
                style={{ background: "var(--gt-accent)", color: "var(--gt-accent-ink)", borderRadius: "var(--gt-radius)" }}
              >
                {zipping ? t("מכין הורדה...") : t("כן, הורד")}
              </button>
              <button
                onClick={() => setDownloadSelectedConfirmOpen(false)}
                className={`flex-1 py-3 text-sm font-semibold border ${BTN_PRESS}`}
                style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)", color: "var(--gt-ink-soft)", borderRadius: "var(--gt-radius)" }}
              >
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Share/download menu — opened by double-tap/double-click on a photo. Holds an array even
          for a single photo; when the tapped photo is part of a multi-favorite selection, both
          actions below operate on the whole selection instead of just the one tapped. */}
      {shareMenuPhotos && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
          onClick={() => setShareMenuPhotos(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 shadow-sheet"
            style={{ background: "var(--gt-surface)", color: "var(--gt-ink)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold font-display">
                {shareMenuPhotos.length > 1 ? t("אפשרויות ({n} תמונות)", { n: shareMenuPhotos.length }) : t("אפשרויות תמונה")}
              </h2>
              <button
                onClick={() => setShareMenuPhotos(null)}
                className={`h-8 w-8 rounded-full flex items-center justify-center border ${BTN_PRESS}`}
                style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)" }}
              >
                <IconClose className="h-4 w-4" />
              </button>
            </div>
            <div className={`grid gap-3 ${allowDownloads ? "grid-cols-2" : "grid-cols-1"}`}>
              <button
                onClick={() => {
                  openPhotosShare(shareMenuPhotos.map((p) => p.id));
                  setShareMenuPhotos(null);
                }}
                className={`flex flex-col items-center gap-2 rounded-2xl py-5 border shadow-card ${BTN_PRESS}`}
                style={{ background: "var(--gt-surface-soft)", borderColor: "var(--gt-border)" }}
              >
                <ShareIcon />
                <span className="text-sm font-semibold">{t("שיתוף")}</span>
              </button>
              {allowDownloads && (
                <button
                  onClick={() => {
                    if (shareMenuPhotos.length > 1) downloadZip(shareMenuPhotos.map((p) => p.id));
                    else downloadPhoto(shareMenuPhotos[0]);
                    setShareMenuPhotos(null);
                  }}
                  className={`flex flex-col items-center gap-2 rounded-2xl py-5 border shadow-card ${BTN_PRESS}`}
                  style={{ background: "var(--gt-surface-soft)", borderColor: "var(--gt-border)" }}
                >
                  <DownloadIcon />
                  <span className="text-sm font-semibold">{t("הורדה")}</span>
                </button>
              )}
            </div>
            {shareFeedback && (
              <p className="text-xs text-center mt-3 font-medium" style={{ color: "var(--gt-accent)" }}>{shareFeedback}</p>
            )}
          </div>
        </div>
      )}

      {galleryShareOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
          onClick={() => setGalleryShareOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 shadow-sheet max-h-[85vh] overflow-y-auto"
            style={{ background: "var(--gt-surface)", color: "var(--gt-ink)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {galleryShareView === "main" ? (
              <>
                <h2 className="text-lg font-bold font-display mb-4">
                  {galleryShareScope?.kind === "photos"
                    ? galleryShareScope.ids.length > 1
                      ? t("שיתוף {n} תמונות", { n: galleryShareScope.ids.length })
                      : t("שיתוף תמונה")
                    : t("שיתוף הגלריה")}
                </h2>

                {showFolderPicker && (
                  <div className="mb-5">
                    <p className="text-xs mb-2.5" style={{ color: "var(--gt-ink-soft)" }}>{t("אילו לשוניות לשתף?")}</p>
                    <div className="space-y-1.5">
                      {folders.map((folder) => (
                        <label
                          key={folder.id}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 border text-sm"
                          style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)" }}
                        >
                          <input type="checkbox" checked={shareSelectedFolders.has(folder.id)} onChange={() => toggleShareFolder(folder.id)} />
                          {folder.name}
                        </label>
                      ))}
                      {hasUnfoldered && (
                        <label
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 border text-sm"
                          style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)" }}
                        >
                          <input type="checkbox" checked={shareSelectedFolders.has(NO_FOLDER_KEY)} onChange={() => toggleShareFolder(NO_FOLDER_KEY)} />
                          {t("כללי (ללא לשונית)")}
                        </label>
                      )}
                    </div>
                    {shareDisabled && <p className="text-xs mt-2 font-semibold" style={{ color: "var(--gt-accent)" }}>{t("יש לבחור לפחות לשונית אחת לשיתוף")}</p>}
                  </div>
                )}

                <div className="mb-5">
                  <p className="text-xs mb-2.5" style={{ color: "var(--gt-ink-soft)" }}>{t("באיזו איכות לשתף?")}</p>
                  {restrictedQuality === "web" ? (
                    <p className="text-xs" style={{ color: "var(--gt-ink-soft)" }}>{t("הקישור הזה שותף באיכות מותאמת לרשת בלבד")}</p>
                  ) : (
                    <div className="space-y-1.5">
                      <label
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 border text-sm"
                        style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)" }}
                      >
                        <input type="radio" name="share-quality" checked={shareQuality === "full"} onChange={() => setShareQuality("full")} />
                        {t("איכות מלאה (הקבצים המקוריים)")}
                      </label>
                      <label
                        className="flex items-center gap-2.5 rounded-lg px-3 py-2 border text-sm"
                        style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)" }}
                      >
                        <input type="radio" name="share-quality" checked={shareQuality === "web"} onChange={() => setShareQuality("web")} />
                        {t("איכות מותאמת לרשת, קובץ קטן יותר (עד כ-3MB לתמונה)")}
                      </label>
                    </div>
                  )}
                </div>

                <div className="space-y-2.5">
                  <button onClick={shareGalleryViaWhatsapp} disabled={shareDisabled} className={`w-full rounded-lg py-3 text-sm font-semibold disabled:opacity-40 ${BTN_PRESS}`} style={{ background: "var(--gt-surface-soft)", color: "var(--gt-accent)" }}>
                    {t("וואטסאפ")}
                  </button>
                  <button onClick={shareGalleryViaInstagram} disabled={shareDisabled} className={`w-full rounded-lg py-3 text-sm font-semibold border disabled:opacity-40 ${BTN_PRESS}`} style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)" }}>
                    {t("אינסטגרם")}
                  </button>
                  <button onClick={shareGalleryViaTiktok} disabled={shareDisabled} className={`w-full rounded-lg py-3 text-sm font-semibold border disabled:opacity-40 ${BTN_PRESS}`} style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)" }}>
                    {t("טיקטוק")}
                  </button>
                  <button onClick={shareGalleryViaQr} disabled={shareDisabled} className={`w-full rounded-lg py-3 text-sm font-semibold border disabled:opacity-40 ${BTN_PRESS}`} style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)" }}>
                    {t("קוד QR")}
                  </button>
                  <button onClick={shareGalleryViaOther} disabled={shareDisabled} className={`w-full rounded-lg py-3 text-sm font-semibold border disabled:opacity-40 ${BTN_PRESS}`} style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)" }}>
                    {t("אחר")}
                  </button>
                </div>
                {shareFeedback && (
                  <p className="text-xs text-center mt-3 font-medium" style={{ color: "var(--gt-accent)" }}>{shareFeedback}</p>
                )}
                <button onClick={() => setGalleryShareOpen(false)} className="w-full text-center mt-4 text-xs" style={{ color: "var(--gt-ink-soft)" }}>
                  {t("ביטול")}
                </button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold font-display mb-4">{t("קוד QR לגלריה")}</h2>
                {gQrDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={gQrDataUrl} alt={t("קוד QR לגלריה")} className="w-full rounded-2xl mb-4" />
                )}
                <div className="flex gap-2">
                  <button onClick={() => setGalleryShareView("main")} className="flex-1 rounded-lg py-3 text-sm font-semibold border" style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)", color: "var(--gt-ink-soft)" }}>
                    {t("חזרה")}
                  </button>
                  <button onClick={() => setGalleryShareOpen(false)} className="flex-1 rounded-lg py-3 text-sm font-semibold" style={{ background: "var(--gt-accent)", color: "var(--gt-accent-ink)" }}>
                    {t("סגירה")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Download options — folder/tab selection (default: everything) and quality, shown before
          starting a background zip job. */}
      {downloadOptionsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
          onClick={() => setDownloadOptionsOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 shadow-sheet max-h-[85vh] overflow-y-auto"
            style={{ background: "var(--gt-surface)", color: "var(--gt-ink)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-4 font-display">{t("הורדת תמונות")}</h2>

            {folders.length > 0 && (
              <div className="mb-5">
                <p className="text-xs mb-2.5" style={{ color: "var(--gt-ink-soft)" }}>{t("אילו לשוניות להוריד?")}</p>
                <div className="space-y-1.5">
                  {folders.map((folder) => (
                    <label
                      key={folder.id}
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 border text-sm"
                      style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)" }}
                    >
                      <input type="checkbox" checked={downloadSelectedFolders.has(folder.id)} onChange={() => toggleDownloadFolder(folder.id)} />
                      {folder.name}
                    </label>
                  ))}
                  {hasUnfoldered && (
                    <label
                      className="flex items-center gap-2.5 rounded-lg px-3 py-2 border text-sm"
                      style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)" }}
                    >
                      <input
                        type="checkbox"
                        checked={downloadSelectedFolders.has(NO_FOLDER_KEY)}
                        onChange={() => toggleDownloadFolder(NO_FOLDER_KEY)}
                      />
                      {t("כללי (ללא לשונית)")}
                    </label>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs mb-2.5" style={{ color: "var(--gt-ink-soft)" }}>{t("באיזו איכות להוריד?")}</p>
            {restrictedQuality === "web" ? (
              <p className="text-xs mb-5" style={{ color: "var(--gt-ink-soft)" }}>
                {t("הקישור הזה שותף באיכות מותאמת לרשת בלבד")}
              </p>
            ) : (
              <div className="space-y-1.5 mb-5">
                <label
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 border text-sm"
                  style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)" }}
                >
                  <input type="radio" name="download-quality" checked={downloadQuality === "full"} onChange={() => setDownloadQuality("full")} />
                  {t("איכות מלאה (הקבצים המקוריים)")}
                </label>
                <label
                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 border text-sm"
                  style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)" }}
                >
                  <input type="radio" name="download-quality" checked={downloadQuality === "web"} onChange={() => setDownloadQuality("web")} />
                  {t("איכות מותאמת לרשת, קובץ קטן יותר (עד כ-3MB לתמונה)")}
                </label>
              </div>
            )}

            {downloadSelectedFolderPhotoIds.length === 0 && (
              <p className="text-xs mb-3 font-semibold" style={{ color: "var(--gt-accent)" }}>{t("יש לבחור לפחות לשונית אחת")}</p>
            )}
            <button
              onClick={() => {
                setDownloadOptionsOpen(false);
                startZipJob(downloadSelectedFolderPhotoIds, downloadQuality);
              }}
              disabled={downloadSelectedFolderPhotoIds.length === 0}
              className={`w-full py-3 text-sm font-semibold disabled:opacity-40 ${BTN_PRESS}`}
              style={{ background: "var(--gt-accent)", color: "var(--gt-accent-ink)", borderRadius: "var(--gt-radius)" }}
            >
              {t("הורדת {n} תמונות", { n: downloadSelectedFolderPhotoIds.length })}
            </button>
          </div>
        </div>
      )}

      {/* Background zip-job progress — a part downloads on its own the moment it's ready. Closing
          this panel only hides it; the job (and the auto-download-on-ready polling) keeps running
          in the background, and clicking "download all" again reopens this same panel. */}
      {zipBatch && zipPanelOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 shadow-sheet"
            style={{ background: "var(--gt-surface)", color: "var(--gt-ink)" }}
          >
            {zipDone ? (
              <>
                <h2 className="text-lg font-bold mb-2 font-display">{t("ההורדה הושלמה")}</h2>
                <p className="text-sm mb-5" style={{ color: "var(--gt-ink-soft)" }}>
                  {zipBatch.parts.length > 1
                    ? t("כל {n} הקבצים ירדו למכשיר שלך.", { n: zipBatch.parts.length })
                    : t("הקובץ ירד למכשיר שלך.")}
                </p>
                {zipBatch.parts.some((p) => p.status === "failed") && (
                  <p className="text-xs mb-4" style={{ color: "var(--gt-rose, #c0392b)" }}>
                    {t("חלק מהתמונות לא נכללו בהורדה בגלל שגיאה. אפשר לנסות שוב.")}
                  </p>
                )}
                <button
                  onClick={() => {
                    setZipPanelOpen(false);
                    setZipBatch(null);
                  }}
                  className={`w-full py-3 text-sm font-semibold ${BTN_PRESS}`}
                  style={{ background: "var(--gt-accent)", color: "var(--gt-accent-ink)", borderRadius: "var(--gt-radius)" }}
                >
                  {t("סגירה")}
                </button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold mb-2 font-display">{t("מכינים את ההורדה")}</h2>
                <p className="text-sm mb-4" style={{ color: "var(--gt-ink-soft)" }}>
                  {zipBatch.parts.length > 1
                    ? t("הגלריה מחולקת ל-{n} קבצי ZIP. כל חלק יורד אוטומטית ברגע שהוא מוכן.", { n: zipBatch.parts.length })
                    : t("קובץ ה-ZIP יורד אוטומטית ברגע שהוא מוכן.")}
                </p>
                <div className="space-y-2 mb-4">
                  {zipBatch.parts.map((part) => (
                    <div
                      key={part.partIndex}
                      className="flex items-center justify-between text-sm rounded-lg px-3 py-2.5 border"
                      style={{ borderColor: "var(--gt-border)" }}
                    >
                      <span>{zipBatch.parts.length > 1 ? t("חלק {n} מתוך {total}", { n: part.partIndex + 1, total: part.partCount }) : t("הקובץ")}</span>
                      {part.status === "ready" && part.downloadUrl ? (
                        <a href={part.downloadUrl} className="font-semibold" style={{ color: "var(--gt-accent)" }}>
                          {t("הורד שוב")}
                        </a>
                      ) : part.status === "failed" ? (
                        <span style={{ color: "var(--gt-rose, #c0392b)" }}>{t("נכשל")}</span>
                      ) : (
                        <span style={{ color: "var(--gt-ink-soft)" }}>
                          {part.totalCount > 0 ? `${Math.round((part.processedCount / part.totalCount) * 100)}%` : t("מכינים...")}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-xs mb-3" style={{ color: "var(--gt-ink-soft)" }}>{t("אפשר לסגור את החלון, ההכנה וההורדה ימשיכו ברקע.")}</p>
                <button
                  onClick={() => setZipPanelOpen(false)}
                  className={`w-full py-3 text-sm font-semibold border ${BTN_PRESS}`}
                  style={{ background: "var(--gt-surface)", borderColor: "var(--gt-border)", color: "var(--gt-ink-soft)", borderRadius: "var(--gt-radius)" }}
                >
                  {t("סגירה")}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxIndex !== null && visiblePhotos[lightboxIndex] && premium && renderPremiumLightbox(lightboxIndex)}
      {lightboxIndex !== null && visiblePhotos[lightboxIndex] && !premium && (
        <div
          className="gf-no-enter fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={() => {
            if (lightboxSwiped.current) {
              lightboxSwiped.current = false;
              return;
            }
            closeLightbox();
          }}
          onTouchStart={handleLightboxTouchStart}
          onTouchEnd={handleLightboxTouchEnd}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
            aria-label={t("סגירה")}
            className={`absolute top-4 end-4 h-9 w-9 rounded-full bg-white/10 text-white flex items-center justify-center ${BTN_PRESS}`}
          >
            <IconClose className="h-4 w-4" />
          </button>
          {allowDownloads && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                downloadPhoto(visiblePhotos[lightboxIndex]);
              }}
              className={`absolute top-4 start-4 h-9 px-3 rounded-full bg-white/10 text-white flex items-center justify-center text-xs font-semibold ${BTN_PRESS}`}
            >
              {t("הורדה")}
            </button>
          )}
          {lightboxIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateLightbox(lightboxIndex - 1);
              }}
              aria-label={t("התמונה הקודמת")}
              className={`absolute start-3 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center text-lg ${BTN_PRESS}`}
            >
              {isRtl ? "›" : "‹"}
            </button>
          )}
          {lightboxIndex < visiblePhotos.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigateLightbox(lightboxIndex + 1);
              }}
              aria-label={t("התמונה הבאה")}
              className={`absolute end-3 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center text-lg ${BTN_PRESS}`}
            >
              {isRtl ? "‹" : "›"}
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={visiblePhotos[lightboxIndex].previewUrl ?? `/api/gallery/${token}/photos/${visiblePhotos[lightboxIndex].id}/preview`}
            alt={visiblePhotos[lightboxIndex].original_filename}
            className="max-w-[90vw] max-h-[85vh] object-contain"
            style={{ viewTransitionName: `photo-${visiblePhotos[lightboxIndex].id}` }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {slideshowOpen && (
        <GallerySlideshow
          photos={slideshowPhotos}
          onClose={() => setSlideshowOpen(false)}
          onDownload={allowDownloads ? () => downloadZip(slideshowPhotos.map((p) => p.id)) : undefined}
          downloading={zipping}
        />
      )}

      {albumOpen && album && (
        <GalleryAlbumProofing
          token={token}
          status={album.status}
          title={album.title}
          coverUrl={album.coverUrl}
          spreads={albumSpreads}
          onClose={() => setAlbumOpen(false)}
        />
      )}
    </>
  );
}

// The premium layout's content column; other themes render their content exactly as before.
function ContentFrame({ premium, children }: { premium: boolean; children: ReactNode }) {
  if (!premium) return <>{children}</>;
  return <div className="mx-auto max-w-[1600px] px-1 sm:px-6 lg:px-10 pt-4 sm:pt-8">{children}</div>;
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={direction === "left" ? "M14.5 5.5L8 12l6.5 6.5" : "M9.5 5.5L16 12l-6.5 6.5"} />
    </svg>
  );
}

function PlayIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" aria-hidden="true">
      <path d="M8 5.5v13l10.5-6.5L8 5.5z" />
    </svg>
  );
}

function ShareIcon({ size = 22, stroke = "var(--gt-ink)" }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 15V3m0 0l-4 4m4-4l4 4" />
      <path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" />
    </svg>
  );
}

function DownloadIcon({ size = 22, stroke = "var(--gt-ink)" }: { size?: number; stroke?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

function PhotoTileOverlays({
  photo,
  selectionMode,
  isSelected,
  toggleFavorite,
  onOpenLabel,
  onDownload,
  inset = 0,
  premium = false,
}: {
  photo: PhotoWithUrl;
  selectionMode: boolean;
  isSelected: boolean;
  toggleFavorite: (photo: PhotoWithUrl) => void;
  onOpenLabel?: (photo: PhotoWithUrl) => void;
  onDownload?: (photo: PhotoWithUrl) => void;
  inset?: number;
  premium?: boolean;
}) {
  const t = useT();
  if (premium) {
    return (
      <PremiumTileOverlays
        photo={photo}
        selectionMode={selectionMode}
        isSelected={isSelected}
        toggleFavorite={toggleFavorite}
        onOpenLabel={onOpenLabel}
        onDownload={onDownload}
        inset={inset}
      />
    );
  }
  const offset = 6 + inset;
  // The diamond (label) button sits at the very bottom-right corner; the download button stacks
  // directly above it in the same corner column, one button-height + gap further up.
  const downloadOffset = offset + 34;
  return (
    <>
      {selectionMode && (
        <div
          className={`absolute h-7 w-7 rounded-full flex items-center justify-center border-2 backdrop-blur-md pointer-events-none ${
            isSelected ? "border-amber-deep" : "border-white/70"
          }`}
          style={{ top: offset, insetInlineEnd: offset, background: isSelected ? "var(--color-amber-deep)" : "rgba(255,255,255,0.25)" }}
        >
          {isSelected && <CheckIcon />}
        </div>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleFavorite(photo);
        }}
        className={`absolute h-8 w-8 rounded-full flex items-center justify-center backdrop-blur-md ${
          photo.is_favorite ? "bg-black/30" : "bg-white/20"
        } ${BTN_PRESS}`}
        style={{ top: offset, insetInlineStart: offset }}
        aria-label={t("סמן כמועדף")}
      >
        <HeartIcon filled={photo.is_favorite} />
      </button>
      {onDownload && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDownload(photo);
          }}
          className={`absolute h-8 w-8 rounded-full flex items-center justify-center backdrop-blur-md bg-white/20 ${BTN_PRESS}`}
          style={{ bottom: downloadOffset, insetInlineStart: offset }}
          aria-label={t("הורדת התמונה")}
          title={t("הורדת התמונה")}
        >
          <DownloadIcon size={18} stroke="#fff" />
        </button>
      )}
      {onOpenLabel && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onOpenLabel(photo);
          }}
          className={`absolute h-8 w-8 rounded-full flex items-center justify-center backdrop-blur-md ${
            photo.custom_label ? "bg-black/30" : "bg-white/20"
          } ${BTN_PRESS}`}
          style={{ bottom: offset, insetInlineStart: offset }}
          aria-label={photo.custom_label ? t("תגית: {label}", { label: photo.custom_label }) : t("הוספת תגית לתמונה")}
          title={photo.custom_label ?? undefined}
        >
          <DiamondIcon filled={!!photo.custom_label} />
        </button>
      )}
    </>
  );
}

// Premium tiles: bare white glyphs in one corner instead of three frosted circles. On a device with
// a mouse they appear on hover (or keyboard focus); a set heart or label always stays visible. On a
// touch screen the heart and label are always there (no hover), and download stays in the lightbox,
// the double-tap menu and the favorites panel, to keep every tile from carrying three icons.
const PREMIUM_GLYPH_SHADOW = "drop-shadow(0 1px 3px rgba(0,0,0,0.45))";
const HOVER_REVEAL = "[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 focus-visible:opacity-100";

function PremiumTileOverlays({
  photo,
  selectionMode,
  isSelected,
  toggleFavorite,
  onOpenLabel,
  onDownload,
  inset = 0,
}: {
  photo: PhotoWithUrl;
  selectionMode: boolean;
  isSelected: boolean;
  toggleFavorite: (photo: PhotoWithUrl) => void;
  onOpenLabel?: (photo: PhotoWithUrl) => void;
  onDownload?: (photo: PhotoWithUrl) => void;
  inset?: number;
}) {
  const t = useT();
  const offset = 2 + inset;
  const glyphBtn = "h-9 w-9 flex items-center justify-center text-white transition-opacity duration-200 focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-white";
  return (
    <>
      {selectionMode && (
        <div
          className="absolute h-6 w-6 rounded-full flex items-center justify-center pointer-events-none"
          style={{
            top: offset + 6,
            insetInlineEnd: offset + 6,
            background: isSelected ? "#232427" : "rgba(255,255,255,0.2)",
            boxShadow: isSelected ? "0 0 0 1.5px #fff" : "inset 0 0 0 1.5px rgba(255,255,255,0.9)",
          }}
        >
          {isSelected && <CheckIcon />}
        </div>
      )}
      <div className="absolute flex items-center" style={{ bottom: offset, insetInlineEnd: offset }}>
        {onOpenLabel && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpenLabel(photo);
            }}
            className={`${glyphBtn} ${photo.custom_label ? "" : HOVER_REVEAL}`}
            style={{ filter: PREMIUM_GLYPH_SHADOW }}
            aria-label={photo.custom_label ? t("תגית: {label}", { label: photo.custom_label }) : t("הוספת תגית לתמונה")}
            title={photo.custom_label ?? undefined}
          >
            <DiamondIcon filled={!!photo.custom_label} size={16} color="#fff" />
          </button>
        )}
        {onDownload && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDownload(photo);
            }}
            className={`${glyphBtn} ${HOVER_REVEAL} [@media(hover:none)]:hidden`}
            style={{ filter: PREMIUM_GLYPH_SHADOW }}
            aria-label={t("הורדת התמונה")}
            title={t("הורדת התמונה")}
          >
            <DownloadIcon size={18} stroke="#fff" />
          </button>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            toggleFavorite(photo);
          }}
          className={`${glyphBtn} ${photo.is_favorite ? "" : HOVER_REVEAL}`}
          style={{ filter: PREMIUM_GLYPH_SHADOW }}
          aria-label={photo.is_favorite ? t("הסרה מהמועדפים") : t("הוספה למועדפים")}
          aria-pressed={photo.is_favorite}
        >
          <HeartIcon filled={photo.is_favorite} size={19} color="#fff" />
        </button>
      </div>
    </>
  );
}

function CheckIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <path d="M5 13l5 5L19 7" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// --gt-heart is set only by themes that define `heart` (premium: ink); every other theme keeps coral.
function HeartIcon({ filled, size = 20, color = "var(--gt-heart, var(--color-coral))" }: { filled: boolean; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 20.5s-7.5-4.6-10-9.2C0.4 8.1 1.7 4.5 5 3.4c2.1-0.7 4.3 0.1 5.6 1.9l1.4 1.9 1.4-1.9c1.3-1.8 3.5-2.6 5.6-1.9 3.3 1.1 4.6 4.7 3 7.9-2.5 4.6-10 9.2-10 9.2z"
        fill={filled ? color : "none"}
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function LabelEditModal({
  photo,
  saving,
  onSave,
  onClose,
}: {
  photo: PhotoWithUrl;
  saving: boolean;
  onSave: (label: string) => void;
  onClose: () => void;
}) {
  const [value, setValue] = useState(photo.custom_label ?? "");
  const t = useT();
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(28, 27, 25, 0.5)" }} onClick={onClose}>
      <div
        className="w-full max-w-xs rounded-2xl p-5 shadow-sheet"
        style={{ background: "var(--gt-surface)", color: "var(--gt-ink)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-bold mb-1">{t("תגית לתמונה")}</h2>
        <p className="text-xs mb-3" style={{ color: "var(--gt-ink-soft)" }}>
          {t("למשל: קנבס, בלוק זכוכית, כדי לספר לצלם/ת מה תרצו לעשות עם התמונה הזו.")}
        </p>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoFocus
          placeholder={t("קנבס")}
          className="w-full rounded-lg border px-3 py-2.5 text-sm mb-4"
          style={{ borderColor: "var(--gt-border)", background: "var(--gt-surface)", color: "var(--gt-ink)" }}
        />
        <div className="flex gap-2">
          <button
            onClick={() => onSave(value)}
            disabled={saving}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold disabled:opacity-60"
            style={{ background: "var(--gt-accent)", color: "var(--gt-accent-ink)" }}
          >
            {saving ? t("שומר...") : t("שמירה")}
          </button>
          <button
            onClick={onClose}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold border"
            style={{ borderColor: "var(--gt-border)", color: "var(--gt-ink-soft)" }}
          >
            {t("ביטול")}
          </button>
        </div>
      </div>
    </div>
  );
}

function DiamondIcon({ filled, size = 18, color = "var(--color-amber-deep)" }: { filled: boolean; size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path
        d="M12 2.5 21 9.5 12 21.5 3 9.5 12 2.5Z"
        fill={filled ? color : "none"}
        stroke={color}
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}
