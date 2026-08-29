"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { readAlbumRotateResume, writeAlbumRotateResume, clearAlbumRotateResume } from "@/lib/albumRotateResume";
import type {
  AlbumBookTemplateRow,
  AlbumElement,
  AlbumFrame,
  AlbumPhotoElement,
  AlbumTemplateRow,
  GalleryAlbumCommentRow,
  GalleryAlbumRow,
  GalleryAlbumSpreadRow,
  GalleryFolderRow,
  GalleryPhotoRow,
  GalleryRow,
  PrintHouseEmailRow,
} from "@/lib/types";
import { withViewTransition, BTN_PRESS } from "@/lib/viewTransition";
import PrintHouseEmailsSettings from "@/components/PrintHouseEmailsSettings";
import ErrorBoundary from "@/components/ErrorBoundary";
import { readDataTransferItems, folderNameFromPath, isHiddenFileName } from "@/lib/fileDrop";
import { ALBUM_STYLE_OPTIONS, type AlbumStyleId } from "@/lib/albumStyleGenerator";
import { usePinchSize } from "@/lib/usePinchColumns";
import { optimizedImageUrl } from "@/lib/imageOptimize";
import { IconGallery, IconTrash } from "@/components/icons/NavIcons";
import { IconClose as IconAlbumClose, IconPalette, IconChat, IconSave as IconAlbumSave, IconWarning, IconPdf, IconImage, IconCheck as IconAlbumCheck, IconRotateDevice } from "@/components/icons/AlbumIcons";
import AlbumSpreadCanvasEditor, { fitFramesToSafeArea, marginInsetPctFor } from "@/components/AlbumSpreadCanvasEditor";
import LiquidProgressBar from "@/components/LiquidProgressBar";
import { isLightTextColor } from "@/lib/textColor";
import {
  fetchCustomOrnaments,
  createCustomOrnamentTab,
  uploadCustomOrnament,
  fetchCustomOrnamentBytes,
  deleteCustomOrnament,
  type CustomOrnamentTab,
} from "@/lib/customOrnaments";
import {
  GALLERY_THEMES,
  COVER_TEXT_POSITIONS,
  COVER_SHAPES,
  FONT_OPTIONS,
  GRID_STYLE_OPTIONS,
  galleryThemeById,
  galleryThemeVars,
  galleryTitleStyle,
  galleryFont,
} from "@/lib/galleryTheme";
import { openWhatsApp } from "@/lib/waLink";
import SendUpdateButton from "@/components/SendUpdateButton";
import GalleryCoverBanner from "@/components/GalleryCoverBanner";
import GallerySlideshow from "@/components/GallerySlideshow";
import { TextPositionIcon, ShapeIcon, GridStyleIcon, PlayIcon } from "@/components/GalleryStyleIcons";
import FaceCircle from "@/components/FaceCircle";
import AlbumEditorGuideModal from "@/components/AlbumEditorGuideModal";
import AlbumSpreadThumbnail from "@/components/AlbumSpreadThumbnail";
import PhotoCullingModal from "@/components/PhotoCullingModal";
import GalleryVideosSection from "@/components/GalleryVideosSection";
import GalleryFtpSection from "@/components/GalleryFtpSection";
import { detectFacesInImageUrl, clusterFaces, type FaceBox } from "@/lib/faceRecognition";
import { GALLERY_EXPIRY_OPTIONS, GALLERY_EXPIRY_OPTIONS_BY_TIER, SUBSCRIPTION_PLANS, type SubscriptionPlan } from "@/lib/stages";
import { ADMIN_EMAIL } from "@/lib/admin";

type PhotoWithUrl = GalleryPhotoRow & { url: string; previewUrl?: string | null };

const CLOSE_ANIMATION_MS = 220;

// Common photo-album print sizes, each with a recommended safe-margin starting point — picking
// one just prefills the width/height/margin fields below, so manual entry (typing different
// numbers, or overriding a preset's values) always stays available on the exact same fields.
const ALBUM_SIZE_PRESETS: { label: string; width: number; height: number; margin: number }[] = [
  { label: "20×20", width: 20, height: 20, margin: 0.4 },
  { label: "20×30", width: 20, height: 30, margin: 0.5 },
  { label: "30×20", width: 30, height: 20, margin: 0.5 },
  { label: "25×25", width: 25, height: 25, margin: 0.5 },
  { label: "30×30", width: 30, height: 30, margin: 0.6 },
  { label: "30×40", width: 30, height: 40, margin: 0.8 },
  { label: "40×30", width: 40, height: 30, margin: 0.8 },
  { label: "54×20", width: 54, height: 20, margin: 0.6 },
  { label: "60×30", width: 60, height: 30, margin: 0.9 },
  { label: "80×30", width: 80, height: 30, margin: 1 },
];

const CELL_SIZE_MIN = 80;
const CELL_SIZE_MAX = 260;
const CELL_SIZE_DEFAULT = 126;

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "bmp", "heic", "heif"];
// iPhones save photos as HEIC by default — an accept list of only "safe" web formats hides those
// photos from Safari's picker entirely (Files/Photos on iOS filters by this exact string), which
// looks like "nothing happens" when uploading from a phone. HEIC/HEIF files are converted to JPEG
// client-side before upload (see convertHeicIfNeeded) so nothing HEIC ever reaches storage.
const ALLOWED_EXTENSIONS_SET = new Set(ALLOWED_EXTENSIONS);
const ALLOWED_ACCEPT = "image/jpeg,image/png,image/gif,image/bmp,image/heic,image/heif";

function isAllowedImageFile(file: File): boolean {
  // Dot-prefixed names (macOS AppleDouble sidecars like "._IMG_1234.jpg", ".DS_Store") keep the
  // real file's extension, so the extension check alone lets them through — reject them here too,
  // as a second guard alongside fileDrop.ts's own filter (this one also covers the plain
  // <input type="file" webkitdirectory> picker path, which doesn't go through fileDrop.ts).
  if (file.name.startsWith(".")) return false;
  const ext = file.name.split(".").pop()?.toLowerCase();
  return !!ext && ALLOWED_EXTENSIONS_SET.has(ext);
}

function isHeicFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "heic" || ext === "heif" || file.type === "image/heic" || file.type === "image/heif";
}

