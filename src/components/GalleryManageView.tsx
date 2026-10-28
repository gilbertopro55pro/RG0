"use client";

import { Fragment, startTransition, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { readAlbumRotateResume, writeAlbumRotateResume, clearAlbumRotateResume } from "@/lib/albumRotateResume";
import GlassTabStrip from "@/components/GlassTabStrip";
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
import PrintHouseSendsHistory from "@/components/PrintHouseSendsHistory";
import ErrorBoundary from "@/components/ErrorBoundary";
import { readDroppedEntries, isHiddenFileName, fileOfEntry } from "@/lib/fileDrop";
import { dropTarget, folderTree, folderWithChildren, mainFolderId, nextSortOrder, orderedFolders, tabKey, tabsInOrder, type GalleryFolderNode } from "@/lib/galleryFolders";
import { ALBUM_STYLE_OPTIONS, type AlbumStyleId } from "@/lib/albumStyleGenerator";
import { STARTER_BOOK_TEMPLATES, generateStarterBookPages, type StarterTemplateId } from "@/lib/albumStarterTemplates";
import { usePinchSize } from "@/lib/usePinchColumns";
import { photographerOriginalUrl, resizedPhotoUrl } from "@/lib/galleryPhotoUrls";
import { refreshIfDataChanged } from "@/lib/dataChanges";
import { IconGallery, IconTrash } from "@/components/icons/NavIcons";
import { IconClose as IconAlbumClose, IconPalette, IconChat, IconSave as IconAlbumSave, IconWarning, IconPdf, IconImage, IconCheck as IconAlbumCheck, IconRotateDevice } from "@/components/icons/AlbumIcons";
import type { AlbumCanvasDraft } from "@/components/AlbumSpreadCanvasEditor";
import { fitFramesToSafeArea, marginInsetPctFor } from "@/lib/albumSafeArea";
import { takeResumeState, useBusy, useResumeState } from "@/lib/updateResume";
import type { AutoDesignResult } from "@/components/AlbumAutoDesigner";
import { hasAutoDesignSession } from "@/lib/albumAuto/session";
import { fitPhotoInFrame, swapPhotoPatches, type FaceRect, type SwapFit, type SwapPick } from "@/lib/albumAuto/swapPhotos";
import { createFaceCache, createSerialQueue, refitAfterFaces } from "@/lib/albumAuto/swapFaces";
import { applyUndo, elementBox, qualityFixPatches, undoRecord, type QualityIssue, type QualityUndo } from "@/lib/albumAuto/qualityCheck";
import { chooseRedesign, designShape, engineLayouts, redesignDesigns, type EngineLayout } from "@/lib/albumAuto/redesign";
import { AUTO_STYLES, type AutoStyleId, type LayoutPhoto } from "@/lib/albumAuto/types";
import LiquidProgressBar from "@/components/LiquidProgressBar";
import { isLightTextColor } from "@/lib/textColor";
import {
  fetchCustomOrnaments,
  createCustomOrnamentTab,
  uploadCustomOrnament,
  deleteCustomOrnament,
  type CustomOrnamentTab,
} from "@/lib/customOrnaments";
import {
  GRID_STYLE_OPTIONS,
  galleryThemeById,
  galleryThemeVars,
  galleryFont,
  resolveGalleryTheme,
  titleFontFamily,
} from "@/lib/galleryTheme";
import { openWhatsApp } from "@/lib/waLink";
import { albumJobBusyMessage, isAlbumExportRunning, showAlbumExport, startAlbumExport, useAlbumExports } from "@/lib/albumExports";
import GalleryExportLine from "@/components/galleryManage/GalleryExportLine";
import { ProgressModal } from "@/components/ProgressModal";
import { IndeterminateProgressCard } from "@/components/IndeterminateProgressCard";
import { pdfBandedPct } from "@/lib/pdfBandedPct";
import SendUpdateButton from "@/components/SendUpdateButton";
import GalleryPremiumCover from "@/components/GalleryPremiumCover";
import GalleryCoverFocalPointModal from "@/components/GalleryCoverFocalPointModal";
import GallerySlideshow from "@/components/GallerySlideshow";
import FaceCircle from "@/components/FaceCircle";
import AlbumEditorGuideModal from "@/components/AlbumEditorGuideModal";
import AlbumSpreadThumbnail from "@/components/AlbumSpreadThumbnail";
import PhotoCullingModal from "@/components/PhotoCullingModal";
import RemoteUploadLine from "@/components/RemoteUploadLine";
import { reportUnreadableDrop, useRemoteUploads } from "@/lib/remoteUploads";
import GalleryVideosSection from "@/components/GalleryVideosSection";
import GalleryFtpSection from "@/components/GalleryFtpSection";
import { detectFacesInImageUrl, clusterFaces, type FaceBox } from "@/lib/faceRecognition";
import { GALLERY_EXPIRY_OPTIONS, GALLERY_EXPIRY_OPTIONS_BY_TIER, SUBSCRIPTION_PLANS, VIDEO_MAX_BYTES_BY_TIER, type SubscriptionPlan, type SubscriptionTier } from "@/lib/stages";
import { ADMIN_EMAIL } from "@/lib/admin";
import { ALLOWED_ACCEPT, isAllowedImageFile, isAllowedImageName } from "@/lib/imageUpload";
import { readActiveUploadLock, requestActiveUploadCancel, type ActiveUploadLock } from "@/lib/activeUploadLock";
import {
  activeUploadCount,
  cancelUpload,
  dismissUpload,
  enqueueGalleryUpload,
  getUploadsSnapshot,
  onGalleryPhoto,
  otherTabUpload,
  unreadableReason,
  uploadTabId,
  sendUploadToBackground,
  subscribeUploads,
  UNREADABLE_FILE,
  uploadKey,
  useUploadValue,
  type GalleryUploadItem,
} from "@/lib/galleryUploads";
import BackLink from "@/components/BackLink";
import { useT, useLang } from "@/i18n/client";
import dynamic from "next/dynamic";
import { dateLocale, type Lang } from "@/i18n/config";
import { buildGalleryShareMessage, buildGalleryPhotosUploadedMessage, galleryShareTitle } from "@/components/GalleryShareModal";
import { galleryShareSearch, shortClientUrl } from "@/lib/shortLinks";
import type { PhotoWithUrl, ZipJobPart, ZipBatchState } from "@/components/galleryManage/types";
import {
  ALBUM_SIZE_PRESETS,
  CELL_SIZE_DEFAULT,
  CELL_SIZE_MAX,
  CELL_SIZE_MIN,
  CLOSE_ANIMATION_MS,
  MAX_GALLERY_PHOTOS,
  ZIP_NO_FOLDER_KEY,
} from "@/components/galleryManage/constants";
import { triggerZipAnchorDownload, addDays, fitAutoElements } from "@/components/galleryManage/helpers";
import { MgrPhotoOverlays } from "@/components/galleryManage/MgrPhotoOverlays";
import { GallerySettingsModal } from "@/components/galleryManage/GallerySettingsModal";
import { UploadCount, UploadPct } from "@/components/galleryManage/UploadProgress";
import { GridThumb } from "@/components/galleryManage/GridThumb";
import { DeleteFolderConfirmModal, type DeleteFolderMode } from "@/components/galleryManage/DeleteFolderConfirmModal";
import TabEditSheet from "@/components/galleryManage/TabEditSheet";
import TabPicker from "@/components/galleryManage/TabPicker";
import { SlideshowManageModal } from "@/components/galleryManage/SlideshowManageModal";
import AnchoredMenu, { type AnchoredMenuItem } from "@/components/AnchoredMenu";
import PhotoActionSheet from "@/components/galleryManage/PhotoActionSheet";
import PhotoDeleteConfirm from "@/components/galleryManage/PhotoDeleteConfirm";
import DeleteSelectedConfirm from "@/components/galleryManage/DeleteSelectedConfirm";
import ScrollTopButton from "@/components/galleryManage/ScrollTopButton";
import AlbumQualityCheck, { QualityHighlight, QualityPageBadge, useAlbumQualityCheck } from "@/components/galleryManage/AlbumQualityCheck";
import AlbumSelectionBar from "@/components/galleryManage/AlbumSelectionBar";
import AlbumSelectionConfirm from "@/components/galleryManage/AlbumSelectionConfirm";
import MarkedFrameDots from "@/components/galleryManage/MarkedFrameDots";
import { useAlbumSelection } from "@/components/galleryManage/useAlbumSelection";
import AlbumSendToClient, { AlbumSendNotice, fetchAlbumClientInfo, recordAlbumSend } from "@/components/galleryManage/AlbumSendToClient";
import type { AlbumClientInfo } from "@/lib/albumApproval";
import { albumPoolIds, type AlbumSelectionFields, type SpreadMarkFields } from "@/lib/albumSelection";

// The reel builder (admin only, 2026-10-07) loads its video encoder only when opened.
const ReelBuilder = dynamic(() => import("@/components/ReelBuilder"), { ssr: false });
// The album editor (~400KB of source) and the auto designer load when opened, not with every
// gallery: most visits to this screen never open either.
const AlbumSpreadCanvasEditor = dynamic(() => import("@/components/AlbumSpreadCanvasEditor"), { ssr: false });
const AlbumAutoDesigner = dynamic(() => import("@/components/AlbumAutoDesigner"), { ssr: false });
// The automatic collage (admin only, 2026-10-23), loaded only when opened.
const CollageBuilder = dynamic(() => import("@/components/CollageBuilder"), { ssr: false });
// Photo culling labels for the admin's culling-engine test (app/admin/culling), loaded only when opened.
const CullingLabelModal = dynamic(() => import("@/components/CullingLabelModal"), { ssr: false });


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
  clientLang = "he",
  brandLogoUrl = null,
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
  // The client's language for the text sent to them (UI languages phase 3), computed on the server
  // with clientLangFor — "he" for every non-admin account.
  clientLang?: Lang;
  // The photographer's logo when gallery branding applies (see galleryBrandingAllowed), else null.
  brandLogoUrl?: string | null;
}) {
  const t = useT();
  const lang = useLang();
  const supabase = createClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const [gallery, setGallery] = useState(initialGallery);
  const [photos, setPhotos] = useState(initialPhotos);
  // What the album tools offer (owner, 2026-10-27; lib/albumSelection.ts): the final selection made
  // in the favorites view, or the favorites. The tools read it as `is_favorite`.
  const albumSelection = (gallery as GalleryRow & AlbumSelectionFields).album_selection ?? null;
  const albumToolPhotos = useMemo(() => {
    if (!albumSelection) return photos;
    const pool = new Set(albumPoolIds(photos, albumSelection));
    return photos.map((p) => (p.is_favorite === pool.has(p.id) ? p : { ...p, is_favorite: pool.has(p.id) }));
  }, [photos, albumSelection]);
  // Main tabs and sub-tabs (owner, 2026-10-28; lib/galleryFolders.ts), in the order they read.
  const [folders, setFolders] = useState<GalleryFolderNode[]>(() => orderedFolders(initialFolders as GalleryFolderNode[]));
  const folderNodes = useMemo(() => folderTree(folders), [folders]);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  // Opening a main tab shows its sub-tabs' photos too.
  const activeFolderIds = useMemo(() => (activeFolderId ? folderWithChildren(folders, activeFolderId) : null), [folders, activeFolderId]);
  const activeMainId = mainFolderId(folders, activeFolderId);
  const activeSubTabs = activeMainId ? folderNodes.find((n) => n.folder.id === activeMainId)?.children ?? [] : [];
  // "+" on the main row adds a main tab, "+" on the sub-tab row a sub-tab of the open main tab.
  const [addingFolder, setAddingFolder] = useState<"main" | "sub" | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [editTab, setEditTab] = useState<GalleryFolderNode | null>(null);
  const [deleteFolderConfirm, setDeleteFolderConfirm] = useState<GalleryFolderNode | null>(null);
  const [deletingFolder, setDeletingFolder] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  // The last upload stopped because the browser couldn't read the files: the error offers picking
  // the folder instead of dragging it.
  const [uploadHalted, setUploadHalted] = useState(false);
  // A drop the browser couldn't read (checked before anything is sent): a window offers picking the
  // same folder or photos instead.
  const [dropUnreadable, setDropUnreadable] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mgrAspectRatios, setMgrAspectRatios] = useState<Record<string, number>>({});
  // Loads every visible thumbnail behind the scenes and reveals the whole grid together once
  // they're all in (or after a timeout, so one slow/broken image can't hold the rest hostage
  // forever) — replaces the previous one-by-one pop-in with a single moment where the gallery just
  // appears, which is what was actually asked for ("all photos at once, not a waterfall").
  const fullImagePrefetchedIdsRef = useRef<Set<string>>(new Set());
  // Only the photo being opened/closed carries a view-transition-name: naming every thumbnail made
  // the browser snapshot all of them on each open, which froze or crashed big galleries on phones.
  const [transitionPhotoId, setTransitionPhotoId] = useState<string | null>(null);

  // Shared across upload and face detection — only one of those can be running at a time (the
  // ProgressModal itself blocks starting a second). Both poll the flag between items and stop
  // starting new ones. Album exports run in their own store (lib/albumExports.ts).
  const cancelRequestedRef = useRef(false);
  // A photo upload that ran in the background ("המשך ברקע", lib/galleryUploads.ts) ends with this
  // toast when the photographer is on the gallery page; the engine itself emails and pushes a
  // notification when they weren't watching it end.
  const [completedUploadToast, setCompletedUploadToast] = useState<{ succeededCount: number; totalCount: number } | null>(null);
  // Sole source of truth (not just a pointer to server state — see activeUploadLock.ts) for "is a
  // photo upload already running, in this tab or another." Set when uploadResolvedFiles finds an
  // unstale lock for a DIFFERENT gallery already active; cleared once that other upload's lock
  // disappears or goes stale, letting the blocked photographer retry.
  const [blockedByOtherUpload, setBlockedByOtherUpload] = useState<ActiveUploadLock | null>(null);
  // Refreshes the blocked screen's own progress readout live, and clears it the moment the other
  // upload finishes/goes stale — the photographer never has to manually re-check or reload to
  // find out they can retry now.
  useEffect(() => {
    if (!blockedByOtherUpload) return;
    const interval = setInterval(() => {
      const latest = readActiveUploadLock();
      if (!latest || latest.galleryId !== blockedByOtherUpload.galleryId) setBlockedByOtherUpload(null);
      else setBlockedByOtherUpload(latest);
    }, 1500);
    return () => clearInterval(interval);
  }, [blockedByOtherUpload]);
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
  const [activeLabelFilter, setActiveLabelFilter] = useState<string | null>(null);
  const [zippingFavorites, setZippingFavorites] = useState(false);
  // Photographer-side ZIP downloads (favorites / slideshow / selected) go through the same background
  // zip-job system as the client gallery — options screen first (which tabs, which quality), then a
  // progress panel while the parts build and download on their own. The old inline route streamed the
  // whole archive in one request and got cut off mid-stream on big selections, leaving a truncated,
  // unopenable ZIP (macOS: "Error 94 - Bad message").
  const [downloadOptions, setDownloadOptions] = useState<{ photoIds: string[] } | null>(null);
  const [downloadSelectedFolders, setDownloadSelectedFolders] = useState<Set<string>>(new Set());
  const [downloadQuality, setDownloadQuality] = useState<"full" | "web">("full");
  const [zipBatch, setZipBatch] = useState<ZipBatchState | null>(null);
  const [zipPanelOpen, setZipPanelOpen] = useState(false);
  const downloadedZipPartsRef = useRef<Set<number>>(new Set());
  const [cullingIndex, setCullingIndex] = useState<number | null>(null);
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [showRejectedOnly, setShowRejectedOnly] = useState(false);
  const [portfolioCategoryPhoto, setPortfolioCategoryPhoto] = useState<PhotoWithUrl | null>(null);
  const [portfolioCategoryInput, setPortfolioCategoryInput] = useState("");
  // Optional sub-tab inside that tab, with each tab's existing sub-tabs (across all the
  // photographer's portfolio photos, loaded when the sheet opens) as suggestions.
  const [portfolioSubcategoryInput, setPortfolioSubcategoryInput] = useState("");
  const [portfolioSubTabs, setPortfolioSubTabs] = useState<Record<string, string[]>>({});
  const [removeFromPortfolioPhoto, setRemoveFromPortfolioPhoto] = useState<PhotoWithUrl | null>(null);
  const [faceClusters, setFaceClusters] = useState<{ clusterId: string; photoIds: Set<string>; representative: { photoId: string; box: FaceBox } }[]>([]);
  const [faceFilterClusterId, setFaceFilterClusterId] = useState<string | null>(null);
  const [detectingFaces, setDetectingFaces] = useState(false);
  const [faceProgress, setFaceProgress] = useState<{ done: number; total: number } | null>(null);
  const faceCancelRef = useRef<(() => void) | null>(null);
  const [faceError, setFaceError] = useState<string | null>(null);
  // Legacy galleries (created before migration 0084) can have expiry_days = null, meaning "store
  // indefinitely" — grandfathered, not force-migrated. The select below shows a sensible default
  // for display, but state stays null until the photographer deliberately picks a new value, which
  // is what lets the DB trigger (enforce_gallery_expiry_by_plan) tell "unrelated settings edit on
  // an old gallery" apart from "actually changing the retention window."
  const [expiryDays, setExpiryDays] = useState<7 | 14 | 30 | 90 | 180 | 365 | null>(initialGallery.expiry_days);
  // Was a binary studio_pro/standard check — silently gave a "basic" tier photographer the
  // standard tier's (longer) retention options once that tier existed, since it only ever
  // resolved to one of those two buckets. Looks up the photographer's REAL tier now, admin still
  // overridden to the most permissive one (same override FTP Live and the expiry trigger use).
  const effectiveExpiryTier: SubscriptionTier =
    photographerEmail === ADMIN_EMAIL ? "studio_pro" : SUBSCRIPTION_PLANS[photographerPlan].tier;
  const galleryExpiryOptions = GALLERY_EXPIRY_OPTIONS_BY_TIER[effectiveExpiryTier];
  // Shared by video-in-gallery and the album editor — both are entry-tier-excluded features (see
  // PlanComparison.tsx), neither retroactive: existing video/albums an entry-tier photographer
  // already has stay intact, this only blocks starting NEW ones.
  const nonBasicTierAllowed = effectiveExpiryTier !== "basic";
  // This gallery's photo upload, from the shared upload engine (lib/galleryUploads.ts, owner
  // 2026-10-09): it keeps running after the photographer leaves the page ("המשך ברקע"), several
  // galleries can upload at once, and photos dropped in while it runs join it (the total grows).
  // Only its phase and whether it went to the background: the counts change many times a second,
  // and this page (every photo in the grid) would redraw with them (owner, 2026-10-17: smooth with
  // 2000+ photos). The counts are drawn by UploadCount and UploadPct, which redraw alone.
  const photoUploadKey = uploadKey("photos", gallery.id);
  const uploadStatus = useUploadValue((list) => {
    const u = list.find((x) => x.key === photoUploadKey);
    return u ? `${u.phase}:${u.background ? 1 : 0}` : "";
  });
  const [uploadPhase, uploadBg] = uploadStatus.split(":");
  const uploadActive = uploadPhase === "queued" || uploadPhase === "uploading";
  // This gallery's uploads running on another device or tab (owner, 2026-10-16: the computer's
  // upload didn't show on the phone), lib/remoteUploads.ts.
  const remoteUploads = useRemoteUploads(gallery.id);
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
  const [editAllowClientUpload, setEditAllowClientUpload] = useState(initialGallery.allow_client_upload);
  const [savingSettings, setSavingSettings] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [actionSheetPhoto, setActionSheetPhoto] = useState<PhotoWithUrl | null>(null);
  const [deleteConfirmPhoto, setDeleteConfirmPhoto] = useState<PhotoWithUrl | null>(null);
  const [deleteSelectedConfirmOpen, setDeleteSelectedConfirmOpen] = useState(false);
  const [deleteSelectedConfirmClosing, setDeleteSelectedConfirmClosing] = useState(false);
  // Shared by both confirmDeletePhoto and confirmDeleteSelectedPhotos below — they never run
  // concurrently (each only fires from its own now-closed confirmation dialog), so one pair of
  // flags covers both. A failure used to only ever reach the shared `error` state, which renders
  // in a few unrelated panels far from the delete action (upload panel, album/export modals) — on
  // a bigger gallery where the delete can genuinely fail, that read as "nothing happens" even
  // though an error had actually been set.
  const [deletingPhotos, setDeletingPhotos] = useState(false);
  const [deletePhotosError, setDeletePhotosError] = useState<string | null>(null);
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
  const [coverFocalX, setCoverFocalX] = useState(initialGallery.cover_focal_x);
  const [coverFocalY, setCoverFocalY] = useState(initialGallery.cover_focal_y);
  // Opens the centering screen the moment a cover photo is picked — from either the settings
  // modal's thumbnail strip (staged, applied to coverFocalX/Y on save, persisted later by the
  // settings modal's own Save button) or the lightbox's quick "קביעה כשער" action (persists
  // cover_photo_id + the focal point together immediately, see setCoverPhoto below).
  const [coverFocalPointTarget, setCoverFocalPointTarget] = useState<{ photo: PhotoWithUrl; immediate: boolean } | null>(null);
  const [titleFontOverride, setTitleFontOverride] = useState(initialGallery.title_font_override);
  const [gridStyleOverride, setGridStyleOverride] = useState(initialGallery.grid_style_override);
  const [slideshowManageOpen, setSlideshowManageOpen] = useState(false);
  const [reelOpen, setReelOpen] = useState(false);
  const [collageOpen, setCollageOpen] = useState(false);
  // The "כלים" dropdown (slideshow, reels, collage, face detection): the button it opened from.
  const [toolsAnchor, setToolsAnchor] = useState<HTMLElement | null>(null);
  const [slideshowPhotoIds, setSlideshowPhotoIds] = useState<Set<string>>(new Set(initialGallery.slideshow_photo_ids));
  const [slideshowPreviewOpen, setSlideshowPreviewOpen] = useState(false);
  const [albumManageOpen, setAlbumManageOpen] = useState(false);
  // While the album tool is open, a phone's keyboard must not hide what's being typed (owner,
  // 2026-10-07): the visible area (visualViewport) is tracked, and while the keyboard is up every
  // full-screen dialog is fitted into it and scrolls inside (the rules are in globals.css,
  // html.gf-kb-open).
  useEffect(() => {
    if (!albumManageOpen) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const root = document.documentElement;
    const update = () => {
      root.style.setProperty("--gf-vvh", `${vv.height}px`);
      root.style.setProperty("--gf-vvt", `${vv.offsetTop}px`);
      root.classList.toggle("gf-kb-open", vv.height < window.innerHeight * 0.8);
    };
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      root.classList.remove("gf-kb-open");
    };
  }, [albumManageOpen]);
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
  const [albumViewportSize, setAlbumViewportSize] = useState(() =>
    typeof window === "undefined" ? { w: 0, h: 0 } : { w: window.innerWidth, h: window.innerHeight }
  );
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
  const [albumStyleDraft] = useState<AlbumStyleId>("classic");
  const [selectedStarterId, setSelectedStarterId] = useState<StarterTemplateId | null>(null);
  const [selectedSavedTemplateId, setSelectedSavedTemplateId] = useState<string | null>(null);
  const [starterPageCount, setStarterPageCount] = useState(10);
  const [starterPhotoCount, setStarterPhotoCount] = useState(30);
  const [buildingAlbumBook, setBuildingAlbumBook] = useState(false);
  // Admin-only "עיצוב אוטומטי" (AlbumAutoDesigner) shown in place of the manual wizard.
  // Starts open when a design for this gallery is still in progress (lib/albumAuto/session.ts): the
  // phone's rotate round trip remounts this page, and the photographer must land back in it.
  const [autoDesignOpen, setAutoDesignOpen] = useState(() => hasAutoDesignSession(gallery.id));
  const [autoDesignEventType, setAutoDesignEventType] = useState<string | null>(null);
  const [saveBookTemplateOpen, setSaveBookTemplateOpen] = useState(false);
  const [bookTemplateNameDraft, setBookTemplateNameDraft] = useState("");
  const [savingBookTemplate, setSavingBookTemplate] = useState(false);
  const [confirmNewAlbumOpen, setConfirmNewAlbumOpen] = useState(false);
  const [creatingSpread, setCreatingSpread] = useState(false);
  const [draggedSpreadId, setDraggedSpreadId] = useState<string | null>(null);
  // The album export running for this photographer, from any screen (lib/albumExports.ts: it goes
  // on in the background, "המשך ברקע", owner 2026-10-22). Its buttons here show its progress when
  // it's this gallery's.
  const runningExport = useAlbumExports().find(isAlbumExportRunning);
  const ownExport = runningExport?.galleryId === gallery.id ? runningExport : undefined;
  const exportingAlbumPdf = ownExport?.format === "pdf";
  const exportingAlbumJpg = ownExport?.format === "jpg";
  const exportingAlbumPsd = ownExport?.format === "psd";
  const sendingAlbumToPrint = ownExport?.format === "print";
  const exportProgress = ownExport?.pct ?? 0;
  const [exportRangeFormat, setExportRangeFormat] = useState<"pdf" | "jpg" | "psd" | null>(null);
  const [exportRangeFrom, setExportRangeFrom] = useState(1);
  const [exportRangeTo, setExportRangeTo] = useState(1);
  // Only JPG ever goes to a print house — loaded lazily (on first open) rather than up front,
  // since most gallery-management page loads never touch this feature at all.
  const [printHouseEmails, setPrintHouseEmails] = useState<PrintHouseEmailRow[]>([]);
  const [printHouseEmailsLoaded, setPrintHouseEmailsLoaded] = useState(false);
  const [printHouseModalOpen, setPrintHouseModalOpen] = useState(false);
  const [printHouseSelectedId, setPrintHouseSelectedId] = useState<string | null>(null);
  // Instructions for the print house (paper, finish, quantity…), added to the email.
  const [printHouseNotes, setPrintHouseNotes] = useState("");
  // Which pages go to the print house (owner, 2026-10-09): from/to, like the export range dialog.
  const [printHouseFrom, setPrintHouseFrom] = useState(1);
  const [printHouseTo, setPrintHouseTo] = useState(1);
  const [printHouseConfirmOpen, setPrintHouseConfirmOpen] = useState(false);
  // A send that can't start because an export or another send is still running (the send itself
  // runs in the exports store, lib/albumExports.ts, with its own window, pill and card).
  const [printHouseToast, setPrintHouseToast] = useState<string | null>(null);
  const [savingAlbumSize, setSavingAlbumSize] = useState(false);
  const [canvasEditorTarget, setCanvasEditorTarget] = useState<{ spreadId: string; mode: "overlay" | "custom" } | null>(null);
  // The album editor's "עריכת תמונה" panel drag offset — owned HERE (not inside
  // AlbumSpreadCanvasEditor) specifically so it survives that editor's own full remount on every
  // page switch (key={spread.id} below) — per explicit request, once the photographer drags that
  // panel on any page, the same position becomes the default on every other page of the album too,
  // until dragged again. This component doesn't remount on a page switch, so this value does.
  const [albumSidePanelOffset, setAlbumSidePanelOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
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
  // After an update's reload (lib/updateResume): reopen the album panel, and the page that was being
  // designed with its unsaved draft — through the same "resume" path the rotate round trip uses.
  const canvasDraftRef = useRef<AlbumCanvasDraft | null>(null);
  useResumeState("album-panel", () => (albumManageOpen ? { open: true } : null));
  useEffect(() => {
    const draft = takeResumeState<AlbumCanvasDraft>("album-canvas");
    const panel = takeResumeState<{ open: boolean }>("album-panel");
    if (!draft && !panel?.open) return;
    setResumingAfterRotate(true);
    if (draft) {
      canvasDraftRef.current = draft;
      pendingCanvasResumeRef.current = { spreadId: draft.spreadId, mode: draft.mode };
    }
    openAlbumManage();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, []);
  useEffect(() => {
    const intent = readAlbumRotateResume();
    if (!intent || intent.galleryId !== gallery.id) return;
    clearAlbumRotateResume();
    setResumingAfterRotate(true);
    if (intent.kind === "canvas") pendingCanvasResumeRef.current = { spreadId: intent.spreadId, mode: intent.mode };
    openAlbumManage();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount only
  }, []);

  // Deep-link from the dashboard's album-design quick-access button (AlbumQuickAccessButton) —
  // ?openAlbum=1 auto-opens the panel the same way the tab button's onClick would.
  useEffect(() => {
    if (searchParams.get("openAlbum") !== "1") return;
    openAlbumManage();
    router.replace(`/galleries/${gallery.id}`, { scroll: false });
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
  // The canvas itself already renders a true square whenever width_cm equals height_cm (driven by
  // a real aspect-ratio, not a fixed shape) — the only way to actually get a non-square-looking
  // "square" cover was manually typing the same number into both fields and hoping they stayed in
  // sync. This removes that failure mode entirely: while locked, editing either field mirrors the
  // other, so the two values can never silently drift apart.
  const [coverSquareLock, setCoverSquareLock] = useState(false);

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
  // photo.url is the /original route (lib/galleryPhotoUrls.ts), with no download filename —
  // downloads fetch their own freshly-named signed URL on demand instead.
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

  const downloadSelectedPhotos = () => downloadPhotosZip([...selectedIds]);

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
    // Cancelling has to take effect at once: checking the flag only between photos left the modal
    // up while the models loaded or a slow photo was still being read (owner, 2026-10-07: "can't
    // cancel face detection"). Each photo races this, so the loop stops the moment cancel is hit.
    const cancelSignal = new Promise<"cancelled">((resolve) => {
      faceCancelRef.current = () => resolve("cancelled");
    });
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
          const faces = await Promise.race([detectFacesInImageUrl(`/api/galleries/${gallery.id}/photos/${photo.id}/image`), cancelSignal]);
          if (faces === "cancelled") {
            cancelled = true;
            break;
          }
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
      setFaceError(t("שגיאה בזיהוי הפרצופים"));
      succeeded = false;
    } finally {
      // Same "hold the full green fill for a beat so completion actually registers" pattern as the
      // gallery upload progress bar — skipped on failure so a red-flagged error doesn't also flash
      // a contradictory "done" fill.
      if (succeeded) {
        setFaceProgress({ done: photos.length, total: photos.length });
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      faceCancelRef.current = null;
      setDetectingFaces(false);
      setFaceProgress(null);
    }
  };

  // Opens the options screen (which tabs to include, which quality) for a set of photos — or, if a
  // batch is already building, just reopens its progress panel instead of starting a second job.
  // The zip itself keeps one subfolder per tab, same as the client gallery's download.
  const downloadPhotosZip = (photoIds: string[]) => {
    if (photoIds.length === 0 || zippingFavorites) return;
    if (zipBatch && !zipBatch.parts.every((p) => p.status === "ready" || p.status === "failed")) {
      setZipPanelOpen(true);
      return;
    }
    const chosen = new Set(photoIds);
    const keys = new Set<string>();
    for (const p of photos) if (chosen.has(p.id)) keys.add(p.folder_id ?? ZIP_NO_FOLDER_KEY);
    setDownloadSelectedFolders(keys);
    setDownloadOptions({ photoIds });
  };

  const toggleDownloadFolder = (key: string) =>
    setDownloadSelectedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const startZipJob = async (photoIds: string[], quality: "full" | "web") => {
    if (photoIds.length === 0 || zippingFavorites) return;
    setZippingFavorites(true);
    setError(null);
    try {
      const res = await fetch(`/api/gallery/${gallery.access_token}/zip-jobs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds, quality }),
      });
      const data: { batchId?: string; partCount?: number; error?: string } = await res.json().catch(() => ({}));
      if (!res.ok || !data.batchId || !data.partCount) {
        setError(data.error ?? t("שגיאה בהכנת ההורדה"));
        return;
      }
      downloadedZipPartsRef.current = new Set();
      setZipBatch({
        batchId: data.batchId,
        parts: Array.from({ length: data.partCount }, (_, i) => ({
          partIndex: i,
          partCount: data.partCount!,
          status: "pending" as const,
          errorMessage: null,
          downloadUrl: null,
          processedCount: 0,
          totalCount: 0,
        })),
      });
      setZipPanelOpen(true);
    } finally {
      setZippingFavorites(false);
    }
  };

  // Polls while any part is still building; each part that becomes ready downloads itself once (a
  // plain link click, spaced out because browsers drop back-to-back downloads that carry no fresh
  // user gesture). Closing the panel only hides it — the job and this polling keep running.
  useEffect(() => {
    if (!zipBatch) return;
    if (!zipBatch.parts.some((p) => p.status === "pending" || p.status === "processing")) return;
    const timer = setTimeout(async () => {
      const res = await fetch(`/api/gallery/${gallery.access_token}/zip-jobs/${zipBatch.batchId}`);
      if (!res.ok) return;
      const data: { parts: ZipJobPart[] } = await res.json();
      setZipBatch((prev) => (prev ? { ...prev, parts: data.parts } : prev));
      const ready = data.parts.filter((part) => part.status === "ready" && part.downloadUrl && !downloadedZipPartsRef.current.has(part.partIndex));
      ready.forEach((part, i) => {
        downloadedZipPartsRef.current.add(part.partIndex);
        setTimeout(() => triggerZipAnchorDownload(part.downloadUrl!), i * 700);
      });
    }, 3000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zipBatch]);

  const downloadFavoritesZip = () => downloadPhotosZip(photos.filter((p) => p.is_favorite).map((p) => p.id));
  const downloadSlideshowZip = () => downloadPhotosZip([...slideshowPhotoIds]);

  // Pulls just the two fields a client can change from their own side (favorite + label) without
  // reloading the whole page — the photographer's own edits already update local state instantly,
  // but a client's live favorite/label taps only reach this view on the next full load otherwise.
  const [refreshingFavorites, setRefreshingFavorites] = useState(false);
  const refreshFavoritesAndLabels = async () => {
    setRefreshingFavorites(true);
    const { data } = await supabase
      .from("gallery_photos")
      .select("id, is_favorite, custom_label")
      .eq("gallery_id", gallery.id)
      .returns<{ id: string; is_favorite: boolean; custom_label: string | null }[]>();
    setRefreshingFavorites(false);
    if (!data) return;
    const freshById = new Map(data.map((d) => [d.id, d]));
    setPhotos((prev) =>
      prev.map((p) => {
        const fresh = freshById.get(p.id);
        return fresh ? { ...p, is_favorite: fresh.is_favorite, custom_label: fresh.custom_label } : p;
      })
    );
  };

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

  // Narrowing the favorites down for the album, inside the favorites view (owner, 2026-10-27;
  // galleryManage/useAlbumSelection). Confirming it can change the album, which then reloads here.
  const albumSel = useAlbumSelection({
    gallery: gallery as GalleryRow & AlbumSelectionFields,
    photos,
    onGalleryPatch: (patch) => setGallery((g) => ({ ...g, ...patch })),
    onAlbumChanged: () => {
      if (album || albumManageOpen) void loadAlbum();
    },
    t,
  });
  const albumFilterOn = albumSel.filtering && showFavoritesOnly;

  const openAlbumManage = async () => {
    // Running inside the desktop app's embedded browser view (see photographer-flow-desktop's
    // BrowserView preload script, which sets this global) — hand off to the native album editor
    // instead of opening this same web modal, since the whole reason that separate app exists is
    // real filesystem access (native Save dialogs, actual multi-layer .psd writes) this web modal
    // can't offer. A normal browser tab never has this global, so this is a no-op there.
    const bridge = (window as unknown as { desktopShellBridge?: { openNativeAlbumEditor: (galleryId: string) => void } }).desktopShellBridge;
    if (bridge) {
      // The native editor has nothing to show for a gallery that has no album yet (creating one —
      // size presets, blank/template wizard — has no filesystem dependency, so it stays
      // website-only rather than being duplicated there). Check first and only bridge once one
      // actually exists; otherwise fall through to this same web modal's own creation wizard below,
      // same as a normal browser tab would.
      const { data: existing } = await supabase.from("gallery_albums").select("id").eq("gallery_id", gallery.id).maybeSingle<{ id: string }>();
      if (existing) {
        bridge.openNativeAlbumEditor(gallery.id);
        return;
      }
    }
    // Guards against the backdrop's own click-to-close firing from the very click that opened
    // this modal — on a gallery with a large `photos` array the first render/commit of the
    // modal's content (which the whole array gets passed into) can be slow enough that the
    // opening click is still resolving when the backdrop mounts underneath it, closing the
    // modal the instant it appears. A short grace window after open is enough to absorb that.
    albumManageOpenedAtRef.current = Date.now();
    setAlbumManageOpen(true);
    setSelectedStarterId(null);
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
      setError(albumErr?.message ?? t("שגיאה ביצירת האלבום"));
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
    // Real photos, not empty placeholders — per explicit request to match how a real "auto-design
    // whole album" tool works (fills real photos into the whole book in seconds, not just a blank
    // structure the photographer then has to populate frame by frame). Favorites first, matching
    // every other picker's own precedent in this tool (dragPanelPool, pickerPhotosBase below),
    // falling back to every photo when none are marked favorite yet. Consumed sequentially, one
    // photo per frame across the WHOLE book, never repeating one across two frames — once the pool
    // runs out, any remaining frames are left as empty placeholders exactly like before, rather
    // than duplicating a photo or guessing: a gallery with fewer favorites than frames still gets a
    // real, honest start.
    const favoritePool = albumToolPhotos.filter((p) => p.is_favorite);
    const photoPool = favoritePool.length > 0 ? favoritePool : photos;
    let poolIndex = 0;
    const rows = pagesFrames.map((rawFrames, i) => {
      const frames = fitFramesToSafeArea(rawFrames, marginInset);
      const elements: AlbumElement[] = frames.map((f) => {
        const photoId = poolIndex < photoPool.length ? photoPool[poolIndex++].id : null;
        return {
          id: f.id,
          type: "photo",
          photoId,
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
        };
      });
      return {
        album_id: targetAlbum.id,
        sort_order: i,
        layout: "custom" as const,
        elements,
        // NOT NULL anchor column left over from before custom layouts existed (see migration
        // 0048's comment) — unused for rendering (every frame now carries its own real photoId, or
        // null once the pool ran dry), but still has to be set to *something* real when available.
        photo_id_1: photoPool[0]?.id ?? photos[0]?.id,
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
      setError(albumErr?.message ?? t("שגיאה ביצירת האלבום"));
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
      setError(albumErr?.message ?? t("שגיאה ביצירת האלבום"));
      setBuildingAlbumBook(false);
      return;
    }
    setAlbum(newAlbum);
    await insertSpreadsFromFrameLists(newAlbum, template.pages);
    setBuildingAlbumBook(false);
  };

  // Wizard step 1, "starter template" mode: same album creation, but the page layouts are
  // generated on the fly for the requested page/photo counts instead of coming from a fixed saved
  // list — see src/lib/albumStarterTemplates.ts.
  const buildAlbumFromStarterTemplate = async (templateId: StarterTemplateId, pageCount: number, photoCount: number) => {
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
      setError(albumErr?.message ?? t("שגיאה ביצירת האלבום"));
      setBuildingAlbumBook(false);
      return;
    }
    setAlbum(newAlbum);
    await insertSpreadsFromFrameLists(newAlbum, generateStarterBookPages(templateId, pageCount, photoCount));
    setBuildingAlbumBook(false);
  };

  // Admin-only auto design (AlbumAutoDesigner): same album creation as the wizard paths above,
  // then an optional cover page (sort_order 0, its own size) and the designed spreads, every
  // element fitted into its page's safe margin exactly like fitFramesToSafeArea does for frames.
  const openAutoDesign = async () => {
    setAutoDesignOpen(true);
    if (!eventId) return;
    const { data } = await supabase.from("events").select("event_type").eq("id", eventId).maybeSingle<{ event_type: string | null }>();
    setAutoDesignEventType(data?.event_type ?? null);
  };
  // The collage decides who's in it by the event's kind, from the event type like the auto design.
  const openCollage = async () => {
    setCollageOpen(true);
    if (!eventId || autoDesignEventType) return;
    const { data } = await supabase.from("events").select("event_type").eq("id", eventId).maybeSingle<{ event_type: string | null }>();
    setAutoDesignEventType(data?.event_type ?? null);
  };
  // A design resumed after the rotate round trip (autoDesignOpen starts true) never ran
  // openAutoDesign on this page instance, so its event type is fetched here.
  useEffect(() => {
    if (!hasAutoDesignSession(gallery.id) || !eventId) return;
    supabase
      .from("events")
      .select("event_type")
      .eq("id", eventId)
      .maybeSingle<{ event_type: string | null }>()
      .then(({ data }) => setAutoDesignEventType(data?.event_type ?? null));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on mount
  }, []);

  const createAutoDesignedAlbum = async ({ size, style, cover, spreads }: AutoDesignResult) => {
    const { data: newAlbum, error: albumErr } = await supabase
      .from("gallery_albums")
      .insert({
        gallery_id: gallery.id,
        photographer_id: gallery.photographer_id,
        width_cm: size.width,
        height_cm: size.height,
        safe_margin_cm: size.margin,
        auto_style: style,
      })
      .select()
      .single<GalleryAlbumRow>();
    if (albumErr || !newAlbum) throw new Error(albumErr?.message ?? "album");
    const favoritePool = albumToolPhotos.filter((p) => p.is_favorite);
    const fallbackPhotoId = (favoritePool.length > 0 ? favoritePool : photos)[0]?.id;
    const firstPhotoId = (elements: AlbumElement[]) =>
      elements.find((el): el is AlbumPhotoElement => el.type === "photo" && !!el.photoId)?.photoId ?? fallbackPhotoId;
    const rows: Record<string, unknown>[] = [];
    if (cover) {
      const elements = fitAutoElements(cover.elements, marginInsetPctFor({ width_cm: cover.widthCm, height_cm: cover.heightCm, safe_margin_cm: size.margin }), cover.bleedIds);
      rows.push({
        album_id: newAlbum.id,
        sort_order: 0,
        layout: "custom",
        elements,
        photo_id_1: firstPhotoId(elements),
        width_cm: cover.widthCm,
        height_cm: cover.heightCm,
        background_photo_id: cover.background?.photoId ?? null,
        background_blur: cover.background?.blur ?? 0,
        background_opacity: cover.background?.opacity ?? 100,
      });
    }
    const bookInset = marginInsetPctFor(newAlbum);
    for (const spread of spreads) {
      const elements = fitAutoElements(spread.elements, bookInset, spread.bleedIds);
      rows.push({
        album_id: newAlbum.id,
        sort_order: rows.length,
        layout: "custom",
        elements,
        photo_id_1: firstPhotoId(elements),
        // Set on every row (a batch insert sends the union of the columns; a missing one would be null).
        background_photo_id: spread.background?.photoId ?? null,
        background_blur: spread.background?.blur ?? 0,
        background_opacity: spread.background?.opacity ?? 100,
      });
    }
    const { error: spreadsErr } = await supabase.from("gallery_album_spreads").insert(rows);
    if (spreadsErr) {
      // Don't leave an empty album behind: the wizard (and a retry) only shows while there's none.
      await supabase.from("gallery_albums").delete().eq("id", newAlbum.id);
      throw new Error(spreadsErr.message);
    }
    setAutoDesignOpen(false);
    await loadAlbum();
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
    setSelectedStarterId(null);
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

  // "עיצוב מחדש" (admin, with the auto designer), owner's flow (2026-09-30): a click checks how many
  // photos the page holds and applies the next template for exactly that count from the template
  // library (the photographer's album_templates first, then the built-in TEMPLATE_BANK tab), ranked
  // by how well these photos fit it; the same photos, the page's own frame finish. A template that
  // reads as the same design as one already shown (its mirror image included) is skipped until
  // every one has been seen, so each click is a visible change. When the photographer moves on to
  // another page, the last template of the previous page is saved to the library (album_templates,
  // which the editor shows in the tab of its photo count).
  const [redesigning, setRedesigning] = useState<string | null>(null);
  // Swapping photos between pages in the preview (owner, 2026-09-30): in swap mode a tap marks a
  // photo, a tap on another photo (on any page, the same one too) swaps the two — see
  // swapPhotoPatches for what changes.
  const [photoSwapMode, setPhotoSwapMode] = useState(false);
  const [photoSwapPick, setPhotoSwapPick] = useState<{ spreadId: string; elId: string } | null>(null);
  const [photoSwapping, setPhotoSwapping] = useState(false);
  // The admin's swap (owner, 2026-10-20) fits each photo into its new frame without cutting a head:
  // fitPhotoInFrame, with the photo's faces. And it has to be instant (owner: "עובדת אבל לאט מאוד,
  // זה צריך להיות מהיר מאוד"): the faces come from the gallery's stored face detection when there is
  // one, otherwise from a boxes-only detector on the photo's small preview, started as soon as a
  // photo is pointed at; the detector loads when swap mode opens; and the swap shows at once and
  // saves in the background, in order. A photo whose faces aren't known yet goes in centred and its
  // crop follows the faces a moment later.
  const albumSpreadsRef = useRef(albumSpreads);
  useEffect(() => {
    albumSpreadsRef.current = albumSpreads;
  }, [albumSpreads]);
  const [swapFaces] = useState(() =>
    createFaceCache(async (photoId) => {
      const { detectFaceBoxes } = await import("@/lib/faceRecognition");
      return detectFaceBoxes(`/api/galleries/${gallery.id}/photos/${photoId}/image?size=640&fast=1`);
    })
  );
  const photoIdAt = (pick: SwapPick) => {
    const el = albumSpreadsRef.current.find((sp) => sp.id === pick.spreadId)?.elements?.find((x) => x.id === pick.elId);
    return el?.type === "photo" ? el.photoId : null;
  };
  // The gallery's stored face detection for these photos, into the shared face cache (the swap and
  // the quality check).
  const seedStoredFaces = async (ids: string[]) => {
    for (let i = 0; i < ids.length; i += 80) {
      const { data } = await supabase
        .from("gallery_photo_faces")
        .select("photo_id, box_x, box_y, box_width, box_height")
        .eq("gallery_id", gallery.id)
        .in("photo_id", ids.slice(i, i + 80))
        .returns<{ photo_id: string; box_x: number; box_y: number; box_width: number; box_height: number }[]>();
      const byPhoto = new Map<string, FaceRect[]>();
      for (const r of data ?? []) byPhoto.set(r.photo_id, [...(byPhoto.get(r.photo_id) ?? []), { x: r.box_x, y: r.box_y, width: r.box_width, height: r.box_height }]);
      for (const [id, faces] of byPhoto) swapFaces.seed(id, faces);
    }
  };
  useEffect(() => {
    if (!photoSwapMode || photographerEmail !== ADMIN_EMAIL) return;
    void import("@/lib/faceRecognition").then((m) => m.warmFaceBoxDetector()).catch(() => {});
    const ids = [...new Set(albumSpreadsRef.current.flatMap((sp) => (sp.elements ?? []).flatMap((el) => (el.type === "photo" && el.photoId ? [el.photoId] : []))))].filter(
      (id) => !swapFaces.known(id)
    );
    void seedStoredFaces(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per opening of swap mode
  }, [photoSwapMode]);
  const fitForSwap = (faces: Map<string, FaceRect[]>): SwapFit => (el, spreadId, photoId) => {
    const sp = albumSpreadsRef.current.find((x) => x.id === spreadId);
    const page = { widthCm: sp?.width_cm ?? album!.width_cm, heightCm: sp?.height_cm ?? album!.height_cm };
    const aspect = photos.find((p) => p.id === photoId)?.preview_aspect_ratio ?? 0;
    // A frame shaped by its design keeps its shape: a mask (the fade), a tilt, or a bleed off the page.
    const bleeds = el.xPct <= 0.5 || el.yPct <= 0.5 || el.xPct + el.widthPct >= 99.5 || el.yPct + el.heightPct >= 99.5;
    return fitPhotoInFrame(el, page, aspect, faces.get(photoId) ?? [], !el.maskId && !el.rotation && !bleeds);
  };
  // Swap saves, one after another so a later swap of the same page never lands before an earlier one.
  const [enqueueSwapSave] = useState(createSerialQueue);
  const queueSpreadSave = (patches: Map<string, Partial<GalleryAlbumSpreadRow>>, failMessage = t("ההחלפה לא נשמרה, נסו שוב")) => {
    void enqueueSwapSave(async () => {
      try {
        const results = await Promise.all([...patches].map(([id, patch]) => supabase.from("gallery_album_spreads").update(patch).eq("id", id)));
        if (results.some((r) => r.error)) throw new Error("save failed");
        for (const id of patches.keys()) fetch(`/api/album-spreads/${id}/render-preview`, { method: "POST" }).catch(() => {});
      } catch {
        // Later swaps were built on this one, so the pages come back from the server as they are saved.
        if (album) {
          const { data } = await supabase.from("gallery_album_spreads").select("*").eq("album_id", album.id).order("sort_order").returns<GalleryAlbumSpreadRow[]>();
          if (data) setAlbumSpreads(data);
        }
        alert(failMessage);
      }
    });
  };
  // The album's quality check (admin, 2026-10-21; components/galleryManage/AlbumQualityCheck): it
  // shares the swap's face cache, and its fixes save like the swap does, one after another.
  const albumQuality = useAlbumQualityCheck({ album, spreads: albumSpreads, photos, faceCache: swapFaces, loadStoredFaces: seedStoredFaces });
  const [qualityFocus, setQualityFocus] = useState<{ spreadId: string; elementId?: string } | null>(null);
  const qualityFocusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Every batch of fixes can be undone (owner, 2026-10-21), also after a reload: the frames as they
  // were are kept in this browser, per album (the last 10 batches).
  const qualityUndoKey = album ? `album-quality-undo:${album.id}` : null;
  const storedQualityUndo = useMemo(() => {
    if (!qualityUndoKey) return [];
    try {
      const raw = localStorage.getItem(qualityUndoKey);
      return raw ? (JSON.parse(raw) as QualityUndo[]) : [];
    } catch {
      return [];
    }
  }, [qualityUndoKey]);
  const [qualityUndoState, setQualityUndoState] = useState<{ key: string | null; stack: QualityUndo[] } | null>(null);
  const qualityUndo = qualityUndoState && qualityUndoState.key === qualityUndoKey ? qualityUndoState.stack : storedQualityUndo;
  const keepQualityUndo = (stack: QualityUndo[]) => {
    const kept = stack.slice(-10);
    setQualityUndoState({ key: qualityUndoKey, stack: kept });
    if (!qualityUndoKey) return;
    try {
      if (kept.length) localStorage.setItem(qualityUndoKey, JSON.stringify(kept));
      else localStorage.removeItem(qualityUndoKey);
    } catch {
      // No storage (a private window): the undo still works until the page reloads.
    }
  };
  const savePatchedSpreads = (patches: Map<string, AlbumElement[]>, failMessage: string) => {
    albumSpreadsRef.current = albumSpreadsRef.current.map((sp) => (patches.has(sp.id) ? { ...sp, elements: patches.get(sp.id)! } : sp));
    setAlbumSpreads(albumSpreadsRef.current);
    queueSpreadSave(new Map([...patches].map(([id, elements]) => [id, { elements }])), failMessage);
  };
  const applyQualityFixes = (issueIds: string[]) => {
    // Recomputed on the latest pages, so a fix never lands on a frame that changed since the list was drawn.
    const wanted = new Set(issueIds);
    const patches = qualityFixPatches(albumSpreadsRef.current, albumQuality.issuesFor(albumSpreadsRef.current).filter((i) => wanted.has(i.id)));
    if (!patches.size) return;
    const record = undoRecord(albumSpreadsRef.current, patches, Date.now());
    if (record.frames.length) keepQualityUndo([...qualityUndo, record]);
    savePatchedSpreads(patches, t("התיקון לא נשמר, נסו שוב"));
  };
  const undoQualityFixes = () => {
    const last = qualityUndo[qualityUndo.length - 1];
    if (!last) return;
    const { patched, kept } = applyUndo(albumSpreadsRef.current, last);
    keepQualityUndo(qualityUndo.slice(0, -1));
    if (patched.size) savePatchedSpreads(patched, t("הביטול לא נשמר, נסו שוב"));
    if (kept) alert(t("{n} מסגרות נערכו אחרי התיקון, ולכן נשארו כמו שהן.", { n: kept }));
  };
  const showQualityIssue = (issue: QualityIssue) => {
    setQualityFocus({ spreadId: issue.spreadId, elementId: issue.elementId });
    document.getElementById(`album-page-${issue.spreadId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (qualityFocusTimer.current) clearTimeout(qualityFocusTimer.current);
    qualityFocusTimer.current = setTimeout(() => setQualityFocus(null), 5000);
  };
  const swapPhotos = async (a: SwapPick, b: SwapPick) => {
    if (photographerEmail === ADMIN_EMAIL && album) {
      const ids = [photoIdAt(a), photoIdAt(b)].filter((id): id is string => !!id);
      // Faces still being found get a short moment (usually done by then, since detection starts
      // the moment a photo is pointed at), then the swap goes ahead without them.
      const faces = new Map<string, FaceRect[]>();
      await Promise.all(
        ids.map(async (id) => {
          const found = await swapFaces.within(id, 250);
          if (found) faces.set(id, found);
        })
      );
      const patches = swapPhotoPatches(albumSpreadsRef.current, a, b, fitForSwap(faces));
      if (!patches) return;
      albumSpreadsRef.current = albumSpreadsRef.current.map((sp) => (patches.has(sp.id) ? { ...sp, ...patches.get(sp.id) } : sp));
      setAlbumSpreads(albumSpreadsRef.current);
      queueSpreadSave(patches);
      // Each photo whose faces weren't in yet: refit it when they are, if its frame hasn't changed since.
      for (const [photoId, pick] of [
        [photoIdAt(b), b],
        [photoIdAt(a), a],
      ] as const) {
        if (!photoId || faces.has(photoId)) continue;
        const placed = albumSpreadsRef.current.find((sp) => sp.id === pick.spreadId)?.elements?.find((x) => x.id === pick.elId);
        void swapFaces.facesOf(photoId).then((found) => {
          if (!found?.length) return;
          const elements = refitAfterFaces(albumSpreadsRef.current, pick, photoId, placed, fitForSwap(new Map([[photoId, found]])));
          if (!elements) return;
          albumSpreadsRef.current = albumSpreadsRef.current.map((x) => (x.id === pick.spreadId ? { ...x, elements } : x));
          setAlbumSpreads(albumSpreadsRef.current);
          queueSpreadSave(new Map([[pick.spreadId, { elements }]]));
        });
      }
      return;
    }
    setPhotoSwapping(true);
    const patches = swapPhotoPatches(albumSpreads, a, b);
    if (!patches) {
      setPhotoSwapping(false);
      return;
    }
    const targets = albumSpreads.filter((sp) => patches.has(sp.id));
    setAlbumSpreads((prev) => prev.map((sp) => (patches.has(sp.id) ? { ...sp, ...patches.get(sp.id) } : sp)));
    try {
      const results = await Promise.all([...patches].map(([id, patch]) => supabase.from("gallery_album_spreads").update(patch).eq("id", id)));
      if (results.some((r) => r.error)) {
        // Put the pages back as they were, so the screen never shows a swap that didn't save.
        setAlbumSpreads((prev) => prev.map((sp) => targets.find((t) => t.id === sp.id) ?? sp));
        alert(t("ההחלפה לא נשמרה, נסו שוב"));
        return;
      }
      for (const id of patches.keys()) fetch(`/api/album-spreads/${id}/render-preview`, { method: "POST" }).catch(() => {});
    } finally {
      setPhotoSwapping(false);
    }
  };
  const redesignCountRef = useRef(new Map<string, number>());
  const redesignSeenRef = useRef(new Map<string, Set<string>>());
  // The engine's layouts per page and photo set: computing all its variants takes a moment (most
  // on a phone), so only the first click on a page pays for it.
  const redesignEngineCacheRef = useRef(new Map<string, EngineLayout[]>());
  const lastRedesignRef = useRef<{ spreadId: string; frames: AlbumFrame[] } | null>(null);
  const saveLastRedesign = async () => {
    const last = lastRedesignRef.current;
    lastRedesignRef.current = null;
    if (!last || last.frames.length === 0) return;
    const sig = (frames: AlbumFrame[]) =>
      frames
        .map((f) => [f.xPct, f.yPct, f.widthPct, f.heightPct].map((v) => Math.round(v)).join(":"))
        .sort()
        .join("|");
    const mine = sig(last.frames);
    if (albumTemplates.some((t) => t.frames.length === last.frames.length && sig(t.frames) === mine)) return;
    await saveAlbumTemplate(`עיצוב מחדש · ${last.frames.length} תמונות`, last.frames);
  };
  // Opening the editor on another page, or closing the album, counts as moving on too.
  useEffect(() => {
    if (lastRedesignRef.current && canvasEditorTarget && canvasEditorTarget.spreadId !== lastRedesignRef.current.spreadId) void saveLastRedesign();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the target only
  }, [canvasEditorTarget]);
  useEffect(() => {
    if (!albumManageOpen && lastRedesignRef.current) void saveLastRedesign();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to closing only
  }, [albumManageOpen]);
  const redesignSpread = async (spread: GalleryAlbumSpreadRow) => {
    if (!album || redesigning) return;
    const photoEls = (spread.elements ?? []).filter((el): el is AlbumPhotoElement => el.type === "photo" && !!el.photoId);
    const ids = [...new Set(photoEls.map((el) => el.photoId as string))];
    if (ids.length === 0) return;
    setRedesigning(spread.id);
    try {
      if (lastRedesignRef.current && lastRedesignRef.current.spreadId !== spread.id) await saveLastRedesign();
      const faces = new Map<string, { x: number; y: number; width: number; height: number }[]>();
      const { data: faceRows } = await supabase
        .from("gallery_photo_faces")
        .select("photo_id, box_x, box_y, box_width, box_height")
        .in("photo_id", ids)
        .returns<{ photo_id: string; box_x: number; box_y: number; box_width: number; box_height: number }[]>();
      for (const r of faceRows ?? []) faces.set(r.photo_id, [...(faces.get(r.photo_id) ?? []), { x: r.box_x, y: r.box_y, width: r.box_width, height: r.box_height }]);
      const layoutPhotos: LayoutPhoto[] = ids.map((id) => {
        const p = photos.find((q) => q.id === id);
        const aspect = p?.preview_aspect_ratio && p.preview_aspect_ratio > 0 ? p.preview_aspect_ratio : 1.5;
        return { id, aspect, ...(faces.get(id)?.length ? { faces: faces.get(id) } : {}) };
      });
      const W = album.width_cm;
      const H = album.height_cm;
      const inset = marginInsetPctFor(album);
      const style = AUTO_STYLES.some((st) => st.id === album.auto_style) ? (album.auto_style as AutoStyleId) : "clean";
      const pageIndex = Math.max(0, albumSpreads.filter((sp) => sp.width_cm === null).findIndex((sp) => sp.id === spread.id));
      const cacheKey = `${spread.id}|${style}|${W}x${H}|${pageIndex}|${ids.join(",")}`;
      let engine = redesignEngineCacheRef.current.get(cacheKey);
      if (!engine) {
        engine = engineLayouts({ style, photos: layoutPhotos, pageIndex, widthCm: W, heightCm: H, inset });
        redesignEngineCacheRef.current.set(cacheKey, engine);
      }
      const designs = redesignDesigns({
        engine,
        photos: layoutPhotos,
        userTemplates: albumTemplates.map((t) => t.frames),
        widthCm: W,
        heightCm: H,
        inset,
        elements: spread.elements ?? [],
        idPrefix: `rd-${Date.now()}`,
      });
      if (designs.length === 0) return;
      const idx = albumSpreads.findIndex((sp) => sp.id === spread.id);
      const neighbours = new Set(
        [albumSpreads[idx - 1], albumSpreads[idx + 1]]
          .filter((sp): sp is GalleryAlbumSpreadRow => !!sp)
          .map((sp) => designShape((sp.elements ?? []).filter((el): el is AlbumPhotoElement => el.type === "photo")))
      );
      const choice = chooseRedesign(designs, {
        current: designShape(photoEls),
        seen: redesignSeenRef.current.get(spread.id) ?? new Set<string>(),
        neighbours,
        count: redesignCountRef.current.get(spread.id) ?? -1,
      });
      redesignCountRef.current.set(spread.id, choice.count);
      const chosen = choice.design;
      if (!chosen) return;
      redesignSeenRef.current.set(spread.id, choice.seen);
      const elements = chosen.build();
      const newPhotoEls = elements.filter((el): el is AlbumPhotoElement => el.type === "photo");
      lastRedesignRef.current = {
        spreadId: spread.id,
        frames: newPhotoEls.map((el) => ({
          id: el.id,
          xPct: el.xPct,
          yPct: el.yPct,
          widthPct: el.widthPct,
          heightPct: el.heightPct,
          ...(el.borderWidth ? { borderWidth: el.borderWidth, borderColor: el.borderColor } : {}),
          ...(el.shadow ? { shadow: el.shadow } : {}),
        })),
      };
      const patch = { elements, layout: "custom" as const };
      setAlbumSpreads((prev) => prev.map((row) => (row.id === spread.id ? { ...row, ...patch } : row)));
      await supabase.from("gallery_album_spreads").update(patch).eq("id", spread.id);
      // Keep the page's rendered snapshot in step, same as leaving the editor does.
      fetch(`/api/album-spreads/${spread.id}/render-preview`, { method: "POST" }).catch(() => {});
    } finally {
      setRedesigning(null);
    }
  };

  // "החלה על כל דפי האלבום" in the editor's outline panel (owner, 2026-09-30): the same outline
  // (width + colour) on the photos of every OTHER page of the album — the editor applies it to its
  // own page itself (saved with that page). Photos that run to the edge without a frame (bleeds)
  // keep having none; borderWidth 0 removes the outline.
  const applyBorderToAllSpreads = async (border: { borderWidth: number; borderColor: string }, exceptSpreadId: string) => {
    const touchesEdge = (el: AlbumPhotoElement) => el.xPct <= 0.5 || el.yPct <= 0.5 || el.xPct + el.widthPct >= 99.5 || el.yPct + el.heightPct >= 99.5;
    const updates = albumSpreads
      .filter((sp) => sp.id !== exceptSpreadId)
      .map((sp) => {
        let changed = false;
        const elements = (sp.elements ?? []).map((el) => {
          if (el.type !== "photo" || (!el.borderWidth && touchesEdge(el))) return el;
          if (el.borderWidth === border.borderWidth && el.borderColor === border.borderColor) return el;
          changed = true;
          return { ...el, borderWidth: border.borderWidth, borderColor: border.borderColor };
        });
        return changed ? { id: sp.id, elements } : null;
      })
      .filter((u): u is { id: string; elements: AlbumElement[] } => u !== null);
    if (updates.length === 0) return;
    const results = await Promise.all(updates.map((u) => supabase.from("gallery_album_spreads").update({ elements: u.elements }).eq("id", u.id)));
    const failed = results.find((r) => r.error);
    const byId = new Map(updates.map((u) => [u.id, u.elements]));
    setAlbumSpreads((prev) => prev.map((sp) => (byId.has(sp.id) ? { ...sp, elements: byId.get(sp.id) as AlbumElement[] } : sp)));
    for (const u of updates) fetch(`/api/album-spreads/${u.id}/render-preview`, { method: "POST" }).catch(() => {});
    if (failed?.error) throw new Error(failed.error.message);
  };

  // "החלה על כל דפי האלבום" in the editor's background panel (owner, 2026-09-30): the same
  // background photo with the same blur / opacity / zoom on every OTHER inner page (the editor's own
  // page keeps it and saves it with the page). The cover keeps its own look.
  const applyBackgroundToAllSpreads = async (bg: { photoId: string; blur: number; opacity: number; zoom: number }, exceptSpreadId: string) => {
    const patch = { background_photo_id: bg.photoId, background_blur: bg.blur, background_opacity: bg.opacity, background_zoom: bg.zoom };
    const targets = albumSpreads.filter((sp) => sp.id !== exceptSpreadId && sp.width_cm === null);
    if (targets.length === 0) return;
    const results = await Promise.all(targets.map((sp) => supabase.from("gallery_album_spreads").update(patch).eq("id", sp.id)));
    const ids = new Set(targets.map((sp) => sp.id));
    setAlbumSpreads((prev) => prev.map((sp) => (ids.has(sp.id) ? { ...sp, ...patch } : sp)));
    for (const sp of targets) fetch(`/api/album-spreads/${sp.id}/render-preview`, { method: "POST" }).catch(() => {});
    const failed = results.find((r) => r.error);
    if (failed?.error) throw new Error(failed.error.message);
  };

  // Swaps in a different photo for one slot of an existing spread without disturbing the other
  // slot, the spread's position, layout, or the client's comments (comments are tied to spread_id,
  // not to a specific photo, so a swapped-in photo still shows prior feedback in context).
  const saveSpreadElements = async (elements: AlbumElement[], background: { photoId: string | null; blur: number; opacity: number; zoom: number }) => {
    if (!canvasEditorTarget) return;
    const { spreadId, mode } = canvasEditorTarget;
    const backgroundPatch = {
      background_photo_id: background.photoId,
      background_blur: background.blur,
      background_opacity: background.opacity,
      background_zoom: background.zoom,
    };
    // Saving the page in the editor is the photographer having seen it: its red dots go (lib/albumSelection.ts).
    const patch = mode === "custom" ? { elements, layout: "custom" as const, ...backgroundPatch, marked_frames: [] } : { elements, ...backgroundPatch, marked_frames: [] };
    setAlbumSpreads((prev) => prev.map((s) => (s.id === spreadId ? { ...s, ...patch } : s)));
    await supabase.from("gallery_album_spreads").update(patch).eq("id", spreadId);
    setCanvasEditorTarget(null);
  };

  // Loads the photographer's own custom ornament tabs the moment the canvas editor opens (not
  // Self-clears so it doesn't linger.
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
    setCustomOrnamentsLoading(true);
    (async () => {
      try {
        // Only the list (one request): each ornament's image is its own route URL, which the browser
        // loads when it's actually shown (and caches). Downloading every ornament up front — 97+
        // separate server round trips — is what made the tool slow to open on phones, where the
        // editor waits for this list (owner, 2026-09-30).
        const data = await fetchCustomOrnaments();
        if (cancelled) return;
        setCustomOrnamentTabs(data.tabs);
        setCustomOrnaments(data.ornaments.map((o) => ({ id: o.id, tab_id: o.tab_id, url: `/api/desktop/ornaments/${o.id}` })));
      } catch {
        // A failed ornament-tab load shouldn't block opening the editor itself.
      } finally {
        if (!cancelled) setCustomOrnamentsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
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

  // "שליחה לאישור הלקוח/ה" (owner, 2026-10-27): the message with the link that opens the album, in
  // the send window (galleryManage/AlbumSendToClient). The album turns "sent" only when it goes out.
  const [albumSendInfo, setAlbumSendInfo] = useState<AlbumClientInfo | null>(null);
  const [albumSendNotice, setAlbumSendNotice] = useState<"unpublished" | "error" | null>(null);
  // The client's latest marked corrections (gallery_album_corrections, the client's "צריך תיקונים"),
  // linked from the status line while the album waits for them.
  const [albumCorrectionId, setAlbumCorrectionId] = useState<string | null>(null);
  useEffect(() => {
    if (!album || album.status !== "changes_requested") return;
    let cancelled = false;
    supabase
      .from("gallery_album_corrections")
      .select("id")
      .eq("album_id", album.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string }>()
      .then(({ data }) => {
        if (!cancelled) setAlbumCorrectionId(data?.id ?? null);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the album's id and status are what matter
  }, [album?.id, album?.status]);
  const sendAlbumToClient = async () => {
    if (!album) return;
    setSavingAlbum(true);
    try {
      const info = await fetchAlbumClientInfo(gallery.id);
      if (info.published) setAlbumSendInfo(info);
      else setAlbumSendNotice("unpublished");
    } catch {
      setAlbumSendNotice("error");
    } finally {
      setSavingAlbum(false);
    }
  };
  const albumSent = (channel: Parameters<typeof recordAlbumSend>[1]) => {
    setAlbum((prev) => (prev && prev.status !== "approved" ? { ...prev, status: "sent" } : prev));
    void recordAlbumSend(gallery.id, channel);
  };

  // Total exportable pages, matching how the export routes number them: the cover (if the album
  // has one) counts as page 1, then each spread follows in sort order.
  const albumTotalPages = (album?.cover_photo_id ? 1 : 0) + albumSpreads.length;

  const openExportRangeModal = (format: "pdf" | "jpg" | "psd") => {
    // One export at a time (several abandoned exports competing for the same render resources was
    // a real bug, 2026-09-02): any export button while one runs, here or in the background, brings
    // that one's progress window back instead of starting another.
    if (runningExport) {
      showAlbumExport(runningExport.id);
      return;
    }
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
    // Always "web" now — per explicit request, a PDF export never needs original/print-resolution
    // images, so the "high"/print-quality choice was removed from the UI below entirely rather
    // than just defaulted; see TARGET_MAX_BYTES.web in albumExportJobs.ts for the matching bump to
    // 80MB (was 5MB) that goes with dropping "high" — a generous target now, not the "keep it
    // mobile-tiny" one "web" originally had, so the export's own first quality-step pass almost
    // always fits on the first try instead of needing several full re-render retries.
    // allowSaveDialog: PDF only, per explicit request — lets the photographer pick exactly where it
    // lands (e.g. straight into a client's folder) instead of always going to Downloads.
    startAlbumExport({
      galleryId: gallery.id,
      galleryTitle: gallery.title,
      format: exportRangeFormat,
      ...range,
      allowSaveDialog: exportRangeFormat === "pdf",
      clientPhone: gallery.client_phone,
      clientLang,
    });
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
    setPrintHouseFrom(1);
    setPrintHouseTo(albumTotalPages);
    setPrintHouseModalOpen(true);
  };

  // The chosen pages, in order and inside the album (same rule as confirmExportRange).
  const printHouseRange = () => ({
    from: Math.max(1, Math.min(printHouseFrom, printHouseTo)),
    to: Math.min(albumTotalPages, Math.max(printHouseFrom, printHouseTo)),
  });

  // The send runs in the exports store like an export (lib/albumExports.ts, owner 2026-10-26): the
  // progress window with "המשך ברקע", the pill, the line on the gallery page and the card.
  const sendToPrintHouseConfirmed = () => {
    const target = printHouseEmails.find((e) => e.id === printHouseSelectedId);
    if (!target) return;
    const range = printHouseRange();
    setPrintHouseConfirmOpen(false);
    setPrintHouseModalOpen(false);
    const busy = albumJobBusyMessage();
    if (busy) {
      setPrintHouseToast(t(busy));
      return;
    }
    startAlbumExport({
      galleryId: gallery.id,
      galleryTitle: gallery.title,
      format: "print",
      ...range,
      print: { email: target.email, target: target.label || target.email, notes: printHouseNotes },
    });
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

    if (albumFilterOn) {
      albumSel.toggle(photo.id);
      return;
    }

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
      withViewTransition(() => {
        setTransitionPhotoId(photo.id);
        setLightboxIndex(index);
      });
    }, DOUBLE_TAP_MS);
  };
  const closeLightbox = () => withViewTransition(() => setLightboxIndex(null));
  // Stepping between photos is a plain update (no transition), and the photo shown becomes the one
  // that animates back into the grid on close.
  const navLightbox = (index: number) => {
    setTransitionPhotoId(visiblePhotos[index]?.id ?? null);
    setLightboxIndex(index);
  };

  // Get or create a tab by its place (lib/galleryFolders.ts, dropTarget): a main tab by name, or a
  // sub-tab under a main tab given by id or by name. `known` holds the tabs made during this drop,
  // ahead of the state update.
  type TabLookup = { cache: Map<string, string>; known: GalleryFolderNode[] };
  const newTabLookup = (): TabLookup => ({ cache: new Map(), known: [...folders] });
  const ensureTab = async (name: string, parent: null | { id: string } | { name: string }, ctx: TabLookup): Promise<string | null> => {
    const key = tabKey(name, parent);
    const cached = ctx.cache.get(key);
    if (cached) return cached;
    let parentId: string | null = null;
    if (parent) {
      parentId = "id" in parent ? parent.id : await ensureTab(parent.name, null, ctx);
      if (!parentId) return null;
    }
    const found = ctx.known.find((f) => f.name === name && (f.parent_id ?? null) === parentId);
    if (found) {
      ctx.cache.set(key, found.id);
      return found.id;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: folderRow, error } = await supabase
      .from("gallery_folders")
      .insert({
        gallery_id: gallery.id,
        photographer_id: user.id,
        name,
        parent_id: parentId,
        sort_order: nextSortOrder(ctx.known, parentId),
      })
      .select()
      .single<GalleryFolderNode>();
    if (error || !folderRow) {
      // Made meanwhile (another device, or a race): use that one.
      let q = supabase.from("gallery_folders").select("*").eq("gallery_id", gallery.id).eq("name", name);
      q = parentId ? q.eq("parent_id", parentId) : q.is("parent_id", null);
      const { data: existingRow } = await q.maybeSingle<GalleryFolderNode>();
      if (!existingRow) return null;
      ctx.known.push(existingRow);
      ctx.cache.set(key, existingRow.id);
      setFolders((prev) => (prev.some((f) => f.id === existingRow.id) ? prev : orderedFolders([...prev, existingRow])));
      return existingRow.id;
    }
    ctx.known.push(folderRow);
    ctx.cache.set(key, folderRow.id);
    setFolders((prev) => orderedFolders([...prev, folderRow]));
    return folderRow.id;
  };
  // The tab of every dropped file, its tabs made first in the order of their names (tabsInOrder),
  // so "1.חתן" sits before "2.תפילה" whatever order the browser read the files in.
  const foldersForPaths = async (relativePaths: string[], ctx: TabLookup): Promise<(string | null)[]> => {
    const targets = relativePaths.map((p) => dropTarget(ctx.known, activeFolderId, p));
    for (const t of tabsInOrder(targets)) await ensureTab(t.name, t.parent, ctx);
    const ids: (string | null)[] = [];
    for (const t of targets) ids.push(t.kind === "open" ? t.folderId : await ensureTab(t.name, t.parent, ctx));
    return ids;
  };

  // True when the upload started (or joined this gallery's running one).
  const uploadResolvedFiles = async (items: GalleryUploadItem[]): Promise<boolean> => {
    if (items.length === 0) return false;
    setError(null);
    setUploadHalted(false);
    setDropUnreadable(false);
    // Photos still on their way in this gallery's running upload count toward the limit too.
    const existing = photos.length + activeUploadCount(gallery.id);
    if (existing + items.length > MAX_GALLERY_PHOTOS) {
      setError(
        existing >= MAX_GALLERY_PHOTOS
          ? t("הגלריה כבר מכילה {count} תמונות, הגעתם למגבלה של {max} תמונות לגלריה.", { count: existing, max: MAX_GALLERY_PHOTOS })
          : t("בגלריה יש כבר {count} תמונות, ונבחרו עוד {added}, יחד זה חורג מהמגבלה של {max} תמונות לגלריה. אפשר להעלות עד {left} תמונות נוספות בסבב הזה.", {
              count: existing,
              added: items.length,
              max: MAX_GALLERY_PHOTOS,
              left: MAX_GALLERY_PHOTOS - existing,
            })
      );
      return false;
    }
    // One tab uploads at a time (two tabs would only split the connection between them). In this
    // tab any number of galleries can upload together, and photos dropped into a gallery that is
    // already uploading join that upload.
    const other = otherTabUpload();
    if (other) {
      setBlockedByOtherUpload(other);
      return false;
    }
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    setUploadJustFinished(null);
    enqueueGalleryUpload({ galleryId: gallery.id, galleryTitle: gallery.title, userId: user.id, sortBase: photos.length, items });
    return true;
  };

  // A dropped folder lands in a tab named after it (ensureFolderId), also when another tab is open
  // (owner, 2026-10-17). The page moves to that tab, so the photographer sees the photos arrive
  // there instead of an open tab that stays the same. Several folders at once: "הכל".
  // Tabs of one main tab (a dropped event folder) show that main tab.
  const showUploadTab = (items: { folderId: string | null }[], known: GalleryFolderNode[]) => {
    const ids = new Set(items.map((i) => i.folderId));
    if (ids.size === 1) {
      setActiveFolderId([...ids][0]);
      return;
    }
    const mains = new Set([...ids].map((id) => mainFolderId(known, id)));
    setActiveFolderId(mains.size === 1 ? [...mains][0] : null);
  };

  // This gallery's new photos appear as they land, also after leaving the page and coming back.
  // They join the grid in batches, not one redraw of the whole page per photo, and show the
  // server's small preview (made right after the upload), not the original from the computer:
  // hundreds of full-size originals decoding on screen stalled the page (owner, 2026-10-17: smooth
  // with 2000+ photos).
  useEffect(() => {
    let pending: PhotoWithUrl[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      const batch = pending;
      pending = [];
      startTransition(() =>
        setPhotos((prev) => {
          const have = new Set(prev.map((p) => p.id));
          const fresh = batch.filter((p) => !have.has(p.id));
          return fresh.length > 0 ? [...prev, ...fresh] : prev;
        })
      );
    };
    const off = onGalleryPhoto(gallery.id, (row) => {
      // `url` is what the rest of the page (slideshow, cover, album) draws: the same-origin image
      // route, so a canvas can read it, like the local copy it replaces.
      pending.push({
        ...row,
        url: `/api/galleries/${gallery.id}/photos/${row.id}/image?size=2000`,
        previewUrl: `/api/galleries/${gallery.id}/photos/${row.id}/preview`,
      });
      if (!timer) timer = setTimeout(flush, 800);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, [gallery.id]);

  // When this gallery's upload ends: the files that didn't make it, the "upload complete" toast for
  // one that ran in the background, and the prompt to tell the client about the new photos. Then
  // it leaves the uploads list.
  const seenUploadPhaseRef = useRef<string | null>(null);
  useEffect(() => {
    const handle = () => {
      const key = uploadKey("photos", gallery.id);
      const u = getUploadsSnapshot().find((g) => g.key === key) ?? null;
      if (!u) {
        seenUploadPhaseRef.current = null;
        return;
      }
      const prev = seenUploadPhaseRef.current;
      seenUploadPhaseRef.current = u.phase;
      if (u.phase === "queued" || u.phase === "uploading" || prev === u.phase) return;
      const ok = u.succeeded;
      if (u.phase === "offline") {
        setError(
          ok > 0
            ? t("אין חיבור לאינטרנט, ההעלאה הופסקה. {done} מתוך {total} תמונות הספיקו לעלות לפני שהחיבור ירד. יש לבדוק את החיבור לרשת ולהעלות את השאר שוב.", { done: ok, total: u.total })
            : t("אין חיבור לאינטרנט, ההעלאה לא התחילה. יש לבדוק את החיבור לרשת ולנסות שוב.")
        );
      } else if (u.halted) {
        setUploadHalted(u.halted.reason === UNREADABLE_FILE);
        setError(
          `${
            u.halted.left > 0
              ? t("ההעלאה נעצרה: {n} התמונות הראשונות לא עלו, ולכן {left} התמונות האחרות לא נשלחו. הסיבה: {reason}.", {
                  n: u.failed.length,
                  left: u.halted.left,
                  reason: t(u.halted.reason),
                })
              : t("אף אחת מ-{n} התמונות לא עלתה. הסיבה: {reason}.", { n: u.failed.length, reason: t(u.halted.reason) })
          } ${
            u.halted.reason === UNREADABLE_FILE
              ? t("הדפדפן לא מצליח לקרוא את הקבצים מהמחשב. אפשר לבחור את התיקייה בכפתור כאן למטה, במקום לגרור. אם גם זה לא עובד: תיקייה ב-iCloud, ב-Google Drive או ב-OneDrive צריך קודם להוריד למחשב (ב-Mac: לחיצה ימנית על התיקייה ב-Finder, ואז \"הורדה עכשיו\"). תיקייה בכונן חיצוני: לוודא שהוא מחובר.")
              : t("כדאי לבדוק את החיבור לאינטרנט ולנסות שוב. אם זה חוזר, שלחו לנו את ההודעה הזו.")
          }`
        );
      } else if (u.failed.length > 0) {
        const shown = u.failed.slice(0, 8);
        const more = u.failed.length - shown.length;
        const files = shown.join(", ") + (more > 0 ? ` ${t("ועוד {n} נוספים", { n: more })}` : "");
        // Files the browser couldn't read: the same hint and picker buttons as a stopped upload.
        const unreadable = u.failed.some((f) => f.includes(UNREADABLE_FILE));
        setUploadHalted(unreadable);
        setError(
          `${
            ok > 0
              ? t("{n} קבצים לא הועלו: {files}{more}. שאר התמונות הועלו בהצלחה. אפשר להעלות את אלה שנכשלו שוב בנפרד.", { n: u.failed.length, files: shown.join(", "), more: more > 0 ? ` ${t("ועוד {n} נוספים", { n: more })}` : "" })
              : t("אף אחת מהתמונות לא עלתה: {files}.", { files })
          }${
            unreadable
              ? ` ${t("הדפדפן לא מצליח לקרוא את הקבצים מהמחשב. אפשר לבחור את התיקייה בכפתור כאן למטה, במקום לגרור. אם גם זה לא עובד: תיקייה ב-iCloud, ב-Google Drive או ב-OneDrive צריך קודם להוריד למחשב (ב-Mac: לחיצה ימנית על התיקייה ב-Finder, ואז \"הורדה עכשיו\"). תיקייה בכונן חיצוני: לוודא שהוא מחובר.")}`
              : ""
          }`
        );
      } else if (u.phase === "done") {
        if (u.background) setCompletedUploadToast({ succeededCount: ok, totalCount: u.total });
        // Only worth prompting a client update for photos landing in a gallery the client can
        // already see, and only for an upload that ended while this page was open.
        if (ok > 0 && gallery.published && prev !== null) setUploadJustFinished(ok);
      }
      // Photos that landed while this page was closed come from the server.
      if (u.background || prev === null) router.refresh();
      dismissUpload(key);
    };
    // Also an upload that finished while this page was closed (checked once, right after opening).
    const first = setTimeout(handle, 0);
    const unsubscribe = subscribeUploads(handle);
    return () => {
      clearTimeout(first);
      unsubscribe();
    };
  }, [gallery.id, gallery.published, router, t]);

  const reportRejectedFormats = (rejected: string[]) => {
    if (rejected.length === 0) return;
    const note = t("הגלריה תומכת רק בקבצי JPG, JPEG, PNG, GIF ו-BMP. הקבצים הבאים לא הועלו: {files}", {
      files: rejected.join(", "),
    });
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
    reportRejectedFormats(rejected.map((f) => f.name));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDirectoryFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const all = Array.from(files).filter((f) => !isHiddenFileName(f.name));
    const allowed = all.filter(isAllowedImageFile);
    const rejected = all.filter((f) => !isAllowedImageFile(f));
    const lookup = newTabLookup();
    const ids = await foldersForPaths(allowed.map((file) => (file as File & { webkitRelativePath?: string }).webkitRelativePath || ""), lookup);
    const items = allowed.map((file, i) => ({ file, folderId: ids[i] }));
    if (await uploadResolvedFiles(items)) showUploadTab(items, lookup.known);
    reportRejectedFormats(rejected.map((f) => f.name));
    if (directoryInputRef.current) directoryInputRef.current.value = "";
  };

  // Dropped files are passed by their entries and read only when the upload gets to each one
  // (lib/fileDrop.ts, readDroppedEntries).
  const handleDroppedItems = async (items: DataTransferItemList) => {
    const dropped = await readDroppedEntries(items);
    if (dropped.length === 0) return;
    const allowed = dropped.filter((d) => isAllowedImageName(d.name));
    const rejected = dropped.filter((d) => !isAllowedImageName(d.name)).map((d) => d.name);
    // Can the browser read what was dropped? Safari's app on a Mac (added to the Dock) and a cloud
    // folder that isn't on the computer hand over files it then can't read (owner, 2026-10-17: every
    // photo failed there, while the same drag worked in Chrome). Checked on the first photo, before
    // a tab is opened or anything is sent; the photographer picks the folder instead.
    const first = allowed[0];
    if (first) {
      let probe: File | null = first.file ?? null;
      let problem: string | null = null;
      if (!probe && first.entry) probe = await fileOfEntry(first.entry).catch((e: unknown) => ((problem = e instanceof Error ? `${e.name}: ${e.message}` : String(e)), null));
      if (probe) problem = await unreadableReason(probe);
      if (problem || !probe) {
        setDropUnreadable(true);
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) reportUnreadableDrop({ tabId: uploadTabId(), galleryId: gallery.id, title: gallery.title, userId: user.id, count: allowed.length, note: `${UNREADABLE_FILE} (drop) | ${problem ?? "no file"}` });
        return;
      }
    }
    const lookup = newTabLookup();
    const ids = await foldersForPaths(allowed.map((d) => d.relativePath), lookup);
    const resolved: GalleryUploadItem[] = [];
    allowed.forEach((d, i) => {
      if (d.entry) resolved.push({ entry: d.entry, name: d.name, folderId: ids[i] });
      else if (d.file) resolved.push({ file: d.file, folderId: ids[i] });
    });
    if (await uploadResolvedFiles(resolved)) showUploadTab(resolved, lookup.known);
    reportRejectedFormats(rejected);
  };

  // The whole page is the drop target (not just the zone) — a photographer scrolled deep into a long
  // gallery can drop straight onto whatever is under the cursor. Only real file drags count
  // (dataTransfer.types includes "Files"), so the album/photo reordering drags that share these
  // events are left alone. The enter/leave counter is the standard fix for dragleave firing every
  // time the cursor crosses a child element boundary, which would otherwise flicker the overlay.
  // Kept in a ref so the listeners (registered once) always call the latest handler.
  const handleDroppedItemsRef = useRef(handleDroppedItems);
  handleDroppedItemsRef.current = handleDroppedItems;
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: globalThis.DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    const onEnter = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setIsDragging(true);
    };
    const onOver = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
    };
    const onLeave = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setIsDragging(false);
    };
    const onDropWindow = (e: globalThis.DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setIsDragging(false);
      if (e.dataTransfer) void handleDroppedItemsRef.current(e.dataTransfer.items);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDropWindow);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDropWindow);
    };
  }, []);

  const createFolder = async () => {
    const name = newFolderName.trim();
    if (!name) return;
    const parent = addingFolder === "sub" && activeMainId ? { id: activeMainId } : null;
    const id = await ensureTab(name, parent, newTabLookup());
    if (!id) {
      setError(t("שגיאה ביצירת התיקייה"));
      return;
    }
    setActiveFolderId(id);
    setNewFolderName("");
    setAddingFolder(null);
  };

  const tabSaveError = (code: string | undefined, message: string | undefined) =>
    code === "23505" ? t("כבר קיימת לשונית בשם הזה") : message?.startsWith("folder_") ? t("אי אפשר להעביר את הלשונית לשם") : message ?? t("שגיאה בשינוי שם התיקייה");

  // "עריכת לשונית": the name and the main tab it sits in. A tab moved to another main tab goes last there.
  const saveTab = async (folder: GalleryFolderNode, name: string, parentId: string | null): Promise<string | null> => {
    const moved = (folder.parent_id ?? null) !== parentId;
    if (name === folder.name && !moved) return null;
    const patch: { name: string; parent_id?: string | null; sort_order?: number } = { name };
    if (moved) {
      patch.parent_id = parentId;
      patch.sort_order = nextSortOrder(folders, parentId);
    }
    const { error: updateError } = await supabase.from("gallery_folders").update(patch).eq("id", folder.id);
    if (updateError) return tabSaveError(updateError.code, updateError.message);
    setFolders((prev) => orderedFolders(prev.map((f) => (f.id === folder.id ? { ...f, ...patch } : f))));
    return null;
  };

  const addSubTab = async (parent: GalleryFolderNode, name: string): Promise<string | null> => {
    if (folders.some((f) => f.parent_id === parent.id && f.name === name)) return t("כבר קיימת לשונית בשם הזה");
    const id = await ensureTab(name, { id: parent.id }, newTabLookup());
    if (!id) return t("שגיאה ביצירת התיקייה");
    setActiveFolderId(id);
    return null;
  };

  // Deleting a tab (owner, 2026-10-28): the photographer chose either the tab alone, whose photos
  // stay in the gallery without a tab (`on delete set null`), or the tab and its photos. A main tab's
  // sub-tabs go with it (`on delete cascade`). The photos go first, so a failure leaves the tab.
  const deleteFolder = async (mode: DeleteFolderMode) => {
    const folder = deleteFolderConfirm;
    if (!folder) return;
    const ids = folderWithChildren(folders, folder.id);
    setDeletingFolder(true);
    if (mode === "photos") {
      const inTab = photos.filter((p) => p.folder_id && ids.has(p.folder_id));
      const failed = await deletePhotoRows(inTab).then(
        () => null,
        (e: unknown) => (e instanceof Error ? e.message : t("שגיאה במחיקת התמונות. נסו שוב"))
      );
      if (failed) {
        setDeletingFolder(false);
        setDeleteFolderConfirm(null);
        setError(failed);
        return;
      }
    }
    const { error: deleteError } = await supabase.from("gallery_folders").delete().eq("id", folder.id);
    setDeletingFolder(false);
    setDeleteFolderConfirm(null);
    if (deleteError) {
      setError(deleteError.message ?? t("שגיאה במחיקת התיקייה"));
      return;
    }
    setFolders((prev) => prev.filter((f) => !ids.has(f.id)));
    setPhotos((prev) => prev.map((p) => (p.folder_id && ids.has(p.folder_id) ? { ...p, folder_id: null } : p)));
    if (activeFolderId && ids.has(activeFolderId)) setActiveFolderId(null);
  };

  // Storage cleanup happens FIRST and is checked before either the DB row or local UI state is
  // touched — this used to fire-and-forget the storage removal, so a failure (e.g. R2 erroring on
  // a large batch) left the DB row deleted and the photo gone from the gallery while the actual
  // file sat orphaned in storage forever. Now a failure leaves everything untouched and visible,
  // with a clear error, instead of silently pretending the delete succeeded.
  // A .webp preview lives in the separate previews bucket (see storage.ts's removePreviewObjects)
  // — anything else is a pre-migration legacy preview still sitting in the main bucket right next
  // to its storage_path, and must be deleted the same way storage_path is.
  const isNewPreviewPath = (p: string) => p.endsWith(".webp");

  const confirmDeletePhoto = async () => {
    const photo = deleteConfirmPhoto;
    if (!photo) return;
    setDeleteConfirmPhoto(null);
    setDeletePhotosError(null);
    setDeletingPhotos(true);
    try {
      const legacyPreview = photo.preview_storage_path && !isNewPreviewPath(photo.preview_storage_path) ? photo.preview_storage_path : null;
      const newPreview = photo.preview_storage_path && isNewPreviewPath(photo.preview_storage_path) ? photo.preview_storage_path : null;
      const removeRes = await fetch("/api/storage/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bucket: "galleries",
          paths: [photo.storage_path, legacyPreview].filter((p): p is string => !!p),
          previewPaths: newPreview ? [newPreview] : [],
        }),
      });
      if (!removeRes.ok) {
        const data = await removeRes.json().catch(() => null);
        throw new Error(data?.error ?? t("שגיאה במחיקת התמונה מהאחסון. נסו שוב"));
      }
      const { error: dbError } = await supabase.from("gallery_photos").delete().eq("id", photo.id);
      if (dbError) throw new Error(t("שגיאה במחיקת התמונה. נסו שוב"));
      setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
      if (gallery.cover_photo_id === photo.id) {
        await supabase.from("galleries").update({ cover_photo_id: null }).eq("id", gallery.id);
        setGallery((g) => ({ ...g, cover_photo_id: null }));
      }
    } catch (e) {
      // Was previously left to the shared `error` state, which renders nowhere near this action —
      // a failure here now surfaces immediately, in the same overlay the progress spinner just was.
      setDeletePhotosError(e instanceof Error ? e.message : t("שגיאה במחיקת התמונה. נסו שוב"));
    } finally {
      setDeletingPhotos(false);
    }
  };

  // Deletes photos for good: the files first, then the rows (throws, leaving them, if the files
  // couldn't be removed). Used by "delete selected" and by deleting a tab with its photos.
  const deletePhotoRows = async (selected: PhotoWithUrl[]) => {
    if (selected.length === 0) return;
    const ids = selected.map((p) => p.id);
    const gone = new Set(ids);
    const paths = selected.flatMap((p) => [
      p.storage_path,
      p.preview_storage_path && !isNewPreviewPath(p.preview_storage_path) ? p.preview_storage_path : null,
    ]).filter((x): x is string => !!x);
    const previewPaths = selected
      .map((p) => p.preview_storage_path)
      .filter((x): x is string => !!x && isNewPreviewPath(x));
    const removeRes = await fetch("/api/storage/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: "galleries", paths, previewPaths }),
    });
    if (!removeRes.ok) {
      const data = await removeRes.json().catch(() => null);
      throw new Error(data?.error ?? t("שגיאה במחיקת התמונות מהאחסון. נסו שוב"));
    }
    // PostgREST encodes an .in() filter straight into the request URL's query string — a few
    // hundred UUIDs is already tens of KB, and the underlying infrastructure rejects the request
    // outright (400, before it ever reaches Postgres) well before Supabase's own row-count limits
    // would matter. Deleting in bounded chunks keeps every request's URL short regardless of how
    // many photos were selected.
    const DELETE_ID_BATCH_SIZE = 200;
    for (let i = 0; i < ids.length; i += DELETE_ID_BATCH_SIZE) {
      const batch = ids.slice(i, i + DELETE_ID_BATCH_SIZE);
      const { error: dbError } = await supabase.from("gallery_photos").delete().in("id", batch);
      if (dbError) throw new Error(t("שגיאה במחיקת התמונות. נסו שוב"));
    }
    setPhotos((prev) => prev.filter((p) => !gone.has(p.id)));
    if (gallery.cover_photo_id && ids.includes(gallery.cover_photo_id)) {
      await supabase.from("galleries").update({ cover_photo_id: null }).eq("id", gallery.id);
      setGallery((g) => ({ ...g, cover_photo_id: null }));
    }
  };

  const confirmDeleteSelectedPhotos = async () => {
    const selected = photos.filter((p) => selectedIds.has(p.id));
    if (selected.length === 0) return;
    setDeleteSelectedConfirmOpen(false);
    setDeletePhotosError(null);
    setDeletingPhotos(true);
    try {
      await deletePhotoRows(selected);
      clearSelection();
    } catch (e) {
      setDeletePhotosError(e instanceof Error ? e.message : t("שגיאה במחיקת התמונות. נסו שוב"));
    } finally {
      setDeletingPhotos(false);
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

  const setCoverPhoto = (photo: PhotoWithUrl) => {
    setActionSheetPhoto(null);
    setCoverFocalPointTarget({ photo, immediate: true });
  };

  const updatePhotoCullingStatus = (photoId: string, status: GalleryPhotoRow["culling_status"]) => {
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, culling_status: status } : p)));
  };

  const togglePortfolio = async (photo: PhotoWithUrl) => {
    setActionSheetPhoto(null);
    // Adding a photo asks for a category first (see portfolioCategoryPhoto below); removing asks
    // for a plain confirmation (see removeFromPortfolioPhoto) — a photo that's in the public
    // portfolio should never disappear from it by an accidental tap.
    if (photo.in_portfolio) {
      setRemoveFromPortfolioPhoto(photo);
      return;
    }
    setPortfolioCategoryPhoto(photo);
    setPortfolioCategoryInput(photo.portfolio_category ?? "");
    setPortfolioSubcategoryInput(photo.portfolio_subcategory ?? "");
    // A sub-tab exists only through the photos that carry it (RLS keeps this to the photographer's).
    const { data } = await supabase
      .from("gallery_photos")
      .select("portfolio_category, portfolio_subcategory")
      .eq("in_portfolio", true)
      .not("portfolio_subcategory", "is", null);
    const subTabs: Record<string, string[]> = {};
    for (const r of (data ?? []) as Pick<GalleryPhotoRow, "portfolio_category" | "portfolio_subcategory">[]) {
      if (!r.portfolio_category || !r.portfolio_subcategory) continue;
      const list = (subTabs[r.portfolio_category] ??= []);
      if (!list.includes(r.portfolio_subcategory)) list.push(r.portfolio_subcategory);
    }
    setPortfolioSubTabs(subTabs);
  };

  const confirmRemoveFromPortfolio = async () => {
    if (!removeFromPortfolioPhoto) return;
    const photoId = removeFromPortfolioPhoto.id;
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, in_portfolio: false, portfolio_category: null, portfolio_subcategory: null } : p)));
    setRemoveFromPortfolioPhoto(null);
    await supabase.from("gallery_photos").update({ in_portfolio: false, portfolio_category: null }).eq("id", photoId);
  };

  const savePortfolioCategory = async () => {
    if (!portfolioCategoryPhoto) return;
    const category = portfolioCategoryInput.trim() || null;
    const subcategory = category ? portfolioSubcategoryInput.trim() || null : null;
    const photoId = portfolioCategoryPhoto.id;
    setPhotos((prev) => prev.map((p) => (p.id === photoId ? { ...p, in_portfolio: true, portfolio_category: category, portfolio_subcategory: subcategory } : p)));
    setPortfolioCategoryPhoto(null);
    await supabase.from("gallery_photos").update({ in_portfolio: true, portfolio_category: category, portfolio_subcategory: subcategory }).eq("id", photoId);
  };

  const downloadPhoto = (photo: PhotoWithUrl) => {
    setActionSheetPhoto(null);
    downloadPhotoNow(photo);
  };

  // The page no longer carries a signed URL per photo (photo.url is the /original route, which
  // needs the photographer's session; a photo uploaded since the page loaded has /image), so the photo's own hour-long link is fetched as soon as its
  // action sheet opens: navigator.share has to run straight from the tap, not after a request.
  const [photoShareLink, setPhotoShareLink] = useState<{ id: string; url: string } | null>(null);
  useEffect(() => {
    if (!actionSheetPhoto) return;
    let cancelled = false;
    fetch(`${photographerOriginalUrl(gallery.id, actionSheetPhoto.id)}?link=1`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { url?: string } | null) => {
        if (!cancelled && data?.url) setPhotoShareLink({ id: actionSheetPhoto.id, url: data.url });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [actionSheetPhoto, gallery.id]);

  const sharePhoto = async (photo: PhotoWithUrl) => {
    setActionSheetPhoto(null);
    let link = photoShareLink?.id === photo.id ? photoShareLink.url : null;
    if (!link) {
      const res = await fetch(`${photographerOriginalUrl(gallery.id, photo.id)}?link=1`).catch(() => null);
      link = res?.ok ? (((await res.json()) as { url?: string }).url ?? null) : null;
    }
    if (!link) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: photo.original_filename, url: link });
        return;
      } catch {
        // user cancelled or share failed — fall through to clipboard copy
      }
    }
    await navigator.clipboard.writeText(link);
    setShareStatus(t("הקישור הועתק ✓"));
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

  // A gallery gets exactly one restore out of the "פג תוקף" tab — enforced server-side too (see
  // migration 0086's gallery_restore_once trigger, not just this button being hidden after use).
  // Fixed 30-day validity regardless of whatever expiry_days it carried before archiving — this
  // is a fresh, simple "one month, then it's back to normal rules" grant, not a resumption of
  // whatever plan-tier duration was previously selected. Also republishes the gallery, matching
  // the assumption everywhere else in this component that an unarchived gallery with a live
  // expires_at is a published one.
  const restoreGalleryNow = async () => {
    setRenewing(true);
    const now = new Date();
    const expiresAt = addDays(now, 30);
    const patch = {
      published: true,
      published_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
      expiry_days: 30 as const,
      archived_at: null,
      archive_reason: null,
      permanent_delete_at: null,
      reminder_sent_at: null,
      restored_once: true,
    };
    await supabase.from("galleries").update(patch).eq("id", gallery.id);
    setGallery((g) => ({ ...g, ...patch }));
    setExpiryDays(30);
    setRenewing(false);
  };

  // A photographer-initiated delete, distinct from the cron's natural-expiry archiving (see
  // gallery-lifecycle/route.ts). A gallery that has never used its one-time restore gets 14 days
  // in archive (more room to reconsider than a gallery that simply timed out); one that has
  // already been restored once gets the same short 3-day final window the cron gives a
  // second-time natural expiry — no more restores are coming either way, so there's no reason to
  // hold it longer. Reuses the exact same archived_at/permanent_delete_at columns and
  // permanent-deletion cron step, so nothing else needs to change for this to get cleaned up on
  // schedule.
  const [deletingGallery, setDeletingGallery] = useState(false);
  const deleteGalleryNow = async () => {
    setDeletingGallery(true);
    const now = new Date();
    const permanentDeleteAt = addDays(now, gallery.restored_once ? 3 : 14);
    const patch = {
      archived_at: now.toISOString(),
      archive_reason: "manual" as const,
      permanent_delete_at: permanentDeleteAt.toISOString(),
    };
    await supabase.from("galleries").update(patch).eq("id", gallery.id);
    // The galleries list may be in the router's memory, still showing this gallery.
    refreshIfDataChanged(router);
    router.push("/galleries");
  };

  const copyLink = async () => {
    await navigator.clipboard.writeText(shortClientUrl(window.location.origin, "gallery", gallery.access_token));
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

  const showFolderPicker = folders.length > 0;
  const shareDisabled = showFolderPicker && shareSelectedFolders.size === 0;

  const buildShareUrl = () =>
    shortClientUrl(window.location.origin, "gallery", gallery.access_token, galleryShareSearch(showFolderPicker ? allShareOptionKeys : null, shareSelectedFolders, shareQuality));

  // The text itself lives in GalleryShareModal (shared with the galleries list's quick share): one
  // specific account's own wording, a generic one for everyone else, in the client's language.
  const buildShareMessage = (url: string) =>
    buildGalleryShareMessage({ url, clientName, photographerName, photographerEmail, expiryDays, lang: clientLang });

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
    const text = buildGalleryPhotosUploadedMessage({ url, clientName, count, lang: clientLang });
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
        await navigator.share({ title: galleryShareTitle(clientLang), text, url });
      } catch {
        // user canceled the native share sheet — nothing to do
      }
    } else {
      await navigator.clipboard.writeText(text);
      setShareStatus(t("הקישור הועתק ✓"));
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
    // An empty title field means "go back to tracking the event's own name" — only meaningful for
    // an event-linked gallery; a standalone one has no event name to fall back to, so an empty
    // field there just keeps the generic default, same as before this feature existed. Typing
    // anything freezes the title as a customization: later renaming the event on its own page will
    // no longer touch this gallery's title (see EditEventModal.tsx's save handler).
    const trimmedTitle = editTitle.trim();
    const titlePatch =
      trimmedTitle === "" && eventId
        ? { title: clientName, title_customized: false }
        : { title: trimmedTitle || "הגלריה שלכם", title_customized: true };
    const patch = {
      ...titlePatch,
      shoot_date: eventId ? gallery.shoot_date : editShootDate || null,
      client_email: editClientEmail.trim() || null,
      client_phone: editClientPhone.trim() || null,
      allow_downloads: editAllowDownloads,
      allow_client_upload: editAllowClientUpload,
      theme,
      cover_text_position: coverTextPosition,
      cover_shape: coverShape,
      cover_photo_id: coverPhotoId,
      cover_focal_x: coverFocalX,
      cover_focal_y: coverFocalY,
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
  // Distinct labels a client has typed onto their favorited photos (via the diamond icon in the
  // client-facing gallery) — powers the filter chip row shown alongside the מועדפים toggle below.
  const usedLabels = Array.from(
    new Set(photos.filter((p) => p.is_favorite && p.custom_label).map((p) => p.custom_label as string))
  ).sort((a, b) => a.localeCompare(b, "he"));
  const activeFaceCluster = faceFilterClusterId ? faceClusters.find((c) => c.clusterId === faceFilterClusterId) : null;
  const premiumTheme = galleryThemeById(gallery.theme).coverStyle === "fullbleed";
  // A sub-tab's chapter reads with its main tab: "בוק בר מצווה · חוף".
  const chapterName = (f: GalleryFolderNode) => {
    const parent = f.parent_id ? folders.find((x) => x.id === f.parent_id) : null;
    return parent ? `${parent.name} · ${f.name}` : f.name;
  };
  const filteredPhotos = photos
    .filter((p) => (showFavoritesOnly ? p.is_favorite : true))
    .filter((p) => (showFavoritesOnly && activeLabelFilter ? p.custom_label === activeLabelFilter : true))
    .filter((p) => (!albumFilterOn || albumSel.view === "all" ? true : albumSel.picks.has(p.id) === (albumSel.view === "picked")))
    .filter((p) => (showRejectedOnly ? p.culling_status === "rejected" : true))
    .filter((p) => (activeFolderIds ? !!p.folder_id && activeFolderIds.has(p.folder_id) : true))
    .filter((p) => (activeFaceCluster ? activeFaceCluster.photoIds.has(p.id) : true));
  // Premium: like the client's page, "הכל" shows the photos chapter by chapter (photos outside any
  // folder first, then each folder under its own heading), and the lightbox follows that order.
  const chapters: { key: string; name: string | null; photos: PhotoWithUrl[] }[] | null =
    premiumTheme && folders.length > 0 && !activeFolderId
      ? [
          { key: "none", name: null, photos: filteredPhotos.filter((p) => !p.folder_id || !folders.some((f) => f.id === p.folder_id)) },
          ...folders.map((f) => ({ key: f.id, name: chapterName(f), photos: filteredPhotos.filter((p) => p.folder_id === f.id) })),
        ].filter((c) => c.photos.length > 0)
      : null;
  const visiblePhotos = chapters ? chapters.flatMap((c) => c.photos) : filteredPhotos;
  // A tab with no photos yet gets the drop zone too (owner, 2026-10-16: after uploading to one tab,
  // the next, empty tab showed nothing to drop on). Files dropped while it's open go to that tab.
  const activeFolderName = activeFolderId ? folders.find((f) => f.id === activeFolderId)?.name ?? null : null;
  const folderEmpty = !!activeFolderIds && photos.length > 0 && !photos.some((p) => !!p.folder_id && activeFolderIds.has(p.folder_id));
  const visibleIndex = new Map(visiblePhotos.map((p, i) => [p.id, i]));
  // The photographer's own management grid mirrors the same resolved style the client actually
  // sees — no separate local toggle, so there's only ever one layout control to reason about.
  const resolvedGridStyle = gallery.grid_style_override ?? galleryThemeById(gallery.theme).gridStyle;
  const managerCoverPhoto = photos.find((p) => p.id === gallery.cover_photo_id) ?? photos[0];
  // Premium tiles are square-cornered like the client page; the per-photo action icons wait for
  // hover on a mouse so the grid reads as photos, and stay visible on touch screens.
  const tileRound = premiumTheme ? "" : "rounded-lg";

  // Opening a photo warms the cache for a few photos on each side only, so the next/previous one
  // is instant. This used to load EVERY visible photo's full-size preview at once (thousands in a
  // big gallery), which ran a phone out of memory: the tab crashed and reloaded on the app's
  // loading screen (owner's report, 2026-10-05). Same fix as PublicGalleryView.
  useEffect(() => {
    if (lightboxIndex === null) return;
    const PREFETCH_WINDOW = 3;
    const start = Math.max(0, lightboxIndex - PREFETCH_WINDOW);
    const end = Math.min(visiblePhotos.length - 1, lightboxIndex + PREFETCH_WINDOW);
    for (let i = start; i <= end; i++) {
      const photo = visiblePhotos[i];
      if (!photo || fullImagePrefetchedIdsRef.current.has(photo.id)) continue;
      fullImagePrefetchedIdsRef.current.add(photo.id);
      const img = new window.Image();
      img.src = photo.previewUrl ?? `/api/galleries/${gallery.id}/photos/${photo.id}/preview`;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lightboxIndex, visiblePhotos.length]);

  // Arrow-key navigation while the lightbox is open — mapped for RTL reading direction, so the
  // visual "forward" direction (left) advances to the next photo, matching how the prev/next arrow
  // buttons are laid out on screen, not the raw left-to-right English-UI convention.
  useEffect(() => {
    if (lightboxIndex === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      // The page direction follows the UI language (src/i18n): "forward" is left in RTL, right in LTR.
      const rtl = document.documentElement.dir !== "ltr";
      const next = rtl ? "ArrowLeft" : "ArrowRight";
      const prev = rtl ? "ArrowRight" : "ArrowLeft";
      if (e.key === next && lightboxIndex < visiblePhotos.length - 1) navLightbox(lightboxIndex + 1);
      else if (e.key === prev && lightboxIndex > 0) navLightbox(lightboxIndex - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [lightboxIndex, visiblePhotos.length]);

  // Drives the single blocking ProgressModal below — only one of these is ever true at a time in
  // practice (the modal itself blocks starting a second heavy operation while one is showing), but
  // this priority order is the tie-break if that ever changes. Album exports have their own window
  // (AlbumExportsLayer). The upload's progress modal shows unless it was sent to the background
  // (then the floating uploads indicator shows it, UploadsIndicator).
  const uploadOpActive = uploadActive && uploadBg !== "1";
  const activeOp: { label: string; pct: number } | null =
    uploadOpActive
      ? { label: t("העלאת תמונות"), pct: 0 }
      : detectingFaces
        ? { label: t("זיהוי פרצופים"), pct: faceProgress && faceProgress.total > 0 ? (faceProgress.done / faceProgress.total) * 100 : 0 }
        : null;
  // Uploads, exports and sends can't survive the update's reload: it waits for them (lib/updateResume).
  useBusy("gallery-operation", activeOp ? activeOp.label : uploadActive ? t("העלאת תמונות") : null);

  // Covers the whole standalone-iOS-PWA rotate round trip (see albumRotateResume.ts) with one
  // continuous spinner — this page's own normal content never has a chance to flash in between the
  // bounce through /galleries and landing back here with the tool reopening itself. Also covers the
  // OUTBOUND leg (albumPhase "settling", set the instant rotation is detected, right before the
  // router.push away) — and at a z-index above even the canvas editor's own z-80: that editor is a
  // separate top-level modal, not nested inside this one, so without a higher z-index here the
  // editor's own now-stale content would keep sitting on top of this spinner for the moment before
  // the route actually changes, which is exactly the "no spinner visible" gap this exists to close.
  const managerTabItems = [
    ...(!gallery.published
      ? [{ key: "publish", label: publishing ? t("מפרסם...") : t("פרסום הגלריה ללקוח"), active: true, onClick: publish, disabled: publishing }]
      : []),
    // Copy-link lives once, at the bottom with "שיתוף" (design stage 5: no duplicate up here).
    {
      key: "settings",
      label: t("הגדרות גלריה"),
      active: settingsOpen,
      onClick: () => {
        setEditTitle(gallery.title);
        setEditShootDate(gallery.shoot_date ?? "");
        setEditClientEmail(gallery.client_email ?? "");
        setEditClientPhone(gallery.client_phone ?? "");
        setEditAllowDownloads(gallery.allow_downloads);
        setEditAllowClientUpload(gallery.allow_client_upload);
        setTheme(gallery.theme);
        setCoverTextPosition(gallery.cover_text_position);
        setCoverShape(gallery.cover_shape);
        setCoverPhotoId(gallery.cover_photo_id);
        setTitleFontOverride(gallery.title_font_override);
        setGridStyleOverride(gallery.grid_style_override);
        setSettingsOpen(true);
      },
    },
    // Share sits right beside the settings (owner, 2026-10-06), as a labelled button.
    ...(gallery.published && !isArchived ? [{ key: "share", label: t("שיתוף"), active: shareOpen, onClick: openShare }] : []),
    // The album designer, slideshow, reels, the collage and face detection under one dropdown (owner,
    // 2026-10-24: "לרשימה נפתחת בשביל לחסוך מקום"; the bar keeps settings, share, + and preview). The
    // button that opened it anchors the menu.
    {
      key: "tools",
      label: `${t("כלים")} ▾`,
      active: !!toolsAnchor || albumManageOpen || slideshowManageOpen || reelOpen || collageOpen,
      onClick: (e?: React.MouseEvent<HTMLElement>) => {
        const el = e?.currentTarget ?? null;
        setToolsAnchor((open) => (open ? null : el));
      },
    },
  ];

  const toolIcon = (d: ReactNode) => (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      {d}
    </svg>
  );
  const toolItems: AnchoredMenuItem[] = [
    // פרו / פרו+ only (entry tier excluded, see nonBasicTierAllowed); admin resolves to studio_pro.
    ...(photos.length > 0 && nonBasicTierAllowed
      ? [
          {
            key: "album",
            label: t("עיצוב אלבום"),
            icon: toolIcon(
              <>
                <path d="M12 6.5C10.2 5.2 7.6 4.5 4 4.5v13c3.6 0 6.2.7 8 2 1.8-1.3 4.4-2 8-2v-13c-3.6 0-6.2.7-8 2z" />
                <path d="M12 6.5v13" />
              </>
            ),
            onClick: openAlbumManage,
          },
        ]
      : []),
    {
      key: "slideshow",
      label: t("מצגת תמונות"),
      icon: toolIcon(
        <>
          <rect x={3} y={5} width={18} height={14} rx={2} />
          <path d="M10 9.5v5l4.5-2.5z" />
        </>
      ),
      onClick: () => {
        setSlideshowPhotoIds(new Set(gallery.slideshow_photo_ids));
        setSlideshowManageOpen(true);
      },
    },
    // Reels for Instagram / TikTok / Facebook — admin only while it's polished (2026-10-07).
    ...(photographerEmail === ADMIN_EMAIL && photos.length > 0
      ? [
          {
            key: "reels",
            label: t("רילס"),
            icon: toolIcon(
              <>
                <rect x={6} y={2.5} width={12} height={19} rx={2.5} />
                <path d="M10.5 9.5v5l4-2.5z" />
              </>
            ),
            onClick: () => setReelOpen(true),
          },
        ]
      : []),
    // The automatic collage of the event's main figures (2026-10-23; open to everyone since
    // 2026-10-24, version 2.12.9).
    ...(photos.length > 0
      ? [
          {
            key: "collage",
            label: t("קולאז'"),
            icon: toolIcon(
              <>
                <rect x={3} y={4} width={10} height={16} rx={1} />
                <rect x={15} y={4} width={6} height={7} rx={1} />
                <rect x={15} y={13} width={6} height={7} rx={1} />
              </>
            ),
            onClick: openCollage,
          },
        ]
      : []),
    // Runs entirely in the browser (see src/lib/faceRecognition.ts) — no photo ever leaves the
    // photographer's device for this except the already-cached results.
    ...(photos.length > 0
      ? [
          {
            key: "faces",
            label: detectingFaces ? t("מזהה פרצופים...") : faceClusters.length > 0 ? t("רענון זיהוי פרצופים") : t("זיהוי פרצופים"),
            disabled: detectingFaces,
            icon: toolIcon(
              <>
                <path d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2M20 8V6a2 2 0 0 0-2-2h-2M20 16v2a2 2 0 0 1-2 2h-2" />
                <circle cx={12} cy={11} r={2.2} />
                <path d="M8.5 16c1-1.3 2.2-1.8 3.5-1.8s2.5.5 3.5 1.8" />
              </>
            ),
            onClick: runFaceDetection,
          },
        ]
      : []),
  ];

  const renderManagerIcons = (bar: boolean) => (
    <div
      className={
        bar
          ? "flex shrink-0 items-center [&>*]:!h-10 [&>*]:!w-10 [&>*]:!rounded-[2px] [&>*]:!border-transparent [&>*]:!bg-transparent [&>*]:!text-[var(--gt-ink)] [&>*:hover]:!bg-black/[0.045]"
          : "flex items-center gap-1.5"
      }
    >
      {/* Share sits next to "הגדרות גלריה", and the slideshow and face detection moved into the
          "כלים" dropdown (managerTabItems, toolItems). */}
      <a
        href={`/gallery/${gallery.access_token}`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={t("תצוגה מקדימה")}
        title={gallery.published ? t("תצוגה מקדימה של הגלריה") : t("תצוגה מקדימה. כך הגלריה תיראה ללקוח/ה לאחר הפרסום")}
        className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line text-ink-soft ${BTN_PRESS}`}
      >
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M1.5 12S5 5 12 5s10.5 7 10.5 7-3.5 7-10.5 7S1.5 12 1.5 12z" />
          <circle cx={12} cy={12} r={3} />
        </svg>
      </a>
    </div>
  );

  const renderPhotoGrid = (list: PhotoWithUrl[]) =>
    resolvedGridStyle === "grid" ? (
      <div
        className="grid gap-1.5"
        style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${cellSize}px, 1fr))` }}
      >
        {list.map((photo) => {
          const i = visibleIndex.get(photo.id) ?? 0;
          return (
          <button
            key={photo.id}
            onPointerDown={() => startPress(photo)}
            onPointerUp={cancelPress}
            onPointerLeave={cancelPress}
            onClick={() => handlePhotoClick(photo, i)}
            className={`group relative aspect-square ${tileRound} overflow-hidden bg-line`}
            style={photo.preview_blur_data_url ? { backgroundImage: `url(${photo.preview_blur_data_url})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}
          >
            {/* Plain img (not next/image) to match the justified/masonry grid styles below —
                next/image's own onLoad-driven fade-in was replaying on every remount (e.g.
                switching folder tabs away and back unmounts/remounts these nodes), reading as
                a full reload even though the browser already had the bytes cached. A blurred
                LQIP sits on the button's own background (always visible, zero network cost —
                it's inlined as a data URI) so there's real content behind the sharp image
                instead of blank space while the thumbnail loads (GridThumb). */}
            <GridThumb
              photoId={photo.id}
              src={resizedPhotoUrl(photo, 640)}
              alt={photo.original_filename}
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
              style={photo.id === transitionPhotoId && lightboxIndex !== i ? { viewTransitionName: `mgr-photo-${photo.id}` } : undefined}
            />
            <MgrPhotoOverlays photo={photo} isCover={gallery.cover_photo_id === photo.id} selectedIds={selectedIds} onDownload={downloadPhoto} onSetCover={setCoverPhoto} quiet={premiumTheme} albumPick={albumFilterOn ? albumSel.picks.has(photo.id) : undefined} />
          </button>
          );
        })}
      </div>
    ) : resolvedGridStyle === "justified" ? (
      // Each tile grows in proportion to its own shape (flex-grow = aspect ratio) and keeps
      // that shape through the padding sizer, so a row scales as one and nothing is cropped;
      // the filler at the end stops the last, shorter row from blowing up.
      <div className="flex flex-wrap gap-1.5">
        {list.map((photo) => {
          const i = visibleIndex.get(photo.id) ?? 0;
          const ratio = mgrAspectRatios[photo.id] ?? (photo.preview_aspect_ratio && photo.preview_aspect_ratio > 0 ? photo.preview_aspect_ratio : 1.5);
          return (
            <button
              key={photo.id}
              onPointerDown={() => startPress(photo)}
              onPointerUp={cancelPress}
              onPointerLeave={cancelPress}
              onClick={() => handlePhotoClick(photo, i)}
              className={`group relative ${tileRound} overflow-hidden bg-line`}
              style={{
                flexGrow: ratio,
                flexBasis: ratio * cellSize,
                ...(photo.preview_blur_data_url ? { backgroundImage: `url(${photo.preview_blur_data_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
              }}
            >
              <span aria-hidden="true" className="block" style={{ paddingBottom: `${100 / ratio}%` }} />
              <GridThumb
                photoId={photo.id}
                src={resizedPhotoUrl(photo, 640)}
                alt={photo.original_filename}
                className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
                style={photo.id === transitionPhotoId && lightboxIndex !== i ? { viewTransitionName: `mgr-photo-${photo.id}` } : undefined}
                // Only a photo whose shape the server doesn't know yet needs measuring here (one
                // redraw of the page per photo otherwise, thousands in a big gallery).
                onLoaded={
                  photo.preview_aspect_ratio
                    ? undefined
                    : (img) => {
                        const r = img.naturalWidth / img.naturalHeight;
                        setMgrAspectRatios((prev) => (prev[photo.id] ? prev : { ...prev, [photo.id]: r }));
                      }
                }
              />
              <MgrPhotoOverlays photo={photo} isCover={gallery.cover_photo_id === photo.id} selectedIds={selectedIds} onDownload={downloadPhoto} onSetCover={setCoverPhoto} quiet={premiumTheme} albumPick={albumFilterOn ? albumSel.picks.has(photo.id) : undefined} />
            </button>
          );
        })}
        <div aria-hidden="true" style={{ flexGrow: 1e6, flexBasis: 0 }} />
      </div>
    ) : (
      <div className="gap-1.5" style={{ columnWidth: `${cellSize}px` }}>
        {list.map((photo) => {
          const i = visibleIndex.get(photo.id) ?? 0;
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
              className={`group relative w-full mb-1.5 ${tileRound} overflow-hidden bg-line block break-inside-avoid`}
              style={{
                ...(framed ? { padding: 4, border: "1px solid var(--color-line)" } : {}),
                ...(knownShape ? { aspectRatio: `${photo.preview_aspect_ratio}` } : {}),
                ...(photo.preview_blur_data_url ? { backgroundImage: `url(${photo.preview_blur_data_url})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
              }}
            >
              <GridThumb
                photoId={photo.id}
                src={resizedPhotoUrl(photo, 640)}
                alt={photo.original_filename}
                fade={knownShape}
                className={knownShape ? "absolute inset-0 w-full h-full object-cover transition-opacity duration-300" : "w-full h-auto block"}
                style={photo.id === transitionPhotoId && lightboxIndex !== i ? { viewTransitionName: `mgr-photo-${photo.id}` } : undefined}
              />
              <MgrPhotoOverlays photo={photo} isCover={gallery.cover_photo_id === photo.id} selectedIds={selectedIds} onDownload={downloadPhoto} onSetCover={setCoverPhoto} offset={framed ? 8 : 4} quiet={premiumTheme} albumPick={albumFilterOn ? albumSel.picks.has(photo.id) : undefined} />
            </button>
          );
        })}
      </div>
    );

  const barBtn =
    "h-10 min-w-10 px-2 lg:px-3 flex shrink-0 whitespace-nowrap items-center justify-center gap-2 text-sm rounded-[2px] transition-colors hover:bg-black/[0.045] focus-visible:outline-2 focus-visible:outline-[var(--gt-ink)] disabled:opacity-50";
  const chapterTab = (active: boolean) => ({
    color: active ? "var(--gt-ink)" : "var(--gt-ink-soft)",
    boxShadow: active ? "inset 0 -1px 0 var(--gt-ink)" : undefined,
  });
  const chapterTabClass = "shrink-0 whitespace-nowrap py-1.5 text-[13px] sm:text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--gt-ink)]";

  // The tab rows (owner, 2026-10-28): main tabs, and under them the open main tab's sub-tabs.
  // Double-click opens "עריכת לשונית" (name, main tab, a new sub-tab, delete). "+" adds a tab on its row.
  const chipButton = (label: string, active: boolean, onClick: () => void, folder?: GalleryFolderNode, small = false) => (
    <button
      onClick={onClick}
      onDoubleClick={folder ? () => setEditTab(folder) : undefined}
      title={folder ? t("לחיצה כפולה לשינוי שם או מחיקה") : undefined}
      className={`shrink-0 rounded-full font-semibold ${small ? "px-2.5 py-1 text-[11px]" : "px-3 py-1.5 text-xs"} ${BTN_PRESS}`}
      style={{
        background: active ? "var(--color-amber-deep)" : "var(--color-chip)",
        color: active ? "#fff" : "var(--color-ink-soft)",
      }}
    >
      {label}
    </button>
  );
  const newTabInput = (inputClass: string, buttonClass: string) => (
    <div className="shrink-0 flex items-center gap-1">
      <input
        autoFocus
        value={newFolderName}
        onChange={(e) => setNewFolderName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") createFolder();
          if (e.key === "Escape") {
            setAddingFolder(null);
            setNewFolderName("");
          }
        }}
        placeholder={addingFolder === "sub" ? t("שם תת-הלשונית") : t("שם התיקייה")}
        className={inputClass}
      />
      <button onClick={createFolder} className={buttonClass}>
        ✓
      </button>
    </div>
  );
  const addTabButton = (kind: "main" | "sub", className?: string, style?: React.CSSProperties) => (
    <button
      onClick={() => {
        setNewFolderName("");
        setAddingFolder(kind);
      }}
      aria-label={kind === "sub" ? t("הוספת תת-לשונית") : t("הוספת תיקייה חדשה")}
      title={kind === "sub" ? t("הוספת תת-לשונית") : t("הוספת תיקייה חדשה")}
      className={
        className ??
        `shrink-0 rounded-full border border-dashed border-line text-ink-soft flex items-center justify-center ${kind === "sub" ? "h-6 w-6 text-[11px]" : "h-7 w-7 text-xs"} ${BTN_PRESS}`
      }
      style={style}
    >
      +
    </button>
  );

  // Premium: the folders read as the client's chapter tabs, the main tabs on one row and the open
  // main tab's sub-tabs on a row under it.
  const renderChapterTabs = (className: string) => (
    <>
      <nav aria-label={t("פרקים בגלריה")} className={`${className} [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
        <button onClick={() => setActiveFolderId(null)} className={chapterTabClass} style={chapterTab(activeFolderId === null)}>
          {t("הכל")}
        </button>
        {folderNodes.map(({ folder }) => (
          <button
            key={folder.id}
            onClick={() => setActiveFolderId(folder.id)}
            onDoubleClick={() => setEditTab(folder)}
            title={t("לחיצה כפולה לשינוי שם או מחיקה")}
            className={chapterTabClass}
            style={chapterTab(activeMainId === folder.id)}
          >
            {folder.name}
          </button>
        ))}
        {addingFolder === "main"
          ? newTabInput("w-28 rounded-[2px] px-2 py-1 text-[13px] border border-line bg-white text-ink", "shrink-0 h-7 w-7 bg-ink text-white text-xs")
          : addTabButton("main", `${chapterTabClass} px-1`, { color: "var(--gt-ink-soft)" })}
      </nav>
      {activeMainId && activeSubTabs.length > 0 && (
        <nav aria-label={t("תת-לשוניות")} className={`${className} h-9 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden`}>
          <button onClick={() => setActiveFolderId(activeMainId)} className={chapterTabClass} style={chapterTab(activeFolderId === activeMainId)}>
            {t("הכל")}
          </button>
          {activeSubTabs.map((sub) => (
            <button
              key={sub.id}
              onClick={() => setActiveFolderId(sub.id)}
              onDoubleClick={() => setEditTab(sub)}
              title={t("לחיצה כפולה לשינוי שם או מחיקה")}
              className={chapterTabClass}
              style={chapterTab(activeFolderId === sub.id)}
            >
              {sub.name}
            </button>
          ))}
          {addingFolder === "sub"
            ? newTabInput("w-28 rounded-[2px] px-2 py-1 text-[13px] border border-line bg-white text-ink", "shrink-0 h-7 w-7 bg-ink text-white text-xs")
            : addTabButton("sub", `${chapterTabClass} px-1`, { color: "var(--gt-ink-soft)" })}
        </nav>
      )}
    </>
  );

  // Premium: the screen opens the way the client's page does: the full cover, then the gallery's
  // bar (logo, chapters, actions). The management tools stay in the column below.
  const renderPremiumHeader = () => {
    const coverDate = eventDate || gallery.shoot_date;
    return (
      <div className={`${galleryFont.variable} overflow-x-clip`} style={{ ...galleryThemeVars(gallery.theme), color: "var(--gt-ink)" }}>
        <div className="relative">
          <GalleryPremiumCover
            variant="manage"
            titleFont={resolveGalleryTheme(gallery.theme, { titleFontOverride: gallery.title_font_override }).titleFont}
            photoUrl={managerCoverPhoto ? resizedPhotoUrl(managerCoverPhoto, 2048) : null}
            title={gallery.title}
            dateLabel={coverDate ? new Date(coverDate).toLocaleDateString(dateLocale(lang), { day: "numeric", month: "long", year: "numeric" }) : null}
            logoUrl={brandLogoUrl}
            focalX={gallery.cover_focal_x}
            focalY={gallery.cover_focal_y}
            textPosition={gallery.cover_text_position}
            shape={gallery.cover_shape}
          />
          <Link
            href="/galleries"
            aria-label={t("כל הגלריות")}
            title={t("כל הגלריות")}
            className="absolute top-3 start-3 sm:top-5 sm:start-5 z-10 h-10 w-10 rounded-full flex items-center justify-center text-white"
            style={{ background: "rgba(0,0,0,0.32)", backdropFilter: "blur(6px)", WebkitBackdropFilter: "blur(6px)" }}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="ltr:rotate-180">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
        <div style={{ background: "var(--gt-bg)", borderBottom: "1px solid var(--gt-border)" }}>
          <div className="mx-auto max-w-[1600px] min-h-14 px-3 sm:px-6 lg:px-10 flex items-center gap-6 min-w-0">
            {brandLogoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={brandLogoUrl} alt="" className="h-7 w-auto max-w-[140px] shrink-0 object-contain" />
            )}
            {/* On a phone the actions scroll sideways inside the bar instead of widening the page. */}
            <div className="ms-auto flex min-w-0 items-center gap-0.5 lg:gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {managerTabItems.map((item) => (
                <button
                  key={item.key}
                  onClick={item.onClick}
                  disabled={"disabled" in item ? item.disabled : false}
                  className={barBtn}
                  style={item.key === "publish" ? { background: "var(--gt-accent)", color: "var(--gt-accent-ink)" } : undefined}
                >
                  {item.label}
                </button>
              ))}
              <button onClick={() => fileInputRef.current?.click()} className={barBtn} title={t("העלאת תמונות נוספות לגלריה")} aria-label={t("העלאת תמונות")}>
                <span className="text-lg leading-none">+</span>
                <span className="hidden lg:inline">{t("העלאת תמונות")}</span>
              </button>
              {photos.length > 0 && renderManagerIcons(true)}
            </div>
          </div>
          {/* The tabs get their own row under the actions on every width: sharing one row, the two
              ran into each other (owner, 2026-10-07). */}
          {renderChapterTabs("mx-auto max-w-[1600px] flex h-11 items-center gap-5 sm:gap-6 overflow-x-auto px-4 sm:px-6 lg:px-10 border-t border-[var(--gt-border)]")}
        </div>
      </div>
    );
  };

  if (resumingAfterRotate || albumPhase === "settling") {
    return (
      <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center gap-3" style={{ background: "var(--color-paper)" }}>
        <div className="h-8 w-8 rounded-full border-2 border-line border-t-ink animate-spin" />
        <p className="text-sm text-ink-soft">{t("טוען את הכלי...")}</p>
      </div>
    );
  }

  return (
    <div className="pb-8">
      {premiumTheme && renderPremiumHeader()}
      <div className={`max-w-2xl sm:max-w-none sm:w-[85%] lg:w-[80%] mx-auto px-4 ${premiumTheme ? "pt-6" : "pt-7"} pb-10 w-full`}>
      {activeOp && (
        <UploadPct uploadKey={photoUploadKey} live={uploadOpActive} fallback={activeOp.pct}>
        {(pct) => (
        <ProgressModal
          label={activeOp.label}
          pct={pct}
          onCancel={() => {
            if (uploadOpActive) {
              cancelUpload(photoUploadKey);
              return;
            }
            cancelRequestedRef.current = true;
            faceCancelRef.current?.();
          }}
          // Photo uploads can go to the background (owner, 2026-10-09): they keep running while the
          // photographer moves on, and the galleries list shows each one's progress.
          onBackground={
            uploadOpActive
              ? // The photographer stays on the gallery (owner, 2026-10-16): the upload line under the
                // tabs shows the progress, and the galleries list and the floating indicator too.
                () => sendUploadToBackground(photoUploadKey)
              : undefined
          }
        />
        )}
        </UploadPct>
      )}
      {dropUnreadable && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(28, 27, 25, 0.55)" }} onClick={() => setDropUnreadable(false)}>
          <div className="relative w-full max-w-sm rounded-3xl bg-paper shadow-sheet p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold mb-2">{t("הדפדפן לא מצליח לקרוא את התמונות שגררת")}</h3>
            <p className="text-sm text-ink-soft mb-4 leading-relaxed">
              {t("זה קורה באפליקציה שנוספה ל-Dock מ-Safari, או כשהתיקייה ב-iCloud ולא הורדה למחשב. אפשר לבחור את אותה תיקייה או את אותן תמונות מהמחשב, או לגרור דרך Chrome.")}
            </p>
            <div className="flex flex-col gap-2">
              <label htmlFor={`gallery-upload-dir-${gallery.id}`} className={`cursor-pointer rounded-xl py-3 text-sm font-semibold text-center bg-ink text-white ${BTN_PRESS}`}>
                {t("בחירת התיקייה מהמחשב")}
              </label>
              <label htmlFor={`gallery-upload-${gallery.id}`} className={`cursor-pointer rounded-xl py-3 text-sm font-semibold text-center bg-white border border-line text-ink ${BTN_PRESS}`}>
                {t("בחירת תמונות")}
              </label>
              <button onClick={() => setDropUnreadable(false)} className="py-2 text-sm text-ink-soft underline underline-offset-2">
                {t("סגירה")}
              </button>
            </div>
          </div>
        </div>
      )}
      {blockedByOtherUpload && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{ background: "rgba(28, 27, 25, 0.55)" }}>
          <div className="relative w-72 rounded-3xl overflow-hidden shadow-sheet px-6 py-9" style={{ background: "#1c1b19" }}>
            <div className="flex flex-col items-center gap-4 text-white text-center">
              <div className="h-8 w-8 rounded-full border-2 border-white/25 border-t-white animate-spin" />
              <div>
                <div className="text-sm font-semibold">{t("כבר יש העלאה פעילה")}</div>
                <div className="text-xs opacity-70 mt-1">
                  {t("מעלה תמונות בגלריה \"{title}\", {done} מתוך {total}", {
                    title: blockedByOtherUpload.galleryTitle,
                    done: blockedByOtherUpload.doneCount,
                    total: blockedByOtherUpload.totalCount,
                  })}
                </div>
                <div className="text-xs opacity-70 mt-1">{t("יש לבטל אותה כדי להתחיל העלאה כאן")}</div>
              </div>
              <div className="flex gap-2 w-full mt-2">
                <button
                  onClick={() => setBlockedByOtherUpload(null)}
                  className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white/10"
                >
                  {t("סגירה")}
                </button>
                <button
                  onClick={() => requestActiveUploadCancel()}
                  className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-rose text-white"
                >
                  {t("ביטול ההעלאה האחרת")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {completedUploadToast && (
        <div className="fixed inset-x-0 top-4 z-[120] flex justify-center px-4 pointer-events-none">
          <div className="pointer-events-auto w-full max-w-sm rounded-2xl p-4 bg-ink text-white shadow-sheet flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-sage/20 flex items-center justify-center shrink-0" style={{ color: "var(--color-sage)" }}>
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold">{t("העלאת התמונות הושלמה")}</p>
              <p className="text-xs opacity-70">
                {t("{done} מתוך {total} תמונות הועלו בהצלחה", { done: completedUploadToast.succeededCount, total: completedUploadToast.totalCount })}
              </p>
            </div>
            <button
              onClick={() => setCompletedUploadToast(null)}
              className="shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold bg-white text-ink"
            >
              {t("אישור")}
            </button>
          </div>
        </div>
      )}
      {showScrollTop && <ScrollTopButton />}
      {!premiumTheme && (
      <div className="flex items-center justify-between mb-2">
        <BackLink href="/galleries" label={t("כל הגלריות")} />
      </div>
      )}

      {/* The slideshow, reels, collage and face detection sit in the "כלים" dropdown (toolItems);
          the preview is an icon on the favorites row below. */}
      {!premiumTheme && <GlassTabStrip className="mb-4" items={managerTabItems} />}
      {toolsAnchor && <AnchoredMenu anchor={toolsAnchor} items={toolItems} onClose={() => setToolsAnchor(null)} />}
      {/* gallery.title is always accurate now — it's either the photographer's own customization,
          or kept synced to the event's client_name (see saveSettings/EditEventModal.tsx), so
          there's no need to prioritize clientName over it the way this used to. */}
      {!premiumTheme && <h1 className="text-[22px] font-bold mb-1 font-display">{gallery.title}</h1>}
      {premiumTheme ? null : eventDate ? (
        <p className="text-xs mb-1 text-ink-soft">{new Date(eventDate).toLocaleDateString(dateLocale(lang))}</p>
      ) : (
        gallery.shoot_date && (
          <p className="text-xs mb-1 text-ink-soft">{new Date(gallery.shoot_date).toLocaleDateString(dateLocale(lang))}</p>
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
                url={resizedPhotoUrl(photo, 1200)}
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
        <div className="rounded-xl px-3.5 py-2.5 mb-3.5 text-xs bg-rose-bg text-rose">
          {t("הגלריה בארכיון ותימחק סופית בתאריך {date}. הקישור ללקוח אינו פעיל יותר.", {
            date: gallery.permanent_delete_at ? new Date(gallery.permanent_delete_at).toLocaleDateString(dateLocale(lang)) : "",
          })}{" "}
          {gallery.restored_once
            ? t("לא ניתן לשחזר אותה יותר.")
            : t("אפשר לשחזר אותה מתוך הגדרות הגלריה.")}
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
            {t("מיון תמונות")}
            {photos.some((p) => p.culling_status === "pending") &&
              ` (${t("{n} ממתינות", { n: photos.filter((p) => p.culling_status === "pending").length })})`}
          </button>
          {photographerEmail === ADMIN_EMAIL && (
            <button
              onClick={() => setLabelModalOpen(true)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold border border-line bg-white text-ink ${BTN_PRESS}`}
            >
              {t("סימון למודל הסינון")}
            </button>
          )}
          {photos.some((p) => p.culling_status === "rejected") && (
            <button
              onClick={() => setShowRejectedOnly((v) => !v)}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${BTN_PRESS}`}
              style={{
                background: showRejectedOnly ? "var(--color-rose)" : "var(--color-chip)",
                color: showRejectedOnly ? "#fff" : "var(--color-ink-soft)",
              }}
            >
              ✗ {t("נפסלו")} ({photos.filter((p) => p.culling_status === "rejected").length})
            </button>
          )}
        </div>
      )}

      {(favoriteCount > 0 || photos.length > 0) && (
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            {favoriteCount > 0 && (
              <>
                <button
                  onClick={() => {
                    setShowFavoritesOnly((v) => {
                      if (v) setActiveLabelFilter(null);
                      return !v;
                    });
                    if (showFavoritesOnly && albumSel.filtering) albumSel.stop();
                    // Switching the view is exactly the moment a photographer wants to trust
                    // what they're about to see — refresh in the background instead of making
                    // them remember to hit the separate manual refresh button first.
                    refreshFavoritesAndLabels();
                  }}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${BTN_PRESS}`}
                  style={{
                    background: showFavoritesOnly ? "var(--color-amber-deep)" : "var(--color-chip)",
                    color: showFavoritesOnly ? "var(--color-on-accent)" : "var(--color-ink-soft)",
                  }}
                >
                  {t("מועדפים")} ({favoriteCount})
                </button>
                {showFavoritesOnly && (
                  <button
                    onClick={downloadFavoritesZip}
                    disabled={zippingFavorites}
                    aria-label={t("הורדת כל התמונות המועדפות")}
                    title={t("הורדת כל התמונות המועדפות, מאורגנות לפי לשוניות")}
                    className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line text-ink-soft disabled:opacity-60 ${BTN_PRESS}`}
                  >
                    <svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 3v12m0 0l-4-4m4 4l4-4" />
                      <path d="M5 17v2a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-2" />
                    </svg>
                  </button>
                )}
              </>
            )}
            {photos.length > 0 && (
              <button
                onClick={refreshFavoritesAndLabels}
                disabled={refreshingFavorites}
                aria-label={t("רענון מועדפים ותגיות")}
                title={t("רענון מועדפים ותגיות, לראות עדכונים מהלקוח/ה בלי לצאת ולחזור לגלריה")}
                className={`shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line text-ink-soft disabled:opacity-60 ${BTN_PRESS}`}
              >
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={refreshingFavorites ? "animate-spin" : undefined}
                >
                  <path d="M20 11A8 8 0 1 0 18.5 15" />
                  <path d="M20 5v6h-6" />
                </svg>
              </button>
            )}
          </div>
          {!premiumTheme && photos.length > 0 && renderManagerIcons(false)}
        </div>
      )}

      {showFavoritesOnly && favoriteCount > 0 && (
        <AlbumSelectionBar
          filtering={albumFilterOn}
          pickedCount={albumSel.picks.size}
          totalCount={favoriteCount}
          confirmedCount={albumSelection ? albumSelection.length : null}
          view={albumSel.view}
          onView={albumSel.setView}
          onStart={albumSel.start}
          onStop={albumSel.stop}
          onPickAll={() => albumSel.pickAll(filteredPhotos.map((p) => p.id))}
          onClearAll={() => albumSel.clearAll(filteredPhotos.map((p) => p.id))}
          onConfirm={() => void albumSel.confirm()}
          onClearSelection={() => {
            if (window.confirm(t("לחזור למועדפות? כלי עיצוב האלבום יציג שוב את כל המועדפות. האלבום עצמו לא משתנה."))) void albumSel.clearSelection();
          }}
          busy={albumSel.busy}
          notice={albumSel.notice}
          onDismissNotice={albumSel.dismissNotice}
        />
      )}
      {albumSel.pending && (
        <AlbumSelectionConfirm
          removedCount={albumSel.pending.removed.length}
          addedCount={albumSel.pending.added.length}
          albumShared={albumSel.pending.album.status !== "draft"}
          busy={albumSel.busy}
          onApply={(options) => void albumSel.apply(options)}
          onCancel={albumSel.cancelPending}
        />
      )}

      {showFavoritesOnly && usedLabels.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap mb-3 -mt-1.5">
          <button
            onClick={() => setActiveLabelFilter(null)}
            className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${BTN_PRESS}`}
            style={{
              background: !activeLabelFilter ? "var(--color-ink)" : "var(--color-chip)",
              color: !activeLabelFilter ? "var(--color-paper)" : "var(--color-ink-soft)",
            }}
          >
            {t("הכל")}
          </button>
          {usedLabels.map((label) => (
            <button
              key={label}
              onClick={() => setActiveLabelFilter((prev) => (prev === label ? null : label))}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${BTN_PRESS}`}
              style={{
                background: activeLabelFilter === label ? "var(--color-ink)" : "var(--color-chip)",
                color: activeLabelFilter === label ? "var(--color-paper)" : "var(--color-ink-soft)",
              }}
            >
              ◆ {label}
            </button>
          ))}
        </div>
      )}

      {/* Upload zone — sits ABOVE the photos so adding more never means scrolling to the bottom of a
          long gallery. Empty gallery: the big dashed target. Once at least one photo exists it goes
          transparent (just a quiet row of links), because the real drop target is now the whole page —
          see the window-level drag listeners near handleDrop, which show the full-screen overlay below
          while files are dragged anywhere over the page. */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ALLOWED_ACCEPT}
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="hidden"
        id={`gallery-upload-${gallery.id}`}
      />
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
      {photos.length === 0 ? (
        <>
          <div
            style={{ minHeight: "15cm" }}
            className={`flex rounded-lg border-2 border-dashed transition-colors mb-2 ${isDragging ? "border-amber-deep bg-amber-bg" : "border-line"}`}
          >
            <label
              htmlFor={`gallery-upload-${gallery.id}`}
              className={`w-full flex items-center justify-center px-6 text-base font-semibold cursor-pointer text-ink text-center ${BTN_PRESS}`}
            >
              {uploadActive ? <UploadCount uploadKey={photoUploadKey} /> : isDragging ? t("שחררו כאן להעלאה") : t("העלאת תמונות, או גררו לכאן תמונות ותיקיות")}
            </label>
          </div>
          <label
            htmlFor={`gallery-upload-dir-${gallery.id}`}
            className={`w-full flex items-center justify-center rounded-lg py-2 mb-1.5 text-xs font-semibold bg-white border border-line text-ink-soft cursor-pointer ${BTN_PRESS}`}
          >
            {t("העלאת תיקייה שלמה מהמחשב")}
          </label>
          <p className="text-[11px] text-ink-soft mb-4 text-center">{t("פורמטים נתמכים בלבד: JPG, JPEG, PNG, GIF, BMP")}</p>
        </>
      ) : (
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 mb-3 text-[11px] text-ink-soft text-center">
          <label htmlFor={`gallery-upload-${gallery.id}`} className="cursor-pointer font-semibold text-ink underline underline-offset-2">
            {uploadActive ? <UploadCount uploadKey={photoUploadKey} /> : t("העלאת תמונות")}
          </label>
          {!uploadActive && (
            <>
              <span>· {t("אפשר גם לגרור תמונות ותיקיות לכל מקום בעמוד")}</span>
              <label htmlFor={`gallery-upload-dir-${gallery.id}`} className="cursor-pointer font-semibold underline underline-offset-2">
                {t("העלאת תיקייה שלמה")}
              </label>
              <span>· JPG, JPEG, PNG, GIF, BMP</span>
            </>
          )}
        </div>
      )}
      {/* The album's export or print-house send running in the background (owner, 2026-10-26). */}
      <GalleryExportLine galleryId={gallery.id} visible={!albumManageOpen} />
      {remoteUploads.length > 0 && (
        <div className="mb-3 rounded-xl bg-card px-3 py-1.5">
          {remoteUploads.map((r) => (
            <RemoteUploadLine key={r.id} upload={r} onRefresh={() => window.location.reload()} />
          ))}
        </div>
      )}
      {isDragging && (
        <div
          className="fixed inset-0 z-[90] pointer-events-none flex items-center justify-center p-4"
          style={{ background: "rgba(201,119,46,0.14)", backdropFilter: "blur(2px)", WebkitBackdropFilter: "blur(2px)" }}
        >
          <div className="w-full h-full rounded-3xl border-4 border-dashed flex items-center justify-center text-xl font-bold text-amber-deep" style={{ borderColor: "var(--color-amber-deep)" }}>
            {t("שחררו כאן להעלאה לגלריה")}
          </div>
        </div>
      )}

      {!premiumTheme && (
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-1.5 mb-3">
        <div className="flex flex-col gap-1.5 sm:flex-1 sm:min-w-0">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {chipButton(t("הכל"), activeFolderId === null, () => setActiveFolderId(null))}
            {folderNodes.map(({ folder }) => (
              <Fragment key={folder.id}>{chipButton(folder.name, activeMainId === folder.id, () => setActiveFolderId(folder.id), folder)}</Fragment>
            ))}
            {addingFolder === "main" ? newTabInput("w-24 rounded-full px-3 py-1.5 text-xs border border-line", `shrink-0 h-7 w-7 rounded-full bg-ink text-white text-xs ${BTN_PRESS}`) : addTabButton("main")}
          </div>
          {/* The open main tab's sub-tabs (owner, 2026-10-28): "הכל" is the whole main tab. */}
          {activeMainId && activeSubTabs.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto ps-2 border-s-2 border-line">
              {chipButton(t("הכל"), activeFolderId === activeMainId, () => setActiveFolderId(activeMainId), undefined, true)}
              {activeSubTabs.map((sub) => (
                <Fragment key={sub.id}>{chipButton(sub.name, activeFolderId === sub.id, () => setActiveFolderId(sub.id), sub, true)}</Fragment>
              ))}
              {addingFolder === "sub" ? newTabInput("w-24 rounded-full px-3 py-1 text-[11px] border border-line", `shrink-0 h-6 w-6 rounded-full bg-ink text-white text-[11px] ${BTN_PRESS}`) : addTabButton("sub")}
            </div>
          )}
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          title={t("העלאת תמונות נוספות לגלריה")}
          className={`shrink-0 sm:ms-auto flex items-center justify-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold bg-white border border-line text-ink ${BTN_PRESS}`}
        >
          <span className="text-sm leading-none">+</span> {t("העלאת תמונות")}
        </button>
      </div>

      )}

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-ink-soft font-data">{t("{n} תמונות", { n: visiblePhotos.length })}</span>
        <span className="text-[11px] text-ink-soft">
          {t("פריסה: {layout}, משתנה ב״הגדרות גלריה״", { layout: t(GRID_STYLE_OPTIONS.find((g) => g.id === resolvedGridStyle)?.label ?? "") })}
        </span>
      </div>

      {folderEmpty && (
        <div
          style={{ minHeight: "10cm" }}
          className={`flex rounded-lg border-2 border-dashed transition-colors mb-4 ${isDragging ? "border-amber-deep bg-amber-bg" : "border-line"}`}
        >
          <label
            htmlFor={`gallery-upload-${gallery.id}`}
            className={`w-full flex items-center justify-center px-6 text-base font-semibold cursor-pointer text-ink text-center ${BTN_PRESS}`}
          >
            {uploadActive ? (
              <UploadCount uploadKey={photoUploadKey} />
            ) : (isDragging
                ? t("שחררו כאן להעלאה")
                : (
                  <span>
                    {t("העלאת תמונות ללשונית \"{name}\", או גררו לכאן תמונות", { name: activeFolderName ?? "" })}
                    <span className="block mt-1 text-xs font-normal text-ink-soft">{t("תיקייה שגוררים לכאן נפתחת כלשונית חדשה בשם שלה")}</span>
                  </span>
                ))}
          </label>
        </div>
      )}

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
            aria-label={t("גודל תמונות בגלריה")}
          />
          <IconGallery className="h-5 w-5 shrink-0 text-ink-soft" />
        </div>
      )}

      {visiblePhotos.length > 0 && (
        <div ref={pinchContainerRef} className="relative mb-4" style={{ touchAction: "pan-y" }}>
          {chapters
            ? chapters.map((c, ci) => (
                <section key={c.key} aria-labelledby={c.name ? `mgr-chapter-${c.key}` : undefined}>
                  {c.name && (
                    <div className={`flex flex-wrap items-baseline gap-x-4 gap-y-1 pb-4 sm:pb-6 ${ci === 0 ? "pt-2" : "pt-12 sm:pt-20"}`}>
                      <h2
                        id={`mgr-chapter-${c.key}`}
                        className={galleryFont.variable}
                        style={{ fontFamily: titleFontFamily(resolveGalleryTheme(gallery.theme, { titleFontOverride: gallery.title_font_override }).titleFont), fontWeight: 300, fontSize: "clamp(30px, 4.4vw, 52px)", lineHeight: 1.05, letterSpacing: "-0.01em" }}
                      >
                        {c.name}
                      </h2>
                      <span className="text-sm tabular-nums text-ink-soft">
                        {c.photos.length === 1 ? t("תמונה אחת") : t("{n} תמונות", { n: c.photos.length })}
                      </span>
                    </div>
                  )}
                  {renderPhotoGrid(c.photos)}
                </section>
              ))
            : renderPhotoGrid(visiblePhotos)}
        </div>
      )}

      <GalleryVideosSection galleryId={gallery.id} galleryTitle={gallery.title} allowed={nonBasicTierAllowed} maxBytes={VIDEO_MAX_BYTES_BY_TIER[effectiveExpiryTier] ?? 0} />
      <GalleryFtpSection
        galleryId={gallery.id}
        allowed={SUBSCRIPTION_PLANS[photographerPlan].tier === "studio_pro" || photographerEmail === ADMIN_EMAIL}
      />

      {error && <p className="text-xs text-rose mt-2 whitespace-pre-line">{error}</p>}
      {error && uploadHalted && (
        <div className="mt-2 flex flex-wrap gap-2">
          <label htmlFor={`gallery-upload-dir-${gallery.id}`} className={`cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold bg-ink text-white ${BTN_PRESS}`}>
            {t("בחירת התיקייה מהמחשב")}
          </label>
          <label htmlFor={`gallery-upload-${gallery.id}`} className={`cursor-pointer rounded-lg px-3 py-2 text-xs font-semibold bg-white border border-line text-ink ${BTN_PRESS}`}>
            {t("בחירת תמונות")}
          </label>
        </div>
      )}

      <div className="mt-3 space-y-2">
        {!gallery.published && (
          <p className="text-[11px] text-ink-soft text-center">
            {t("משך שמירת הגלריה: {period}. ניתן לשנות בהגדרות הגלריה", {
              period: expiryDays ? t(GALLERY_EXPIRY_OPTIONS.find((o) => o.value === expiryDays)?.label ?? "") : t("ללא הגבלת זמן (מדיניות ישנה)"),
            })}
          </p>
        )}

        {gallery.published && !isArchived && (
          <div className="rounded-xl px-3.5 py-2.5 text-sm bg-sage-bg text-sage font-medium text-center">
            {t("הגלריה פורסמה")}
            {gallery.expires_at && (
              <span className="block text-[11px] mt-0.5 font-normal">
                {t("בתוקף עד {date}", { date: new Date(gallery.expires_at).toLocaleDateString(dateLocale(lang)) })}
              </span>
            )}
          </div>
        )}

        {!gallery.published && (
          <button
            onClick={publish}
            disabled={publishing}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60 ${BTN_PRESS}`}
          >
            {publishing ? t("מפרסם...") : t("פרסום הגלריה ללקוח")}
          </button>
        )}

        {gallery.published && !isArchived && (
          <button
            onClick={copyLink}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white ${BTN_PRESS}`}
          >
            {copied ? t("✓ הועתק") : t("העתקת קישור")}
          </button>
        )}

        {/* One copy-link button only (the primary one above) — this row used to repeat it as a
            small secondary button right next to "שיתוף". */}
        {gallery.published && (
          <button
            onClick={openShare}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink ${BTN_PRESS}`}
          >
            {t("שיתוף")}
          </button>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && visiblePhotos[lightboxIndex] && (
        <div
          className="gf-no-enter fixed inset-0 z-50 flex items-center justify-center bg-black/90"
          onClick={closeLightbox}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              closeLightbox();
            }}
            className={`absolute top-4 end-4 h-9 w-9 rounded-full bg-white/10 text-white flex items-center justify-center ${BTN_PRESS}`}
          >
            <IconAlbumClose className="h-4 w-4" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setCoverPhoto(visiblePhotos[lightboxIndex]);
            }}
            title={t("קביעה כשער לגלריה")}
            aria-label={t("קביעה כשער לגלריה")}
            className={`absolute top-4 start-4 h-9 px-3.5 rounded-full flex items-center gap-1.5 text-xs font-semibold ${BTN_PRESS}`}
            style={{
              background: gallery.cover_photo_id === visiblePhotos[lightboxIndex].id ? "var(--color-amber-deep)" : "rgba(255,255,255,0.1)",
              color: "#fff",
            }}
          >
            {gallery.cover_photo_id === visiblePhotos[lightboxIndex].id ? t("שער הגלריה") : t("קביעה כשער")}
          </button>
          {lightboxIndex > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navLightbox(lightboxIndex - 1);
              }}
              className={`absolute start-3 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center text-lg ${BTN_PRESS}`}
            >
              <span className="inline-block ltr:rotate-180">›</span>
            </button>
          )}
          {lightboxIndex < visiblePhotos.length - 1 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navLightbox(lightboxIndex + 1);
              }}
              className={`absolute end-3 h-10 w-10 rounded-full bg-white/10 text-white flex items-center justify-center text-lg ${BTN_PRESS}`}
            >
              <span className="inline-block ltr:rotate-180">‹</span>
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
        <PhotoActionSheet
          inPortfolio={actionSheetPhoto.in_portfolio}
          onDownload={() => downloadPhoto(actionSheetPhoto)}
          onShare={() => sharePhoto(actionSheetPhoto)}
          onSetCover={() => setCoverPhoto(actionSheetPhoto)}
          onTogglePortfolio={() => togglePortfolio(actionSheetPhoto)}
          onDelete={() => {
            setDeleteConfirmPhoto(actionSheetPhoto);
            setActionSheetPhoto(null);
          }}
          onClose={() => setActionSheetPhoto(null)}
        />
      )}

      {/* Delete confirmation */}
      {deleteConfirmPhoto && <PhotoDeleteConfirm onConfirm={confirmDeletePhoto} onClose={() => setDeleteConfirmPhoto(null)} />}

      {/* Delete-selected confirmation */}
      {deleteSelectedConfirmOpen && (
        <DeleteSelectedConfirm
          count={selectedIds.size}
          closing={deleteSelectedConfirmClosing}
          onConfirm={confirmDeleteSelectedPhotos}
          onCancel={cancelDeleteSelected}
        />
      )}

      {/* Same full-screen indeterminate-spinner visual language as the calendar-scan flow
          (ProfileSettingsView) — a delete has no real percentage to report either. */}
      {/* ZIP download options — which tabs to include and in what quality, shown before the background
          zip job starts (same choices the client gallery offers for "download all"). */}
      {downloadOptions &&
        (() => {
          const chosenIds = new Set(downloadOptions.photoIds);
          const pending = photos.filter((p) => chosenIds.has(p.id));
          const countByKey = new Map<string, number>();
          for (const p of pending) countByKey.set(p.folder_id ?? ZIP_NO_FOLDER_KEY, (countByKey.get(p.folder_id ?? ZIP_NO_FOLDER_KEY) ?? 0) + 1);
          const tabRows = [
            ...folders.filter((f) => countByKey.has(f.id)).map((f) => ({ key: f.id, name: chapterName(f), count: countByKey.get(f.id) ?? 0 })),
            ...(countByKey.has(ZIP_NO_FOLDER_KEY) ? [{ key: ZIP_NO_FOLDER_KEY, name: t("כללי (ללא לשונית)"), count: countByKey.get(ZIP_NO_FOLDER_KEY) ?? 0 }] : []),
          ];
          const selectedPhotoIds = pending.filter((p) => downloadSelectedFolders.has(p.folder_id ?? ZIP_NO_FOLDER_KEY)).map((p) => p.id);
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(28, 27, 25, 0.45)" }} onClick={() => setDownloadOptions(null)}>
              <div className="w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h2 className="text-lg font-bold mb-1 font-display">{t("הורדת תמונות")}</h2>
                <p className="text-xs text-ink-soft mb-4">{t("{n} תמונות נבחרו להורדה", { n: pending.length })}</p>

                {folders.length > 0 && tabRows.length > 0 && (
                  <div className="mb-5">
                    <p className="text-xs text-ink-soft mb-2.5">{t("אילו לשוניות להוריד?")}</p>
                    <div className="space-y-1.5">
                      {tabRows.map((row) => (
                        <label key={row.key} className="flex items-center gap-2.5 rounded-lg px-3 py-2 border border-line bg-white text-sm">
                          <input type="checkbox" checked={downloadSelectedFolders.has(row.key)} onChange={() => toggleDownloadFolder(row.key)} />
                          <span className="flex-1">{row.name}</span>
                          <span className="text-xs text-ink-soft font-data">{row.count}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <p className="text-xs text-ink-soft mb-2.5">{t("באיזו איכות להוריד?")}</p>
                <div className="space-y-1.5 mb-5">
                  <label className="flex items-center gap-2.5 rounded-lg px-3 py-2 border border-line bg-white text-sm">
                    <input type="radio" name="manage-download-quality" checked={downloadQuality === "full"} onChange={() => setDownloadQuality("full")} />
                    {t("איכות מלאה (הקבצים המקוריים)")}
                  </label>
                  <label className="flex items-center gap-2.5 rounded-lg px-3 py-2 border border-line bg-white text-sm">
                    <input type="radio" name="manage-download-quality" checked={downloadQuality === "web"} onChange={() => setDownloadQuality("web")} />
                    {t("איכות מותאמת לרשת, קובץ קטן יותר (עד כ-3MB לתמונה)")}
                  </label>
                </div>

                {selectedPhotoIds.length === 0 && <p className="text-xs mb-3 font-semibold text-rose">{t("יש לבחור לפחות לשונית אחת")}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setDownloadOptions(null);
                      startZipJob(selectedPhotoIds, downloadQuality);
                    }}
                    disabled={selectedPhotoIds.length === 0}
                    className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-40"
                  >
                    {t("הורדת {n} תמונות", { n: selectedPhotoIds.length })}
                  </button>
                  <button onClick={() => setDownloadOptions(null)} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
                    {t("ביטול")}
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      {/* ZIP build progress — every part downloads on its own the moment it's ready. Closing this only
          hides it; the job (and the auto-download polling) keeps running in the background. */}
      {zipBatch && zipPanelOpen &&
        (() => {
          const zipDone = zipBatch.parts.every((p) => p.status === "ready" || p.status === "failed");
          return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(28, 27, 25, 0.45)" }}>
              <div className="w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet">
                {zipDone ? (
                  <>
                    <h2 className="text-lg font-bold mb-2 font-display">{zipBatch.parts.every((p) => p.status === "failed") ? t("ההורדה נכשלה") : t("ההורדה הושלמה")}</h2>
                    <p className="text-sm text-ink-soft mb-4">
                      {zipBatch.parts.every((p) => p.status === "failed")
                        ? t("לא הצלחנו להכין את הקובץ. אפשר לנסות שוב.")
                        : zipBatch.parts.length > 1
                          ? t("כל {n} הקבצים ירדו למחשב שלך.", { n: zipBatch.parts.length })
                          : t("הקובץ ירד למחשב שלך.")}
                    </p>
                    {zipBatch.parts.some((p) => p.status === "failed") && !zipBatch.parts.every((p) => p.status === "failed") && (
                      <p className="text-xs text-rose mb-4">{t("חלק מהתמונות לא נכללו בהורדה בגלל שגיאה. אפשר לנסות שוב.")}</p>
                    )}
                    {zipBatch.parts.filter((p) => p.status === "ready" && p.downloadUrl).map((part) => (
                      <a key={part.partIndex} href={part.downloadUrl!} className="block text-sm font-semibold text-amber-deep underline mb-2">
                        {zipBatch.parts.length > 1 ? t("הורדת חלק {n} שוב", { n: part.partIndex + 1 }) : t("הורדת הקובץ שוב")}
                      </a>
                    ))}
                    <button
                      onClick={() => {
                        setZipPanelOpen(false);
                        setZipBatch(null);
                      }}
                      className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white mt-2"
                    >
                      {t("סגירה")}
                    </button>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-bold mb-2 font-display">{t("מכינים את ההורדה")}</h2>
                    <p className="text-sm text-ink-soft mb-4">
                      {zipBatch.parts.length > 1 ? t("ההורדה מחולקת ל-{n} קבצי ZIP. כל חלק יורד אוטומטית ברגע שהוא מוכן.", { n: zipBatch.parts.length }) : t("קובץ ה-ZIP יורד אוטומטית ברגע שהוא מוכן.")}
                    </p>
                    <div className="space-y-2 mb-4">
                      {zipBatch.parts.map((part) => (
                        <div key={part.partIndex} className="flex items-center justify-between text-sm rounded-lg px-3 py-2.5 border border-line bg-white">
                          <span>{zipBatch.parts.length > 1 ? t("חלק {n} מתוך {total}", { n: part.partIndex + 1, total: part.partCount }) : t("הקובץ")}</span>
                          {part.status === "ready" ? (
                            <span className="text-sage font-semibold">{t("מוכן ✓")}</span>
                          ) : part.status === "failed" ? (
                            <span className="text-rose">{t("נכשל")}</span>
                          ) : (
                            <span className="text-ink-soft font-data">{part.totalCount > 0 ? `${Math.round((part.processedCount / part.totalCount) * 100)}%` : t("מכינים...")}</span>
                          )}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-ink-soft mb-3">{t("אפשר לסגור את החלון, ההכנה וההורדה ימשיכו ברקע.")}</p>
                    <button onClick={() => setZipPanelOpen(false)} className="w-full rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
                      {t("סגירה")}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })()}

      {deletingPhotos && <IndeterminateProgressCard label={t("מוחק תמונות...")} />}

      {/* A delete failure used to only reach the shared `error` state, rendered nowhere near this
          action — this surfaces it right where the confirm dialog and progress spinner just were,
          so it's actually impossible to miss instead of reading as "nothing happened". */}
      {deletePhotosError && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center"
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
          onClick={() => setDeletePhotosError(null)}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 font-display text-rose">{t("מחיקת התמונות נכשלה")}</h2>
            <p className="text-sm text-ink-soft mb-5">{deletePhotosError}</p>
            <button
              onClick={() => setDeletePhotosError(null)}
              className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white"
            >
              {t("סגירה")}
            </button>
          </div>
        </div>
      )}

      {exportRangeFormat && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
          onClick={() => setExportRangeFormat(null)}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 font-display">
              {exportRangeFormat === "pdf" ? t("ייצוא PDF") : exportRangeFormat === "jpg" ? t("ייצוא JPG") : t("ייצוא PSD")}, {t("טווח עמודים")}
            </h2>
            <p className="text-sm text-ink-soft mb-4">{t("בחר/י מאיזה עמוד עד איזה עמוד לייצא (מתוך {n} עמודים).", { n: albumTotalPages })}</p>
            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1">
                <label className="block text-xs font-semibold text-ink-soft mb-1">{t("מעמוד")}</label>
                <input
                  type="number"
                  min={1}
                  max={albumTotalPages}
                  value={exportRangeFrom}
                  onChange={(e) => setExportRangeFrom(Number(e.target.value))}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-white text-ink"
                />
              </div>
              <span className="text-ink-soft mt-5">{t("עד")}</span>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-ink-soft mb-1">{t("עד עמוד")}</label>
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
            {/* The print/"high"-quality choice was removed entirely (2026-09-02, explicit request)
                — a PDF export never needs original-resolution images, so there's no longer a
                choice to make here at all; the page-range picker above is untouched. */}
            {(exportRangeFormat === "jpg" || exportRangeFormat === "psd") && (
              <p className="text-xs text-ink-soft mb-4">{t("קובץ ה-ZIP יירד אוטומטית לתיקיית ההורדות במחשב שלך.")}</p>
            )}
            <div className="flex gap-2">
              <button onClick={confirmExportRange} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white">
                {t("הורדה")}
              </button>
              <button
                onClick={() => setExportRangeFormat(null)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div>
      )}

      {printHouseModalOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
          onClick={() => setPrintHouseModalOpen(false)}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-lg font-bold font-display">{t("שליחה לבית דפוס")}</h2>
              <button
                onClick={() => setPrintHouseModalOpen(false)}
                className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line"
              >
                <IconAlbumClose className="h-4 w-4" />
              </button>
            </div>
            <p className="text-sm text-ink-soft mb-4">
              {t("קובצי ה-JPG של העמודים שתבחר/י יישלחו כקישור להורדה, לכתובת שתבחר/י.")}
            </p>
            {/* The pages to send, like the export range dialog (owner, 2026-10-09). */}
            <div className="flex items-center gap-3 mb-1">
              <div className="flex-1">
                <label htmlFor="print-house-from" className="block text-xs font-semibold text-ink-soft mb-1">{t("מעמוד")}</label>
                <input
                  id="print-house-from"
                  type="number"
                  min={1}
                  max={albumTotalPages}
                  value={printHouseFrom}
                  onChange={(e) => setPrintHouseFrom(Number(e.target.value))}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-white text-ink"
                />
              </div>
              <span className="text-ink-soft mt-5">{t("עד")}</span>
              <div className="flex-1">
                <label htmlFor="print-house-to" className="block text-xs font-semibold text-ink-soft mb-1">{t("עד עמוד")}</label>
                <input
                  id="print-house-to"
                  type="number"
                  min={1}
                  max={albumTotalPages}
                  value={printHouseTo}
                  onChange={(e) => setPrintHouseTo(Number(e.target.value))}
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-white text-ink"
                />
              </div>
            </div>
            <p className="text-xs text-ink-soft mb-4">
              {(() => {
                const r = printHouseRange();
                return r.from === 1 && r.to === albumTotalPages
                  ? t("כל האלבום, {n} עמודים", { n: albumTotalPages })
                  : r.from === r.to
                    ? t("עמוד {page} מתוך {n}", { page: r.from, n: albumTotalPages })
                    : t("עמודים {from}–{to} מתוך {n}", { from: r.from, to: r.to, n: albumTotalPages });
              })()}
            </p>
            <PrintHouseEmailsSettings
              initialEmails={printHouseEmails}
              selectable
              selectedId={printHouseSelectedId}
              onSelect={setPrintHouseSelectedId}
              onChange={setPrintHouseEmails}
              compact
            />
            <label className="block mt-4">
              <span className="text-xs font-semibold text-ink-soft">{t("הנחיות והערות לבית הדפוס (אופציונלי)")}</span>
              <textarea
                value={printHouseNotes}
                onChange={(e) => setPrintHouseNotes(e.target.value)}
                rows={3}
                maxLength={2000}
                placeholder={t("למשל: נייר מט, כריכה קשה, 2 עותקים")}
                className="mt-1.5 w-full rounded-lg px-3 py-2 text-sm border border-line bg-white resize-none"
              />
            </label>
            <button
              onClick={() => setPrintHouseConfirmOpen(true)}
              disabled={!printHouseSelectedId}
              className="w-full rounded-lg py-3 text-sm font-semibold mt-4 bg-ink text-white disabled:opacity-40"
            >
              {t("שליחה")}
            </button>
            <PrintHouseSendsHistory galleryId={gallery.id} />
          </div>
        </div>
      )}

      {printHouseConfirmOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" style={{ background: "rgba(28, 27, 25, 0.55)" }}>
          <div className="w-full max-w-xs rounded-2xl p-5 bg-paper shadow-sheet text-center">
            <p className="text-sm font-semibold mb-1">{t("לשלוח את קובצי ה-JPG לבית הדפוס?")}</p>
            <p className="text-xs text-ink-soft mb-1">
              {(() => {
                const r = printHouseRange();
                return r.from === 1 && r.to === albumTotalPages
                  ? t("כל האלבום, {n} עמודים", { n: albumTotalPages })
                  : r.from === r.to
                    ? t("עמוד {page} מתוך {n}", { page: r.from, n: albumTotalPages })
                    : t("עמודים {from}–{to} מתוך {n}", { from: r.from, to: r.to, n: albumTotalPages });
              })()}
            </p>
            <p className="text-xs text-ink-soft mb-4" dir="ltr">
              {(() => {
                const target = printHouseEmails.find((e) => e.id === printHouseSelectedId);
                return target ? target.label || target.email : "";
              })()}
            </p>
            <div className="flex gap-2">
              <button onClick={sendToPrintHouseConfirmed} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-ink text-white">
                {t("כן, שליחה")}
              </button>
              <button
                onClick={() => setPrintHouseConfirmOpen(false)}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div>
      )}

      {printHouseToast && (
        <div className="fixed top-4 inset-x-4 z-[120] flex justify-center pointer-events-none">
          <div className="rounded-full px-4 py-2.5 text-sm font-semibold bg-ink text-white shadow-sheet">{printHouseToast}</div>
        </div>
      )}

      {saveBookTemplateOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
          onClick={() => setSaveBookTemplateOpen(false)}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 font-display">{t("שמירת תבנית אלבום")}</h2>
            <p className="text-sm text-ink-soft mb-4">
              {t("מבנה העמודים הנוכחי ({n} עמודים) יישמר בתור תבנית לשימוש חוזר, בפעם הבאה אפשר יהיה לבנות ממנה אלבום חדש בלחיצה אחת.", { n: albumSpreads.length })}
            </p>
            <input
              autoFocus
              value={bookTemplateNameDraft}
              onChange={(e) => setBookTemplateNameDraft(e.target.value)}
              placeholder={t("שם התבנית")}
              className="w-full rounded-lg px-3 py-2 text-sm border border-line bg-white mb-4"
            />
            <div className="flex gap-2">
              <button
                onClick={() => saveAlbumBookTemplate(bookTemplateNameDraft)}
                disabled={!bookTemplateNameDraft.trim() || savingBookTemplate}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
              >
                {savingBookTemplate ? t("שומר...") : t("שמירה")}
              </button>
              <button
                onClick={() => setSaveBookTemplateOpen(false)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmNewAlbumOpen && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          style={{ background: "rgba(28, 27, 25, 0.7)" }}
          onClick={() => setConfirmNewAlbumOpen(false)}
        >
          <div className="w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2 font-display">{t("להתחיל אלבום חדש?")}</h2>
            <p className="text-sm text-ink-soft mb-5">
              {t("האלבום הנוכחי ({n} עמודים) יימחק לצמיתות, כולל כל התמונות שסודרו וההערות של הלקוח/ה. הפעולה לא ניתנת לביטול.", { n: albumSpreads.length })}
            </p>
            <div className="flex gap-2">
              <button onClick={startNewAlbum} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white">
                {t("כן, התחל מחדש")}
              </button>
              <button
                onClick={() => setConfirmNewAlbumOpen(false)}
                className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft"
              >
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div>
      )}

      {editTab && (
        <TabEditSheet
          folder={editTab}
          folders={folders}
          onSave={(name, parentId) => saveTab(editTab, name, parentId)}
          onAddSubTab={(name) => addSubTab(editTab, name)}
          onDelete={() => {
            setDeleteFolderConfirm(editTab);
            setEditTab(null);
          }}
          onClose={() => setEditTab(null)}
        />
      )}

      {deleteFolderConfirm && (
        <DeleteFolderConfirmModal
          folder={deleteFolderConfirm}
          subTabs={folders.filter((f) => f.parent_id === deleteFolderConfirm.id).length}
          photoCount={(() => {
            const ids = folderWithChildren(folders, deleteFolderConfirm.id);
            return photos.filter((p) => !!p.folder_id && ids.has(p.folder_id)).length;
          })()}
          deleting={deletingFolder}
          onDelete={(mode) => void deleteFolder(mode)}
          onCancel={() => setDeleteFolderConfirm(null)}
        />
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
            {t("הורדה")}
          </button>
          <button
            onClick={() => setDeleteSelectedConfirmOpen(true)}
            className={`flex items-center gap-1 text-sm font-semibold whitespace-nowrap text-rose ${BTN_PRESS}`}
          >
            {t("מחיקה")}
          </button>
          <button onClick={selectAllVisible} className={`text-sm font-semibold whitespace-nowrap ${BTN_PRESS}`}>
            {t("בחירת הכל")}
          </button>
          <span className="text-sm font-data font-semibold whitespace-nowrap">{t("{n} נבחרו", { n: selectedIds.size })}</span>
          <button
            onClick={clearSelection}
            aria-label={t("ביטול בחירה")}
            title={t("ביטול בחירה")}
            className={`shrink-0 h-6 w-6 rounded-full bg-white/15 flex items-center justify-center text-xs ${BTN_PRESS}`}
          >
            <IconAlbumClose className="h-3 w-3" />
          </button>
        </div>
      )}

      {coverFocalPointTarget && (
        <GalleryCoverFocalPointModal
          photoUrl={resizedPhotoUrl(coverFocalPointTarget.photo, 2048)}
          initialFocalX={coverFocalPointTarget.immediate ? gallery.cover_focal_x : coverFocalX}
          initialFocalY={coverFocalPointTarget.immediate ? gallery.cover_focal_y : coverFocalY}
          theme={coverFocalPointTarget.immediate ? gallery.theme : theme}
          shape={coverFocalPointTarget.immediate ? gallery.cover_shape : coverShape}
          textPosition={coverFocalPointTarget.immediate ? gallery.cover_text_position : coverTextPosition}
          titleFontOverride={coverFocalPointTarget.immediate ? gallery.title_font_override : titleFontOverride}
          title={gallery.title}
          dateLabel={eventDate ? new Date(eventDate).toLocaleDateString("he-IL") : null}
          onClose={() => setCoverFocalPointTarget(null)}
          onSave={async (focalX, focalY) => {
            if (coverFocalPointTarget.immediate) {
              // Lightbox quick action — persists cover_photo_id + the focal point together right
              // now, matching how that action always saved immediately before this screen existed.
              const patch = { cover_photo_id: coverFocalPointTarget.photo.id, cover_focal_x: focalX, cover_focal_y: focalY };
              await supabase.from("galleries").update(patch).eq("id", gallery.id);
              setGallery((g) => ({ ...g, ...patch }));
              setCoverPhotoId(coverFocalPointTarget.photo.id);
              setCoverFocalX(focalX);
              setCoverFocalY(focalY);
            } else {
              // Settings-modal picker — stays staged like coverPhotoId already does, actually
              // persisted only once the settings modal's own Save button is pressed.
              setCoverFocalX(focalX);
              setCoverFocalY(focalY);
            }
            setCoverFocalPointTarget(null);
          }}
        />
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
          allowClientUpload={editAllowClientUpload}
          setAllowClientUpload={setEditAllowClientUpload}
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
          coverFocalX={coverFocalX}
          coverFocalY={coverFocalY}
          onPickCoverPhoto={(photo) => {
            setCoverPhotoId(photo.id);
            setCoverFocalPointTarget({ photo, immediate: false });
          }}
          titleFontOverride={titleFontOverride}
          setTitleFontOverride={setTitleFontOverride}
          gridStyleOverride={gridStyleOverride}
          setGridStyleOverride={setGridStyleOverride}
          photos={photos}
          previewTitle={gallery.title}
          previewDateLabel={eventDate ? new Date(eventDate).toLocaleDateString("he-IL") : null}
          saving={savingSettings}
          onSave={saveSettings}
          onClose={() => setSettingsOpen(false)}
          onDeleteGallery={deleteGalleryNow}
          deletingGallery={deletingGallery}
          isArchived={isArchived}
          restoredOnce={gallery.restored_once}
          permanentDeleteAt={gallery.permanent_delete_at}
          onRestoreGallery={restoreGalleryNow}
          restoringGallery={renewing}
        />
      )}

      {reelOpen && (
        <ReelBuilder
          galleryId={gallery.id}
          galleryTitle={gallery.title}
          dateLabel={(() => {
            const d = eventDate || gallery.shoot_date;
            return d ? new Date(d).toLocaleDateString(dateLocale(lang), { day: "numeric", month: "numeric", year: "numeric" }) : null;
          })()}
          studioName={photographerName || null}
          photos={photos.map((p) => ({ id: p.id, thumbUrl: resizedPhotoUrl(p, 640), isFavorite: !!p.is_favorite }))}
          initialSelection={
            gallery.slideshow_photo_ids.length > 0
              ? gallery.slideshow_photo_ids
              : photos.some((p) => p.is_favorite)
                ? photos.filter((p) => p.is_favorite).map((p) => p.id).slice(0, 12)
                : photos.slice(0, 12).map((p) => p.id)
          }
          onClose={() => setReelOpen(false)}
        />
      )}
      {collageOpen && (
        <CollageBuilder
          galleryId={gallery.id}
          galleryTitle={gallery.title}
          eventType={autoDesignEventType}
          photos={photos.map((p) => ({
            id: p.id,
            storage_path: p.storage_path,
            is_favorite: !!p.is_favorite,
            preview_aspect_ratio: p.preview_aspect_ratio,
            folder_id: p.folder_id,
            culling_status: p.culling_status,
            previewUrl: p.previewUrl ?? null,
            blur: p.preview_blur_data_url,
          }))}
          folders={folders}
          onClose={() => setCollageOpen(false)}
        />
      )}
      {slideshowManageOpen && (
        <SlideshowManageModal
          photos={photos}
          selected={slideshowPhotoIds}
          onToggle={toggleSlideshowPhoto}
          onPreview={() => setSlideshowPreviewOpen(true)}
          error={error}
          saving={savingSlideshow}
          onSave={saveSlideshow}
          onClose={() => setSlideshowManageOpen(false)}
        />
      )}

      {slideshowPreviewOpen && (
        <GallerySlideshow
          photos={photos.filter((p) => slideshowPhotoIds.has(p.id)).map((p) => ({ id: p.id, url: resizedPhotoUrl(p, 1920) }))}
          onClose={() => setSlideshowPreviewOpen(false)}
          onDownload={downloadSlideshowZip}
          downloading={zippingFavorites}
        />
      )}

      {albumSendInfo && <AlbumSendToClient info={albumSendInfo} onSend={albumSent} onClose={() => setAlbumSendInfo(null)} />}
      {albumSendNotice && <AlbumSendNotice kind={albumSendNotice} onClose={() => setAlbumSendNotice(null)} />}
      {albumManageOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 overflow-hidden"
          style={{ background: "rgba(28, 27, 25, 0.7)" }}
          onClick={() => {
            // Widened from 400ms to 1200ms (2026-09-02) — a real phone is slower than the desktop/
            // tablet this was originally tuned against, and this whole modal's first render/commit
            // (see the comment on albumManageOpenedAtRef's own assignment above) can plausibly run
            // past 400ms there, especially on a gallery with a large photos array. When that
            // happens the tool visibly "doesn't open" — it opens and is immediately closed by this
            // same guard misfiring on the tail of the opening tap, not a mounting failure.
            if (Date.now() - albumManageOpenedAtRef.current < 1200) return;
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
                <p className="text-lg font-bold font-display mb-1">{t("סובבו את המכשיר למצב אופקי")}</p>
                <p className="text-sm opacity-80">{t("כלי עיצוב האלבום פועל רק במצב אופקי, סובבו את הטלפון כדי להמשיך")}</p>
              </div>
              <button onClick={() => setAlbumManageOpen(false)} className="mt-1 h-9 px-4 rounded-full bg-white text-ink text-sm font-semibold">
                {t("סגירה")}
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
            /* A phone on its side (owner, 2026-10-07: show as much of the album as possible): the
               tool's base size drops to 12px, so every rem-sized text, gap and button shrinks for
               real (a true size, not zoom, so taps land where they look), and the page previews
               go 7 to a row. The canvas editor keeps its own sizes. */
            @media (max-width: 1023.98px) and (max-height: 560px) {
              html:has(.gf-album-manage-card):not(:has(.gf-album-canvas-wrap)) { font-size: 12px; }
              .gf-album-preview-grid { grid-template-columns: repeat(7, minmax(0, 1fr)) !important; }
            }
          `}</style>
          <div
            className={`gf-album-manage-card relative w-full max-w-sm rounded-3xl bg-paper shadow-sheet overflow-hidden flex flex-col ${
              albumManageFullscreen ? "lg:max-w-none lg:w-[95vw] lg:h-[92vh] max-h-[85vh] lg:max-h-none" : "lg:max-w-3xl max-h-[85vh]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <ErrorBoundary label={t("עיצוב אלבום")}>
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
            {/* Closing the tool: the top-left corner in every language, white with a red outline so it's
                easy to find (owner, 2026-10-27). The header keeps that corner clear. */}
            <button
              onClick={() => setAlbumManageOpen(false)}
              aria-label={t("סגירת כלי עיצוב האלבום")}
              title={t("סגירת כלי עיצוב האלבום")}
              className={`absolute left-3 top-3 lg:left-4 lg:top-4 z-10 h-[34px] w-[34px] rounded-full flex items-center justify-center bg-white border-2 shadow-sm ${BTN_PRESS}`}
              style={{ borderColor: "#e5322d", color: "#e5322d" }}
            >
              <IconAlbumClose size={16} />
            </button>
            <div className="shrink-0 pr-5 lg:pr-7 pl-14 lg:pl-16 pt-5 lg:pt-7 pb-4 mb-2 bg-paper flex items-center justify-between flex-wrap gap-2 border-b border-line">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold font-display">{t("עיצוב אלבום")}</h2>
                <button
                  onClick={() => setAlbumGuideOpen(true)}
                  aria-label={t("מדריך לכלי עיצוב האלבום")}
                  title={t("מדריך לכלי עיצוב האלבום")}
                  className={`h-6 w-6 rounded-full flex items-center justify-center bg-chip text-ink-soft text-[11px] font-bold ${BTN_PRESS}`}
                >
                  ?
                </button>
                {album && (
                  <button
                    onClick={() => setConfirmNewAlbumOpen(true)}
                    className={`${isAlbumPhone ? "text-[13px] font-semibold px-3.5 py-2" : "text-xs font-semibold px-3 py-1.5"} rounded-full bg-white border border-line text-ink`}
                  >
                    + {t("אלבום חדש")}
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
                    {creatingSpread ? t("יוצר...") : t("+ עמוד חדש")}
                  </button>
                )}
                {album && albumSpreads.length > 0 && (
                  <button
                    onClick={() => setSaveBookTemplateOpen(true)}
                    className={`${isAlbumPhone ? "text-[13px] font-semibold px-3.5 py-2" : "text-xs font-semibold px-3 py-1.5"} rounded-full bg-white border border-line text-ink flex items-center gap-1`}
                  >
                    <IconAlbumSave size={12} />
                    {t("שמירת מבנה האלבום כתבנית")}
                  </button>
                )}
                {album && (
                  <button
                    onClick={() => openExportRangeModal("pdf")}
                    disabled={albumSpreads.length === 0}
                    className={`relative overflow-hidden ${isAlbumPhone ? "text-[13px] font-semibold px-3.5 py-2" : "text-xs font-semibold px-3 py-1.5"} rounded-full bg-white border border-line text-ink disabled:opacity-60`}
                  >
                    {exportingAlbumPdf && (
                      <LiquidProgressBar pct={exportProgress} style={{ position: "absolute", inset: 0, borderRadius: 9999 }} />
                    )}
                    <span className="relative z-10 flex items-center gap-1">
                      <IconPdf size={12} />
                      {exportingAlbumPdf ? t("מייצא...") : t("ייצוא PDF")}
                    </span>
                  </button>
                )}
                {album && (
                  <button
                    onClick={() => openExportRangeModal("jpg")}
                    disabled={albumSpreads.length === 0}
                    className={`relative overflow-hidden ${isAlbumPhone ? "text-[13px] font-semibold px-3.5 py-2" : "text-xs font-semibold px-3 py-1.5"} rounded-full bg-white border border-line text-ink disabled:opacity-60`}
                  >
                    {exportingAlbumJpg && (
                      <LiquidProgressBar pct={exportProgress} style={{ position: "absolute", inset: 0, borderRadius: 9999 }} />
                    )}
                    <span className="relative z-10 flex items-center gap-1">
                      <IconImage size={12} />
                      {exportingAlbumJpg ? t("מייצא...") : t("ייצוא JPG (כל העמודים)")}
                    </span>
                  </button>
                )}
                {album && albumSpreads.length > 0 && (
                  <button
                    // While a send runs, the button brings its progress window back.
                    onClick={() => (sendingAlbumToPrint && ownExport ? showAlbumExport(ownExport.id) : openPrintHouseModal())}
                    className={`relative overflow-hidden ${isAlbumPhone ? "text-[13px] font-semibold px-3.5 py-2" : "text-xs font-semibold px-3 py-1.5"} rounded-full bg-white border border-line text-ink disabled:opacity-60`}
                  >
                    {sendingAlbumToPrint && (
                      <LiquidProgressBar pct={exportProgress} style={{ position: "absolute", inset: 0, borderRadius: 9999 }} />
                    )}
                    <span className="relative z-10 flex items-center gap-1">
                      <IconImage size={12} />
                      {sendingAlbumToPrint ? t("שולח...") : t("שליחה לבית דפוס")}
                    </span>
                  </button>
                )}
                {album && (
                  <button
                    onClick={() => openExportRangeModal("psd")}
                    disabled={albumSpreads.length === 0}
                    className={`relative overflow-hidden ${isAlbumPhone ? "text-[13px] font-semibold px-3.5 py-2" : "text-xs font-semibold px-3 py-1.5"} rounded-full bg-white border border-line text-ink disabled:opacity-60`}
                  >
                    {exportingAlbumPsd && (
                      <LiquidProgressBar pct={exportProgress} style={{ position: "absolute", inset: 0, borderRadius: 9999 }} />
                    )}
                    <span className="relative z-10 flex items-center gap-1">
                      <IconPalette size={12} />
                      {exportingAlbumPsd ? t("מייצא...") : t("ייצוא PSD (פוטושופ)")}
                    </span>
                  </button>
                )}
                {album && album.status !== "approved" && (
                  <button
                    onClick={sendAlbumToClient}
                    disabled={savingAlbum || albumSpreads.length === 0}
                    className={`${isAlbumPhone ? "text-[13px] font-semibold px-3.5 py-2" : "text-xs font-semibold px-3 py-1.5"} rounded-full bg-amber-deep text-white disabled:opacity-60`}
                  >
                    {savingAlbum ? t("שולח...") : album.status === "draft" ? t("שליחה לאישור הלקוח/ה") : t("שליחה מחדש לאישור")}
                  </button>
                )}
                <button
                  onClick={() => setAlbumManageFullscreen((v) => !v)}
                  aria-label={albumManageFullscreen ? t("הקטנת החלון") : t("הגדלה למסך מלא")}
                  title={albumManageFullscreen ? t("הקטנת החלון") : t("הגדלה למסך מלא")}
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
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-5 lg:px-7 pb-5 lg:pb-7">
            {albumLoading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10">
                <div className="h-8 w-8 rounded-full border-2 border-line border-t-ink animate-spin" />
                <p className="text-sm text-ink-soft">{t("טוען...")}</p>
              </div>
            ) : !album ? (
              // Album creation (all three paths below: blank page, starter template, saved
              // template) is entry-tier-excluded — see PlanComparison.tsx and nonBasicTierAllowed's
              // own comment. Not retroactive: an album already built before a downgrade keeps
              // working fine (that's the OTHER branch of this ternary, untouched by this check).
              !nonBasicTierAllowed ? (
                <div className="rounded-xl p-5 text-center bg-chip">
                  <p className="text-sm text-ink-soft leading-relaxed">
                    {t("עורך האלבומים זמין ממסלול פרו ומעלה, שדרגו מסלול בהגדרות כדי להתחיל לעצב אלבום לגלריה זו.")}
                  </p>
                </div>
              ) : autoDesignOpen ? (
                <AlbumAutoDesigner
                  galleryId={gallery.id}
                  galleryTitle={gallery.title}
                  eventType={autoDesignEventType}
                  eventDate={eventDate || gallery.shoot_date}
                  photos={albumToolPhotos}
                  folders={folders}
                  defaultSize={albumSizeDraft}
                  sizePresets={ALBUM_SIZE_PRESETS}
                  onCreate={createAutoDesignedAlbum}
                  onCancel={() => setAutoDesignOpen(false)}
                />
              ) : (
              <>
                {/* Admin only again (owner, 2026-10-06): the result still needs polish (layouts not
                    tidy enough, photo order mixed up). Was open to every plan from 2026-09-30. */}
                {photographerEmail === ADMIN_EMAIL && (
                <button
                  type="button"
                  onClick={openAutoDesign}
                  className="w-full text-start rounded-lg border border-ink bg-white p-3.5 mb-4 flex items-center justify-between gap-3"
                >
                  <span>
                    <span className="block text-sm font-semibold">{t("עיצוב אוטומטי של כל האלבום")}</span>
                    <span className="block text-xs text-ink-soft mt-0.5">{t("בוחרים מידות, סגנון ומשפחה, והאלבום כולו מעוצב לבד")}</span>
                  </span>
                  <span className="shrink-0 rounded-lg px-3 py-2 text-xs font-semibold bg-ink text-white">{t("התחלה")}</span>
                </button>
                )}
                <p className="text-xs text-ink-soft mb-3.5">
                  {t("קודם כל, מה מידות האלבום להדפסה? תתחילו מעמוד ריק אחד, ומשם תוכלו לבחור תבנית מוכנה או לעצב בעצמכם, ולהוסיף עוד עמודים בהמשך.")}
                </p>
                <div className="flex items-end gap-2 flex-wrap mb-3.5">
                  <div>
                    <p className="text-xs text-ink-soft mb-2">{t("מידה נפוצה: בחירה ממלאת את השדות למטה, ואפשר גם לשנות אותם ידנית")}</p>
                    <select
                      value={ALBUM_SIZE_PRESETS.find((p) => p.width === albumSizeDraft.width && p.height === albumSizeDraft.height)?.label ?? ""}
                      onChange={(e) => {
                        const preset = ALBUM_SIZE_PRESETS.find((p) => p.label === e.target.value);
                        if (preset) setAlbumSizeDraft({ width: preset.width, height: preset.height, margin: preset.margin });
                      }}
                      style={{ width: "15vw", minWidth: 110 }}
                      className="rounded-lg border border-line px-2.5 py-2 text-sm bg-white"
                    >
                      <option value="">{t("בחירה...")}</option>
                      {ALBUM_SIZE_PRESETS.map((preset) => (
                        <option key={preset.label} value={preset.label}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <p className="text-xs text-ink-soft mb-2">{t("תבנית מוכנה (לא חובה, אפשר גם עמוד ריק ולעצב בעצמכם)")}</p>
                    <select
                      value={selectedStarterId ? `starter:${selectedStarterId}` : selectedSavedTemplateId ? `saved:${selectedSavedTemplateId}` : ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v.startsWith("starter:")) {
                          setSelectedStarterId(v.slice(8) as StarterTemplateId);
                          setSelectedSavedTemplateId(null);
                        } else if (v.startsWith("saved:")) {
                          setSelectedSavedTemplateId(v.slice(6));
                          setSelectedStarterId(null);
                        } else {
                          setSelectedStarterId(null);
                          setSelectedSavedTemplateId(null);
                        }
                      }}
                      style={{ width: "15vw", minWidth: 150 }}
                      className="rounded-lg border border-line px-2.5 py-2 text-sm bg-white"
                    >
                      <option value="">{t("בלי תבנית: עמוד ריק")}</option>
                      <optgroup label={t("תבניות מוכנות בסגנון אלבום")}>
                        {STARTER_BOOK_TEMPLATES.map((tpl) => (
                          <option key={tpl.id} value={`starter:${tpl.id}`}>
                            {t(tpl.name)}
                          </option>
                        ))}
                      </optgroup>
                      {albumBookTemplates.length > 0 && (
                        <optgroup label={t("התבניות השמורות שלי")}>
                          {albumBookTemplates.map((t) => (
                            <option key={t.id} value={`saved:${t.id}`}>
                              {t.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                </div>

                {selectedStarterId && (
                  <div className="rounded-lg p-2.5 bg-chip space-y-2.5 mb-3.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <input
                        type="number"
                        min={1}
                        value={starterPageCount}
                        onChange={(e) => setStarterPageCount(Math.max(1, Number(e.target.value) || 1))}
                        className="w-16 rounded-lg border border-line px-2 py-1.5 text-sm text-center bg-white"
                      />
                      <span className="text-xs text-ink-soft">{t("מספר עמודים")}</span>
                      <input
                        type="number"
                        min={1}
                        value={starterPhotoCount}
                        onChange={(e) => setStarterPhotoCount(Math.max(1, Number(e.target.value) || 1))}
                        className="w-16 rounded-lg border border-line px-2 py-1.5 text-sm text-center bg-white"
                      />
                      <span className="text-xs text-ink-soft">{t("סה״כ תמונות")}</span>
                    </div>
                    <button
                      onClick={() => buildAlbumFromStarterTemplate(selectedStarterId, starterPageCount, starterPhotoCount)}
                      disabled={buildingAlbumBook}
                      className="w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60"
                    >
                      {buildingAlbumBook ? t("יוצר את האלבום...") : t("יצירת האלבום מהתבנית")}
                    </button>
                  </div>
                )}

                {selectedSavedTemplateId &&
                  (() => {
                    const savedTemplate = albumBookTemplates.find((t) => t.id === selectedSavedTemplateId);
                    if (!savedTemplate) return null;
                    return (
                      <div className="rounded-lg p-2.5 bg-chip space-y-2.5 mb-3.5">
                        <p className="text-xs text-ink-soft">
                          {t("{n} עמודים", { n: savedTemplate.pages.length })}, {t(ALBUM_STYLE_OPTIONS.find((s) => s.id === savedTemplate.style)?.label ?? savedTemplate.style)}
                        </p>
                        <button
                          onClick={() => buildAlbumFromBookTemplate(savedTemplate)}
                          disabled={buildingAlbumBook}
                          className="w-full rounded-lg py-2.5 text-sm font-semibold bg-ink text-white disabled:opacity-60"
                        >
                          {buildingAlbumBook ? t("יוצר את האלבום...") : t("יצירת האלבום מהתבנית")}
                        </button>
                      </div>
                    );
                  })()}

                <p className="text-xs text-ink-soft mb-2">{t("מידות האלבום (ס״מ)")}</p>
                <div className="flex items-center gap-2 mb-2.5">
                  <input
                    type="number"
                    min={1}
                    value={albumSizeDraft.width}
                    onChange={(e) => setAlbumSizeDraft((prev) => ({ ...prev, width: Number(e.target.value) || prev.width }))}
                    className="w-20 rounded-lg border border-line px-2.5 py-2 text-sm text-center"
                  />
                  <span className="text-xs text-ink-soft">{t("רוחב")}</span>
                  <span className="text-ink-soft">×</span>
                  <input
                    type="number"
                    min={1}
                    value={albumSizeDraft.height}
                    onChange={(e) => setAlbumSizeDraft((prev) => ({ ...prev, height: Number(e.target.value) || prev.height }))}
                    className="w-20 rounded-lg border border-line px-2.5 py-2 text-sm text-center"
                  />
                  <span className="text-xs text-ink-soft">{t("גובה")}</span>
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
                  <span className="text-xs text-ink-soft">{t("מרחק המסגרת הירוקה מהקצה (ס״מ)")}</span>
                </div>

                <div className="space-y-4">
                  {error && <p className="text-xs text-rose">{error}</p>}
                  {buildingAlbumBook && <p className="text-xs text-ink-soft text-center">{t("בונה את האלבום...")}</p>}

                  <div className="flex gap-2">
                    <button
                      onClick={buildStyledAlbum}
                      disabled={buildingAlbumBook}
                      className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink disabled:opacity-60"
                    >
                      {t("עיצוב אישי: התחלה מדף ריק")}
                    </button>
                    <button
                      onClick={() => setAlbumManageOpen(false)}
                      disabled={buildingAlbumBook}
                      className="rounded-lg px-4 py-3 text-sm font-semibold bg-white border border-line text-ink-soft disabled:opacity-60"
                    >
                      {t("חזרה")}
                    </button>
                  </div>
                </div>
              </>
              )
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
                    {album.status === "draft" && t("טיוטה. עדיין לא נשלח ללקוח/ה")}
                    {album.status === "sent" && t("נשלח ללקוח/ה: ממתין לאישור")}
                    {album.status === "approved" && (
                      <span className="inline-flex items-center gap-1">
                        <IconAlbumCheck size={12} />
                        {t("האלבום אושר ע\"י הלקוח/ה")}
                      </span>
                    )}
                    {album.status === "changes_requested" && (
                      <>
                        {t("הלקוח/ה ביקש/ה שינויים, ראו הערות למטה")}
                        {albumCorrectionId && (
                          <>
                            {" · "}
                            <Link href={`/album-corrections/${albumCorrectionId}`} className="underline font-bold">
                              {t("לצפייה בתיקונים שסומנו")}
                            </Link>
                          </>
                        )}
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap" title={t("גודל האלבום להדפסה (ס״מ), לצורך ייצוא JPG / PSD")}>
                    <input
                      type="number"
                      min={1}
                      value={album.width_cm}
                      onChange={(e) => updateAlbumSize(Number(e.target.value) || album.width_cm, album.height_cm)}
                      className="w-20 rounded-lg border border-line px-2.5 py-2 text-sm text-center"
                    />
                    <span className="text-xs text-ink-soft">{t("רוחב")}</span>
                    <span className="text-ink-soft">×</span>
                    <input
                      type="number"
                      min={1}
                      value={album.height_cm}
                      onChange={(e) => updateAlbumSize(album.width_cm, Number(e.target.value) || album.height_cm)}
                      className="w-20 rounded-lg border border-line px-2.5 py-2 text-sm text-center"
                    />
                    <span className="text-xs text-ink-soft">{t("גובה")}</span>
                    <span className="w-px self-stretch bg-line mx-1" />
                    <input
                      type="number"
                      min={0}
                      step={0.1}
                      value={album.safe_margin_cm}
                      onChange={(e) => updateAlbumMargin(Number(e.target.value) || 0)}
                      className="w-16 rounded-lg border border-line px-2.5 py-2 text-sm text-center"
                    />
                    <span className="text-xs text-ink-soft">{t("מרחק המסגרת הירוקה מהקצה (ס״מ)")}</span>
                    {savingAlbumSize && <span className="text-[11px] text-ink-soft">{t("שומר...")}</span>}
                  </div>
                </div>

                <div className="flex items-start gap-4 mb-4 flex-wrap">
                  <div className="relative shrink-0" style={{ width: "18cm" }}>
                    <p className="text-xs text-ink-soft mb-2">{t("כריכה")}</p>
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
                      {t("יצירת כריכה")}
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
                              {t("לפי מידות האלבום")}
                            </button>
                            <button
                              onClick={() => {
                                setCoverCustomWidth(album.width_cm);
                                setCoverCustomHeight(album.height_cm);
                                setCoverSquareLock(false);
                                setCoverCustomMode(true);
                              }}
                              className="w-full rounded-lg py-2 text-xs font-semibold bg-white border border-line text-ink"
                            >
                              {t("מידה מותאמת")}
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="number"
                                min={1}
                                value={coverCustomWidth}
                                onChange={(e) => {
                                  const v = Number(e.target.value) || coverCustomWidth;
                                  setCoverCustomWidth(v);
                                  if (coverSquareLock) setCoverCustomHeight(v);
                                }}
                                className="w-16 rounded-lg border border-line px-2 py-1.5 text-xs text-center"
                              />
                              <span className="text-[11px] text-ink-soft">×</span>
                              <input
                                type="number"
                                min={1}
                                value={coverCustomHeight}
                                onChange={(e) => {
                                  const v = Number(e.target.value) || coverCustomHeight;
                                  setCoverCustomHeight(v);
                                  if (coverSquareLock) setCoverCustomWidth(v);
                                }}
                                className="w-16 rounded-lg border border-line px-2 py-1.5 text-xs text-center"
                              />
                              <span className="text-[11px] text-ink-soft">{t("ס״מ")}</span>
                            </div>
                            <label className="flex items-center gap-1.5 text-[11px] text-ink-soft cursor-pointer">
                              <input
                                type="checkbox"
                                checked={coverSquareLock}
                                onChange={(e) => {
                                  const checked = e.target.checked;
                                  setCoverSquareLock(checked);
                                  // Snap to a real square the moment it's turned on, instead of only
                                  // affecting the NEXT edit — otherwise checking the box with two
                                  // already-mismatched numbers still typed in looks like it did
                                  // nothing until you touch a field.
                                  if (checked) setCoverCustomHeight(coverCustomWidth);
                                }}
                                className="h-3.5 w-3.5"
                              />
                              {t("ריבוע (רוחב וגובה זהים)")}
                            </label>
                            <button
                              onClick={() => createCoverSpread(coverCustomWidth, coverSquareLock ? coverCustomWidth : coverCustomHeight)}
                              disabled={creatingSpread}
                              className="w-full rounded-lg py-2 text-xs font-semibold bg-ink text-white disabled:opacity-50"
                            >
                              {creatingSpread ? t("יוצר...") : t("יצירת כריכה")}
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {albumSpreads.length === 0 && (
                  <p className="text-sm text-ink-soft text-center py-4 mb-2">{t("אין עדיין עמודים באלבום.")}</p>
                )}
                {albumSpreads.length > 0 && (
                  <>
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <p className="text-xs font-bold text-ink-soft">{t("תצוגה מקדימה")}</p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {/* Admin only for now, like the other album precision tools (2026-10-21). */}
                        {photographerEmail === ADMIN_EMAIL && (
                          <button
                            type="button"
                            onClick={albumQuality.toggle}
                            className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${albumQuality.open ? "bg-ink text-white border-ink" : "bg-white text-ink border-line"}`}
                          >
                            {albumQuality.open ? t("סיום בדיקת האיכות") : t("בדיקת איכות")}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setPhotoSwapMode((v) => !v);
                            setPhotoSwapPick(null);
                          }}
                          className={`rounded-full px-3 py-1.5 text-xs font-semibold border ${photoSwapMode ? "bg-amber-deep text-white border-amber-deep" : "bg-white text-ink border-line"}`}
                        >
                          {photoSwapMode ? t("סיום החלפת תמונות") : t("⇄ החלפת תמונות בין עמודים")}
                        </button>
                      </div>
                    </div>
                    {photographerEmail === ADMIN_EMAIL && albumQuality.open && (
                      <AlbumQualityCheck
                        quality={albumQuality}
                        onShow={showQualityIssue}
                        onFix={applyQualityFixes}
                        undo={qualityUndo.length ? { frames: qualityUndo[qualityUndo.length - 1].frames.length, onUndo: undoQualityFixes } : null}
                      />
                    )}
                    {photoSwapMode && (
                      <p className="text-xs text-ink mb-2 rounded-lg bg-amber-bg px-3 py-2">
                        {photoSwapping
                          ? t("שומר את ההחלפה...")
                          : photoSwapPick
                            ? t("עכשיו לחצו על התמונה שאיתה להחליף, בכל עמוד. לחיצה שוב על אותה תמונה מבטלת.")
                            : t("לחצו על תמונה באחד העמודים, ואז על התמונה שאיתה להחליף.")}
                      </p>
                    )}
                    <div className="gf-album-preview-grid grid grid-cols-5 gap-1.5 mb-4">
                    {albumSpreads.map((spread, i) => {
                      const commentCount = albumComments.filter((c) => c.spread_id === spread.id).length;
                      return (
                        <div
                          key={spread.id}
                          id={`album-page-${spread.id}`}
                          draggable={!photoSwapMode}
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
                          {/* A page with its own size (the cover, e.g. 32×32 in a 60×30 album) shows in
                              its own shape, at the same height as the other pages (admin, owner
                              2026-10-20; everyone else still sees it in the album's shape). */}
                          {(() => {
                            const ownSize = photographerEmail === ADMIN_EMAIL && spread.width_cm && spread.height_cm ? { width_cm: spread.width_cm, height_cm: spread.height_cm } : null;
                            const widthShare = ownSize ? Math.min(1, ownSize.width_cm / ownSize.height_cm / (album.width_cm / album.height_cm)) : 1;
                            return (
                          <div className="relative mx-auto" style={widthShare < 1 ? { width: `${widthShare * 100}%` } : undefined}>
                          <AlbumSpreadThumbnail
                            spread={spread}
                            album={ownSize ? { ...album, ...ownSize } : album}
                            photos={photos}
                            customOrnaments={customOrnaments}
                            exactText={photographerEmail === ADMIN_EMAIL}
                            onClick={() => {
                              if (!photoSwapMode) setCanvasEditorTarget({ spreadId: spread.id, mode: "custom" });
                            }}
                          />
                          <MarkedFrameDots elements={spread.elements} marked={(spread as GalleryAlbumSpreadRow & SpreadMarkFields).marked_frames} size={8} />
                          {photographerEmail === ADMIN_EMAIL && albumQuality.open && (
                            <>
                              <QualityPageBadge counts={albumQuality.byPage.get(spread.id)} />
                              {qualityFocus?.spreadId === spread.id &&
                                (() => {
                                  const el = qualityFocus.elementId ? spread.elements?.find((x) => x.id === qualityFocus.elementId) : undefined;
                                  return <QualityHighlight box={el ? elementBox(el) : { xPct: 0, yPct: 0, widthPct: 100, heightPct: 100 }} />;
                                })()}
                            </>
                          )}
                          {photoSwapMode && (
                            <div className="absolute inset-0 z-[1]">
                              {(spread.elements ?? [])
                                .filter((el): el is AlbumPhotoElement => el.type === "photo" && !!el.photoId)
                                .map((el) => {
                                  const picked = photoSwapPick?.spreadId === spread.id && photoSwapPick.elId === el.id;
                                  return (
                                    <button
                                      key={el.id}
                                      type="button"
                                      disabled={photoSwapping}
                                      aria-label={picked ? t("התמונה שנבחרה להחלפה") : t("בחירת תמונה להחלפה")}
                                      // The admin's swap finds this photo's faces while the pointer is
                                      // still on its way to the click, so the swap doesn't wait for them.
                                      onPointerEnter={photographerEmail === ADMIN_EMAIL && el.photoId ? () => void swapFaces.facesOf(el.photoId!) : undefined}
                                      onPointerDown={photographerEmail === ADMIN_EMAIL && el.photoId ? () => void swapFaces.facesOf(el.photoId!) : undefined}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (picked) return setPhotoSwapPick(null);
                                        if (!photoSwapPick) return setPhotoSwapPick({ spreadId: spread.id, elId: el.id });
                                        const first = photoSwapPick;
                                        setPhotoSwapPick(null);
                                        void swapPhotos(first, { spreadId: spread.id, elId: el.id });
                                      }}
                                      className={`absolute ${picked ? "ring-[3px] ring-amber-deep bg-amber-deep/30" : "hover:ring-2 hover:ring-white/90 hover:bg-white/15"}`}
                                      style={{ left: `${el.xPct}%`, top: `${el.yPct}%`, width: `${el.widthPct}%`, height: `${el.heightPct}%` }}
                                    />
                                  );
                                })}
                            </div>
                          )}
                          </div>
                            );
                          })()}
                          <span className="absolute top-1 right-1 h-5 min-w-5 px-1 rounded-full bg-black/60 text-white text-[9px] font-semibold flex items-center justify-center pointer-events-none">
                            {i + 1}
                          </span>
                          <button
                            onClick={() => removeSpread(spread.id)}
                            className="absolute top-1 left-1 h-5 w-5 rounded-full bg-black/60 text-white flex items-center justify-center"
                            title={t("מחיקת עמוד")}
                          >
                            <IconAlbumClose size={9} />
                          </button>
                          {/* Part of the automatic designer: admin only for now, like it (2026-10-06). */}
                          {photographerEmail === ADMIN_EMAIL && spread.width_cm === null && (
                            <button
                              onClick={() => redesignSpread(spread)}
                              disabled={redesigning !== null}
                              className="w-full flex items-center justify-center gap-1 py-1.5 text-[11px] font-bold text-white bg-amber-deep hover:opacity-90 disabled:opacity-60"
                              title={t("עיצוב מחדש של העמוד עם אותן התמונות: כל לחיצה פריסה אחרת, בלי לחזור על פריסות שכבר הוצגו")}
                            >
                              <span className={redesigning === spread.id ? "inline-block animate-spin" : "inline-block"}>↻</span>
                              {t("עיצוב מחדש")}
                            </button>
                          )}
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
                    <span>{t("מספר אי-זוגי של עמודים ({n}), חלק ממעבדות הדפוס דורשות מספר זוגי. מומלץ להוסיף או להסיר עמוד אחד.", { n: albumSpreads.length })}</span>
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
          <p className="text-sm text-ink-soft">{t("טוען את הכלי...")}</p>
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
          // falsely hide real favorites from every later page's picker. A page's BACKGROUND photo is
          // deliberately excluded too, per explicit request — setting a photo as a page's background
          // is a different, non-exclusive kind of use (the same photo commonly also gets framed
          // somewhere on the page), so it must never mark that photo "used" and hide it from pickers
          // elsewhere; only actually placing it into a frame (an `elements` entry) should.
          const usedElsewhere = new Set(
            albumSpreads
              .filter((s) => s.id !== spread.id)
              .flatMap((s) => [
                ...(s.layout === "custom" ? [] : [s.photo_id_1, s.photo_id_2]),
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
              photos={albumToolPhotos}
              poolIsSelection={!!albumSelection}
              markedFrames={(spread as GalleryAlbumSpreadRow & SpreadMarkFields).marked_frames ?? []}
              folders={folders}
              photo1={photo1}
              photo2={photo2}
              mode={canvasEditorTarget.mode}
              templates={albumTemplates}
              usedElsewhere={usedElsewhere}
              onSave={saveSpreadElements}
              onSaveTemplate={saveAlbumTemplate}
              onClose={() => {
                canvasDraftRef.current = null;
                setCanvasEditorTarget(null);
              }}
              customOrnamentTabs={customOrnamentTabs}
              customOrnaments={customOrnaments}
              onCreateCustomOrnamentTab={handleCreateCustomOrnamentTab}
              onUploadCustomOrnament={handleUploadCustomOrnament}
              onDeleteCustomOrnament={handleDeleteCustomOrnament}
              spreads={albumSpreads}
              onSwitchSpread={(id) => {
                canvasDraftRef.current = null;
                setCanvasEditorTarget({ spreadId: id, mode: "custom" });
              }}
              onApplyBorderToAll={(border) => applyBorderToAllSpreads(border, spread.id)}
              onApplyBackgroundToAll={(bg) => applyBackgroundToAllSpreads(bg, spread.id)}
              onAddPage={createBlankSpread}
              sidePanelOffset={albumSidePanelOffset}
              onSidePanelOffsetChange={setAlbumSidePanelOffset}
              draft={canvasDraftRef.current?.spreadId === spread.id ? canvasDraftRef.current : null}
              isAdmin={photographerEmail === ADMIN_EMAIL}
              bookSize={{ width_cm: album.width_cm, height_cm: album.height_cm }}
            />
          );
        })()}

      {shareOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-end justify-center"
          style={{ background: "rgba(28, 27, 25, 0.7)" }}
          onClick={() => setShareOpen(false)}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {shareView === "main" ? (
              <>
                <h2 className="text-lg font-bold font-display mb-4">{t("שיתוף הגלריה")}</h2>

                {showFolderPicker && (
                  <div className="mb-5">
                    <p className="text-xs text-ink-soft mb-2.5">{t("אילו לשוניות לשתף?")}</p>
                    <TabPicker folders={folders} selected={shareSelectedFolders} onChange={setShareSelectedFolders} noFolderKey={NO_FOLDER_KEY} hasUnfoldered={hasUnfoldered} />
                    {shareDisabled && <p className="text-xs text-rose mt-2">{t("יש לבחור לפחות לשונית אחת לשיתוף")}</p>}
                  </div>
                )}

                <div className="mb-5">
                  <p className="text-xs text-ink-soft mb-2.5">{t("באיזו איכות לשתף?")}</p>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm">
                      <input type="radio" name="manage-share-quality" checked={shareQuality === "full"} onChange={() => setShareQuality("full")} />
                      {t("איכות מלאה (הקבצים המקוריים)")}
                    </label>
                    <label className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm">
                      <input type="radio" name="manage-share-quality" checked={shareQuality === "web"} onChange={() => setShareQuality("web")} />
                      {t("איכות מותאמת לרשת, קובץ קטן יותר (עד כ-3MB לתמונה)")}
                    </label>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <button
                    onClick={shareViaWhatsapp}
                    disabled={shareDisabled}
                    className="w-full rounded-lg py-3 text-sm font-semibold bg-sage-bg text-sage disabled:opacity-40"
                  >
                    {t("וואטסאפ")}
                  </button>
                  <button
                    onClick={shareViaQr}
                    disabled={shareDisabled}
                    className="w-full rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink disabled:opacity-40"
                  >
                    {t("קוד QR")}
                  </button>
                  <button
                    onClick={shareViaOther}
                    disabled={shareDisabled}
                    className="w-full rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink disabled:opacity-40"
                  >
                    {t("אחר")}
                  </button>
                </div>
                <button onClick={() => setShareOpen(false)} className="w-full text-center mt-4 text-xs text-ink-soft">
                  {t("ביטול")}
                </button>
              </>
            ) : (
              <>
                <h2 className="text-lg font-bold font-display mb-4">{t("קוד QR לגלריה")}</h2>
                {qrDataUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={qrDataUrl} alt={t("קוד QR לגלריה")} className="w-full rounded-2xl mb-4" />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => setShareView("main")}
                    className="flex-1 rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink-soft"
                  >
                    {t("חזרה")}
                  </button>
                  <button
                    onClick={() => setShareOpen(false)}
                    className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white"
                  >
                    {t("סגירה")}
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
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
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
                <div className="text-base font-bold font-display">{t("הגלריה פורסמה בהצלחה")}</div>
                <p className="text-xs text-ink-soft mt-1">{t("הגלריה זמינה ללקוח/ה לצפייה ובחירת תמונות.")}</p>
              </div>
            </div>
            {gallery.client_phone ? (
              <>
                <p className="text-xs text-ink-soft text-center mb-2">
                  {t("לחיצה תפתח את הוואטסאפ שלך עם הודעה מוכנה ללקוח/ה וקישור לגלריה, תישאר/י לבדוק ולשלוח בעצמך.")}
                </p>
                <SendUpdateButton onSend={sendGalleryPublishedUpdate} pending={sendingGalleryUpdate} />
              </>
            ) : (
              <p className="text-xs text-ink-soft text-center mb-2">{t("לא הוזן טלפון לקוח לגלריה. לא ניתן לשלוח עדכון.")}</p>
            )}
            <button
              onClick={() => setJustPublished(false)}
              className="w-full text-center mt-3 text-xs text-ink-soft"
            >
              {t("סגירה")}
            </button>
          </div>
        </div>
      )}

      {uploadJustFinished !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
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
                <div className="text-base font-bold font-display">{t("{n} תמונות הועלו בהצלחה", { n: uploadJustFinished })}</div>
                <p className="text-xs text-ink-soft mt-1">{t("התמונות זמינות עכשיו בגלריה.")}</p>
              </div>
            </div>
            {gallery.client_phone ? (
              <>
                <p className="text-xs text-ink-soft text-center mb-2">
                  {t("לחיצה תפתח את הוואטסאפ שלך עם הודעה מוכנה ללקוח/ה שיש תמונות חדשות בגלריה, תישאר/י לבדוק ולשלוח בעצמך.")}
                </p>
                <SendUpdateButton
                  onSend={() => sendPhotosUploadedUpdate(uploadJustFinished)}
                  pending={sendingUploadUpdate}
                />
              </>
            ) : (
              <p className="text-xs text-ink-soft text-center mb-2">{t("לא הוזן טלפון לקוח לגלריה. לא ניתן לשלוח עדכון.")}</p>
            )}
            <button
              onClick={() => setUploadJustFinished(null)}
              className="w-full text-center mt-3 text-xs text-ink-soft"
            >
              {t("סגירה")}
            </button>
          </div>
        </div>
      )}
      {portfolioCategoryPhoto && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
          onClick={() => setPortfolioCategoryPhoto(null)}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-1 font-display">{t("הוספה לפורטפוליו הציבורי")}</h2>
            <p className="text-xs text-ink-soft mb-3">
              {t("אפשר לתייג את התמונה בנושא (למשל \"חתונות\", \"בר/בת מצווה\") כדי לאפשר סינון לפי נושא בעמוד הפורטפוליו. זה אופציונלי.")}
            </p>
            <input
              value={portfolioCategoryInput}
              onChange={(e) => setPortfolioCategoryInput(e.target.value)}
              list="portfolio-category-suggestions"
              placeholder={t("לדוגמה: חתונות")}
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white mb-4"
              autoFocus
            />
            <datalist id="portfolio-category-suggestions">
              {Array.from(new Set(photos.map((p) => p.portfolio_category).filter((c): c is string => !!c))).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            {/* A sub-tab needs a tab. */}
            <label className="text-xs block mb-1 text-ink-soft">{t("תת-לשונית (לא חובה)")}</label>
            <input
              value={portfolioSubcategoryInput}
              onChange={(e) => setPortfolioSubcategoryInput(e.target.value)}
              list="portfolio-subcategory-suggestions"
              disabled={!portfolioCategoryInput.trim()}
              placeholder={portfolioCategoryInput.trim() ? t("לדוגמה: הכנות") : t("קודם בוחרים לשונית")}
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white mb-4 disabled:opacity-50"
            />
            <datalist id="portfolio-subcategory-suggestions">
              {(portfolioSubTabs[portfolioCategoryInput.trim()] ?? []).map((c) => (
                <option key={c} value={c} />
              ))}
            </datalist>
            <div className="flex gap-2">
              <button
                onClick={savePortfolioCategory}
                className={`flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white ${BTN_PRESS}`}
              >
                {t("הוספה לפורטפוליו")}
              </button>
              <button
                onClick={() => setPortfolioCategoryPhoto(null)}
                className={`flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft ${BTN_PRESS}`}
              >
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div>
      )}
      {removeFromPortfolioPhoto && (
        <div
          className="fixed inset-0 z-[70] flex items-end justify-center"
          style={{ background: "rgba(28, 27, 25, 0.45)" }}
          onClick={() => setRemoveFromPortfolioPhoto(null)}
        >
          <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold mb-1 font-display">{t("הסרה מהפורטפוליו הציבורי")}</h2>
            <p className="text-xs text-ink-soft mb-4">{t("התמונה תוסר מעמוד הפורטפוליו הציבורי. אפשר להוסיף אותה שוב בכל שלב.")}</p>
            <div className="flex gap-2">
              <button
                onClick={confirmRemoveFromPortfolio}
                className={`flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white ${BTN_PRESS}`}
              >
                {t("כן, הסרה")}
              </button>
              <button
                onClick={() => setRemoveFromPortfolioPhoto(null)}
                className={`flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft ${BTN_PRESS}`}
              >
                {t("ביטול")}
              </button>
            </div>
          </div>
        </div>
      )}
      {labelModalOpen && (
        // The photos on screen (the open folder and filters), in the gallery's order.
        <CullingLabelModal photos={visiblePhotos} galleryId={gallery.id} userId={gallery.photographer_id} onClose={() => setLabelModalOpen(false)} />
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
    </div>
  );
}