async function convertHeicIfNeeded(file: File): Promise<File> {
  if (!isHeicFile(file)) return file;
  const heic2any = (await import("heic2any")).default;
  const result = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.9 });
  const blob = Array.isArray(result) ? result[0] : result;
  const newName = file.name.replace(/\.(heic|heif)$/i, ".jpg");
  return new File([blob], newName, { type: "image/jpeg" });
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// On iOS/Android tries the OS share sheet (Web Share API) so the user still gets a real "Save to
// Files"/"Save to device" target — plain <a download> isn't reliable on mobile browsers. Every
// other browser (every desktop one) just downloads straight to the Downloads folder, no picker,
// no extra click.
async function downloadBlob(blob: Blob, filename: string, mimeType: string): Promise<void> {
  const isMobileOs = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const nav = navigator as Navigator & { share?: (data: ShareData) => Promise<void>; canShare?: (data: ShareData) => boolean };
  if (isMobileOs && nav.share) {
    try {
      const file = new File([blob], filename, { type: mimeType });
      if (!nav.canShare || nav.canShare({ files: [file] })) {
        await nav.share({ files: [file] });
        return;
      }
    } catch (err) {
      // AbortError = user backed out of the share sheet on purpose — respect that, don't fall
      // back to a surprise auto-download. Any other error (unsupported file type, expired user
      // activation, etc.) falls through to the plain-download path below.
      if (err instanceof Error && err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// Full-screen blocking overlay shown during any single heavy operation (upload / face detection /
// album export) — deliberately has no dismiss affordance (no backdrop-click-to-close, no X
// button): it closes itself the moment the underlying operation's own state clears to null, and
// blocking the rest of the page while it's up is the point (keeps a photographer from kicking off
// a second heavy operation — upload, detection, export — on top of one already running).
function ProgressModal({
  label,
  pct,
  onCancel,
  onBackground,
}: {
  label: string;
  pct: number;
  onCancel: () => void;
  // When provided, offers a way out that doesn't abort the operation — it keeps running, and the
  // caller is expected to surface its own completion (e.g. a toast) once it settles. Only the
  // send-to-print-house flow uses this; every other caller omits it and keeps the modal's
  // original always-blocking behavior unchanged.
  onBackground?: () => void;
}) {
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const clamped = Math.max(0, Math.min(100, Math.round(pct)));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(20,24,20,0.55)" }}>
        {/* Deliberately a fixed dark navy, not `var(--color-ink)` — that token is a TEXT color that
            flips to near-white in dark mode (by design, for use as text-on-dark-background), which
            would turn this white-text-on-dark-card modal illegible the moment the site is in dark
            mode. This card is always dark regardless of site theme, so it needs a color that's
            always dark too. */}
      <div className="relative w-64 rounded-3xl overflow-hidden shadow-sheet" style={{ background: "#201f33" }}>
        {/* Rises from the bottom like a tank filling with water — a second, independent read of
            progress alongside the ring, at the scale of the whole window rather than a thin bar. */}
        <div
          className="absolute inset-x-0 bottom-0 transition-[height] duration-300 ease-linear"
          style={{ height: `${clamped}%`, background: "#1f4d36" }}
        />
        {!confirmingCancel && (
          <button
            onClick={() => setConfirmingCancel(true)}
            aria-label="ביטול הפעולה"
            className="absolute top-3 left-3 z-10 h-7 w-7 rounded-full flex items-center justify-center bg-rose text-white"
          >
            <svg viewBox="0 0 24 24" width={13} height={13} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}
        {confirmingCancel ? (
          <div className="relative flex flex-col items-center gap-4 px-6 py-9 text-white text-center">
            <div className="text-sm font-semibold">לבטל את הפעולה?</div>
            <div className="text-xs opacity-70">{label} עדיין באמצע — הביטול לא ניתן לשחזור.</div>
            <div className="flex gap-2 w-full mt-2">
              <button onClick={() => setConfirmingCancel(false)} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white/10">
                המשך
              </button>
              <button onClick={onCancel} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-rose text-white">
                ביטול הפעולה
              </button>
            </div>
          </div>
        ) : (
          <div className="relative flex flex-col items-center gap-4 px-6 py-9 text-white text-center">
            <svg viewBox="0 0 100 100" width={112} height={112} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={50} cy={50} r={radius} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={8} />
              <circle
                cx={50}
                cy={50}
                r={radius}
                fill="none"
                stroke="#fff"
                strokeWidth={8}
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                style={{ transition: "stroke-dashoffset 300ms linear" }}
              />
              <text x={50} y={51} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight={700} fill="#fff" style={{ transform: "rotate(90deg)", transformOrigin: "50px 50px" }} className="font-data">
                {clamped}%
              </text>
            </svg>
            <div>
              <div className="text-sm font-semibold">המערכת מבצעת {label}</div>
              <div className="text-xs opacity-70 mt-1">החלון ייסגר אוטומטית בסיום הפעולה</div>
            </div>
            {onBackground && (
              <button onClick={onBackground} className="text-xs font-semibold underline underline-offset-2 opacity-80">
                המשך ברקע
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function GalleryManageView({
  eventId,
  clientName,
  eventDate,
  initialGallery,
  initialPhotos,
  initialFolders,
  photographerName,
  photographerEmail,
  photographerPlan,
}: {
  eventId: string | null;
  clientName: string;
  eventDate: string | null;
  initialGallery: GalleryRow;
  initialPhotos: PhotoWithUrl[];
  initialFolders: GalleryFolderRow[];
  photographerName: string;
  photographerEmail: string;
  photographerPlan: SubscriptionPlan;
}) {
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const [gallery, setGallery] = useState(initialGallery);
  const [photos, setPhotos] = useState(initialPhotos);
  const [folders, setFolders] = useState(initialFolders);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editFolderName, setEditFolderName] = useState("");
  const [deleteFolderConfirm, setDeleteFolderConfirm] = useState<GalleryFolderRow | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mgrAspectRatios, setMgrAspectRatios] = useState<Record<string, number>>({});
  // Loads every visible thumbnail behind the scenes and reveals the whole grid together once
  // they're all in (or after a timeout, so one slow/broken image can't hold the rest hostage
  // forever) — replaces the previous one-by-one pop-in with a single moment where the gallery just
  // appears, which is what was actually asked for ("all photos at once, not a waterfall").
  const [thumbsReady, setThumbsReady] = useState(false);
  const loadedThumbIdsRef = useRef<Set<string>>(new Set());
  const fullImagePrefetchedKeyRef = useRef<string | null>(null);

  // Shared across upload/face-detection/export — only one of those can be running at a time (the
  // ProgressModal itself blocks starting a second), so one flag + one AbortController is enough.
  // The loop-based operations (upload, face detection) poll the flag between items and stop
  // starting new ones; export is a single request, so it's aborted directly instead.
  const cancelRequestedRef = useRef(false);
  // Set when a photo upload batch stops because the browser actually went offline (as opposed to
  // the photographer pressing cancel, or one file failing outright) — lets uploadResolvedFiles
  // show a specific "no network connection" message instead of the generic per-file failure list.
  const offlineAbortedRef = useRef(false);
  const exportAbortControllerRef = useRef<AbortController | null>(null);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapPhotoId = useRef<string | null>(null);
  const DOUBLE_TAP_MS = 300;

  // Called the instant a pinch (2nd finger) is detected, so a single-touch long-press/tap
  // that already started on a photo doesn't fire mid-pinch.
  const cancelPendingGestures = () => {
    if (pressTimer.current) {
      clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    longPressFired.current = false;
    if (tapTimer.current) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
    }
    lastTapPhotoId.current = null;
  };

  const {
    size: cellSize,
    setSize: setCellSize,
    containerRef: pinchContainerRef,
    activeTouchesRef,
  } = usePinchSize(CELL_SIZE_DEFAULT, CELL_SIZE_MIN, CELL_SIZE_MAX, cancelPendingGestures);
  // Desktop starts at the largest thumbnail size (pinch-to-zoom isn't available with a mouse, so
  // there's no reason to default small); phones keep CELL_SIZE_DEFAULT since pinch makes resizing
  // trivial there. Set post-mount (not as the hook's initialSize) to avoid an SSR/client mismatch.
  useEffect(() => {
    if (window.innerWidth >= 1024) setCellSize(CELL_SIZE_MAX);
  }, [setCellSize]);
  // "Back to top" fab: this page has no inner scroll container, it scrolls with the window, so
  // window.scrollY against the page's full scrollable height gives the actual scroll percentage.
  const [showScrollTop, setShowScrollTop] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      const pct = scrollable > 0 ? (window.scrollY / scrollable) * 100 : 0;
      setShowScrollTop(pct >= 15);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(searchParams.get("favorites") === "1");
  const [zippingFavorites, setZippingFavorites] = useState(false);
  const [cullingIndex, setCullingIndex] = useState<number | null>(null);
  const [showRejectedOnly, setShowRejectedOnly] = useState(false);
  const [portfolioCategoryPhoto, setPortfolioCategoryPhoto] = useState<PhotoWithUrl | null>(null);
  const [portfolioCategoryInput, setPortfolioCategoryInput] = useState("");
  const [faceClusters, setFaceClusters] = useState<{ clusterId: string; photoIds: Set<string>; representative: { photoId: string; box: FaceBox } }[]>([]);
  const [faceFilterClusterId, setFaceFilterClusterId] = useState<string | null>(null);
  const [detectingFaces, setDetectingFaces] = useState(false);
  const [faceProgress, setFaceProgress] = useState<{ done: number; total: number } | null>(null);
  const [faceError, setFaceError] = useState<string | null>(null);
  // Legacy galleries (created before migration 0084) can have expiry_days = null, meaning "store
  // indefinitely" — grandfathered, not force-migrated. The select below shows a sensible default
  // for display, but state stays null until the photographer deliberately picks a new value, which
  // is what lets the DB trigger (enforce_gallery_expiry_by_plan) tell "unrelated settings edit on
  // an old gallery" apart from "actually changing the retention window."
  const [expiryDays, setExpiryDays] = useState<7 | 14 | 30 | 90 | 180 | null>(initialGallery.expiry_days);
  const isFramePlusTier = SUBSCRIPTION_PLANS[photographerPlan].tier === "studio_pro" || photographerEmail === ADMIN_EMAIL;
  const galleryExpiryOptions = GALLERY_EXPIRY_OPTIONS_BY_TIER[isFramePlusTier ? "studio_pro" : "standard"];
  const [uploading, setUploading] = useState<string | null>(null);
  // 0..100 while a batch upload is running, mirroring how many of the batch's items are done —
  // drives the bottle-green fill effect on the drop-zone so the photographer sees actual progress,
  // not just a static "מעלה X מתוך Y" label. null when no upload is in progress.
  const [uploadProgressPct, setUploadProgressPct] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [justPublished, setJustPublished] = useState(false);
  const [sendingGalleryUpdate, setSendingGalleryUpdate] = useState(false);
  const [uploadJustFinished, setUploadJustFinished] = useState<number | null>(null);
  const [sendingUploadUpdate, setSendingUploadUpdate] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(initialGallery.title);
  const [editShootDate, setEditShootDate] = useState(initialGallery.shoot_date ?? "");
  const [editClientEmail, setEditClientEmail] = useState(initialGallery.client_email ?? "");
  const [editClientPhone, setEditClientPhone] = useState(initialGallery.client_phone ?? "");
  const [editAllowDownloads, setEditAllowDownloads] = useState(initialGallery.allow_downloads);
  const [savingSettings, setSavingSettings] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [actionSheetPhoto, setActionSheetPhoto] = useState<PhotoWithUrl | null>(null);
  const [deleteConfirmPhoto, setDeleteConfirmPhoto] = useState<PhotoWithUrl | null>(null);
  const [deleteSelectedConfirmOpen, setDeleteSelectedConfirmOpen] = useState(false);
  const [deleteSelectedConfirmClosing, setDeleteSelectedConfirmClosing] = useState(false);
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareView, setShareView] = useState<"main" | "qr">("main");
  const [shareSelectedFolders, setShareSelectedFolders] = useState<Set<string>>(new Set());
  const [shareQuality, setShareQuality] = useState<"full" | "web">("full");
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const NO_FOLDER_KEY = "none";
  const [theme, setTheme] = useState(initialGallery.theme);
  const [coverTextPosition, setCoverTextPosition] = useState(initialGallery.cover_text_position);
  const [coverShape, setCoverShape] = useState(initialGallery.cover_shape);
  const [coverPhotoId, setCoverPhotoId] = useState(initialGallery.cover_photo_id);
  const [titleFontOverride, setTitleFontOverride] = useState(initialGallery.title_font_override);
  const [gridStyleOverride, setGridStyleOverride] = useState(initialGallery.grid_style_override);
  const [slideshowManageOpen, setSlideshowManageOpen] = useState(false);
  const [slideshowPhotoIds, setSlideshowPhotoIds] = useState<Set<string>>(new Set(initialGallery.slideshow_photo_ids));
  const [slideshowPreviewOpen, setSlideshowPreviewOpen] = useState(false);
  const [albumManageOpen, setAlbumManageOpen] = useState(false);
  const albumManageOpenedAtRef = useRef(0);
  // Defaults to a smaller centered dialog rather than the old always-near-fullscreen size, so it
  // never risks being clipped by a short viewport — the photographer opts into fullscreen instead.
  const [albumManageFullscreen, setAlbumManageFullscreen] = useState(true);
  // This "עיצוב אלבום" screen (and the canvas editor it opens into) is meant to be the exact SAME
  // tool on a phone/tablet as on desktop — not a cut-down variant, just resized. Real desktop
  // (≥1024px) is untouched. See the <style> block down where this panel is rendered, and the fuller
  // history in AlbumSpreadCanvasEditor.tsx's own matching comment, for why the resize itself is
  // done with real vw/vh dimensions rather than `zoom`/`transform: scale()` — both were tried and
  // both left a real standalone-iOS-PWA device mistapping several rows below the visible button.
  const [albumViewportSize, setAlbumViewportSize] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  useEffect(() => {
    const update = () => setAlbumViewportSize({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);
  // A real phone (short side ≤500px, comfortably above phones' ~430pt and below tablets' ~768pt+)
  // gets its header action buttons a bit bigger than they'd otherwise be — only used for this
  // cosmetic nudge, so a brief stale read here just means a button is very slightly the wrong size
  // for a moment, never a mis-click.
  const isAlbumPhone = albumViewportSize.w < 1024 && Math.min(albumViewportSize.w, albumViewportSize.h) <= 500;
  // A phone always opens this modal in portrait (that's how it's normally held) but the panel is
  // only designed for landscape — this shows a rotate-prompt instead of mounting the panel at all
  // until the device already reports landscape, both for that UX reason and so the panel never has
  // to also carry a portrait layout of its own. matchMedia's own "change" event is used instead of
  // resize/orientationchange because it's tied to the same native media-query evaluation the CSS
  // below relies on, not a JS-buffered dimension read.
  //
  // Three phases, not just a boolean — see the matching, fuller comment on AlbumSpreadCanvasEditor's
  // own `phase` state for why: opening directly into landscape goes straight to "ready" (confirmed
  // working), but portrait→landscape passes through a brief, deliberately VISIBLE "settling" loading
  // screen first, so the real panel's first-ever mount always happens on its own frame, strictly
  // after rotation completes and the prompt is gone — never possibly hidden underneath it.
  const [albumPhase, setAlbumPhase] = useState<"portrait" | "settling" | "ready">(() =>
    typeof window === "undefined"
      ? "ready"
      : window.matchMedia("(max-width: 1023.98px) and (orientation: portrait)").matches
        ? "portrait"
        : "ready"
  );
  // The mql "change" listener itself is wired up further below, once canvasEditorTarget (also
  // needed there) is in scope — see the comment there for what it does beyond just this timeout.
  const albumPhaseRef = useRef(albumPhase);
  useEffect(() => {
    albumPhaseRef.current = albumPhase;
  }, [albumPhase]);
  useEffect(() => {
    if (albumPhase !== "settling") return;
    const t = setTimeout(() => setAlbumPhase("ready"), 500);
    return () => clearTimeout(t);
  }, [albumPhase]);
  // This component itself stays mounted for the whole page visit — only `albumManageOpen` toggles
  // when the tool opens and closes — so albumPhase's own useState initializer above only ever runs
  // once, at page load. If that single read ever landed stale (a resize mid-flight, the tab
  // resuming from background), every later open of the tool would keep replaying that one wrong
  // answer forever, since no further orientation "change" event is guaranteed to fire. Re-checking
  // matchMedia fresh on each actual open closes that gap cheaply, without needing the tool itself
  // to unmount/remount just to get a second chance at a correct read.
  useEffect(() => {
    if (!albumManageOpen) return;
    const isPortraitNow = window.matchMedia("(max-width: 1023.98px) and (orientation: portrait)").matches;
    setAlbumPhase((prev) => (isPortraitNow ? "portrait" : prev === "ready" ? prev : "ready"));
  }, [albumManageOpen]);
  const albumNeedsRotate = albumPhase === "portrait";
  const [albumGuideOpen, setAlbumGuideOpen] = useState(false);
  const [albumLoading, setAlbumLoading] = useState(false);
  const [album, setAlbum] = useState<GalleryAlbumRow | null>(null);
  const [albumSpreads, setAlbumSpreads] = useState<GalleryAlbumSpreadRow[]>([]);
  const [albumComments, setAlbumComments] = useState<GalleryAlbumCommentRow[]>([]);
  const [albumSizeDraft, setAlbumSizeDraft] = useState({ width: 30, height: 20, margin: 0.5 });
  const [albumBookTemplates, setAlbumBookTemplates] = useState<AlbumBookTemplateRow[]>([]);
  const [albumWizardMode, setAlbumWizardMode] = useState<"style" | "saved">("style");
  const [albumStyleDraft] = useState<AlbumStyleId>("classic");
  const [buildingAlbumBook, setBuildingAlbumBook] = useState(false);
  const [saveBookTemplateOpen, setSaveBookTemplateOpen] = useState(false);
  const [bookTemplateNameDraft, setBookTemplateNameDraft] = useState("");
  const [savingBookTemplate, setSavingBookTemplate] = useState(false);
  const [confirmNewAlbumOpen, setConfirmNewAlbumOpen] = useState(false);
  const [creatingSpread, setCreatingSpread] = useState(false);
  const [draggedSpreadId, setDraggedSpreadId] = useState<string | null>(null);
  const [exportingAlbumPdf, setExportingAlbumPdf] = useState(false);
  const [exportingAlbumJpg, setExportingAlbumJpg] = useState(false);
  const [exportingAlbumPsd, setExportingAlbumPsd] = useState(false);
  const [exportProgressPdf, setExportProgressPdf] = useState<number | null>(null);
  const [exportProgressJpg, setExportProgressJpg] = useState<number | null>(null);
  const [exportProgressPsd, setExportProgressPsd] = useState<number | null>(null);
  const [exportRangeFormat, setExportRangeFormat] = useState<"pdf" | "jpg" | "psd" | null>(null);
  const [exportRangeFrom, setExportRangeFrom] = useState(1);
  const [exportRangeTo, setExportRangeTo] = useState(1);
  // Only JPG ever goes to a print house — loaded lazily (on first open) rather than up front,
  // since most gallery-management page loads never touch this feature at all.
  const [printHouseEmails, setPrintHouseEmails] = useState<PrintHouseEmailRow[]>([]);
  const [printHouseEmailsLoaded, setPrintHouseEmailsLoaded] = useState(false);
  const [printHouseModalOpen, setPrintHouseModalOpen] = useState(false);
  const [printHouseSelectedId, setPrintHouseSelectedId] = useState<string | null>(null);
  const [printHouseConfirmOpen, setPrintHouseConfirmOpen] = useState(false);
  const [sendingToPrintHouse, setSendingToPrintHouse] = useState(false);
  const [printHouseSendProgress, setPrintHouseSendProgress] = useState<number | null>(null);
  // Decoupled from `sendingToPrintHouse` on purpose — "המשך ברקע" hides the progress modal
  // without touching the actual in-flight send, which keeps running and reports via a toast.
  const [printHouseProgressVisible, setPrintHouseProgressVisible] = useState(false);
  const [printHouseToast, setPrintHouseToast] = useState<string | null>(null);
  const printHouseAbortControllerRef = useRef<AbortController | null>(null);
  const [savingAlbumSize, setSavingAlbumSize] = useState(false);
  const [canvasEditorTarget, setCanvasEditorTarget] = useState<{ spreadId: string; mode: "overlay" | "custom" } | null>(null);
  // Whether the custom-ornament-tabs fetch has ever completed for THIS mounted instance of the
  // page — a plain ref, not state, and deliberately never reset once true. The previous version of
  // this compared canvasEditorTarget by object identity instead, meant to close a one-frame flash
  // on the very first open — but that identity check re-triggered a full reload-and-spinner on
  // EVERY canvasEditorTarget change, including ordinary page switches inside an already-open editor
  // (a new {spreadId, mode} object is a new reference even when nothing meaningful changed), which
  // left the tool stuck reloading on every click. Ornament tabs don't change page-to-page within
  // the same album anyway, so there was never a reason to refetch on switch — this only ever loads
  // once, the very first time the album tool opens, matching "only at the start" exactly.
  const ornamentsFetchedRef = useRef(false);
  const [customOrnamentsLoading, setCustomOrnamentsLoading] = useState(false);
  // Real fix for the standalone-iOS-PWA-only mistap: on the portrait→landscape edge (not just any
  // landscape state) while either album tool is actually open, instead of settling in place this
  // hands off to src/lib/albumRotateResume.ts and leaves the page entirely — see that file for why
  // a real route navigation, not any in-place remount, is what a real device needed. albumPhaseRef
  // (synced above) is read instead of a dependency on albumPhase itself so this doesn't need to
  // resubscribe on every phase change, only when what's open (and thus what to hand off) changes.
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023.98px) and (orientation: portrait)");
    const update = () => {
      if (mql.matches) {
        setAlbumPhase("portrait");
        return;
      }
      const wasPortrait = albumPhaseRef.current === "portrait";
      if (wasPortrait && (albumManageOpen || canvasEditorTarget)) {
        writeAlbumRotateResume(
          canvasEditorTarget
            ? { galleryId: gallery.id, kind: "canvas", spreadId: canvasEditorTarget.spreadId, mode: canvasEditorTarget.mode }
            : { galleryId: gallery.id, kind: "manage" }
        );
        setAlbumPhase("settling");
        router.push("/galleries");
        return;
      }
      setAlbumPhase((prev) => (prev === "portrait" ? "settling" : prev === "settling" ? prev : "ready"));
    };
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, [albumManageOpen, canvasEditorTarget, gallery.id, router]);
  // The landing side of that same round trip: GalleriesListView bounced straight back here once it
  // saw this pending intent, so by now orientation is already confirmed landscape (that's what
  // triggered the hand-off in the first place) — this just replays "open the tool" on this fresh
  // page instance, which is exactly the "opened directly into landscape" case that's always worked.
  const [resumingAfterRotate, setResumingAfterRotate] = useState(false);
  const pendingCanvasResumeRef = useRef<{ spreadId: string; mode: "overlay" | "custom" } | null>(null);
  useEffect(() => {
    const intent = readAlbumRotateResume();
    if (!intent || intent.galleryId !== gallery.id) return;
    clearAlbumRotateResume();
    setResumingAfterRotate(true);
    if (intent.kind === "canvas") pendingCanvasResumeRef.current = { spreadId: intent.spreadId, mode: intent.mode };
    openAlbumManage();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, []);
  useEffect(() => {
    if (!resumingAfterRotate || albumLoading) return;
    const pending = pendingCanvasResumeRef.current;
    if (pending) {
      pendingCanvasResumeRef.current = null;
      const match = albumSpreads.find((s) => s.id === pending.spreadId);
      if (match) setCanvasEditorTarget({ spreadId: pending.spreadId, mode: pending.mode });
    }
    setResumingAfterRotate(false);
  }, [resumingAfterRotate, albumLoading, albumSpreads]);
  const [albumTemplates, setAlbumTemplates] = useState<AlbumTemplateRow[]>([]);
  const [savingAlbum, setSavingAlbum] = useState(false);
  const [savingSlideshow, setSavingSlideshow] = useState(false);
  const [customOrnamentTabs, setCustomOrnamentTabs] = useState<CustomOrnamentTab[]>([]);
  const [customOrnaments, setCustomOrnaments] = useState<{ id: string; tab_id: string; url: string }[]>([]);
  // "יצירת כריכה" — anchored below its own button, same slide pattern as the canvas editor's
  // מסכות/עיטורים/צורות panels: either the album's own size, or a custom one-off size stored on
  // just that spread (see gallery_album_spreads.width_cm/height_cm).
  const [coverPanelOpen, setCoverPanelOpen] = useState(false);
  const [coverPanelClosing, setCoverPanelClosing] = useState(false);
  const [coverPanelRect, setCoverPanelRect] = useState<{ top: number; left: number; width: number } | null>(null);
  const coverButtonRef = useRef<HTMLButtonElement>(null);
  const [coverCustomMode, setCoverCustomMode] = useState(false);
  const [coverCustomWidth, setCoverCustomWidth] = useState(20);
  const [coverCustomHeight, setCoverCustomHeight] = useState(20);

  const toggleSlideshowPhoto = (id: string) => {
    setSlideshowPhotoIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelect = (photoId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(photoId)) next.delete(photoId);
      else next.add(photoId);
      return next;
    });
  };
  const selectAllVisible = () => setSelectedIds(new Set(visiblePhotos.map((p) => p.id)));
  const clearSelection = () => setSelectedIds(new Set());
  // The page-load signed URLs (photo.url) are generated in one fast batched call without a
  // per-file download filename (that's a display-only optimization) — downloads fetch their own
  // freshly-named signed URL on demand instead, since that only happens for the handful of
  // photos actually being downloaded, not the whole gallery.
  const downloadPhotoNow = async (photo: PhotoWithUrl) => {
    const res = await fetch("/api/storage/download-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: "galleries", path: photo.storage_path, filename: photo.original_filename }),
    });
    const data = await res.json();
    if (!res.ok || !data.url) return;
    // Some engines (WebKit especially) don't reliably fire an <a>'s default navigation from
    // .click() unless the element is actually attached to the document.
    const a = document.createElement("a");
    a.href = data.url;
    a.download = photo.original_filename;
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const downloadSelectedPhotos = () => {
    const selected = photos.filter((p) => selectedIds.has(p.id));
    selected.forEach((photo, i) => {
      setTimeout(() => downloadPhotoNow(photo), i * 150);
    });
  };

  // Turns flat gallery_photo_faces rows into one summary per cluster: every photo id the cluster
  // appears in (for filtering) plus a single representative face (the largest detected box, since
  // that's usually the clearest/closest crop) to render as the circle's avatar.
  const buildClusterSummaries = (
    rows: { photo_id: string; cluster_id: string; box_x: number; box_y: number; box_width: number; box_height: number }[]
  ) => {
    const byCluster = new Map<string, typeof rows>();
    for (const row of rows) {
      const list = byCluster.get(row.cluster_id) ?? [];
      list.push(row);
      byCluster.set(row.cluster_id, list);
    }
    return Array.from(byCluster.entries()).map(([clusterId, members]) => {
      const best = members.reduce((a, b) => (a.box_width * a.box_height >= b.box_width * b.box_height ? a : b));
      return {
        clusterId,
        photoIds: new Set(members.map((m) => m.photo_id)),
        representative: { photoId: best.photo_id, box: { x: best.box_x, y: best.box_y, width: best.box_width, height: best.box_height } },
      };
    });
  };

  // Loads whatever face-detection results are already cached for this gallery (from a previous
  // run) so the circles row appears instantly without re-running detection every visit.
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("gallery_photo_faces").select("photo_id, cluster_id, box_x, box_y, box_width, box_height").eq("gallery_id", gallery.id);
      if (data && data.length > 0) setFaceClusters(buildClusterSummaries(data));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gallery.id]);

  const runFaceDetection = async () => {
    if (detectingFaces) return;
    setDetectingFaces(true);
    setFaceError(null);
    setFaceProgress({ done: 0, total: photos.length });
    cancelRequestedRef.current = false;
    let succeeded = true;
    let cancelled = false;
    try {
      const allFaces: { photoId: string; box: FaceBox; descriptor: number[] }[] = [];
      for (let i = 0; i < photos.length; i++) {
        if (cancelRequestedRef.current) {
          cancelled = true;
          break;
        }
        const photo = photos[i];
        try {
          const faces = await detectFacesInImageUrl(`/api/galleries/${gallery.id}/photos/${photo.id}/image`);
          for (const face of faces) allFaces.push({ photoId: photo.id, ...face });
        } catch {
          // A single unreadable photo shouldn't sink detection for the rest of the gallery.
        }
        setFaceProgress({ done: i + 1, total: photos.length });
      }
      if (cancelled) {
        succeeded = false;
        return;
      }
      const clusters = clusterFaces(allFaces);
      await supabase.from("gallery_photo_faces").delete().eq("gallery_id", gallery.id);
      const rows = clusters.flatMap((cluster) =>
        cluster.members.map((member) => ({
          gallery_id: gallery.id,
          photo_id: member.photoId,
          cluster_id: cluster.clusterId,
          box_x: member.box.x,
          box_y: member.box.y,
          box_width: member.box.width,
          box_height: member.box.height,
          descriptor: member.descriptor,
        }))
      );
      if (rows.length > 0) {
        const { error } = await supabase.from("gallery_photo_faces").insert(rows);
        if (error) throw error;
      }
      setFaceClusters(buildClusterSummaries(rows));
      setFaceFilterClusterId(null);
    } catch {
      setFaceError("שגיאה בזיהוי הפרצופים");
      succeeded = false;
    } finally {
      // Same "hold the full green fill for a beat so completion actually registers" pattern as the
      // gallery upload progress bar — skipped on failure so a red-flagged error doesn't also flash
      // a contradictory "done" fill.
      if (succeeded) {
        setFaceProgress({ done: photos.length, total: photos.length });
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      setDetectingFaces(false);
      setFaceProgress(null);
    }
  };

  // One zip, organized into a subfolder per tab — same shared endpoint the client-facing gallery
  // uses, except the photographer's own session bypasses the published/allow-downloads gates
  // (those control what the client can do, not what the photographer can do with their own data).
  //
  // Submitted as a real form POST instead of fetch()+blob() so the browser streams the response
  // straight to disk instead of buffering the whole zip in JS memory first — a large gallery's
  // full-res zip can run into the gigabytes, which silently hangs forever on mobile Safari's
  // ~1-1.5GB per-tab memory ceiling (the same bug that was hitting the client-facing gallery).
  // There's no response body to read back on failure this way, so this only does the cheap
  // pre-flight check and otherwise trusts the same download-zip route the client-facing gallery
  // already relies on.
  const downloadPhotosZip = (photoIds: string[]) => {
    if (photoIds.length === 0 || zippingFavorites) return;
    setZippingFavorites(true);
    const form = document.createElement("form");
    form.method = "POST";
    form.action = `/api/gallery/${gallery.access_token}/download-zip`;
    form.style.display = "none";
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = "photoIds";
    input.value = JSON.stringify(photoIds);
    form.appendChild(input);
    document.body.appendChild(form);
    form.submit();
    form.remove();
    setTimeout(() => setZippingFavorites(false), 2000);
  };

  const downloadFavoritesZip = () => downloadPhotosZip(photos.filter((p) => p.is_favorite).map((p) => p.id));
  const downloadSlideshowZip = () => downloadPhotosZip([...slideshowPhotoIds]);

  const loadAlbum = async () => {
    setAlbumLoading(true);
    const { data: albumRow } = await supabase
      .from("gallery_albums")
      .select("*")
      .eq("gallery_id", gallery.id)
      .maybeSingle<GalleryAlbumRow>();
    setAlbum(albumRow);
    if (albumRow) {
      const [{ data: spreads }, { data: comments }] = await Promise.all([
        supabase
          .from("gallery_album_spreads")
          .select("*")
          .eq("album_id", albumRow.id)
          .order("sort_order")
          .returns<GalleryAlbumSpreadRow[]>(),
        supabase
          .from("gallery_album_comments")
          .select("*")
          .eq("album_id", albumRow.id)
          .order("created_at")
          .returns<GalleryAlbumCommentRow[]>(),
      ]);
      setAlbumSpreads(spreads ?? []);
      setAlbumComments(comments ?? []);
    } else {
      setAlbumSpreads([]);
      setAlbumComments([]);
    }
    setAlbumLoading(false);
  };

  const openAlbumManage = () => {
    // Guards against the backdrop's own click-to-close firing from the very click that opened
    // this modal — on a gallery with a large `photos` array the first render/commit of the
    // modal's content (which the whole array gets passed into) can be slow enough that the
    // opening click is still resolving when the backdrop mounts underneath it, closing the
    // modal the instant it appears. A short grace window after open is enough to absorb that.
    albumManageOpenedAtRef.current = Date.now();
    setAlbumManageOpen(true);
    setAlbumWizardMode("style");
    loadAlbum();
    supabase
      .from("album_templates")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<AlbumTemplateRow[]>()
      .then(({ data }) => setAlbumTemplates(data ?? []));
    supabase
      .from("album_book_templates")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<AlbumBookTemplateRow[]>()
      .then(({ data }) => setAlbumBookTemplates(data ?? []));
  };

  const saveAlbumTemplate = async (name: string, frames: AlbumFrame[]) => {
    const { data, error } = await supabase
      .from("album_templates")
      .insert({ photographer_id: gallery.photographer_id, name, frames })
      .select()
      .single<AlbumTemplateRow>();
    if (!error && data) setAlbumTemplates((prev) => [data, ...prev]);
  };

  // Step 1 of album creation: the photographer sets the physical print dimensions up front, before
  // picking any photos or pages — creates an empty album (no spreads yet) with those dimensions.
  const createAlbumWithSize = async () => {
    setSavingAlbum(true);
    const { data: newAlbum, error: albumErr } = await supabase
      .from("gallery_albums")
      .insert({
        gallery_id: gallery.id,
        photographer_id: gallery.photographer_id,
        width_cm: albumSizeDraft.width,
        height_cm: albumSizeDraft.height,
        safe_margin_cm: albumSizeDraft.margin,
      })
      .select()
      .single<GalleryAlbumRow>();
    if (albumErr || !newAlbum) {
      setError(albumErr?.message ?? "שגיאה ביצירת האלבום");
      setSavingAlbum(false);
      return;
    }
    setAlbum(newAlbum);
    setAlbumSpreads([]);
    setAlbumComments([]);
    setSavingAlbum(false);
  };

  // Shared by both wizard modes below: turns a list of per-page frame layouts into real spread
  // rows in one batch insert (every frame photoId-less — same "empty placeholder" state a single
  // template application produces), and loads the result straight into state.
  const insertSpreadsFromFrameLists = async (targetAlbum: GalleryAlbumRow, pagesFrames: AlbumFrame[][]) => {
    const marginInset = marginInsetPctFor(targetAlbum);
    // photo_id_1 is a NOT NULL anchor column left over from before custom layouts existed (see
    // migration 0048's comment) — unused for rendering here since every frame is its own
    // photoId-less placeholder, but still has to be set to *something*. Cycles through the
    // gallery's own photos so pages don't all point at the same one.
    const rows = pagesFrames.map((rawFrames, i) => {
      const frames = fitFramesToSafeArea(rawFrames, marginInset);
      const elements: AlbumElement[] = frames.map((f) => ({
        id: f.id,
        type: "photo",
        photoId: null,
        xPct: f.xPct,
        yPct: f.yPct,
        widthPct: f.widthPct,
        heightPct: f.heightPct,
        focalX: 50,
        focalY: 50,
        rotation: f.rotation,
        borderWidth: f.borderWidth,
        borderColor: f.borderColor,
        shadow: f.shadow,
      }));
      return {
        album_id: targetAlbum.id,
        sort_order: i,
        layout: "custom" as const,
        elements,
        photo_id_1: photos[i % photos.length]?.id,
      };
    });
    const { data, error } = await supabase.from("gallery_album_spreads").insert(rows).select().returns<GalleryAlbumSpreadRow[]>();
    if (error) {
      setError(error.message);
      return;
    }
    if (data) setAlbumSpreads(data.sort((a, b) => a.sort_order - b.sort_order));
  };

  // Wizard step 1, "style" mode: creates the album with a single blank custom page (instead of a
  // full pre-templated book) — the photographer picks a ready template or builds the page
  // themselves from there, then adds more pages one at a time as they go. Drops straight into the
  // free-design editor for that first page so there's no extra click back through an
  // otherwise-empty album view.
  const buildStyledAlbum = async () => {
    setBuildingAlbumBook(true);
    setError(null);
    const { data: newAlbum, error: albumErr } = await supabase
      .from("gallery_albums")
      .insert({
        gallery_id: gallery.id,
        photographer_id: gallery.photographer_id,
        width_cm: albumSizeDraft.width,
        height_cm: albumSizeDraft.height,
        safe_margin_cm: albumSizeDraft.margin,
      })
      .select()
      .single<GalleryAlbumRow>();
    if (albumErr || !newAlbum) {
      setError(albumErr?.message ?? "שגיאה ביצירת האלבום");
      setBuildingAlbumBook(false);
      return;
    }
    setAlbum(newAlbum);
    const { data: spreadRows, error: spreadErr } = await supabase
      .from("gallery_album_spreads")
      .insert({ album_id: newAlbum.id, sort_order: 0, layout: "custom", elements: [], photo_id_1: photos[0]?.id })
      .select()
      .returns<GalleryAlbumSpreadRow[]>();
    if (spreadErr) {
      setError(spreadErr.message);
      setBuildingAlbumBook(false);
      return;
    }
    if (spreadRows) {
      setAlbumSpreads(spreadRows);
      setCanvasEditorTarget({ spreadId: spreadRows[0].id, mode: "custom" });
    }
    setBuildingAlbumBook(false);
  };

  // Wizard step 1, "saved template" mode: same album creation, but the page layouts come from a
  // previously saved whole-book template instead of a fresh style-based generation.
  const buildAlbumFromBookTemplate = async (template: AlbumBookTemplateRow) => {
    setBuildingAlbumBook(true);
    setError(null);
    const { data: newAlbum, error: albumErr } = await supabase
      .from("gallery_albums")
      .insert({
        gallery_id: gallery.id,
        photographer_id: gallery.photographer_id,
        width_cm: albumSizeDraft.width,
        height_cm: albumSizeDraft.height,
        safe_margin_cm: albumSizeDraft.margin,
      })
      .select()
      .single<GalleryAlbumRow>();
    if (albumErr || !newAlbum) {
      setError(albumErr?.message ?? "שגיאה ביצירת האלבום");
      setBuildingAlbumBook(false);
      return;
    }
    setAlbum(newAlbum);
    await insertSpreadsFromFrameLists(newAlbum, template.pages);
    setBuildingAlbumBook(false);
  };

  // Saves the album's CURRENT full set of pages (whatever their frame shapes are right now,
  // regardless of how they got there) as one reusable named whole-book template.
  const saveAlbumBookTemplate = async (name: string) => {
    if (!name.trim() || albumSpreads.length === 0) return;
    setSavingBookTemplate(true);
    const pages: AlbumFrame[][] = albumSpreads.map((s) =>
      s.elements
        .filter((el): el is AlbumPhotoElement => el.type === "photo")
        .map((el) => ({
          id: el.id,
          xPct: el.xPct,
          yPct: el.yPct,
          widthPct: el.widthPct,
          heightPct: el.heightPct,
          rotation: el.rotation,
          borderWidth: el.borderWidth,
          borderColor: el.borderColor,
          shadow: el.shadow,
        }))
    );
    const { data, error } = await supabase
      .from("album_book_templates")
      .insert({ photographer_id: gallery.photographer_id, name: name.trim(), style: albumStyleDraft, pages })
      .select()
      .single<AlbumBookTemplateRow>();
    setSavingBookTemplate(false);
    if (!error && data) {
      setAlbumBookTemplates((prev) => [data, ...prev]);
      setSaveBookTemplateOpen(false);
      setBookTemplateNameDraft("");
    }
  };

  // Discards the current album (cascades to its spreads and client comments) and drops back to
  // the wizard's first step so the photographer can build a fresh one — gated behind an explicit
  // confirmation since it permanently deletes any pages already laid out.
  const startNewAlbum = async () => {
    if (!album) return;
    await supabase.from("gallery_albums").delete().eq("id", album.id);
    setAlbum(null);
    setAlbumSpreads([]);
    setAlbumComments([]);
    setAlbumWizardMode("style");
    setConfirmNewAlbumOpen(false);
  };

  // "+ עמוד חדש" — always creates a single blank custom page and drops straight into its editor,
  // matching buildStyledAlbum's first-page behavior: no template/count picker upfront, since the
  // canvas editor's own "תבניות" button already covers applying a template once the page is open.
  const createBlankSpread = async () => {
    if (!album) return;
    setCreatingSpread(true);
    const { data: newSpread } = await supabase
      .from("gallery_album_spreads")
      .insert({ album_id: album.id, sort_order: albumSpreads.length, layout: "custom", elements: [], photo_id_1: photos[0]?.id })
      .select()
      .single<GalleryAlbumSpreadRow>();
    setCreatingSpread(false);
    if (newSpread) {
      await loadAlbum();
      setCanvasEditorTarget({ spreadId: newSpread.id, mode: "custom" });
    }
  };

  const removeSpread = async (spreadId: string) => {
    await supabase.from("gallery_album_spreads").delete().eq("id", spreadId);
    setAlbumSpreads((prev) => prev.filter((s) => s.id !== spreadId));
  };

  const closeCoverPanel = () => {
    setCoverPanelClosing(true);
    setTimeout(() => {
      setCoverPanelOpen(false);
      setCoverPanelClosing(false);
      setCoverCustomMode(false);
    }, 200);
  };

  // "יצירת כריכה" — always becomes the FIRST page (sort_order 0), pushing every existing spread
  // up by one; `customWidthCm`/`customHeightCm` (from "מידה מותאמת") store a one-off size on just
  // this spread (gallery_album_spreads.width_cm/height_cm) so it can differ from the rest of the
  // album — omitted entirely ("לפי מידות האלבום") it behaves exactly like every other page.
  const createCoverSpread = async (customWidthCm?: number, customHeightCm?: number) => {
    if (!album) return;
    setCreatingSpread(true);
    await Promise.all(albumSpreads.map((s, i) => supabase.from("gallery_album_spreads").update({ sort_order: i + 1 }).eq("id", s.id)));
    const { data: newSpread } = await supabase
      .from("gallery_album_spreads")
      .insert({
        album_id: album.id,
        sort_order: 0,
        layout: "custom",
        elements: [],
        photo_id_1: photos[0]?.id,
        width_cm: customWidthCm ?? null,
        height_cm: customHeightCm ?? null,
      })
      .select()
      .single<GalleryAlbumSpreadRow>();
    setCreatingSpread(false);
    closeCoverPanel();
    if (newSpread) {
      await loadAlbum();
      setCanvasEditorTarget({ spreadId: newSpread.id, mode: "custom" });
    }
  };

  // Drag-and-drop reorder: dropping spread `draggedSpreadId` onto `targetIndex` moves it there and
  // shifts everything between the two positions — simplest correct approach for a short list is to
  // just recompute sort_order for the whole array rather than diffing which pairs actually moved.
  const reorderSpreads = async (targetIndex: number) => {
    if (!draggedSpreadId) return;
    const fromIndex = albumSpreads.findIndex((s) => s.id === draggedSpreadId);
    if (fromIndex === -1 || fromIndex === targetIndex) return;
    const next = [...albumSpreads];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(targetIndex, 0, moved);
    setAlbumSpreads(next);
    setDraggedSpreadId(null);
    await Promise.all(next.map((s, i) => supabase.from("gallery_album_spreads").update({ sort_order: i }).eq("id", s.id)));
  };

  // Swaps in a different photo for one slot of an existing spread without disturbing the other
  // slot, the spread's position, layout, or the client's comments (comments are tied to spread_id,
  // not to a specific photo, so a swapped-in photo still shows prior feedback in context).
  const saveSpreadElements = async (elements: AlbumElement[], background: { photoId: string | null; blur: number; opacity: number }) => {
    if (!canvasEditorTarget) return;
    const { spreadId, mode } = canvasEditorTarget;
    const backgroundPatch = { background_photo_id: background.photoId, background_blur: background.blur, background_opacity: background.opacity };
    const patch = mode === "custom" ? { elements, layout: "custom" as const, ...backgroundPatch } : { elements, ...backgroundPatch };
    setAlbumSpreads((prev) => prev.map((s) => (s.id === spreadId ? { ...s, ...patch } : s)));
    await supabase.from("gallery_album_spreads").update(patch).eq("id", spreadId);
    setCanvasEditorTarget(null);
  };

  // Loads the photographer's own custom ornament tabs the moment the canvas editor opens (not
  // Surfaces the print-house send result even after "המשך ברקע" already closed its progress
  // modal — self-clears so it doesn't linger indefinitely.
  useEffect(() => {
    if (!printHouseToast) return;
    const timer = setTimeout(() => setPrintHouseToast(null), 5000);
    return () => clearTimeout(timer);
  }, [printHouseToast]);

  // eagerly on page load — most gallery visits never touch the album editor at all) and revokes
  // every object URL again once it closes, mirroring the desktop app's identical AlbumPageEditor
  // loading pattern.
  // Starts as soon as the album-manage screen opens (not when a specific spreadId is chosen), so
  // the fetch is already in flight — often already done — by the time the photographer clicks
  // "עמוד חדש"/"יצירת כריכה"/an existing page. Depends on the BOOLEAN albumManageOpen (stable across
  // page switches within an open editor), never on canvasEditorTarget itself (a new {spreadId, mode}
  // object every switch) — depending on the raw object was the actual regression bug: it made this
  // effect re-run — cleanup (revoking the just-fetched blob URLs) then immediately bailing on the
  // ornamentsFetchedRef guard, never refetching — on every single page switch, which is what left
  // the tool stuck showing the loading spinner on every click.
  useEffect(() => {
    if (!albumManageOpen || ornamentsFetchedRef.current) return;
    ornamentsFetchedRef.current = true;
    let cancelled = false;
    let revokedUrls: string[] = [];
    setCustomOrnamentsLoading(true);
    (async () => {
      try {
        const data = await fetchCustomOrnaments();
        const urls = await Promise.all(
          data.ornaments.map(async (o) => {
            try {
              const bytes = await fetchCustomOrnamentBytes(o.id);
              const url = URL.createObjectURL(new Blob([bytes]));
              revokedUrls.push(url);
              return { id: o.id, tab_id: o.tab_id, url };
            } catch {
              return { id: o.id, tab_id: o.tab_id, url: "" };
            }
          })
        );
        if (cancelled) return;
        setCustomOrnamentTabs(data.tabs);
        setCustomOrnaments(urls);
      } catch {
        // A failed ornament-tab load shouldn't block opening the editor itself.
      } finally {
        if (!cancelled) setCustomOrnamentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
      revokedUrls.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [albumManageOpen]);

  const handleCreateCustomOrnamentTab = async (name: string) => {
    const tab = await createCustomOrnamentTab(name);
    setCustomOrnamentTabs((prev) => [...prev, tab]);
  };

  const handleUploadCustomOrnament = async (tabId: string, name: string, bytes: ArrayBuffer, contentType: string) => {
    const ornament = await uploadCustomOrnament(tabId, name, bytes, contentType);
    const url = URL.createObjectURL(new Blob([bytes], { type: contentType }));
    setCustomOrnaments((prev) => [...prev, { id: ornament.id, tab_id: ornament.tab_id, url }]);
  };

  const handleDeleteCustomOrnament = async (ornamentId: string) => {
    await deleteCustomOrnament(ornamentId);
    setCustomOrnaments((prev) => prev.filter((o) => o.id !== ornamentId));
  };

  const sendAlbumToClient = async () => {
    if (!album) return;
    setSavingAlbum(true);
    await supabase.from("gallery_albums").update({ status: "sent" }).eq("id", album.id);
    setAlbum({ ...album, status: "sent" });
    setSavingAlbum(false);
  };

  // Shared by all three export formats. The server streams the file (a zip's final size isn't
  // known ahead of time, so there's no real byte-progress to report) — the 0-100% shown on the
  // button is a simulated, time-based approach toward ~92% while waiting, then a snap to 100%
  // once the blob actually finishes downloading, purely to show the photographer something is
  // happening during what can be a multi-second server-side render.
  const downloadFromRoute = async (
    path: string,
    fallbackName: string,
    mimeType: string,
    setBusy: (v: boolean) => void,
    setProgress: (v: number | null) => void,
    range: { from: number; to: number }
  ) => {
    setBusy(true);
    setProgress(0);
    const start = Date.now();
    const progressTimer = setInterval(() => {
      const elapsed = Date.now() - start;
      setProgress(Math.min(92, Math.round(92 * (1 - Math.exp(-elapsed / 2500)))));
    }, 120);
    const controller = new AbortController();
    exportAbortControllerRef.current = controller;
    try {
      const res = await fetch(`/api/galleries/${gallery.id}/album/${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(range),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "שגיאה בייצוא הקבצים");
        return;
      }
      const disposition = res.headers.get("content-disposition") ?? "";
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const filename = utf8Match ? decodeURIComponent(utf8Match[1]) : fallbackName;
      const blob = await res.blob();
      clearInterval(progressTimer);
      setProgress(100);
      await downloadBlob(blob, filename, mimeType);
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (e) {
      // A user-initiated cancel aborts the same fetch a real network failure would throw from —
      // quietly stop for the former, surface the latter like any other export error.
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setError("שגיאה בייצוא הקבצים");
      }
    } finally {
      clearInterval(progressTimer);
      setBusy(false);
      setProgress(null);
      exportAbortControllerRef.current = null;
    }
  };

  const exportAlbumPdf = (range: { from: number; to: number }) =>
    downloadFromRoute("export-pdf", "album.pdf", "application/pdf", setExportingAlbumPdf, setExportProgressPdf, range);
  const exportAlbumJpg = (range: { from: number; to: number }) =>
    downloadFromRoute("export-jpg", "album-jpg.zip", "application/zip", setExportingAlbumJpg, setExportProgressJpg, range);
  const exportAlbumPsd = (range: { from: number; to: number }) =>
    downloadFromRoute("export-psd", "album-psd.zip", "application/zip", setExportingAlbumPsd, setExportProgressPsd, range);

  // Total exportable pages, matching how the export routes number them: the cover (if the album
  // has one) counts as page 1, then each spread follows in sort order.
  const albumTotalPages = (album?.cover_photo_id ? 1 : 0) + albumSpreads.length;

  const openExportRangeModal = (format: "pdf" | "jpg" | "psd") => {
    setExportRangeFormat(format);
    setExportRangeFrom(1);
    setExportRangeTo(albumTotalPages);
  };

  const confirmExportRange = () => {
    if (!exportRangeFormat) return;
    const from = Math.max(1, Math.min(exportRangeFrom, exportRangeTo));
    const to = Math.min(albumTotalPages, Math.max(exportRangeFrom, exportRangeTo));
    const range = { from, to };
    setExportRangeFormat(null);
    if (exportRangeFormat === "pdf") exportAlbumPdf(range);
    else if (exportRangeFormat === "jpg") exportAlbumJpg(range);
    else exportAlbumPsd(range);
  };

  const openPrintHouseModal = async () => {
    if (!printHouseEmailsLoaded) {
      const { data } = await supabase
        .from("print_house_emails")
        .select("*")
        .order("created_at", { ascending: true })
        .returns<PrintHouseEmailRow[]>();
      const rows = data ?? [];
      setPrintHouseEmails(rows);
      setPrintHouseEmailsLoaded(true);
      const preferred = rows.find((r) => r.is_default) ?? rows[0];
      setPrintHouseSelectedId(preferred?.id ?? null);
    }
    setPrintHouseModalOpen(true);
  };

  const sendToPrintHouseConfirmed = async () => {
    const target = printHouseEmails.find((e) => e.id === printHouseSelectedId);
    if (!target) return;
    setPrintHouseConfirmOpen(false);
    setPrintHouseModalOpen(false);
    setSendingToPrintHouse(true);
    setPrintHouseProgressVisible(true);
    setPrintHouseSendProgress(0);
    const start = Date.now();
    // Same simulated-progress pattern as the PDF/JPG/PSD exports (no real byte-progress to
    // report for a server-side zip-then-email round trip).
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      setPrintHouseSendProgress(Math.min(92, Math.round(92 * (1 - Math.exp(-elapsed / 2500)))));
    }, 120);
    const controller = new AbortController();
    printHouseAbortControllerRef.current = controller;
    try {
      const res = await fetch(`/api/galleries/${gallery.id}/album/send-to-print-house`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: target.email, from: 1, to: albumTotalPages }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setPrintHouseToast(data?.error ?? "שליחה לבית הדפוס נכשלה");
        return;
      }
      setPrintHouseSendProgress(100);
      await new Promise((resolve) => setTimeout(resolve, 400));
      setPrintHouseToast(`נשלח בהצלחה ל-${target.label || target.email} ✓`);
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError")) {
        setPrintHouseToast("שליחה לבית הדפוס נכשלה");
      }
    } finally {
      clearInterval(timer);
      setSendingToPrintHouse(false);
      setPrintHouseProgressVisible(false);
      setPrintHouseSendProgress(null);
      printHouseAbortControllerRef.current = null;
    }
  };

  const updateAlbumSize = async (widthCm: number, heightCm: number) => {
    if (!album) return;
    setAlbum({ ...album, width_cm: widthCm, height_cm: heightCm });
    setSavingAlbumSize(true);
    await supabase.from("gallery_albums").update({ width_cm: widthCm, height_cm: heightCm }).eq("id", album.id);
    setSavingAlbumSize(false);
  };

  const updateAlbumMargin = async (marginCm: number) => {
    if (!album) return;
    setAlbum({ ...album, safe_margin_cm: marginCm });
    setSavingAlbumSize(true);
    await supabase.from("gallery_albums").update({ safe_margin_cm: marginCm }).eq("id", album.id);
    setSavingAlbumSize(false);
  };

  const startPress = (photo: PhotoWithUrl) => {
    if (activeTouchesRef.current >= 2) return;
    longPressFired.current = false;
    pressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      toggleSelect(photo.id);
    }, 500);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };
  const handlePhotoClick = (photo: PhotoWithUrl, index: number) => {
    if (longPressFired.current) {
      longPressFired.current = false;
      return;
    }
    if (activeTouchesRef.current >= 2) return;

    if (selectedIds.size > 0) {
      toggleSelect(photo.id);
      return;
    }

    if (tapTimer.current && lastTapPhotoId.current === photo.id) {
      clearTimeout(tapTimer.current);
      tapTimer.current = null;
      lastTapPhotoId.current = null;
      setActionSheetPhoto(photo);
      return;
    }

    lastTapPhotoId.current = photo.id;
    tapTimer.current = setTimeout(() => {
      tapTimer.current = null;
      lastTapPhotoId.current = null;
      withViewTransition(() => setLightboxIndex(index));
    }, DOUBLE_TAP_MS);
  };
  const closeLightbox = () => withViewTransition(() => setLightboxIndex(null));
  const navLightbox = (index: number) => withViewTransition(() => setLightboxIndex(index));

  const ensureFolderId = async (folderName: string, cache: Map<string, string>): Promise<string | null> => {
    const existing = cache.get(folderName);
    if (existing) return existing;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: folderRow, error } = await supabase
      .from("gallery_folders")
      .insert({
        gallery_id: gallery.id,
        photographer_id: user.id,
        name: folderName,
        sort_order: folders.length + cache.size,
      })
      .select()
      .single<GalleryFolderRow>();
    if (error || !folderRow) {
      const { data: existingRow } = await supabase
        .from("gallery_folders")
        .select("*")
        .eq("gallery_id", gallery.id)
        .eq("name", folderName)
        .maybeSingle<GalleryFolderRow>();
      if (existingRow) {
        cache.set(folderName, existingRow.id);
        return existingRow.id;
      }
      return null;
    }
    cache.set(folderName, folderRow.id);
    setFolders((prev) => [...prev, folderRow]);
    return folderRow.id;
  };

  const uploadResolvedFiles = async (items: { file: File; folderId: string | null }[]) => {
    if (items.length === 0) return;
    setError(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const sortBase = photos.length;
    let hadError = false;
    let succeededCount = 0;
    // Collected instead of surfaced one at a time — with a 340-file batch, `setError` overwriting
    // itself on every failure meant only the LAST failed file was ever visible, silently losing
    // every earlier one. One combined summary at the end shows all of them.
    const failedFiles: string[] = [];
    cancelRequestedRef.current = false;
    offlineAbortedRef.current = false;
    // A real disconnect mid-batch shouldn't be treated like "340 individual files failed" — that
    // grinds through 3 retries times whatever's left, each waiting out a backoff delay against a
    // connection that isn't coming back, before finally showing an unhelpful wall of per-file
    // errors. The 'offline' event catches this the moment it happens (not just whenever the next
    // fetch happens to throw), so the whole batch can stop right away with one clear reason.
    const handleOffline = () => {
      offlineAbortedRef.current = true;
      cancelRequestedRef.current = true;
    };
    window.addEventListener("offline", handleOffline);
    try {
      for (let i = 0; i < items.length; i++) {
        if (!navigator.onLine) {
          offlineAbortedRef.current = true;
          cancelRequestedRef.current = true;
        }
        if (cancelRequestedRef.current) {
          hadError = true;
          break;
        }
        const { folderId } = items[i];
        let file = items[i].file;
        // How much of the batch is already behind us, going into item i — 0% for the very first
        // file, climbing toward (but not reaching) 100% until the last file actually finishes.
        const pct = Math.round((i / items.length) * 100);
        setUploadProgressPct(pct);
        try {
          if (isHeicFile(file)) {
            setUploading(`ממיר ${i + 1} מתוך ${items.length}...`);
            try {
              file = await convertHeicIfNeeded(file);
            } catch {
              failedFiles.push(`${file.name} (המרה נכשלה)`);
              hadError = true;
              continue;
            }
          }
          setUploading(`מעלה ${i + 1} מתוך ${items.length}...`);
          const path = `${user.id}/${gallery.id}/${crypto.randomUUID()}-${file.name}`;

          // A large batch (hundreds of files) takes long enough that a single transient network
          // blip on any one file is likely, not exceptional — retrying a couple of times before
          // giving up on that file turns "one bad wifi moment" into a non-event instead of forcing
          // a manual re-upload of just that photo afterward.
          let uploaded = false;
          let lastFailureReason = "שגיאה לא ידועה";
          for (let attempt = 0; attempt < 3 && !uploaded; attempt++) {
            if (!navigator.onLine) {
              offlineAbortedRef.current = true;
              cancelRequestedRef.current = true;
              lastFailureReason = "אין חיבור לאינטרנט";
              break;
            }
            if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
            try {
              const urlRes = await fetch("/api/storage/upload-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ bucket: "galleries", path, contentType: file.type || "application/octet-stream" }),
              });
              const urlData = await urlRes.json();
              if (!urlRes.ok || !urlData.url) {
                lastFailureReason = urlData.error ?? "שגיאה לא ידועה";
                continue;
              }
              const putRes = await fetch(urlData.url, {
                method: "PUT",
                headers: { "Content-Type": file.type || "application/octet-stream" },
                body: file,
              });
              if (!putRes.ok) {
                lastFailureReason = `סטטוס ${putRes.status}`;
                continue;
              }
              uploaded = true;
            } catch (e) {
              // A network-level failure (dropped connection, DNS hiccup) throws instead of
              // resolving to a response — caught here so the retry loop above can try again
              // instead of the whole file (or the whole batch) silently giving up.
              lastFailureReason = e instanceof Error ? e.message : "שגיאת רשת";
            }
          }
          if (!uploaded) {
            // Once offline is confirmed, this file's own failure is just noise on top of the
            // single batch-level message shown below — no need to list it individually too.
            if (!offlineAbortedRef.current) failedFiles.push(`${file.name} (${lastFailureReason})`);
            hadError = true;
            continue;
          }

          const { data: photoRow, error: insertError } = await supabase
            .from("gallery_photos")
            .insert({
              gallery_id: gallery.id,
              photographer_id: user.id,
              storage_path: path,
              original_filename: file.name,
              file_size_bytes: file.size,
              sort_order: sortBase + i,
              folder_id: folderId,
            })
            .select()
            .single<GalleryPhotoRow>();
          if (insertError || !photoRow) {
            failedFiles.push(`${file.name} (${insertError?.message ?? "שגיאה בשמירה"})`);
            hadError = true;
            continue;
          }
          setPhotos((prev) => [...prev, { ...photoRow, url: URL.createObjectURL(file) }]);
          succeededCount++;
          // Fire-and-forget: generates the lightbox preview right now instead of waiting for
          // someone to click the photo — by the time a photographer finishes uploading a batch and
          // opens one to check it, the preview is already sitting in storage. `redirect: "manual"`
          // stops the browser from following (and wastefully downloading) the redirect target; the
          // route's own work (resize/compress/persist) already happened server-side by then.
          fetch(`/api/galleries/${gallery.id}/photos/${photoRow.id}/preview`, { redirect: "manual" }).catch(() => {});
        } catch (e) {
          // Catch-all for anything outside the retry loop above (e.g. a bug in this code itself) —
          // without this the whole loop would abort silently and leave "מעלה..." on screen forever
          // with no indication anything went wrong.
          failedFiles.push(`${file.name} (${e instanceof Error ? e.message : "שגיאה לא צפויה"})`);
          hadError = true;
        }
      }
    } finally {
      window.removeEventListener("offline", handleOffline);
      if (offlineAbortedRef.current) {
        setError(
          succeededCount > 0
            ? `אין חיבור לאינטרנט — ההעלאה הופסקה. ${succeededCount} מתוך ${items.length} תמונות הספיקו לעלות לפני שהחיבור ירד. יש לבדוק את החיבור לרשת ולהעלות את השאר שוב.`
            : "אין חיבור לאינטרנט — ההעלאה לא התחילה. יש לבדוק את החיבור לרשת ולנסות שוב."
        );
      } else if (failedFiles.length > 0) {
        const shown = failedFiles.slice(0, 8);
        const more = failedFiles.length - shown.length;
        setError(
          `${failedFiles.length} קבצים לא הועלו: ${shown.join(", ")}${more > 0 ? ` ועוד ${more} נוספים` : ""}. שאר התמונות הועלו בהצלחה — אפשר להעלות את אלה שנכשלו שוב בנפרד.`
        );
      }
      // Snap to 100% and hold there briefly instead of jumping straight back to the idle state —
      // matches the shared progress modal's own fill-then-reset pattern, so the last file finishing
      // doesn't feel like it vanished mid-progress. Skipped on failure — a "done" flash would
      // contradict the error message just surfaced, so a failed batch clears state immediately.
      if (hadError) {
        setUploading(null);
        setUploadProgressPct(null);
      } else {
        setUploadProgressPct(100);
        await new Promise((resolve) => setTimeout(resolve, 700));
        setUploading(null);
        setUploadProgressPct(null);
        // Only worth prompting a client update for photos landing in a gallery the client can
        // already see — if it isn't published yet, this upload is just prep and the client hasn't
        // been sent a link at all, so the publish confirmation panel is the one that should notify
        // them, not this one.
        if (succeededCount > 0 && gallery.published) {
          setUploadJustFinished(succeededCount);
        }
      }
    }
  };

  const reportRejectedFormats = (rejected: File[]) => {
    if (rejected.length === 0) return;
    const note = `הגלריה תומכת רק בקבצי JPG, JPEG, PNG, GIF ו-BMP — הקבצים הבאים לא הועלו: ${rejected
      .map((f) => f.name)
      .join(", ")}`;
    setError((prev) => (prev ? `${prev}\n${note}` : note));
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Hidden files (macOS AppleDouble sidecars, .DS_Store) are dropped silently, not reported as
    // rejected — they aren't something the photographer meant to upload, so flagging them as an
    // "unsupported format" would just be confusing noise.
    const all = Array.from(files).filter((f) => !isHiddenFileName(f.name));
    const allowed = all.filter(isAllowedImageFile);
    const rejected = all.filter((f) => !isAllowedImageFile(f));
    const items = allowed.map((file) => ({ file, folderId: activeFolderId }));
    await uploadResolvedFiles(items);
    reportRejectedFormats(rejected);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDirectoryFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const all = Array.from(files).filter((f) => !isHiddenFileName(f.name));
    const allowed = all.filter(isAllowedImageFile);
    const rejected = all.filter((f) => !isAllowedImageFile(f));
    const cache = new Map(folders.map((f) => [f.name, f.id]));
    const items: { file: File; folderId: string | null }[] = [];
    for (const file of allowed) {
      const relPath = (file as File & { webkitRelativePath?: string }).webkitRelativePath || "";
      const folderName = relPath ? folderNameFromPath(relPath) : null;
      const folderId = folderName ? await ensureFolderId(folderName, cache) : activeFolderId;
      items.push({ file, folderId });
    }
    await uploadResolvedFiles(items);
    reportRejectedFormats(rejected);
    if (directoryInputRef.current) directoryInputRef.current.value = "";
  };

  const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = await readDataTransferItems(e.dataTransfer.items);
    if (dropped.length === 0) return;
    const allowed = dropped.filter((d) => isAllowedImageFile(d.file));
    const rejected = dropped.filter((d) => !isAllowedImageFile(d.file)).map((d) => d.file);
    const cache = new Map(folders.map((f) => [f.name, f.id]));
    const items: { file: File; folderId: string | null }[] = [];
    for (const { file, relativePath } of allowed) {
      const folderName = folderNameFromPath(relativePath);
      const folderId = folderName ? await ensureFolderId(folderName, cache) : activeFolderId;
      items.push({ file, folderId });
    }
    await uploadResolvedFiles(items);
    reportRejectedFormats(rejected);
  };

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;

    // A tab with this name may already exist (gallery_folders has a unique gallery_id+name
    // constraint) — reuse it instead of round-tripping to a duplicate-key error.
    const existingFolder = folders.find((f) => f.name === name);
    if (existingFolder) {
      setActiveFolderId(existingFolder.id);
      setNewFolderName("");
      setAddingFolder(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const { data: folderRow, error: insertError } = await supabase
      .from("gallery_folders")
      .insert({ gallery_id: gallery.id, photographer_id: user.id, name, sort_order: folders.length })
      .select()
      .single<GalleryFolderRow>();
    if (insertError || !folderRow) {
      setError(insertError?.code === "23505" ? "כבר קיימת לשונית בשם הזה" : insertError?.message ?? "שגיאה ביצירת התיקייה");
      return;
    }
    setFolders((prev) => [...prev, folderRow]);
    setActiveFolderId(folderRow.id);
    setNewFolderName("");
    setAddingFolder(false);
  };

  const renameFolder = async () => {
    const folderId = editingFolderId;
    const name = editFolderName.trim();
    setEditingFolderId(null);
    if (!folderId) return;
    const current = folders.find((f) => f.id === folderId);
    if (!name || !current || name === current.name) return;
    const { error: updateError } = await supabase.from("gallery_folders").update({ name }).eq("id", folderId);
    if (updateError) {
      setError(updateError.code === "23505" ? "כבר קיימת לשונית בשם הזה" : updateError.message ?? "שגיאה בשינוי שם התיקייה");
      return;
    }
    setFolders((prev) => prev.map((f) => (f.id === folderId ? { ...f, name } : f)));
  };

  // Deleting a folder never deletes its photos — the DB column has `on delete set null`, so
  // photos just fall back to "הכל" (ungrouped). Local state is mirrored manually here to match,
  // same as every other folder/photo mutation in this component.
  const deleteFolder = async () => {
    const folder = deleteFolderConfirm;
    if (!folder) return;
    setDeletingFolder(true);
    const { error: deleteError } = await supabase.from("gallery_folders").delete().eq("id", folder.id);
    setDeletingFolder(false);
    setDeleteFolderConfirm(null);
    if (deleteError) {
      setError(deleteError.message ?? "שגיאה במחיקת התיקייה");
      return;
    }
    setFolders((prev) => prev.filter((f) => f.id !== folder.id));
    setPhotos((prev) => prev.map((p) => (p.folder_id === folder.id ? { ...p, folder_id: null } : p)));
    if (activeFolderId === folder.id) setActiveFolderId(null);
    if (editingFolderId === folder.id) setEditingFolderId(null);
  };

  const confirmDeletePhoto = async () => {
    const photo = deleteConfirmPhoto;
    if (!photo) return;
    setDeleteConfirmPhoto(null);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    await fetch("/api/storage/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: "galleries", paths: [photo.storage_path, photo.preview_storage_path].filter((p): p is string => !!p) }),
    });
    await supabase.from("gallery_photos").delete().eq("id", photo.id);
    if (gallery.cover_photo_id === photo.id) {
      await supabase.from("galleries").update({ cover_photo_id: null }).eq("id", gallery.id);
      setGallery((g) => ({ ...g, cover_photo_id: null }));
    }
  };

  const confirmDeleteSelectedPhotos = async () => {
    const selected = photos.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) return;
    setDeleteSelectedConfirmOpen(false);
    const ids = selected.map((p) => p.id);
    const paths = selected.flatMap((p) => [p.storage_path, p.preview_storage_path].filter((x): x is string => !!x));
    setPhotos((prev) => prev.filter((p) => !selectedIds.has(p.id)));
    clearSelection();
    await fetch("/api/storage/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: "galleries", paths }),
    });
    await supabase.from("gallery_photos").delete().in("id", ids);
    if (gallery.cover_photo_id && ids.includes(gallery.cover_photo_id)) {
      await supabase.from("galleries").update({ cover_photo_id: null }).eq("id", gallery.id);
      setGallery((g) => ({ ...g, cover_photo_id: null }));
    }
  };

  // Fades the confirmation question out, and — since selection is left untouched — the floating
  // toolbar cross-fades back in at the same time so the user can keep adjusting their selection.
  const cancelDeleteSelected = () => {
    setDeleteSelectedConfirmClosing(true);
    setTimeout(() => {
      setDeleteSelectedConfirmOpen(false);
      setDeleteSelectedConfirmClosing(false);
    }, CLOSE_ANIMATION_MS);
  };

  const setCoverPhoto = async (photo: PhotoWithUrl) => {
    setActionSheetPhoto(null);
    await supabase.from("galleries").update({ cover_photo_id: photo.id }).eq("id", gallery.id);
    setGallery((g) => ({ ...g, cover_photo_id: photo.id }));
  };

  const updatePhotoCullingStatus = (photoId: string, status: GalleryPhotoRow["culling_status"]) => {
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, culling_status: status } : p)));
  };

  const togglePortfolio = async (photo: PhotoWithUrl) => {
    setActionSheetPhoto(null);
    // Adding a photo asks for a category first (see portfolioCategoryPhoto below) — removing is
    // instant, no prompt needed either way.
    if (photo.in_portfolio) {
      setPhotos((prev) => prev.map((p) => (p.id === photo.id ? { ...p, in_portfolio: false, portfolio_category: null } : p)));
      await supabase.from("gallery_photos").update({ in_portfolio: false, portfolio_category: null }).eq("id", photo.id);
      return;
    }
    setPortfolioCategoryPhoto(photo);
    setPortfolioCategoryInput(photo.portfolio_category ?? "");
  };

  const savePortfolioCategory = async () => {
    if (!portfolioCategoryPhoto) return;
    const category = portfolioCategoryInput.trim() || null;
    const photoId = portfolioCategoryPhoto.id;
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, in_portfolio: true, portfolio_category: category } : p)));
    setPortfolioCategoryPhoto(null);
    await supabase.from("gallery_photos").update({ in_portfolio: true, portfolio_category: category }).eq("id", photoId);
  };

  const downloadPhoto = (photo: PhotoWithUrl) => {
    setActionSheetPhoto(null);
    downloadPhotoNow(photo);
  };

  const sharePhoto = async (photo: PhotoWithUrl) => {
    setActionSheetPhoto(null);
    if (navigator.share) {
      try {
        await navigator.share({ title: photo.original_filename, url: photo.url });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard copy
      }
    }
    await navigator.clipboard.writeText(photo.url);
    setShareStatus("הקישור הועתק ✓");
    setTimeout(() => setShareStatus(null), 2000);
  };

  const publish = async () => {
    setPublishing(true);
    const now = new Date();
    const expiresAt = expiryDays ? addDays(now, expiryDays) : null;
    const patch = {
      published: true,
      expiry_days: expiryDays,
      published_at: now.toISOString(),
      expires_at: expiresAt ? expiresAt.toISOString() : null,
    };
    await supabase.from("galleries").update(patch).eq("id", gallery.id);
    setGallery((g) => ({ ...g, ...patch }));
    // Standalone galleries (no event) have no stage tracker to sync. The client update itself
    // happens from the confirmation panel below (buildShareMessage already has the richer,
    // link-and-signature-carrying text), so this call's own `notify` response is unused here.
    if (eventId) {
      await fetch(`/api/events/${eventId}/stages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageKey: "gallery_upload", done: true }),
      });
    }
    setPublishing(false);
    setJustPublished(true);
  };

  const renew = async () => {
    setRenewing(true);
    const now = new Date();
    const expiresAt = expiryDays ? addDays(now, expiryDays) : null;
    const patch = {
      published_at: now.toISOString(),
      expires_at: expiresAt ? expiresAt.toISOString() : null,
      archived_at: null,
      permanent_delete_at: null,
      reminder_sent_at: null,
    };
    await supabase.from("galleries").update(patch).eq("id", gallery.id);
    setGallery((g) => ({ ...g, ...patch }));
    setRenewing(false);
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(`${window.location.origin}/gallery/${gallery.access_token}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const hasUnfoldered = photos.some((p) => !p.folder_id);
  const allShareOptionKeys = [...folders.map((f) => f.id), ...(hasUnfoldered ? [NO_FOLDER_KEY] : [])];

  const openShare = () => {
    setShareSelectedFolders(new Set(allShareOptionKeys));
    setShareQuality("full");
    setShareView("main");
    setQrDataUrl(null);
    setShareOpen(true);
  };

  const toggleShareFolder = (key: string) => {
    setShareSelectedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const showFolderPicker = folders.length > 0;
  const shareDisabled = showFolderPicker && shareSelectedFolders.size === 0;

  const buildShareUrl = () => {
    const base = `${window.location.origin}/gallery/${gallery.access_token}`;
    const params = new URLSearchParams();
    if (showFolderPicker) {
      const allSelected = allShareOptionKeys.every((k) => shareSelectedFolders.has(k));
      if (!allSelected) params.set("folders", [...shareSelectedFolders].join(","));
    }
    if (shareQuality === "web") params.set("quality", "web");
    const qs = params.toString();
    return qs ? `${base}?${qs}` : base;
  };

  // One specific account's own wording, requested verbatim — every other photographer gets a
  // generic message instead, signed with their own name rather than a hardcoded one.
  const OWNER_ACCOUNT_EMAIL = "gilbertopro_admin@gmail.com";

  const buildShareMessage = (url: string) => {
    // The full option list, not the tier-filtered one — a gallery can carry a value from a plan
    // the photographer no longer has (e.g. downgraded from פרו+ after picking 6 months), and it
    // should still label correctly rather than silently show nothing.
    const expiryLabel = expiryDays ? GALLERY_EXPIRY_OPTIONS.find((o) => o.value === expiryDays)?.label : null;
    const expiryClause = expiryLabel ? `הקישור בתוקף ל-${expiryLabel}, ` : "";
    if (photographerEmail === OWNER_ACCOUNT_EMAIL) {
      return `היי,\nהיה אירוע מעולה, תודה על הזכות לצלם לכם, שנפגש רק בשמחות 🙏🏼😊\nקישור לגלריית התמונות: ${url}\n\n${expiryClause}ניתן להוריד את התמונות, לשתף ולא לשכוח לתייג 😁\n${photographerName || "רועי גלברט"} - צילום אירועים`;
    }
    const namePrefix = clientName ? `${clientName}, ` : "";
    const signOff = photographerName ? `\n\n${photographerName} - צילום אירועים` : "";
    return `${namePrefix}הגלריה מהאירוע שלכם מוכנה לצפייה ובחירת תמונות 📸\nקישור לגלריית התמונות: ${url}\n\n${expiryClause}אפשר להוריד ולשתף את התמונות בכל שלב.${signOff}`;
  };

  const shareViaWhatsapp = () => {
    const text = buildShareMessage(buildShareUrl());
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    setShareOpen(false);
  };

  // Bound to the "just published" confirmation panel's SendUpdateButton — same message as the
  // manual share option, but opened straight into the client's own chat (gallery.client_phone)
  // instead of a generic wa.me picker, matching the rest of the app's "send update" buttons.
  const sendGalleryPublishedUpdate = () => {
    if (!gallery.client_phone) return;
    setSendingGalleryUpdate(true);
    const text = buildShareMessage(buildShareUrl());
    openWhatsApp(gallery.client_phone, text);
    if (eventId) {
      fetch(`/api/events/${eventId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "פרסום הגלריה", clientPhone: gallery.client_phone }),
      }).catch(() => {});
    }
    setSendingGalleryUpdate(false);
  };

  // Bound to the "photos just uploaded" confirmation panel — only ever shown for a gallery that
  // was already published (see uploadResolvedFiles), so the client has a live link already and
  // this is purely "there's more to see now", not a first-time share.
  const sendPhotosUploadedUpdate = (count: number) => {
    if (!gallery.client_phone) return;
    setSendingUploadUpdate(true);
    const url = buildShareUrl();
    const namePrefix = clientName ? `${clientName}, ` : "";
    const text = `${namePrefix}עודכנו ${count} תמונות חדשות בגלריה שלכם 📸\n${url}`;
    openWhatsApp(gallery.client_phone, text);
    if (eventId) {
      fetch(`/api/events/${eventId}/notify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "העלאת תמונות לגלריה", clientPhone: gallery.client_phone }),
      }).catch(() => {});
    }
    setSendingUploadUpdate(false);
  };

  const shareViaQr = async () => {
    const QRCode = (await import("qrcode")).default;
    const dataUrl = await QRCode.toDataURL(buildShareUrl(), { width: 280, margin: 1 });
    setQrDataUrl(dataUrl);
    setShareView("qr");
  };

  const shareViaOther = async () => {
    const url = buildShareUrl();
    const text = buildShareMessage(url);
    if (navigator.share) {
      try {
        await navigator.share({ title: "גלריה מהאירוע", text, url });
      } catch {
        // user canceled the native share sheet — nothing to do
      }
    } else {
      await navigator.clipboard.writeText(text);
      setShareStatus("הקישור הועתק ✓");
      setTimeout(() => setShareStatus(null), 2000);
    }
    setShareOpen(false);
  };

  // One combined save for both settings tabs (details + style) — they're one form now, so a
  // single patch avoids the awkwardness of "which tab's changes actually got saved".
  const saveSettings = async () => {
    setSavingSettings(true);
    // Once published, the duration is counted from the original publish date, not from whenever
    // settings happen to be saved — otherwise every unrelated settings edit would silently push
    // the expiry date out. Archived galleries have no active expiry to recompute here; use
    // "חידוש תוקף הגלריה" for those instead.
    const expiresAtPatch =
      gallery.published && !gallery.archived_at && gallery.published_at
        ? {
            expires_at: expiryDays
              ? addDays(new Date(gallery.published_at), expiryDays).toISOString()
              : null,
          }
        : {};
    const patch = {
      title: editTitle.trim() || "הגלריה שלכם",
      shoot_date: eventId ? gallery.shoot_date : editShootDate || null,
      client_email: editClientEmail.trim() || null,
      client_phone: editClientPhone.trim() || null,
      allow_downloads: editAllowDownloads,
      theme,
      cover_text_position: coverTextPosition,
      cover_shape: coverShape,
      cover_photo_id: coverPhotoId,
      title_font_override: titleFontOverride,
      grid_style_override: gridStyleOverride,
      expiry_days: expiryDays,
      ...expiresAtPatch,
    };
    const { error: updateError } = await supabase.from("galleries").update(patch).eq("id", gallery.id);
    setSavingSettings(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setGallery((g) => ({ ...g, ...patch }));
    setSettingsOpen(false);
  };

  const saveSlideshow = async () => {
    setSavingSlideshow(true);
    const patch = { slideshow_photo_ids: [...slideshowPhotoIds] };
    const { error: updateError } = await supabase.from("galleries").update(patch).eq("id", gallery.id);
    setSavingSlideshow(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setGallery((g) => ({ ...g, ...patch }));
    setSlideshowManageOpen(false);
  };

  const isArchived = !!gallery.archived_at;
  const favoriteCount = photos.filter((p) => p.is_favorite).length;
  const activeFaceCluster = faceFilterClusterId ? faceClusters.find((c) => c.clusterId === faceFilterClusterId) : null;
  const visiblePhotos = photos
    .filter((p) => (showFavoritesOnly ? p.is_favorite : true))
    .filter((p) => (showRejectedOnly ? p.culling_status === "rejected" : true))
    .filter((p) => (activeFolderId ? p.folder_id === activeFolderId : true))
    .filter((p) => (activeFaceCluster ? activeFaceCluster.photoIds.has(p.id) : true));
  // The photographer's own management grid mirrors the same resolved style the client actually
  // sees — no separate local toggle, so there's only ever one layout control to reason about.
  const resolvedGridStyle = gallery.grid_style_override ?? galleryThemeById(gallery.theme).gridStyle;

  // Resets the "all thumbnails in, reveal together" gate whenever the visible photo SET changes
  // (folder switch, favorites filter, etc) — for a set that's already browser-cached this settles
  // within a frame or two anyway, so it doesn't reintroduce a wait on repeat views. The timeout is
  // a safety net so one slow or broken image can't hold the whole grid hidden indefinitely.
  const visiblePhotoIdsKey = visiblePhotos.map((p) => p.id).join(",");
  useEffect(() => {
    loadedThumbIdsRef.current = new Set();
    setThumbsReady(visiblePhotoIdsKey.length === 0);
    const timeout = setTimeout(() => setThumbsReady(true), 2500);
    return () => clearTimeout(timeout);
  }, [visiblePhotoIdsKey]);

  const markThumbLoaded = (photoId: string) => {
    loadedThumbIdsRef.current.add(photoId);
    if (loadedThumbIdsRef.current.size >= visiblePhotos.length) setThumbsReady(true);
  };

  // Opening any one photo full-size is treated as "the client is now browsing this gallery" —
  // quietly warms the browser cache for every OTHER photo's full-size view in the background, so
  // navigating to the next/previous photo (or reopening one later) is instant instead of waiting
  // on a fresh fetch each time. Runs once per visible-photo-set, not on every lightbox nav.
  useEffect(() => {
    if (lightboxIndex === null) return;
    if (fullImagePrefetchedKeyRef.current === visiblePhotoIdsKey) return;
    fullImagePrefetchedKeyRef.current = visiblePhotoIdsKey;
    visiblePhotos.forEach((photo) => {
      const src = photo.previewUrl ?? `/api/galleries/${gallery.id}/photos/${photo.id}/preview`;
      const img = new window.Image();
      img.src = src;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex !== null, visiblePhotoIdsKey]);

  // Arrow-key navigation while the lightbox is open — mapped for RTL reading direction, so the
  // visual "forward" direction (left) advances to the next photo, matching how the prev/next arrow
  // buttons are laid out on screen, not the raw left-to-right English-UI convention.
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && lightboxIndex < visiblePhotos.length - 1) navLightbox(lightboxIndex + 1);
      else if (e.key === "ArrowRight" && lightboxIndex > 0) navLightbox(lightboxIndex - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxIndex, visiblePhotos.length]);

  // Drives the single blocking ProgressModal below — only one of these is ever true at a time in
  // practice (the modal itself blocks starting a second heavy operation while one is showing), but
  // this priority order is the tie-break if that ever changes.
  const activeOp: { label: string; pct: number } | null =
    uploading != null
      ? { label: "העלאת תמונות", pct: uploadProgressPct ?? 0 }
      : detectingFaces
        ? { label: "זיהוי פרצופים", pct: faceProgress && faceProgress.total > 0 ? (faceProgress.done / faceProgress.total) * 100 : 0 }
        : exportingAlbumPdf
          ? { label: "ייצוא PDF", pct: exportProgressPdf ?? 0 }
          : exportingAlbumJpg
            ? { label: "ייצוא JPG", pct: exportProgressJpg ?? 0 }
            : exportingAlbumPsd
              ? { label: "ייצוא PSD", pct: exportProgressPsd ?? 0 }
              : sendingToPrintHouse && printHouseProgressVisible
                ? { label: "שליחה לבית דפוס", pct: printHouseSendProgress ?? 0 }
                : null;
  const printHouseOpActive = sendingToPrintHouse && printHouseProgressVisible;

  // Covers the whole standalone-iOS-PWA rotate round trip (see albumRotateResume.ts) with one
  // continuous spinner — this page's own normal content never has a chance to flash in between the
  // bounce through /galleries and landing back here with the tool reopening itself. Also covers the
  // OUTBOUND leg (albumPhase "settling", set the instant rotation is detected, right before the
  // router.push away) — and at a z-index above even the canvas editor's own z-80: that editor is a
  // separate top-level modal, not nested inside this one, so without a higher z-index here the
  // editor's own now-stale content would keep sitting on top of this spinner for the moment before
  // the route actually changes, which is exactly the "no spinner visible" gap this exists to close.
  if (resumingAfterRotate || albumPhase === "settling") {
    return (
      <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center gap-3" style={{ background: "var(--color-paper)" }}>
        <div className="h-8 w-8 rounded-full border-2 border-line border-t-ink animate-spin" />
        <p className="text-sm text-ink-soft">טוען את הכלי...</p>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {activeOp && (
        <ProgressModal
          label={activeOp.label}
          pct={activeOp.pct}
          onCancel={() => {
            if (printHouseOpActive) {
              printHouseAbortControllerRef.current?.abort();
              return;
            }
            cancelRequestedRef.current = true;
            exportAbortControllerRef.current?.abort();
          }}
          onBackground={printHouseOpActive ? () => setPrintHouseProgressVisible(false) : undefined}
        />
      )}
      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          aria-label="חזרה לראש העמוד"
          className={`fixed bottom-5 left-5 z-40 h-11 w-11 rounded-full flex items-center justify-center bg-ink text-white shadow-sheet ${BTN_PRESS}`}
        >
          <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 19V5M5 12l7-7 7 7" />
          </svg>
        </button>
      )}
      <div className="flex items-center justify-between mb-1.5">
        <Link href="/galleries" className="flex items-center gap-1 text-sm tracking-wide text-ink-soft">
          → כל הגלריות
        </Link>
        <div className="hidden sm:flex items-center gap-2">
          {!gallery.published && photos.length > 0 && (
            <button
              onClick={publish}
              disabled={publishing}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full bg-ink text-white disabled:opacity-60 ${BTN_PRESS}`}
            >
              {publishing ? "מפרסם..." : "פרסום הגלריה ללקוח"}
            </button>
          )}
          {gallery.published && !isArchived && (
            <button
              onClick={copyLink}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full bg-ink text-white ${BTN_PRESS}`}
            >
              {copied ? "✓ הועתק" : "העתקת קישור"}
            </button>
          )}
          {gallery.published && !isArchived && (
            <button
              onClick={openShare}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-line text-ink ${BTN_PRESS}`}
            >
              שיתוף
            </button>
          )}
          <button
            onClick={() => {
              setEditTitle(gallery.title);
              setEditShootDate(gallery.shoot_date ?? "");
              setEditClientEmail(gallery.client_email ?? "");
              setEditClientPhone(gallery.client_phone ?? "");
              setEditAllowDownloads(gallery.allow_downloads);
              setTheme(gallery.theme);
              setCoverTextPosition(gallery.cover_text_position);
              setCoverShape(gallery.cover_shape);
              setCoverPhotoId(gallery.cover_photo_id);
              setTitleFontOverride(gallery.title_font_override);
              setGridStyleOverride(gallery.grid_style_override);
              setSettingsOpen(true);
            }}
            className={`text-xs font-semibold px-3 py-1.5 rounded-full bg-amber-deep text-white ${BTN_PRESS}`}
          >
            הגדרות גלריה
          </button>
          {photos.length > 0 && (
            <button
              onClick={() => {
                setSlideshowPhotoIds(new Set(gallery.slideshow_photo_ids));
                setSlideshowManageOpen(true);
              }}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-line text-ink ${BTN_PRESS}`}
            >
              מצגת תמונות
            </button>
          )}
          {photos.length > 0 && (
            <button
              onClick={openAlbumManage}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-line text-ink ${BTN_PRESS}`}
            >
              עיצוב אלבום
            </button>
          )}
          {photos.length > 0 && (
            // Runs entirely in the browser (see src/lib/faceRecognition.ts) — no photo ever
            // leaves the photographer's device for this except the already-cached results.
            <button
              onClick={runFaceDetection}
              disabled={detectingFaces}
              className={`text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-line text-ink disabled:opacity-60 ${BTN_PRESS}`}
            >
              {detectingFaces
                ? "מזהה..."
                : faceClusters.length > 0
                  ? "🔄 רענון זיהוי פרצופים"
                  : "🙂 זיהוי פרצופים"}
            </button>
          )}
          {photos.length > 0 && (
            <a
              href={`/gallery/${gallery.access_token}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="תצוגה מקדימה של הגלריה"
              title={gallery.published ? "תצוגה מקדימה של הגלריה" : "תצוגה מקדימה — כך הגלריה תיראה ללקוח/ה לאחר הפרסום"}
              className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line text-amber-deep ${BTN_PRESS}`}
            >
              <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z" />
                <circle cx={12} cy={12} r={3} />
              </svg>
            </a>
          )}
        </div>
      </div>

      {/* Mobile-only uniform button grid — the sm:flex row above packs buttons of very different
          text lengths edge to edge with no wrap, which crowds and unevens out on narrow screens.
          Same actions, same handlers, just laid out as equal-size grid cells with even gaps. */}
      <div className="grid grid-cols-2 sm:hidden gap-2 mb-3">
        {!gallery.published && photos.length > 0 && (
          <button
            onClick={publish}
            disabled={publishing}
            className={`h-11 rounded-xl px-2 text-[11px] font-semibold text-center leading-tight bg-ink text-white disabled:opacity-60 ${BTN_PRESS}`}
          >
            {publishing ? "מפרסם..." : "פרסום הגלריה ללקוח"}
          </button>
        )}
        {gallery.published && !isArchived && (
          <button
            onClick={copyLink}
            className={`h-11 rounded-xl px-2 text-[11px] font-semibold text-center leading-tight bg-ink text-white ${BTN_PRESS}`}
          >
            {copied ? "✓ הועתק" : "העתקת קישור"}
          </button>
        )}
        {gallery.published && !isArchived && (
          <button
            onClick={openShare}
            className={`h-11 rounded-xl px-2 text-[11px] font-semibold text-center leading-tight bg-white border border-line text-ink ${BTN_PRESS}`}
          >
            שיתוף
          </button>
        )}
        <button
          onClick={() => {
            setEditTitle(gallery.title);
            setEditShootDate(gallery.shoot_date ?? "");
            setEditClientEmail(gallery.client_email ?? "");
            setEditClientPhone(gallery.client_phone ?? "");
            setEditAllowDownloads(gallery.allow_downloads);
            setTheme(gallery.theme);
            setCoverTextPosition(gallery.cover_text_position);
            setCoverShape(gallery.cover_shape);
            setCoverPhotoId(gallery.cover_photo_id);
            setTitleFontOverride(gallery.title_font_override);
            setGridStyleOverride(gallery.grid_style_override);
            setSettingsOpen(true);
          }}
          className={`h-11 rounded-xl px-2 text-[11px] font-semibold text-center leading-tight bg-amber-deep text-white ${BTN_PRESS}`}
        >
          הגדרות גלריה
        </button>
        {photos.length > 0 && (
          <button
            onClick={() => {
              setSlideshowPhotoIds(new Set(gallery.slideshow_photo_ids));
              setSlideshowManageOpen(true);
            }}
            className={`h-11 rounded-xl px-2 text-[11px] font-semibold text-center leading-tight bg-white border border-line text-ink ${BTN_PRESS}`}
          >
            מצגת תמונות
          </button>
        )}
        {photos.length > 0 && (
          <button
            onClick={openAlbumManage}
            className={`h-11 rounded-xl px-2 text-[11px] font-semibold text-center leading-tight bg-white border border-line text-ink ${BTN_PRESS}`}
          >
            עיצוב אלבום
          </button>
        )}
        {photos.length > 0 && (
          <button
            onClick={runFaceDetection}
            disabled={detectingFaces}
            className={`h-11 rounded-xl px-2 text-[11px] font-semibold text-center leading-tight bg-white border border-line text-ink disabled:opacity-60 ${BTN_PRESS}`}
          >
            {detectingFaces
              ? "מזהה..."
              : faceClusters.length > 0
                ? "🔄 רענון זיהוי פרצופים"
                : "🙂 זיהוי פרצופים"}
          </button>
        )}
        {photos.length > 0 && (
          <a
            href={`/gallery/${gallery.access_token}`}
            target="_blank"
            rel="noopener noreferrer"
            title={gallery.published ? "תצוגה מקדימה של הגלריה" : "תצוגה מקדימה — כך הגלריה תיראה ללקוח/ה לאחר הפרסום"}
            className={`h-11 rounded-xl px-2 flex items-center justify-center gap-1 text-[11px] font-semibold text-center leading-tight bg-white border border-line text-amber-deep ${BTN_PRESS}`}
          >
            <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z" />
              <circle cx={12} cy={12} r={3} />
            </svg>
            תצוגה מקדימה
          </a>
        )}
      </div>
      <h1 className="text-[22px] font-bold mb-1 font-display">{clientName || gallery.title}</h1>
      {eventDate ? (
        <p className="text-xs mb-1 text-ink-soft">{new Date(eventDate).toLocaleDateString("he-IL")}</p>
      ) : (
        gallery.shoot_date && (
          <p className="text-xs mb-1 text-ink-soft">{new Date(gallery.shoot_date).toLocaleDateString("he-IL")}</p>
        )
      )}

      {faceError && <p className="text-xs text-rose mb-2">{faceError}</p>}

      {faceClusters.length > 0 && (
        <div className="flex items-center gap-2 mb-5 overflow-x-auto">
          {faceClusters.map((cluster) => {
            const photo = photos.find((p) => p.id === cluster.representative.photoId);
            if (!photo) return null;
            return (
              <FaceCircle
                key={cluster.clusterId}
                url={photo.url}
                box={cluster.representative.box}
                size={52}
                selected={faceFilterClusterId === cluster.clusterId}
                onClick={() => setFaceFilterClusterId(faceFilterClusterId === cluster.clusterId ? null : cluster.clusterId)}
              />
            );
          })}
        </div>
      )}
      {faceClusters.length === 0 && <div className="mb-4" />}

      {isArchived && (
        <div className="rounded-xl px-3.5 py-2.5 mb-3.5 text-xs bg-[#FBEEEC] text-rose">
          הגלריה בארכיון ותימחק סופית בתאריך{" "}
          {gallery.permanent_delete_at && new Date(gallery.permanent_delete_at).toLocaleDateString("he-IL")}. הקישור
          ללקוח אינו פעיל יותר.
        </div>
      )}

      {photos.length > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => {
              const firstPending = photos.findIndex((p) => p.culling_status === "pending");
              setCullingIndex(firstPending !== -1 ? firstPending : 0);
            }}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold bg-ink text-white ${BTN_PRESS}`}
          >
            🗂️ מיון תמונות
            {photos.some((p) => p.culling_status === "pending") &&
              ` (${photos.filter((p) => p.culling_status === "pending").length} ממתינות)`}
          </button>
          {photos.some((p) => p.culling_status === "rejected") && (
            <button
              onClick={() => setShowRejectedOnly((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${BTN_PRESS}`}
              style={{
                background: showRejectedOnly ? "var(--color-rose)" : "var(--color-chip)",
                color: showRejectedOnly ? "#fff" : "var(--color-ink-soft)",
              }}
            >
              ✗ נפסלו ({photos.filter((p) => p.culling_status === "rejected").length})
            </button>
          )}
        </div>
      )}

      {favoriteCount > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <button
            onClick={() => setShowFavoritesOnly((v) => !v)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${BTN_PRESS}`}
            style={{
              background: showFavoritesOnly ? "var(--color-amber-deep)" : "var(--color-chip)",
              color: showFavoritesOnly ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            💜 מועדפים ({favoriteCount})
          </button>
          {showFavoritesOnly && (
            <button
              onClick={downloadFavoritesZip}
              disabled={zippingFavorites}
              aria-label="הורדת כל התמונות המועדפות"
              title="הורדת כל התמונות המועדפות, מאורגנות לפי לשוניות"
              className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line text-ink-soft disabled:opacity-60 ${BTN_PRESS}`}
            >
              <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
              </svg>
            </button>
          )}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-1.5 mb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto sm:flex-1 sm:min-w-0">
          <button
            onClick={() => setActiveFolderId(null)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${BTN_PRESS}`}
            style={{
              background: activeFolderId === null ? "var(--color-amber-deep)" : "var(--color-chip)",
              color: activeFolderId === null ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            הכל
          </button>
          {folders.map((folder) =>
            editingFolderId === folder.id ? (
              <div
                key={folder.id}
                ref={(el) => el?.scrollIntoView({ block: "nearest", inline: "nearest" })}
                className="shrink-0 flex items-center gap-1"
              >
                <input
                  autoFocus
                  value={editFolderName}
                  onChange={(e) => setEditFolderName(e.target.value)}
                  onBlur={renameFolder}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") renameFolder();
                    if (e.key === "Escape") setEditingFolderId(null);
                  }}
                  className="w-24 rounded-full px-3 py-1.5 text-xs border border-line"
                />
                <button
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setDeleteFolderConfirm(folder)}
                  aria-label="מחיקת התיקייה"
                  title="מחיקת התיקייה"
                  className={`shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-rose border border-line bg-white ${BTN_PRESS}`}
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                key={folder.id}
                onClick={() => setActiveFolderId(folder.id)}
                onDoubleClick={() => {
                  setEditingFolderId(folder.id);
                  setEditFolderName(folder.name);
                }}
                title="לחיצה כפולה לשינוי שם או מחיקה"
                className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${BTN_PRESS}`}
                style={{
                  background: activeFolderId === folder.id ? "var(--color-amber-deep)" : "var(--color-chip)",
                  color: activeFolderId === folder.id ? "#fff" : "var(--color-ink-soft)",
                }}
              >
                {folder.name}
              </button>
            )
          )}
          {addingFolder ? (
            <div className="shrink-0 flex items-center gap-1">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createFolder();
                  if (e.key === "Escape") {
                    setAddingFolder(false);
                    setNewFolderName("");
                  }
                }}
                placeholder="שם התיקייה"
                className="w-24 rounded-full px-3 py-1.5 text-xs border border-line"
              />
              <button onClick={createFolder} className={`shrink-0 h-7 w-7 rounded-full bg-ink text-white text-xs ${BTN_PRESS}`}>
                ✓
              </button>
            </div>
          ) : (
            <button
              onClick={() => setAddingFolder(true)}
              aria-label="הוספת תיקייה חדשה"
              title="הוספת תיקייה חדשה"
              className={`shrink-0 h-7 w-7 rounded-full border border-dashed border-line text-ink-soft text-xs flex items-center justify-center ${BTN_PRESS}`}
            >
              +
            </button>
          )}
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          title="העלאת תמונות נוספות לגלריה"
          className={`shrink-0 sm:ms-auto flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold bg-white border border-line text-ink ${BTN_PRESS}`}
        >
          <span className="text-sm leading-none">+</span> העלאת תמונות
        </button>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-ink-soft font-data">{visiblePhotos.length} תמונות</span>
        <span className="text-[11px] text-ink-soft">
          פריסה: {GRID_STYLE_OPTIONS.find((g) => g.id === resolvedGridStyle)?.label} — משתנה ב״הגדרות גלריה״
        </span>
      </div>

      {visiblePhotos.length > 0 && (
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
      )}

      {visiblePhotos.length > 0 && (
        <div ref={pinchContainerRef} className="relative mb-4" style={{ touchAction: "pan-y" }}>
          {resolvedGridStyle === "grid" ? (
            <div
              className="grid gap-1.5"
              style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cellSize}px, 1fr))` }}
            >
              {visiblePhotos.map((photo, i) => (
                <button
                  key={photo.id}
                  onPointerDown={() => startPress(photo)}
                  onPointerUp={cancelPress}
                  onPointerLeave={cancelPress}
                  onClick={() => handlePhotoClick(photo, i)}
                  className="relative aspect-square rounded-lg overflow-hidden bg-line"
                  style={photo.preview_blur_data_url ? { backgroundImage: `url(${photo.preview_blur_data_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
                >
                  {/* Plain img (not next/image) to match the justified/masonry grid styles below —
                      next/image's own onLoad-driven fade-in was replaying on every remount (e.g.
                      switching folder tabs away and back unmounts/remounts these nodes), reading as
                      a full reload even though the browser already had the bytes cached. A blurred
                      LQIP sits on the button's own background (always visible, zero network cost —
                      it's inlined as a data URI) so there's real content behind the sharp image
                      instead of blank space while thumbsReady is still false. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.previewUrl ?? optimizedImageUrl(photo.url, 640)}
                    alt={photo.original_filename}
                    className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                    style={{ opacity: thumbsReady ? 1 : 0, ...(lightboxIndex !== i ? { viewTransitionName: `mgr-photo-${photo.id}` } : undefined) }}
                    onLoad={() => markThumbLoaded(photo.id)}
                    onError={() => markThumbLoaded(photo.id)}
                  />
                  <MgrPhotoOverlays photo={photo} isCover={gallery.cover_photo_id === photo.id} selectedIds={selectedIds} />
                </button>
              ))}
            </div>
          ) : resolvedGridStyle === "justified" ? (
            <div className="flex flex-wrap gap-1.5">
              {visiblePhotos.map((photo, i) => {
                const ratio = mgrAspectRatios[photo.id] ?? 1.5;
                return (
                  <button
                    key={photo.id}
                    onPointerDown={() => startPress(photo)}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    onClick={() => handlePhotoClick(photo, i)}
                    className="relative rounded-lg overflow-hidden bg-line"
                    style={{
                      height: cellSize,
                      width: ratio * cellSize,
                      flexGrow: 1,
                      ...(photo.preview_blur_data_url ? { backgroundImage: `url(${photo.preview_blur_data_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.previewUrl ?? optimizedImageUrl(photo.url, 640)}
                      alt={photo.original_filename}
                      className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                      style={{ opacity: thumbsReady ? 1 : 0, ...(lightboxIndex !== i ? { viewTransitionName: `mgr-photo-${photo.id}` } : undefined) }}
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        const r = img.naturalWidth / img.naturalHeight;
                        setMgrAspectRatios((prev) => (prev[photo.id] ? prev : { ...prev, [photo.id]: r }));
                        markThumbLoaded(photo.id);
                      }}
                      onError={() => markThumbLoaded(photo.id)}
                    />
                    <MgrPhotoOverlays photo={photo} isCover={gallery.cover_photo_id === photo.id} selectedIds={selectedIds} />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="gap-1.5" style={{ columnWidth: `${cellSize}px` }}>
              {visiblePhotos.map((photo, i) => {
                const framed = resolvedGridStyle === "framed";
                // The masonry column layout needs the tile's shape to size it — with a known
                // preview_aspect_ratio (server-computed at preview-generation time, see
                // galleryPhotoPreview.ts) the tile gets its size from CSS immediately, so a blurred
                // background + a fading real <img> works the same as the other two grid styles.
                // Older photos processed before that column existed fall back to the previous
                // behavior: natural intrinsic sizing, image shows as soon as it's simply loaded.
                const knownShape = photo.preview_aspect_ratio != null;
                return (
                  <button
                    key={photo.id}
                    onPointerDown={() => startPress(photo)}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    onClick={() => handlePhotoClick(photo, i)}
                    className="relative w-full mb-1.5 rounded-lg overflow-hidden bg-line block break-inside-avoid"
                    style={{
                      ...(framed ? { padding: 4, border: "1px solid var(--color-line)" } : {}),
                      ...(knownShape ? { aspectRatio: `${photo.preview_aspect_ratio}` } : {}),
                      ...(photo.preview_blur_data_url ? { backgroundImage: `url(${photo.preview_blur_data_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={photo.previewUrl ?? optimizedImageUrl(photo.url, 640)}
                      alt={photo.original_filename}
                      onLoad={() => markThumbLoaded(photo.id)}
                      onError={() => markThumbLoaded(photo.id)}
                      className={knownShape ? "absolute inset-0 w-full h-full object-cover transition-opacity duration-300" : "w-full h-auto block"}
                      style={{
                        opacity: knownShape ? (thumbsReady ? 1 : 0) : 1,
                        ...(lightboxIndex !== i ? { viewTransitionName: `mgr-photo-${photo.id}` } : {}),
                      }}
                    />
                    <MgrPhotoOverlays photo={photo} isCover={gallery.cover_photo_id === photo.id} selectedIds={selectedIds} offset={framed ? 8 : 4} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        style={{ minHeight: "15cm" }}
        className={`flex rounded-lg border-2 border-dashed transition-colors ${isDragging ? "border-amber-deep bg-amber-bg" : "border-line"}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ALLOWED_ACCEPT}
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
          id={`gallery-upload-${gallery.id}`}
        />
        <label
          htmlFor={`gallery-upload-${gallery.id}`}
          className={`w-full flex items-center justify-center px-6 text-base font-semibold cursor-pointer text-ink text-center ${BTN_PRESS}`}
        >
          {uploading ?? (isDragging ? "שחררו כאן להעלאה" : "העלאת תמונות — או גררו לכאן תמונות ותיקיות")}
        </label>
      </div>
      <input
        ref={directoryInputRef}
        type="file"
        accept={ALLOWED_ACCEPT}
        multiple
        onChange={(e) => handleDirectoryFiles(e.target.files)}
        className="hidden"
        id={`gallery-upload-dir-${gallery.id}`}
        {...({ webkitdirectory: "true", directory: "true" } as unknown as Record<string, string>)}
      />
      <label
        htmlFor={`gallery-upload-dir-${gallery.id}`}
        className={`w-full flex items-center justify-center rounded-lg py-2 mt-1.5 text-xs font-semibold bg-white border border-line text-ink-soft cursor-pointer ${BTN_PRESS}`}
      >
        העלאת תיקייה שלמה מהמחשב
      </label>
      <p className="text-[11px] text-ink-soft mt-1.5 text-center">
        פורמטים נתמכים בלבד: JPG, JPEG, PNG, GIF, BMP
      </p>

      <GalleryVideosSection galleryId={gallery.id} />
      <GalleryFtpSection
        galleryId={gallery.id}
        allowed={SUBSCRIPTION_PLANS[photographerPlan].tier === "studio_pro" || photographerEmail === ADMIN_EMAIL}
      />

      {error && <p className="text-xs text-rose mt-2 whitespace-pre-line">{error}</p>}

      <div className="mt-3 space-y-2">
        {!gallery.published && (
          <p className="text-[11px] text-ink-soft text-center">
            משך שמירת הגלריה: {expiryDays ? GALLERY_EXPIRY_OPTIONS.find((o) => o.value === expiryDays)?.label : "ללא הגבלת זמן (מדיניות ישנה)"} — ניתן לשנות בהגדרות הגלריה
          </p>
        )}

        {gallery.published && !isArchived && (
          <div className="rounded-xl px-3.5 py-2.5 text-sm bg-sage-bg text-sage font-medium text-center">
            הגלריה פורסמה ✓
            {gallery.expires_at && (
              <span className="block text-[11px] mt-0.5 font-normal">
                בתוקף עד {new Date(gallery.expires_at).toLocaleDateString("he-IL")}
              </span>
            )}
          </div>
        )}

        {!gallery.published && photos.length > 0 && (
          <button
            onClick={publish}
            disabled={publishing}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60 ${BTN_PRESS}`}
          >
            {publishing ? "מפרסם..." : "פרסום הגלריה ללקוח"}
          </button>
        )}

        {gallery.published && !isArchived && (
          <button
            onClick={copyLink}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white ${BTN_PRESS}`}
          >
            {copied ? "✓ הועתק" : "העתקת קישור"}
          </button>
        )}

        {isArchived && (
          <button
            onClick={renew}
            disabled={renewing}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60 ${BTN_PRESS}`}
          >
            {renewing ? "מחדש..." : "חידוש תוקף הגלריה"}
          </button>
        )}

        {gallery.published && (
          <div className="flex gap-2">
            <button
              onClick={openShare}
              className={`flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink ${BTN_PRESS}`}
            >
              שיתוף
            </button>
            <button
              onClick={copyLink}
              className={`shrink-0 rounded-lg px-3.5 py-2.5 text-xs font-semibold bg-white border border-line text-ink-soft ${BTN_PRESS}`}
            >
              {copied ? "✓ הועתק" : "העתקת קישור"}
            </button>
          </div>
        )}
      </div>

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
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCoverPhoto(visiblePhotos[lightboxIndex]);
            }}
            title="קביעה כשער לגלריה"
            aria-label="קביעה כשער לגלריה"
            className={`absolute top-4 right-4 h-9 px-3.5 rounded-full flex items-center gap-1.5 text-xs font-semibold ${BTN_PRESS}`}
            style={{
              background: gallery.cover_photo_id === visiblePhotos[lightboxIndex].id ? "var(--color-amber-deep)" : "rgba(255,255,255,0.1)",
              color: "#fff",
            }}
          >
            🖼 {gallery.cover_photo_id === visiblePhotos[lightboxIndex].id ? "שער הגלריה" : "קביעה כשער"}
          </button>
          {lightboxIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navLightbox(lightboxIndex - 1);
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
                navLightbox(lightboxIndex + 1);
              }}
              className={`absolute left-3 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center text-lg ${BTN_PRESS}`}
            >
              ‹
            </button>
          )}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={visiblePhotos[lightboxIndex].previewUrl ?? `/api/galleries/${gallery.id}/photos/${visiblePhotos[lightboxIndex].id}/preview`}
            alt={visiblePhotos[lightboxIndex].original_filename}
            className="max-w-[90vw] max-h-[85vh] object-contain"
            style={{ viewTransitionName: `mgr-photo-${visiblePhotos[lightboxIndex].id}` }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* Double-tap action sheet */}
      {actionSheetPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(46,49,66,0.45)" }}
          onClick={() => setActionSheetPhoto(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-2">
              <button
                onClick={() => downloadPhoto(actionSheetPhoto)}
                className="w-full text-right rounded-lg py-3 px-4 text-sm font-medium bg-white border border-line"
              >
                ⬇ הורדה
              </button>
              <button
                onClick={() => sharePhoto(actionSheetPhoto)}
                className="w-full text-right rounded-lg py-3 px-4 text-sm font-medium bg-white border border-line"
              >
                ↗ שיתוף
              </button>
              <button
                onClick={() => setCoverPhoto(actionSheetPhoto)}
                className="w-full text-right rounded-lg py-3 px-4 text-sm font-medium bg-white border border-line"
              >
                🖼 קביעה כשער לגלריה
              </button>
              <button
                onClick={() => togglePortfolio(actionSheetPhoto)}
                className="w-full text-right rounded-lg py-3 px-4 text-sm font-medium bg-white border border-line"
              >
                {actionSheetPhoto.in_portfolio ? "★ הסרה מהפורטפוליו הציבורי" : "☆ הוספה לפורטפוליו הציבורי"}
              </button>
              <button
                onClick={() => {
                  setDeleteConfirmPhoto(actionSheetPhoto);
                  setActionSheetPhoto(null);
                }}
                className="w-full text-right rounded-lg py-3 px-4 text-sm font-medium bg-white border border-line text-rose"
              >
                🗑 מחיקה
              </button>
              <button
                onClick={() => setActionSheetPhoto(null)}
                className="w-full text-center rounded-lg py-3 text-sm font-semibold text-ink-soft"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirmPhoto && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{ background: "rgba(46,49,66,0.45)" }}
          onClick={() => setDeleteConfirmPhoto(null)}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2 font-display">למחוק את התמונה?</h2>
            <p className="text-sm text-ink-soft mb-5">הפעולה תמחק את התמונה לצמיתות מהגלריה ולא ניתן יהיה לשחזר אותה.</p>
            <div className="flex gap-2">
              <button
                onClick={confirmDeletePhoto}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white"
              >
                כן, מחק לצמיתות
              </button>
              <button
                onClick={() => setDeleteConfirmPhoto(null)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete-selected confirmation */}
      {deleteSelectedConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center"
          style={{
            background: "rgba(46,49,66,0.45)",
            opacity: deleteSelectedConfirmClosing ? 0 : 1,
            transition: `opacity ${CLOSE_ANIMATION_MS}ms ease`,
          }}
          onClick={cancelDeleteSelected}
        >
          <div
            className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet"
            style={{ opacity: deleteSelectedConfirmClosing ? 0 : 1, transition: `opacity ${CLOSE_ANIMATION_MS}ms ease` }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2 font-display">למחוק {selectedIds.size} תמונות?</h2>
            <p className="text-sm text-ink-soft mb-5">הפעולה תמחק את התמונות שנבחרו לצמיתות מהגלריה ולא ניתן יהיה לשחזר אותן.</p>
            <div className="flex gap-2">
              <button
                onClick={confirmDeleteSelectedPhotos}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white"
              >
                כן, מחק לצמיתות
              </button>
              <button
                onClick={cancelDeleteSelected}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {exportRangeFormat && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: "rgba(46,49,66,0.45)" }}
          onClick={() => setExportRangeFormat(null)}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 font-display">
              {exportRangeFormat === "pdf" ? "ייצוא PDF" : exportRangeFormat === "jpg" ? "ייצוא JPG" : "ייצוא PSD"} — טווח עמודים
            </h2>
            <p className="text-sm text-ink-soft mb-4">בחר/י מאיזה עמוד עד איזה עמוד לייצא (מתוך {albumTotalPages} עמודים).</p>
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-ink-soft mb-1">מעמוד</label>
                <input
                  type="number"
                  min={1}
                  max={albumTotalPages}
                  value={exportRangeFrom}
                  onChange={(e) => setExportRangeFrom(Number(e.target.value))}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-white text-ink"
                />
              </div>
              <span className="text-ink-soft mt-5">עד</span>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-ink-soft mb-1">עד עמוד</label>
                <input
                  type="number"
                  min={1}
                  max={albumTotalPages}
                  value={exportRangeTo}
                  onChange={(e) => setExportRangeTo(Number(e.target.value))}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-white text-ink"
                />
              </div>
            </div>
            {(exportRangeFormat === "jpg" || exportRangeFormat === "psd") && (
              <p className="text-xs text-ink-soft mb-4">קובץ ה-ZIP יירד אוטומטית לתיקיית ההורדות במחשב שלך.</p>
            )}
            <div className="flex gap-2">
              <button onClick={confirmExportRange} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white">
                הורדה
              </button>
              <button
                onClick={() => setExportRangeFormat(null)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {printHouseModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: "rgba(46,49,66,0.45)" }}
          onClick={() => setPrintHouseModalOpen(false)}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold font-display">שליחה לבית דפוס</h2>
              <button
                onClick={() => setPrintHouseModalOpen(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
              >
                ✕
              </button>
            </div>
            <p className="text-sm text-ink-soft mb-4">
              קובצי ה-JPG של כל עמודי האלבום יישלחו כקישור להורדה, לכתובת שתבחר/י.
            </p>
            <PrintHouseEmailsSettings
              initialEmails={printHouseEmails}
              selectable
              selectedId={printHouseSelectedId}
              onSelect={setPrintHouseSelectedId}
              onChange={setPrintHouseEmails}
              compact
            />
            <button
              onClick={() => setPrintHouseConfirmOpen(true)}
              disabled={!printHouseSelectedId}
              className="w-full rounded-lg py-3 text-sm font-semibold mt-4 bg-ink text-white disabled:opacity-40"
            >
              שליחה
            </button>
          </div>
        </div>
      )}

      {printHouseConfirmOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(46,49,66,0.55)" }}>
          <div className="w-full max-w-xs rounded-2xl p-5 bg-paper shadow-sheet text-center">
            <p className="text-sm font-semibold mb-1">לשלוח את קובצי ה-JPG לבית הדפוס?</p>
            <p className="text-xs text-ink-soft mb-4" dir="ltr">
              {(() => {
                const target = printHouseEmails.find((e) => e.id === printHouseSelectedId);
                return target ? target.label || target.email : "";
              })()}
            </p>
            <div className="flex gap-2">
              <button onClick={sendToPrintHouseConfirmed} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white">
                כן, שליחה
              </button>
              <button
                onClick={() => setPrintHouseConfirmOpen(false)}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {printHouseToast && (
        <div className="fixed bottom-5 inset-x-4 z-[90] flex justify-center pointer-events-none">
          <div className="rounded-full px-4 py-2.5 text-sm font-semibold bg-ink text-white shadow-sheet">{printHouseToast}</div>
        </div>
      )}

      {saveBookTemplateOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: "rgba(46,49,66,0.45)" }}
          onClick={() => setSaveBookTemplateOpen(false)}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 font-display">שמירת תבנית אלבום</h2>
            <p className="text-sm text-ink-soft mb-4">
              מבנה העמודים הנוכחי ({albumSpreads.length} עמודים) יישמר בתור תבנית לשימוש חוזר — בפעם הבאה אפשר יהיה לבנות ממנה אלבום חדש בלחיצה אחת.
            </p>
            <input
              autoFocus
              value={bookTemplateNameDraft}
              onChange={(e) => setBookTemplateNameDraft(e.target.value)}
              placeholder="שם התבנית"
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => saveAlbumBookTemplate(bookTemplateNameDraft)}
                disabled={!bookTemplateNameDraft.trim() || savingBookTemplate}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                {savingBookTemplate ? "שומר..." : "שמירה"}
              </button>
              <button
                onClick={() => setSaveBookTemplateOpen(false)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmNewAlbumOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: "rgba(46,49,66,0.7)" }}
          onClick={() => setConfirmNewAlbumOpen(false)}
        >
          <div className="w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 font-display">להתחיל אלבום חדש?</h2>
            <p className="text-sm text-ink-soft mb-5">
              האלבום הנוכחי ({albumSpreads.length} עמודים) יימחק לצמיתות, כולל כל התמונות שסודרו וההערות של הלקוח/ה. הפעולה לא ניתנת לביטול.
            </p>
            <div className="flex gap-2">
              <button onClick={startNewAlbum} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white">
                כן, התחל מחדש
              </button>
              <button
                onClick={() => setConfirmNewAlbumOpen(false)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteFolderConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: "rgba(46,49,66,0.7)" }}
          onClick={() => !deletingFolder && setDeleteFolderConfirm(null)}
        >
          <div className="w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 font-display">למחוק את הלשונית &quot;{deleteFolderConfirm.name}&quot;?</h2>
            <p className="text-sm text-ink-soft mb-5">
              התמונות שבתוכה לא יימחקו — הן פשוט יעברו ל&quot;הכל&quot;. הלשונית עצמה תימחק לצמיתות ולא ניתן לשחזר אותה.
            </p>
            <div className="flex gap-2">
              <button
                onClick={deleteFolder}
                disabled={deletingFolder}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white disabled:opacity-60"
              >
                {deletingFolder ? "מוחק..." : "כן, מחק את הלשונית"}
              </button>
              <button
                onClick={() => setDeleteFolderConfirm(null)}
                disabled={deletingFolder}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {shareStatus && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-full px-4 py-2 text-xs font-semibold bg-ink text-white shadow-sheet">
          {shareStatus}
        </div>
      )}

      {/* Multi-select floating toolbar — fades out while the delete-selected question is open
          (fully, not just while animating in) and cross-fades back in the moment the user cancels,
          since the selection itself is left untouched the whole time. */}
      {selectedIds.size > 0 && (
        <div
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-auto max-w-[92vw] rounded-full px-4 py-3 bg-ink text-white shadow-sheet flex items-center justify-between gap-3"
          style={{
            opacity: deleteSelectedConfirmOpen && !deleteSelectedConfirmClosing ? 0 : 1,
            pointerEvents: deleteSelectedConfirmOpen && !deleteSelectedConfirmClosing ? "none" : "auto",
            transition: `opacity ${CLOSE_ANIMATION_MS}ms ease`,
          }}
        >
          <button
            onClick={downloadSelectedPhotos}
            className={`flex items-center gap-1 text-sm font-semibold whitespace-nowrap ${BTN_PRESS}`}
          >
            ⬇ הורדה
          </button>
          <button
            onClick={() => setDeleteSelectedConfirmOpen(true)}
            className={`flex items-center gap-1 text-sm font-semibold whitespace-nowrap text-rose ${BTN_PRESS}`}
          >
            🗑 מחיקה
          </button>
          <button onClick={selectAllVisible} className={`text-sm font-semibold whitespace-nowrap ${BTN_PRESS}`}>
            בחירת הכל
          </button>
          <span className="text-sm font-data font-semibold whitespace-nowrap">{selectedIds.size} נבחרו</span>
          <button
            onClick={clearSelection}
            aria-label="ביטול בחירה"
            title="ביטול בחירה"
            className={`shrink-0 h-6 w-6 rounded-full bg-white/15 flex items-center justify-center text-xs ${BTN_PRESS}`}
          >
            ✕
          </button>
        </div>
      )}

      {settingsOpen && (
        <GallerySettingsModal
          isStandalone={!eventId}
          title={editTitle}
          setTitle={setEditTitle}
          shootDate={editShootDate}
          setShootDate={setEditShootDate}
          clientEmail={editClientEmail}
          setClientEmail={setEditClientEmail}
          clientPhone={editClientPhone}
          setClientPhone={setEditClientPhone}
          allowDownloads={editAllowDownloads}
          setAllowDownloads={setEditAllowDownloads}
          expiryDays={expiryDays}
          setExpiryDays={setExpiryDays}
          expiryOptions={galleryExpiryOptions}
          theme={theme}
          setTheme={setTheme}
          coverTextPosition={coverTextPosition}
          setCoverTextPosition={setCoverTextPosition}
          coverShape={coverShape}
          setCoverShape={setCoverShape}
          coverPhotoId={coverPhotoId}
          setCoverPhotoId={setCoverPhotoId}
          titleFontOverride={titleFontOverride}
          setTitleFontOverride={setTitleFontOverride}
          gridStyleOverride={gridStyleOverride}
          setGridStyleOverride={setGridStyleOverride}
          photos={photos}
          previewTitle={clientName || gallery.title}
          previewDateLabel={eventDate ? new Date(eventDate).toLocaleDateString("he-IL") : null}
          saving={savingSettings}
          onSave={saveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {slideshowManageOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(46,49,66,0.7)" }}
          onClick={() => setSlideshowManageOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-3xl p-5 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold font-display mb-4">מצגת תמונות</h2>
            <p className="text-xs text-ink-soft mb-3.5">
              בוחרים אילו תמונות ייכנסו למצגת ללקוח — היא תוצג במסך מלא עם אפקטים רנדומליים.
            </p>

            <div className="flex items-center justify-between mb-2.5">
              <p className="text-xs text-ink-soft">בחירת תמונות</p>
              {slideshowPhotoIds.size > 0 && (
                <button
                  onClick={() => setSlideshowPreviewOpen(true)}
                  aria-label="תצוגה מקדימה של המצגת"
                  title="תצוגה מקדימה"
                  className={`h-8 w-8 rounded-full flex items-center justify-center bg-amber-deep text-white ${BTN_PRESS}`}
                >
                  <PlayIcon />
                </button>
              )}
            </div>
            <div className="grid grid-cols-4 gap-2 mb-2.5">
              {photos.map((p) => {
                const active = slideshowPhotoIds.has(p.id);
                return (
                  <button
                    key={p.id}
                    onClick={() => toggleSlideshowPhoto(p.id)}
                    className="relative aspect-square rounded-lg overflow-hidden"
                    style={{
                      boxShadow: active
                        ? "0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-amber-deep)"
                        : "0 0 0 1px var(--color-line)",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt="" className="w-full h-full object-cover" />
                    {active && (
                      <span
                        className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full flex items-center justify-center text-[9px]"
                        style={{ background: "var(--color-amber-deep)", color: "#fff" }}
                      >
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] text-ink-soft mb-5">{slideshowPhotoIds.size} תמונות נבחרו</p>

            {error && <p className="text-xs text-rose mb-2.5">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={saveSlideshow}
                disabled={savingSlideshow}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                {savingSlideshow ? "שומר..." : "שמירה"}
              </button>
              <button
                onClick={() => setSlideshowManageOpen(false)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink-soft"
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}

      {slideshowPreviewOpen && (
        <GallerySlideshow
          photos={photos.filter((p) => slideshowPhotoIds.has(p.id)).map((p) => ({ id: p.id, url: p.url }))}
          onClose={() => setSlideshowPreviewOpen(false)}
          onDownload={downloadSlideshowZip}
          downloading={zippingFavorites}
        />
      )}

      {albumManageOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-hidden"
          style={{ background: "rgba(46,49,66,0.7)" }}
          onClick={() => {
            if (Date.now() - albumManageOpenedAtRef.current < 400) return;
            setAlbumManageOpen(false);
          }}
        >
          {albumNeedsRotate ? (
            // Shown instead of the panel below — see the albumNeedsRotate comment above for why
            // this isn't a one-time dismissible tip: it reappears every time this modal is opened
            // (or left) in portrait, and the real panel never mounts until the device already
            // reports landscape.
            <div className="flex flex-col items-center gap-4 p-6 text-center" onClick={(e) => e.stopPropagation()}>
              <div className="w-16 h-16 rounded-full bg-white flex items-center justify-center shadow-sheet" style={{ color: "var(--color-amber-deep)" }}>
                <IconRotateDevice size={28} />
              </div>
              <div className="text-white">
                <p className="text-lg font-bold font-display mb-1">סובבו את המכשיר למצב אופקי</p>
                <p className="text-sm opacity-80">כלי עיצוב האלבום פועל רק במצב אופקי — סובבו את הטלפון כדי להמשיך</p>
              </div>
              <button onClick={() => setAlbumManageOpen(false)} className="mt-1 h-9 px-4 rounded-full bg-white text-ink text-sm font-semibold">
                סגירה
              </button>
            </div>
          ) : (
            // albumPhase "settling" doesn't need its own branch here — the component returns its
            // own top-level, higher-z-index spinner for that phase before reaching this JSX at all
            // (see that early return's comment for why it has to live up there, not nested in here).
          <>
          {/* Real desktop (≥1024px) is completely untouched — every rule below is scoped inside
              `@media (max-width: 1023.98px)`. Below that width the panel is sized with real vw/vh
              dimensions, not `zoom`/`transform: scale()` — both were tried and both left a real
              standalone-iOS-PWA device mistapping several rows below the visible button, even on a
              completely fresh landscape mount; see the fuller comment in AlbumSpreadCanvasEditor.tsx
              (this screen's sibling tool) for the full history. A real width/height has no painted-
              vs-hit-tested gap to begin with. This only ever needs a landscape layout — the
              albumNeedsRotate branch above shows a rotate prompt instead of this panel whenever the
              device is under 1024px and portrait, so by the time this renders here, it already is. */}
          <style>{`
            @media (max-width: 1023.98px) {
              .gf-album-manage-card {
                width: 96vw !important;
                height: 94vh !important;
                max-width: none !important;
                max-height: none !important;
              }
            }
          `}</style>
          <div
            className={`gf-album-manage-card w-full max-w-sm rounded-3xl bg-paper shadow-sheet overflow-hidden flex flex-col ${
              albumManageFullscreen ? "lg:max-w-none lg:w-[95vw] lg:h-[92vh] max-h-[85vh] lg:max-h-none" : "lg:max-w-3xl max-h-[85vh]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <ErrorBoundary label="עיצוב אלבום">
            {/* A `position: sticky` header used to sit inside the same scrolling container as the
                body below it — real iOS Safari/WKWebView has a long-documented bug where a sticky
                (or fixed) element's PAINTED position updates correctly on scroll but its touch
                hit-test region can desync from that, most reliably reproducing in exactly this kind
                of embedded WKWebView context (a standalone home-screen PWA). That's a strong match
                for a real report on this header specifically — tapping a button here landed the tap
                several rows below it, on a real device, after the scroll region had ever moved.
                Splitting into two flex children instead — this header as a plain, never-scrolled
                item, and a SEPARATE scrolling wrapper below for the body — means the header is never
                inside a scrolled element at all, sticky or not, so there's nothing for that class of
                bug to attach to. */}
            <div className="shrink-0 px-5 lg:px-7 pt-5 lg:pt-7 pb-4 mb-2 bg-paper flex items-center justify-between flex-wrap gap-2 border-b border-line">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold font-display">עיצוב אלבום</h2>
                <button
                  onClick={() => setAlbumGuideOpen(true)}
                  aria-label="מדריך לכלי עיצוב האלבום"
                  title="מדריך לכלי עיצוב האלבום"
                  className={`h-6 w-6 rounded-full flex items-center justify-center bg-chip text-ink-soft text-[11px] font-bold ${BTN_PRESS}`}
                >
                  ?
                </button>
                {album && (
                  <button
                    onClick={() => setConfirmNewAlbumOpen(true)}
                    className={`${isAlbumPhone ? "text-[13px] font-semibold px-3.5 py-2" : "text-xs font-semibold px-3 py-1.5"} rounded-full bg-white border border-line text-ink`}
                  >
                    + אלבום חדש
                  </button>
                )}
              </div>
              <div className="flex items-center flex-wrap gap-2">
                {album && (
                  <button
                    onClick={createBlankSpread}
                    disabled={creatingSpread}
                    className={`${isAlbumPhone ? "text-[13px] font-semibold px-3.5 py-2" : "text-xs font-semibold px-3 py-1.5"} rounded-full bg-white border border-line text-ink disabled:opacity-60`}
                  >
                    {creatingSpread ? "יוצר..." : "+ עמוד חדש"}
                  </button>
                )}
                {album && albumSpreads.length > 0 && (
                  <button
                    onClick={() => setSaveBookTemplateOpen(true)}
                    className={`${isAlbumPhone ? "text-[13px] font-semibold px-3.5 py-2" : "text-xs font-semibold px-3 py-1.5"} rounded-full bg-white border border-line text-ink flex items-center gap-1`}
                  >
                    <IconAlbumSave size={12} />
                    שמירת מבנה האלבום כתבנית
                  </button>
                )}
                {album && (
                  <button
                    onClick={() => openExportRangeModal("pdf")}
                    disabled={exportingAlbumPdf || albumSpreads.length === 0}
                    className={`relative overflow-hidden ${isAlbumPhone ? "text-[13px] font-semibold px-3.5 py-2" : "text-xs font-semibold px-3 py-1.5"} rounded-full bg-white border border-line text-ink disabled:opacity-60`}
                  >
                    {exportingAlbumPdf && (
                      <LiquidProgressBar pct={exportProgressPdf ?? 0} style={{ position: "absolute", inset: 0, borderRadius: 9999 }} />
                    )}
                    <span className="relative z-10 flex items-center gap-1">
                      <IconPdf size={12} />
                      {exportingAlbumPdf ? "מייצא..." : "ייצוא PDF להדפסה"}
                    </span>
                  </button>
                )}
                {album && (
                  <button
                    onClick={() => openExportRangeModal("jpg")}
                    disabled={exportingAlbumJpg || albumSpreads.length === 0}
                    className={`relative overflow-hidden ${isAlbumPhone ? "text-[13px] font-semibold px-3.5 py-2" : "text-xs font-semibold px-3 py-1.5"} rounded-full bg-white border border-line text-ink disabled:opacity-60`}
                  >
                    {exportingAlbumJpg && (
                      <LiquidProgressBar pct={exportProgressJpg ?? 0} style={{ position: "absolute", inset: 0, borderRadius: 9999 }} />
                    )}
                    <span className="relative z-10 flex items-center gap-1">
                      <IconImage size={12} />
                      {exportingAlbumJpg ? "מייצא..." : "ייצוא JPG (כל העמודים)"}
                    </span>
                  </button>
                )}
                {album && albumSpreads.length > 0 && (
                  <button
                    onClick={openPrintHouseModal}
                    disabled={printHouseOpActive}
                    className={`relative overflow-hidden ${isAlbumPhone ? "text-[13px] font-semibold px-3.5 py-2" : "text-xs font-semibold px-3 py-1.5"} rounded-full bg-white border border-line text-ink disabled:opacity-60 flex items-center gap-1`}
                  >
                    <IconImage size={12} />
                    {printHouseOpActive ? "שולח..." : "שליחה לבית דפוס"}
                  </button>
                )}
                {album && (
                  <button
                    onClick={() => openExportRangeModal("psd")}
                    disabled={exportingAlbumPsd || albumSpreads.length === 0}
                    className={`relative overflow-hidden ${isAlbumPhone ? "text-[13px] font-semibold px-3.5 py-2" : "text-xs font-semibold px-3 py-1.5"} rounded-full bg-white border border-line text-ink disabled:opacity-60`}
                  >
                    {exportingAlbumPsd && (
                      <LiquidProgressBar pct={exportProgressPsd ?? 0} style={{ position: "absolute", inset: 0, borderRadius: 9999 }} />
                    )}
                    <span className="relative z-10 flex items-center gap-1">
                      <IconPalette size={12} />
                      {exportingAlbumPsd ? "מייצא..." : "ייצוא PSD (פוטושופ)"}
                    </span>
                  </button>
                )}
                {album && album.status !== "approved" && (
                  <button
                    onClick={sendAlbumToClient}
                    disabled={savingAlbum || albumSpreads.length === 0}
                    className={`${isAlbumPhone ? "text-[13px] font-semibold px-3.5 py-2" : "text-xs font-semibold px-3 py-1.5"} rounded-full bg-amber-deep text-white disabled:opacity-60`}
                  >
                    {savingAlbum ? "שולח..." : album.status === "draft" ? "שליחה לאישור הלקוח/ה" : "שליחה מחדש לאישור"}
                  </button>
                )}
                <button
                  onClick={() => setAlbumManageFullscreen((v) => !v)}
                  aria-label={albumManageFullscreen ? "הקטנת החלון" : "הגדלה למסך מלא"}
                  title={albumManageFullscreen ? "הקטנת החלון" : "הגדלה למסך מלא"}
                  className="hidden lg:flex h-8 w-8 rounded-full items-center justify-center bg-white border border-line text-ink-soft"
                >
                  <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    {albumManageFullscreen ? (
                      <path d="M9 4v4a1 1 0 0 1-1 1H4M20 9h-4a1 1 0 0 1-1-1V4M15 20v-4a1 1 0 0 1 1-1h4M4 15h4a1 1 0 0 1 1 1v4" />
                    ) : (
                      <path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" />
                    )}
                  </svg>
                </button>
                <button onClick={() => setAlbumManageOpen(false)} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line">
                  <IconAlbumClose />
                </button>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 lg:px-7 pb-5 lg:pb-7">
            {albumLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10">
                <div className="h-8 w-8 rounded-full border-2 border-line border-t-ink animate-spin" />
                <p className="text-sm text-ink-soft">טוען...</p>
              </div>
            ) : !album ? (
              <>
                <p className="text-xs text-ink-soft mb-3.5">
                  קודם כל, מה מידות האלבום להדפסה? תתחילו מעמוד ריק אחד — ומשם תוכלו לבחור תבנית מוכנה או לעצב בעצמכם, ולהוסיף עוד עמודים בהמשך.
                </p>
                <p className="text-xs text-ink-soft mb-2">מידה נפוצה — בחירה ממלאת את השדות למטה, ואפשר גם לשנות אותם ידנית</p>
                <select
                  value={ALBUM_SIZE_PRESETS.find((p) => p.width === albumSizeDraft.width && p.height === albumSizeDraft.height)?.label ?? ""}
                  onChange={(e) => {
                    const preset = ALBUM_SIZE_PRESETS.find((p) => p.label === e.target.value);
                    if (preset) setAlbumSizeDraft({ width: preset.width, height: preset.height, margin: preset.margin });
                  }}
                  style={{ width: "15vw", minWidth: 110 }}
                  className="rounded-lg border border-line px-2.5 py-2 text-sm bg-white mb-3.5"
                >
                  <option value="">בחירה...</option>
                  {ALBUM_SIZE_PRESETS.map((preset) => (
                    <option key={preset.label} value={preset.label}>
                      {preset.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-ink-soft mb-2">מידות האלבום (ס״מ)</p>
                <div className="flex items-center gap-2 mb-2.5">
                  <input
                    type="number"
                    min={1}
                    value={albumSizeDraft.width}
                    onChange={(e) => setAlbumSizeDraft((prev) => ({ ...prev, width: Number(e.target.value) || prev.width }))}
                    className="w-20 rounded-lg border border-line px-2.5 py-2 text-sm text-center"
                  />
                  <span className="text-xs text-ink-soft">רוחב</span>
                  <span className="text-ink-soft">×</span>
                  <input
                    type="number"
                    min={1}
                    value={albumSizeDraft.height}
                    onChange={(e) => setAlbumSizeDraft((prev) => ({ ...prev, height: Number(e.target.value) || prev.height }))}
                    className="w-20 rounded-lg border border-line px-2.5 py-2 text-sm text-center"
                  />
                  <span className="text-xs text-ink-soft">גובה</span>
                </div>
                <div className="flex items-center gap-2 mb-5">
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    value={albumSizeDraft.margin}
                    onChange={(e) => setAlbumSizeDraft((prev) => ({ ...prev, margin: Number(e.target.value) || 0 }))}
                    className="w-20 rounded-lg border border-line px-2.5 py-2 text-sm text-center"
                  />
                  <span className="text-xs text-ink-soft">מרחק המסגרת הירוקה מהקצה (ס״מ)</span>
                </div>

                {albumBookTemplates.length > 0 && (
                  <div className="flex gap-2 mb-4">
                    <button
                      onClick={() => setAlbumWizardMode("style")}
                      className={`flex-1 rounded-lg py-2 text-xs font-semibold ${BTN_PRESS}`}
                      style={{
                        background: albumWizardMode === "style" ? "var(--color-amber-deep)" : "var(--color-chip)",
                        color: albumWizardMode === "style" ? "#fff" : "var(--color-ink-soft)",
                      }}
                    >
                      בנייה אוטומטית לפי סגנון
                    </button>
                    <button
                      onClick={() => setAlbumWizardMode("saved")}
                      className={`flex-1 rounded-lg py-2 text-xs font-semibold ${BTN_PRESS}`}
                      style={{
                        background: albumWizardMode === "saved" ? "var(--color-amber-deep)" : "var(--color-chip)",
                        color: albumWizardMode === "saved" ? "#fff" : "var(--color-ink-soft)",
                      }}
                    >
                      מתבנית שמורה
                    </button>
                  </div>
                )}

                {albumWizardMode === "style" ? (
                  <>
                    {/* The style picker (מגזין/קלאסי/מקושקש/אורבני/קו נקי) and the old page-count/
                        photo-count inputs are gone — the wizard now just needs a size, then creates
                        a single blank custom page and drops straight into its editor (template bank
                        or free-form). albumStyleDraft stays fixed at "classic" purely because saved
                        book templates still need a style value in the DB row. */}
                    {error && <p className="text-xs text-rose mb-2.5 mt-2">{error}</p>}
                    <div className="flex gap-2">
                      <button
                        onClick={buildStyledAlbum}
                        disabled={buildingAlbumBook}
                        className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
                      >
                        {buildingAlbumBook ? "יוצר את האלבום..." : "יצירת האלבום"}
                      </button>
                      <button
                        onClick={() => setAlbumManageOpen(false)}
                        disabled={buildingAlbumBook}
                        className="rounded-lg px-4 py-3 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60"
                      >
                        חזרה
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2 mb-4 max-h-64 overflow-y-auto">
                      {albumBookTemplates.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => buildAlbumFromBookTemplate(t)}
                          disabled={buildingAlbumBook}
                          className="w-full flex items-center justify-between rounded-lg p-2.5 text-sm bg-chip disabled:opacity-60"
                        >
                          <span className="font-semibold">{t.name}</span>
                          <span className="text-[11px] text-ink-soft">
                            {t.pages.length} עמודים · {ALBUM_STYLE_OPTIONS.find((s) => s.id === t.style)?.label ?? t.style}
                          </span>
                        </button>
                      ))}
                    </div>
                    {error && <p className="text-xs text-rose mb-2.5">{error}</p>}
                    {buildingAlbumBook && <p className="text-xs text-ink-soft text-center">בונה את האלבום...</p>}
                    <button
                      onClick={() => setAlbumManageOpen(false)}
                      disabled={buildingAlbumBook}
                      className="w-full rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60 mt-2"
                    >
                      חזרה
                    </button>
                  </>
                )}
              </>
            ) : (
              <>
                {/* Status pill and the print-size cells share one row (middle-to-right in this RTL
                    layout) instead of the size cells getting their own full block below — flex-wrap
                    on the size-cell group means a narrow screen wraps it onto its own line rather
                    than clipping it. */}
                <div className="flex items-center justify-between flex-wrap gap-3 mt-3 mb-4">
                  <div
                    className="rounded-xl px-3.5 py-2.5 text-xs font-semibold shrink-0"
                    style={{
                      background:
                        album.status === "approved" ? "var(--color-sage-bg)" : album.status === "changes_requested" ? "#FBEEEC" : "var(--color-chip)",
                      color: album.status === "approved" ? "var(--color-sage)" : album.status === "changes_requested" ? "var(--color-rose)" : "var(--color-ink-soft)",
                    }}
                  >
                    {album.status === "draft" && "טיוטה — עדיין לא נשלח ללקוח/ה"}
                    {album.status === "sent" && "נשלח ללקוח/ה — ממתין לאישור"}
                    {album.status === "approved" && (
                      <span className="inline-flex items-center gap-1">
                        <IconAlbumCheck size={12} />
                        האלבום אושר ע&quot;י הלקוח/ה
                      </span>
                    )}
                    {album.status === "changes_requested" && "הלקוח/ה ביקש/ה שינויים — ראו הערות למטה"}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap" title="גודל האלבום להדפסה (ס״מ) — לצורך ייצוא JPG / PSD">
                    <input
                      type="number"
                      min={1}
                      value={album.width_cm}
                      onChange={(e) => updateAlbumSize(Number(e.target.value) || album.width_cm, album.height_cm)}
                      className="w-20 rounded-lg border border-line px-2.5 py-2 text-sm text-center"
                    />
                    <span className="text-xs text-ink-soft">רוחב</span>
                    <span className="text-ink-soft">×</span>
                    <input
                      type="number"
                      min={1}
                      value={album.height_cm}
                      onChange={(e) => updateAlbumSize(album.width_cm, Number(e.target.value) || album.height_cm)}
                      className="w-20 rounded-lg border border-line px-2.5 py-2 text-sm text-center"
                    />
                    <span className="text-xs text-ink-soft">גובה</span>
                    <span className="w-px self-stretch bg-line mx-1" />
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={album.safe_margin_cm}
                      onChange={(e) => updateAlbumMargin(Number(e.target.value) || 0)}
                      className="w-16 rounded-lg border border-line px-2.5 py-2 text-sm text-center"
                    />
                    <span className="text-xs text-ink-soft">מרחק המסגרת הירוקה מהקצה (ס״מ)</span>
                    {savingAlbumSize && <span className="text-[11px] text-ink-soft">שומר...</span>}
                  </div>
                </div>

                <div className="flex items-start gap-4 mb-4 flex-wrap">
                  <div className="relative shrink-0" style={{ width: "18cm" }}>
                    <p className="text-xs text-ink-soft mb-2">כריכה</p>
                    <button
                      ref={coverButtonRef}
                      onClick={() => {
                        const r = coverButtonRef.current?.getBoundingClientRect();
                        if (r) setCoverPanelRect({ top: r.bottom, left: r.left, width: r.width });
                        setCoverPanelOpen(true);
                      }}
                      disabled={creatingSpread}
                      className="w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink disabled:opacity-50"
                    >
                      יצירת כריכה
                    </button>
                  </div>
                  {(coverPanelOpen || coverPanelClosing) && coverPanelRect && (
                    <>
                      <style>{`
                        @keyframes coverPanelSlideDown { from { transform: translateY(-8px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
                        @keyframes coverPanelSlideUp { from { transform: translateY(0); opacity: 1; } to { transform: translateY(-8px); opacity: 0; } }
                        .cover-panel-opening { animation: coverPanelSlideDown 160ms ease forwards; }
                        .cover-panel-closing { animation: coverPanelSlideUp 160ms ease forwards; }
                      `}</style>
                      <div className="fixed inset-0 z-[84]" onClick={closeCoverPanel} />
                      <div
                        className={`fixed z-[85] rounded-xl p-3 bg-paper shadow-sheet ${coverPanelClosing ? "cover-panel-closing" : "cover-panel-opening"}`}
                        style={{ top: coverPanelRect.top + 4, left: coverPanelRect.left, width: coverPanelRect.width }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {!coverCustomMode ? (
                          <div className="space-y-1.5">
                            <button
                              onClick={() => createCoverSpread()}
                              disabled={creatingSpread}
                              className="w-full rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink disabled:opacity-50"
                            >
                              לפי מידות האלבום
                            </button>
                            <button
                              onClick={() => {
                                setCoverCustomWidth(album.width_cm);
                                setCoverCustomHeight(album.height_cm);
                                setCoverCustomMode(true);
                              }}
                              className="w-full rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink"
                            >
                              מידה מותאמת
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={1}
                                value={coverCustomWidth}
                                onChange={(e) => setCoverCustomWidth(Number(e.target.value) || coverCustomWidth)}
                                className="w-16 rounded-lg border border-line px-2 py-1.5 text-xs text-center"
                              />
                              <span className="text-[11px] text-ink-soft">×</span>
                              <input
                                type="number"
                                min={1}
                                value={coverCustomHeight}
                                onChange={(e) => setCoverCustomHeight(Number(e.target.value) || coverCustomHeight)}
                                className="w-16 rounded-lg border border-line px-2 py-1.5 text-xs text-center"
                              />
                              <span className="text-[11px] text-ink-soft">ס״מ</span>
                            </div>
                            <button
                              onClick={() => createCoverSpread(coverCustomWidth, coverCustomHeight)}
                              disabled={creatingSpread}
                              className="w-full rounded-lg py-2 text-xs font-semibold bg-ink text-white disabled:opacity-50"
                            >
                              {creatingSpread ? "יוצר..." : "יצירת כריכה"}
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {albumSpreads.length === 0 && (
                  <p className="text-sm text-ink-soft text-center py-4 mb-2">אין עדיין עמודים באלבום.</p>
                )}
                {albumSpreads.length > 0 && (
                  <>
                    <p className="text-xs font-bold text-ink-soft mb-2">תצוגה מקדימה</p>
                    <div className="grid grid-cols-5 gap-1.5 mb-4">
                    {albumSpreads.map((spread, i) => {
                      const commentCount = albumComments.filter((c) => c.spread_id === spread.id).length;
                      return (
                        <div
                          key={spread.id}
                          draggable
                          onDragStart={() => setDraggedSpreadId(spread.id)}
                          onDragOver={(e) => e.preventDefault()}
                          onDrop={(e) => {
                            e.preventDefault();
                            reorderSpreads(i);
                          }}
                          className="relative rounded-xl border border-line overflow-hidden"
                          style={{ opacity: draggedSpreadId === spread.id ? 0.4 : 1 }}
                        >
                          {/* Compact thumbnail-only view — the small per-page controls that used to
                              live here (focal point, photo replace, split/feature/stack layout,
                              text-overlay mode) are all reachable by just opening the page: clicking
                              any thumbnail (legacy layouts included, auto-seeded into editable
                              elements by seedElementsFromPreset) drops straight into the full-screen
                              free-design editor, which already covers every one of those. */}
                          <AlbumSpreadThumbnail
                            spread={spread}
                            album={album}
                            photos={photos}
                            customOrnaments={customOrnaments}
                            onClick={() => setCanvasEditorTarget({ spreadId: spread.id, mode: "custom" })}
                          />
                          <span className="absolute top-1 right-1 h-5 min-w-5 px-1 rounded-full bg-black/60 text-white text-[9px] font-semibold flex items-center justify-center pointer-events-none">
                            {i + 1}
                          </span>
                          <button
                            onClick={() => removeSpread(spread.id)}
                            className="absolute top-1 left-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                            title="מחיקת עמוד"
                          >
                            <IconAlbumClose size={9} />
                          </button>
                          {commentCount > 0 && (
                            <span className="absolute bottom-1 right-1 h-5 min-w-5 px-1 rounded-full bg-amber-deep text-white text-[9px] font-semibold flex items-center justify-center gap-0.5 pointer-events-none">
                              <IconChat size={9} />
                              {commentCount}
                            </span>
                          )}
                        </div>
                      );
                    })}
                    </div>
                  </>
                )}

                {albumSpreads.length % 2 !== 0 && (
                  <p className="text-[11px] text-amber-deep mb-2.5 flex items-start gap-1.5">
                    <IconWarning size={13} />
                    <span>מספר אי-זוגי של עמודים ({albumSpreads.length}) — חלק ממעבדות הדפוס דורשות מספר זוגי. מומלץ להוסיף או להסיר עמוד אחד.</span>
                  </p>
                )}

                {error && <p className="text-xs text-rose mb-2.5">{error}</p>}
              </>
            )}
            </div>
            </ErrorBoundary>
          </div>
          </>
          )}
        </div>
      )}

      {albumGuideOpen && <AlbumEditorGuideModal onClose={() => setAlbumGuideOpen(false)} />}

      {/* Phone only, per explicit request — desktop just shows the editor immediately and lets the
          ornament tabs populate silently in the background once fetchCustomOrnaments resolves; the
          fetch itself (see the effect above) still runs on both, only this blocking spinner is
          phone-specific. Covers the editor's own shell (z-[80]) for as long as
          customOrnamentsLoading is true, so the photographer sees one continuous spinner from the
          click through to the tool actually being ready — instead of the editor's main screen
          flashing in first and only THEN, a beat later, visibly settling once its ornament tabs
          finish loading in the background. */}
      {isAlbumPhone && canvasEditorTarget && customOrnamentsLoading && (
        <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center gap-3" style={{ background: "var(--color-paper)" }}>
          <div className="h-8 w-8 rounded-full border-2 border-line border-t-ink animate-spin" />
          <p className="text-sm text-ink-soft">טוען את הכלי...</p>
        </div>
      )}
      {canvasEditorTarget &&
        (() => {
          const spread = albumSpreads.find((s) => s.id === canvasEditorTarget.spreadId);
          if (!spread || !album) return null;
          const photo1 = photos.find((p) => p.id === spread.photo_id_1);
          const photo2 = spread.photo_id_2 ? photos.find((p) => p.id === spread.photo_id_2) : null;
          // photo_id_1/photo_id_2 are the real source of truth only for split/feature/stack preset
          // spreads — a "custom" free-design spread only ever fills them with a NOT-NULL-constraint
          // placeholder (see insertSpreadsFromFrameLists), so counting those as "used" there would
          // falsely hide real favorites from every later page's picker.
          const usedElsewhere = new Set(
            albumSpreads
              .filter((s) => s.id !== spread.id)
              .flatMap((s) => [
                ...(s.layout === "custom" ? [] : [s.photo_id_1, s.photo_id_2]),
                s.background_photo_id,
                ...s.elements.filter((el): el is typeof el & { type: "photo"; photoId: string } => el.type === "photo" && !!el.photoId).map((el) => el.photoId),
              ].filter((id): id is string => !!id))
          );
          return (
            <AlbumSpreadCanvasEditor
              // Forces a full remount (fresh internal state — elements, selection, undo-dirty
              // snapshot, everything) whenever the photographer switches to a different page via
              // the bottom strip — without this, React would just re-render the same instance
              // with a new `spread` prop and keep showing the PREVIOUS page's already-initialized
              // state, since useState's initializer only runs once per mount.
              key={spread.id}
              spread={spread}
              album={{
                width_cm: spread.width_cm ?? album.width_cm,
                height_cm: spread.height_cm ?? album.height_cm,
                safe_margin_cm: album.safe_margin_cm,
              }}
              photos={photos}
              folders={folders}
              photo1={photo1}
              photo2={photo2}
              mode={canvasEditorTarget.mode}
              templates={albumTemplates}
              usedElsewhere={usedElsewhere}
              onSave={saveSpreadElements}
              onSaveTemplate={saveAlbumTemplate}
              onClose={() => setCanvasEditorTarget(null)}
              customOrnamentTabs={customOrnamentTabs}
              customOrnaments={customOrnaments}
              onCreateCustomOrnamentTab={handleCreateCustomOrnamentTab}
              onUploadCustomOrnament={handleUploadCustomOrnament}
              onDeleteCustomOrnament={handleDeleteCustomOrnament}
              spreads={albumSpreads}
              onSwitchSpread={(id) => setCanvasEditorTarget({ spreadId: id, mode: "custom" })}
            />
          );
        })()}

      {shareOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          style={{ background: "rgba(46,49,66,0.7)" }}
          onClick={() => setShareOpen(false)}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {shareView === "main" ? (
              <>
                <h2 className="text-lg font-bold font-display mb-4">שיתוף הגלריה</h2>

                {showFolderPicker && (
                  <div className="mb-5">
                    <p className="text-xs text-ink-soft mb-2.5">אילו לשוניות לשתף?</p>
                    <div className="space-y-1.5">
                      {folders.map((folder) => (
                        <label
                          key={folder.id}
                          className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={shareSelectedFolders.has(folder.id)}
                            onChange={() => toggleShareFolder(folder.id)}
                          />
                          {folder.name}
                        </label>
                      ))}
                      {hasUnfoldered && (
                        <label className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm">
                          <input
                            type="checkbox"
                            checked={shareSelectedFolders.has(NO_FOLDER_KEY)}
                            onChange={() => toggleShareFolder(NO_FOLDER_KEY)}
                          />
                          כללי (ללא לשונית)
                        </label>
                      )}
                    </div>
                    {shareDisabled && <p className="text-xs text-rose mt-2">יש לבחור לפחות לשונית אחת לשיתוף</p>}
                  </div>
                )}

                <div className="mb-5">
                  <p className="text-xs text-ink-soft mb-2.5">באיזו איכות לשתף?</p>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm">
                      <input type="radio" name="manage-share-quality" checked={shareQuality === "full"} onChange={() => setShareQuality("full")} />
                      איכות מלאה — הקבצים המקוריים
                    </label>
                    <label className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm">
                      <input type="radio" name="manage-share-quality" checked={shareQuality === "web"} onChange={() => setShareQuality("web")} />
                      איכות מותאמת לרשת — קובץ קטן יותר (עד כ-3MB לתמונה)
                    </label>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <button
                    onClick={shareViaWhatsapp}
                    disabled={shareDisabled}
                    className="w-full rounded-lg py-3 text-sm font-semibold bg-sage-bg text-sage disabled:opacity-40"
                  >
                    וואטסאפ
                  </button>
                  <button
                    onClick={shareViaQr}
                    disabled={shareDisabled}
                    className="w-full rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink disabled:opacity-40"
                  >
                    קוד QR
                  </button>
                  <button
                    onClick={shareViaOther}
                    disabled={shareDisabled}
                    className="w-full rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink disabled:opacity-40"
                  >
                    אחר
                  </button>
                </div>
                <button onClick={() => setShareOpen(false)} className="w-full text-center mt-4 text-xs text-ink-soft">
                  ביטול
                </button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold font-display mb-4">קוד QR לגלריה</h2>
                {qrDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt="קוד QR לגלריה" className="w-full rounded-2xl mb-4" />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setShareView("main")}
                    className="flex-1 rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink-soft"
                  >
                    חזרה
                  </button>
                  <button
                    onClick={() => setShareOpen(false)}
                    className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white"
                  >
                    סגירה
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {justPublished && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(46,49,66,0.45)" }}
          onClick={() => setJustPublished(false)}
        >
          <div className="w-full max-w-sm rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center gap-2 py-1 mb-3">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                style={{ background: "var(--color-sage-bg)", color: "var(--color-sage)" }}
              >
                ✓
              </span>
              <div>
                <div className="text-base font-bold font-display">הגלריה פורסמה בהצלחה</div>
                <p className="text-xs text-ink-soft mt-1">הגלריה זמינה ללקוח/ה לצפייה ובחירת תמונות.</p>
              </div>
            </div>
            {gallery.client_phone ? (
              <>
                <p className="text-xs text-ink-soft text-center mb-2">
                  לחיצה תפתח את הוואטסאפ שלך עם הודעה מוכנה ללקוח/ה וקישור לגלריה — תישאר/י לבדוק ולשלוח בעצמך.
                </p>
                <SendUpdateButton onSend={sendGalleryPublishedUpdate} pending={sendingGalleryUpdate} />
              </>
            ) : (
              <p className="text-xs text-ink-soft text-center mb-2">לא הוזן טלפון לקוח לגלריה — לא ניתן לשלוח עדכון.</p>
            )}
            <button
              onClick={() => setJustPublished(false)}
              className="w-full text-center mt-3 text-xs text-ink-soft"
            >
              סגירה
            </button>
          </div>
        </div>
      )}

      {uploadJustFinished !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(46,49,66,0.45)" }}
          onClick={() => setUploadJustFinished(null)}
        >
          <div className="w-full max-w-sm rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <div className="flex flex-col items-center text-center gap-2 py-1 mb-3">
              <span
                className="flex h-12 w-12 items-center justify-center rounded-full text-2xl"
                style={{ background: "var(--color-sage-bg)", color: "var(--color-sage)" }}
              >
                ✓
              </span>
              <div>
                <div className="text-base font-bold font-display">{uploadJustFinished} תמונות הועלו בהצלחה</div>
                <p className="text-xs text-ink-soft mt-1">התמונות זמינות עכשיו בגלריה.</p>
              </div>
            </div>
            {gallery.client_phone ? (
              <>
                <p className="text-xs text-ink-soft text-center mb-2">
                  לחיצה תפתח את הוואטסאפ שלך עם הודעה מוכנה ללקוח/ה שיש תמונות חדשות בגלריה — תישאר/י לבדוק
                  ולשלוח בעצמך.
                </p>
                <SendUpdateButton
                  onSend={() => sendPhotosUploadedUpdate(uploadJustFinished)}
                  pending={sendingUploadUpdate}
                />
              </>
            ) : (
              <p className="text-xs text-ink-soft text-center mb-2">לא הוזן טלפון לקוח לגלריה — לא ניתן לשלוח עדכון.</p>
            )}
            <button
              onClick={() => setUploadJustFinished(null)}
              className="w-full text-center mt-3 text-xs text-ink-soft"
            >
              סגירה
            </button>
          </div>
        </div>
      )}
      {portfolioCategoryPhoto && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: "rgba(46,49,66,0.45)" }}
          onClick={() => setPortfolioCategoryPhoto(null)}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-1 font-display">הוספה לפורטפוליו הציבורי</h2>
            <p className="text-xs text-ink-soft mb-3">
              אפשר לתייג את התמונה בנושא (למשל &quot;חתונות&quot;, &quot;בר/בת מצווה&quot;) כדי לאפשר סינון לפי נושא בעמוד
              הפורטפוליו — אופציונלי.
            </p>
            <input
              value={portfolioCategoryInput}
              onChange={(e) => setPortfolioCategoryInput(e.target.value)}
              list="portfolio-category-suggestions"
              placeholder="לדוגמה: חתונות"
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white mb-4"
              autoFocus
            />
            <datalist id="portfolio-category-suggestions">
              {Array.from(new Set(photos.map((p) => p.portfolio_category).filter((c): c is string => !!c))).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="flex gap-2">
              <button
                onClick={savePortfolioCategory}
                className={`flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white ${BTN_PRESS}`}
              >
                הוספה לפורטפוליו
              </button>
              <button
                onClick={() => setPortfolioCategoryPhoto(null)}
                className={`flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft ${BTN_PRESS}`}
              >
                ביטול
              </button>
            </div>
          </div>
        </div>
      )}
      {cullingIndex !== null && (
        <PhotoCullingModal
          photos={photos}
          galleryId={gallery.id}
          supabase={supabase}
          startIndex={cullingIndex}
          onUpdateStatus={updatePhotoCullingStatus}
          onClose={() => setCullingIndex(null)}
        />
      )}
    </div>
  );
}

function MgrPhotoOverlays({
  photo,
  isCover,
  selectedIds,
  offset = 4,
}: {
  photo: PhotoWithUrl;
  isCover: boolean;
  selectedIds: Set<string>;
  offset?: number;
}) {
  return (
    <>
      {isCover && (
        <span
          className="absolute text-[9px] px-1.5 py-0.5 rounded-full bg-black/60 text-white"
          style={{ top: offset, right: offset }}
        >
          שער
        </span>
      )}
      {selectedIds.size > 0 ? (
        <span
          className="absolute h-5 w-5 rounded-full border-2 flex items-center justify-center"
          style={{
            top: offset,
            left: offset,
            borderColor: "#ffffff",
            background: selectedIds.has(photo.id) ? "var(--color-amber-deep)" : "rgba(0,0,0,0.35)",
          }}
        >
          {selectedIds.has(photo.id) && <span className="text-white text-[10px] leading-none">✓</span>}
        </span>
      ) : (
        photo.is_favorite && (
          <span
            className="absolute text-[11px] h-5 w-5 rounded-full bg-black/50 text-white flex items-center justify-center"
            style={{ top: offset, left: offset }}
          >
            💜
          </span>
        )
      )}
      {photo.culling_status === "rejected" && (
        <span
          className="absolute text-[9px] px-1.5 py-0.5 rounded-full text-white font-semibold"
          style={{ bottom: offset, right: offset, background: "var(--color-rose)" }}
        >
          ✗ נפסל
        </span>
      )}
      {photo.in_portfolio && (
        <span
          className="absolute text-[11px] h-5 w-5 rounded-full bg-black/50 text-white flex items-center justify-center"
          style={{ bottom: offset, left: offset }}
        >
          ★
        </span>
      )}
    </>
  );
}

function GallerySettingsModal({
  isStandalone,
  title,
  setTitle,
  shootDate,
  setShootDate,
  clientEmail,
  setClientEmail,
  clientPhone,
  setClientPhone,
  allowDownloads,
  setAllowDownloads,
  expiryDays,
  setExpiryDays,
  expiryOptions,
  theme,
  setTheme,
  coverTextPosition,
  setCoverTextPosition,
  coverShape,
  setCoverShape,
  coverPhotoId,
  setCoverPhotoId,
  titleFontOverride,
  setTitleFontOverride,
  gridStyleOverride,
  setGridStyleOverride,
  photos,
  previewTitle,
  previewDateLabel,
  saving,
  onSave,
  onClose,
}: {
  isStandalone: boolean;
  title: string;
  setTitle: (v: string) => void;
  shootDate: string;
  setShootDate: (v: string) => void;
  clientEmail: string;
  setClientEmail: (v: string) => void;
  clientPhone: string;
  setClientPhone: (v: string) => void;
  allowDownloads: boolean;
  setAllowDownloads: (v: boolean) => void;
  expiryDays: 7 | 14 | 30 | 90 | 180 | null;
  setExpiryDays: (v: 7 | 14 | 30 | 90 | 180) => void;
  expiryOptions: { value: 7 | 14 | 30 | 90 | 180; label: string }[];
  theme: string;
  setTheme: (v: string) => void;
  coverTextPosition: string;
  setCoverTextPosition: (v: string) => void;
  coverShape: string;
  setCoverShape: (v: string) => void;
  coverPhotoId: string | null;
  setCoverPhotoId: (v: string) => void;
  titleFontOverride: string | null;
  setTitleFontOverride: (v: string | null) => void;
  gridStyleOverride: string | null;
  setGridStyleOverride: (v: string | null) => void;
  photos: PhotoWithUrl[];
  previewTitle: string;
  previewDateLabel: string | null;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const [topTab, setTopTab] = useState<"details" | "style">("details");
  const [detailsTab, setDetailsTab] = useState<"details" | "permissions">("details");
  const [entered, setEntered] = useState(false);
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const closeWithAnimation = () => {
    setClosing(true);
    setTimeout(onClose, CLOSE_ANIMATION_MS);
  };

  const resolvedGridStyle = gridStyleOverride ?? galleryThemeById(theme).gridStyle;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        // No backdrop-filter: blur() here on purpose — compositing a full-screen blur on top of
        // a gallery grid with many already-decoded photos behind it can make the browser take
        // seconds (or longer) to paint the very first frame, which read as "the modal doesn't
        // open" on photo-heavy galleries. A plain, more opaque tint gives the same visual
        // separation for a fraction of the GPU cost.
        background: entered && !closing ? "rgba(46,49,66,0.7)" : "rgba(46,49,66,0)",
        transition: `background ${CLOSE_ANIMATION_MS + 60}ms ease`,
      }}
      onClick={closeWithAnimation}
    >
      <style>{`
        @keyframes editGalleryZoomOut { from { transform: scale(1); opacity: 1; } to { transform: scale(0.85); opacity: 0; } }
        .edit-gallery-closing { animation: editGalleryZoomOut ${CLOSE_ANIMATION_MS}ms ease forwards; }
      `}</style>
      <div
        className={`${galleryFont.variable} w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto ${closing ? "edit-gallery-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-display">הגדרות גלריה</h2>
          <button onClick={closeWithAnimation} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line">
            ✕
          </button>
        </div>

        {/* Primary tabs — a segmented control (inset pill on a tinted track) so it reads
            unambiguously as the main navigation, distinct from the smaller sub-tabs below. */}
        <div className="flex gap-1 p-1 rounded-2xl mb-4" style={{ background: "var(--color-chip)" }}>
          <button
            onClick={() => setTopTab("details")}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold"
            style={{
              background: topTab === "details" ? "var(--color-amber-deep)" : "transparent",
              color: topTab === "details" ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            פרטי הגלריה
          </button>
          <button
            onClick={() => setTopTab("style")}
            className="flex-1 rounded-xl py-2.5 text-sm font-bold"
            style={{
              background: topTab === "style" ? "var(--color-amber-deep)" : "transparent",
              color: topTab === "style" ? "#fff" : "var(--color-ink-soft)",
            }}
          >
            עיצוב הגלריה
          </button>
        </div>

        {topTab === "details" ? (
          <>
            <div className="flex gap-1.5 mb-4">
              <button
                onClick={() => setDetailsTab("details")}
                className="flex-1 rounded-full py-2 text-xs font-semibold"
                style={{
                  background: detailsTab === "details" ? "var(--color-ink)" : "var(--color-chip)",
                  color: detailsTab === "details" ? "var(--color-paper)" : "var(--color-ink-soft)",
                }}
              >
                פרטים
              </button>
              <button
                onClick={() => setDetailsTab("permissions")}
                className="flex-1 rounded-full py-2 text-xs font-semibold"
                style={{
                  background: detailsTab === "permissions" ? "var(--color-ink)" : "var(--color-chip)",
                  color: detailsTab === "permissions" ? "var(--color-paper)" : "var(--color-ink-soft)",
                }}
              >
                הרשאות ושמירה
              </button>
            </div>

            {detailsTab === "details" ? (
              <div className="space-y-3.5">
                <div>
                  <label className="text-xs block mb-1 text-ink-soft">שם הגלריה</label>
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
                  />
                </div>

                <div className="flex flex-wrap gap-2">
                  {/* Real px min-width (not min-w-0) — iOS Safari's native date-input control can
                      render with zero visible width when its flex item is allowed to shrink past
                      its comfortable size. flex-wrap is the fallback if both truly don't fit. */}
                  {isStandalone && (
                    <div className="flex-1" style={{ minWidth: 150 }}>
                      <label className="text-xs block mb-1 text-ink-soft">תאריך הצילום</label>
                      <input
                        type="date"
                        value={shootDate}
                        onChange={(e) => setShootDate(e.target.value)}
                        className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
                      />
                    </div>
                  )}
                  <div className="flex-1" style={{ minWidth: 150 }}>
                    <label className="text-xs block mb-1 text-ink-soft">משך שמירת הגלריה</label>
                    <select
                      value={expiryDays ?? expiryOptions[expiryOptions.length - 1].value}
                      onChange={(e) => setExpiryDays(Number(e.target.value) as 7 | 14 | 30 | 90 | 180)}
                      className="w-full rounded-lg px-2 py-2 text-sm border border-line bg-white"
                    >
                      {expiryOptions.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                    {expiryDays === null && (
                      <p className="text-[11px] mt-1 text-ink-soft">
                        כרגע ללא הגבלת זמן (מדיניות ישנה) — בחירת טווח כאן תחיל עליה את המדיניות החדשה
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="text-xs block mb-1 text-ink-soft">אימייל הלקוח/ה (לא חובה — לתזכורת שבוע לפני שהגלריה נמחקת)</label>
                  <input
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white"
                  />
                </div>

                <div>
                  <label className="text-xs block mb-1 text-ink-soft">טלפון הלקוח/ה (לא חובה — לתזכורת שבוע לפני שהגלריה נמחקת בוואטסאפ)</label>
                  <input
                    type="tel"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="050-1234567"
                    className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white font-data"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-3 bg-chip">
                  <div>
                    <div className="text-sm font-semibold">אפשרות הורדת קבצים מקוריים</div>
                    <div className="text-xs text-ink-soft mt-0.5">כשמכובה, הלקוח/ה יוכלו רק לצפות בתמונות, לא להוריד</div>
                  </div>
                  <button
                    onClick={() => setAllowDownloads(!allowDownloads)}
                    role="switch"
                    aria-checked={allowDownloads}
                    className="relative h-6 w-11 shrink-0 rounded-full flex items-center px-0.5"
                    style={{
                      background: allowDownloads ? "var(--color-amber-deep)" : "var(--color-line)",
                      justifyContent: allowDownloads ? "flex-start" : "flex-end",
                    }}
                  >
                    <span className="h-5 w-5 rounded-full shadow" style={{ background: "#fff" }} />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* Live preview — the exact same components the real public gallery page renders,
                including a sample of the actual photo grid, so a layout change is visible right
                here instead of only after leaving the modal to check the real gallery. */}
            <div
              className="rounded-2xl overflow-hidden mb-5 border p-3.5"
              style={{
                background: galleryThemeById(theme).bg,
                borderColor: "var(--color-line)",
                ...galleryThemeVars(theme, { titleFontOverride, gridStyleOverride }),
              }}
            >
              <GalleryCoverBanner
                photoUrl={(photos.find((p) => p.id === coverPhotoId) ?? photos[0])?.url ?? null}
                title={previewTitle}
                dateLabel={previewDateLabel}
                theme={theme}
                textPosition={coverTextPosition}
                shape={coverShape}
                titleFontOverride={titleFontOverride}
              />
              {photos.length > 0 && (
                <div className="mt-3">
                  <GridStylePreview photos={photos} gridStyle={resolvedGridStyle} />
                </div>
              )}
            </div>

            {photos.length > 0 && (
              <>
                <p className="text-xs text-ink-soft mb-2.5">תמונת שער</p>
                <div className="flex gap-2 mb-5 overflow-x-auto">
                  {photos.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setCoverPhotoId(p.id)}
                      className="shrink-0 h-14 w-14 rounded-lg overflow-hidden"
                      style={{
                        boxShadow:
                          (coverPhotoId ?? photos[0]?.id) === p.id
                            ? "0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-amber-deep)"
                            : "0 0 0 1px var(--color-line)",
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}

            <p className="text-xs text-ink-soft mb-2.5">מיקום הכיתוב</p>
            <div className="grid grid-cols-4 gap-2 mb-5">
              {COVER_TEXT_POSITIONS.map((p) => {
                const active = coverTextPosition === p.id;
                return (
                  <button
                    key={p.id}
                    onClick={() => setCoverTextPosition(p.id)}
                    title={p.label}
                    aria-label={p.label}
                    className={`aspect-square rounded-2xl flex items-center justify-center border ${BTN_PRESS}`}
                    style={{
                      borderColor: active ? "var(--color-amber-deep)" : "var(--color-line)",
                      borderWidth: active ? "2px" : "1px",
                      background: active ? "var(--color-amber-bg)" : "var(--color-card)",
                      color: active ? "var(--color-amber-deep)" : "var(--color-ink-soft)",
                    }}
                  >
                    <TextPositionIcon position={p.id} />
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-ink-soft mb-2.5">צורת התמונה</p>
            <div className="grid grid-cols-4 gap-2 mb-5">
              {COVER_SHAPES.map((s) => {
                const active = coverShape === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setCoverShape(s.id)}
                    title={s.label}
                    aria-label={s.label}
                    className={`aspect-square rounded-2xl flex items-center justify-center border ${BTN_PRESS}`}
                    style={{
                      borderColor: active ? "var(--color-amber-deep)" : "var(--color-line)",
                      borderWidth: active ? "2px" : "1px",
                      background: active ? "var(--color-amber-bg)" : "var(--color-card)",
                      color: active ? "var(--color-amber-deep)" : "var(--color-ink-soft)",
                    }}
                  >
                    <ShapeIcon shape={s.id} />
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-ink-soft mb-2.5">ערכת נושא</p>
            <div className="grid grid-cols-5 gap-1.5 mb-5">
              {GALLERY_THEMES.map((t) => {
                const active = theme === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => {
                      setTheme(t.id);
                      setTitleFontOverride(null);
                      setGridStyleOverride(null);
                    }}
                    className={`flex flex-col items-center gap-1.5 ${BTN_PRESS}`}
                  >
                    <span
                      className="relative h-12 w-12 rounded-2xl overflow-hidden grid grid-cols-2"
                      style={{
                        background: t.bg,
                        boxShadow: active
                          ? "0 0 0 2px var(--color-paper), 0 0 0 4px var(--color-amber-deep)"
                          : "0 0 0 1px var(--color-line)",
                      }}
                    >
                      <span style={{ background: t.surface }} />
                      <span style={{ background: t.accent }} />
                      {active && (
                        <span
                          className="absolute -top-1 -right-1 h-4 w-4 rounded-full flex items-center justify-center text-[9px]"
                          style={{ background: "var(--color-amber-deep)", color: "#fff" }}
                        >
                          ✓
                        </span>
                      )}
                    </span>
                    <span
                      className="text-[11px] font-semibold text-center leading-tight"
                      style={{ ...galleryTitleStyle(t.id), color: active ? "var(--color-amber-deep)" : "var(--color-ink)" }}
                    >
                      {t.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-ink-soft mb-2.5">סוג פונט</p>
            <div className="grid grid-cols-2 gap-2 mb-5">
              {FONT_OPTIONS.map((f) => {
                const active = (titleFontOverride ?? galleryThemeById(theme).titleFont) === f.id;
                return (
                  <button
                    key={f.id}
                    onClick={() => setTitleFontOverride(f.id)}
                    className={`rounded-xl px-3 py-2.5 text-sm font-semibold border ${BTN_PRESS}`}
                    style={{
                      borderColor: active ? "var(--color-amber-deep)" : "var(--color-line)",
                      borderWidth: active ? "2px" : "1px",
                      background: active ? "var(--color-amber-bg)" : "var(--color-card)",
                      color: active ? "var(--color-amber-deep)" : "var(--color-ink)",
                      fontFamily: f.id === "serif" ? "var(--font-gallery-serif)" : "var(--font-sans)",
                    }}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-ink-soft mb-2.5">פריסת תמונות</p>
            <div className="grid grid-cols-4 gap-2 mb-5">
              {GRID_STYLE_OPTIONS.map((g) => {
                const active = resolvedGridStyle === g.id;
                return (
                  <button
                    key={g.id}
                    onClick={() => setGridStyleOverride(g.id)}
                    title={g.label}
                    aria-label={g.label}
                    className={`aspect-square rounded-2xl flex items-center justify-center border ${BTN_PRESS}`}
                    style={{
                      borderColor: active ? "var(--color-amber-deep)" : "var(--color-line)",
                      borderWidth: active ? "2px" : "1px",
                      background: active ? "var(--color-amber-bg)" : "var(--color-card)",
                      color: active ? "var(--color-amber-deep)" : "var(--color-ink-soft)",
                    }}
                  >
                    <GridStyleIcon style={g.id} />
                  </button>
                );
              })}
            </div>
          </>
        )}

        <button
          onClick={onSave}
          disabled={saving}
          className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60 mt-5"
        >
          {saving ? "שומר..." : "שמירת שינויים"}
        </button>
      </div>
    </div>
  );
}

// A small live sample of the actual grid style — not a literal WYSIWYG crop, just enough real
// photos in the real layout shape that a picked layout is visibly different from the others,
// since the layout picker used to have no visual feedback at all until leaving the modal.
function GridStylePreview({ photos, gridStyle }: { photos: PhotoWithUrl[]; gridStyle: string }) {
  const sample = photos.slice(0, 6);
  if (gridStyle === "grid") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--gt-gap)" }}>
        {sample.map((p) => (
          <div key={p.id} className="aspect-square overflow-hidden" style={{ borderRadius: "var(--gt-photo-radius)", background: "var(--gt-surface-soft)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    );
  }
  if (gridStyle === "justified") {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--gt-gap)" }}>
        {sample.map((p) => (
          <div
            key={p.id}
            className="overflow-hidden"
            style={{ height: 46, width: 62, flexGrow: 1, borderRadius: "var(--gt-photo-radius)", background: "var(--gt-surface-soft)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.url} alt="" className="w-full h-full object-cover" />
          </div>
        ))}
      </div>
    );
  }
  const framed = gridStyle === "framed";
  return (
    <div style={{ columnWidth: 72, columnGap: "var(--gt-gap)" }}>
      {sample.map((p, i) => (
        <div
          key={p.id}
          className="break-inside-avoid overflow-hidden"
          style={{
            marginBottom: "var(--gt-gap)",
            height: i % 2 === 0 ? 58 : 84,
            borderRadius: "var(--gt-photo-radius)",
            background: "var(--gt-surface-soft)",
            ...(framed ? { padding: 4, border: "1px solid var(--gt-border)" } : {}),
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={p.url}
            alt=""
            className="w-full h-full object-cover"
            style={{ borderRadius: framed ? "calc(var(--gt-photo-radius) - 3px)" : undefined }}
          />
        </div>
      ))}
    </div>
  );
}
