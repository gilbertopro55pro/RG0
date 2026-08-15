"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { GalleryFolderRow, GalleryPhotoRow, GalleryRow } from "@/lib/types";
import { withViewTransition, BTN_PRESS } from "@/lib/viewTransition";
import { readDataTransferItems, folderNameFromPath } from "@/lib/fileDrop";
import { usePinchSize } from "@/lib/usePinchColumns";
import { optimizedImageUrl } from "@/lib/imageOptimize";
import { IconGallery } from "@/components/icons/NavIcons";
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
import GalleryCoverBanner from "@/components/GalleryCoverBanner";
import GallerySlideshow from "@/components/GallerySlideshow";
import { TextPositionIcon, ShapeIcon, GridStyleIcon, PlayIcon } from "@/components/GalleryStyleIcons";

type PhotoWithUrl = GalleryPhotoRow & { url: string };

const CLOSE_ANIMATION_MS = 220;

const CELL_SIZE_MIN = 80;
const CELL_SIZE_MAX = 260;
const CELL_SIZE_DEFAULT = 126;

const EXPIRY_OPTIONS: { value: 1 | 3 | 6; label: string }[] = [
  { value: 1, label: "חודש" },
  { value: 3, label: "3 חודשים" },
  { value: 6, label: "חצי שנה" },
];

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "bmp", "heic", "heif"];
// iPhones save photos as HEIC by default — an accept list of only "safe" web formats hides those
// photos from Safari's picker entirely (Files/Photos on iOS filters by this exact string), which
// looks like "nothing happens" when uploading from a phone. HEIC/HEIF files are converted to JPEG
// client-side before upload (see convertHeicIfNeeded) so nothing HEIC ever reaches storage.
const ALLOWED_EXTENSIONS_SET = new Set(ALLOWED_EXTENSIONS);
const ALLOWED_ACCEPT = "image/jpeg,image/png,image/gif,image/bmp,image/heic,image/heif";

function isAllowedImageFile(file: File): boolean {
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

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

export default function GalleryManageView({
  eventId,
  clientName,
  eventDate,
  initialGallery,
  initialPhotos,
  initialFolders,
}: {
  eventId: string | null;
  clientName: string;
  eventDate: string | null;
  initialGallery: GalleryRow;
  initialPhotos: PhotoWithUrl[];
  initialFolders: GalleryFolderRow[];
}) {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const directoryInputRef = useRef<HTMLInputElement>(null);
  const [gallery, setGallery] = useState(initialGallery);
  const [photos, setPhotos] = useState(initialPhotos);
  const [folders, setFolders] = useState(initialFolders);
  const [activeFolderId, setActiveFolderId] = useState<string | null>(null);
  const [addingFolder, setAddingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mgrAspectRatios, setMgrAspectRatios] = useState<Record<string, number>>({});

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
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(searchParams.get("favorites") === "1");
  const [zippingFavorites, setZippingFavorites] = useState(false);
  const [expiryMonths, setExpiryMonths] = useState<1 | 3 | 6 | null>(initialGallery.expiry_months);
  const [uploading, setUploading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editTitle, setEditTitle] = useState(initialGallery.title);
  const [editShootDate, setEditShootDate] = useState(initialGallery.shoot_date ?? "");
  const [editClientEmail, setEditClientEmail] = useState(initialGallery.client_email ?? "");
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
  const [savingSlideshow, setSavingSlideshow] = useState(false);

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
    const a = document.createElement("a");
    a.href = data.url;
    a.download = photo.original_filename;
    a.click();
  };

  const downloadSelectedPhotos = () => {
    const selected = photos.filter((p) => selectedIds.has(p.id));
    selected.forEach((photo, i) => {
      setTimeout(() => downloadPhotoNow(photo), i * 150);
    });
  };

  // One zip, organized into a subfolder per tab — same shared endpoint the client-facing gallery
  // uses, except the photographer's own session bypasses the published/allow-downloads gates
  // (those control what the client can do, not what the photographer can do with their own data).
  const downloadFavoritesZip = async () => {
    const favoriteIds = photos.filter((p) => p.is_favorite).map((p) => p.id);
    if (favoriteIds.length === 0 || zippingFavorites) return;
    setZippingFavorites(true);
    try {
      const res = await fetch(`/api/gallery/${gallery.access_token}/download-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoIds: favoriteIds }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? "שגיאה בהורדת התמונות");
        return;
      }
      const disposition = res.headers.get("content-disposition") ?? "";
      const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
      const filename = utf8Match ? decodeURIComponent(utf8Match[1]) : "favorites.zip";
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setZippingFavorites(false);
    }
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
    try {
      for (let i = 0; i < items.length; i++) {
        const { folderId } = items[i];
        let file = items[i].file;
        try {
          if (isHeicFile(file)) {
            setUploading(`ממיר ${i + 1} מתוך ${items.length}...`);
            try {
              file = await convertHeicIfNeeded(file);
            } catch {
              setError(`לא ניתן היה להמיר את ${file.name} — נסו לצלם/לשמור כ-JPG ולהעלות שוב`);
              continue;
            }
          }
          setUploading(`מעלה ${i + 1} מתוך ${items.length}...`);
          const path = `${user.id}/${gallery.id}/${crypto.randomUUID()}-${file.name}`;
          const urlRes = await fetch("/api/storage/upload-url", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bucket: "galleries", path, contentType: file.type || "application/octet-stream" }),
          });
          const urlData = await urlRes.json();
          if (!urlRes.ok || !urlData.url) {
            setError(`שגיאה בהעלאת ${file.name}: ${urlData.error ?? "שגיאה לא ידועה"}`);
            continue;
          }
          const putRes = await fetch(urlData.url, {
            method: "PUT",
            headers: { "Content-Type": file.type || "application/octet-stream" },
            body: file,
          });
          if (!putRes.ok) {
            setError(`שגיאה בהעלאת ${file.name}`);
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
            setError(insertError?.message ?? "שגיאה בשמירת התמונה");
            continue;
          }
          setPhotos((prev) => [...prev, { ...photoRow, url: URL.createObjectURL(file) }]);
        } catch (e) {
          // A network-level failure (e.g. a CORS-misconfigured storage bucket) throws instead of
          // resolving to a response — without this, the whole loop would abort silently and leave
          // "מעלה..." on screen forever with no indication anything went wrong.
          setError(`שגיאה בהעלאת ${file.name}: ${e instanceof Error ? e.message : "שגיאת רשת"}`);
        }
      }
    } finally {
      setUploading(null);
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
    const all = Array.from(files);
    const allowed = all.filter(isAllowedImageFile);
    const rejected = all.filter((f) => !isAllowedImageFile(f));
    const items = allowed.map((file) => ({ file, folderId: activeFolderId }));
    await uploadResolvedFiles(items);
    reportRejectedFormats(rejected);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDirectoryFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const all = Array.from(files);
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

  const confirmDeletePhoto = async () => {
    const photo = deleteConfirmPhoto;
    if (!photo) return;
    setDeleteConfirmPhoto(null);
    setPhotos((prev) => prev.filter((p) => p.id !== photo.id));
    await fetch("/api/storage/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bucket: "galleries", paths: [photo.storage_path] }),
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
    const paths = selected.map((p) => p.storage_path);
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
    const expiresAt = expiryMonths ? addMonths(now, expiryMonths) : null;
    const patch = {
      published: true,
      expiry_months: expiryMonths,
      published_at: now.toISOString(),
      expires_at: expiresAt ? expiresAt.toISOString() : null,
    };
    await supabase.from("galleries").update(patch).eq("id", gallery.id);
    setGallery((g) => ({ ...g, ...patch }));
    // Standalone galleries (no event) have no stage tracker to sync.
    if (eventId) {
      await fetch(`/api/events/${eventId}/stages`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageKey: "gallery_upload", done: true }),
      });
    }
    setPublishing(false);
  };

  const renew = async () => {
    setRenewing(true);
    const now = new Date();
    const expiresAt = expiryMonths ? addMonths(now, expiryMonths) : null;
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
    if (!showFolderPicker) return base;
    const allSelected = allShareOptionKeys.every((k) => shareSelectedFolders.has(k));
    if (allSelected) return base;
    return `${base}?folders=${[...shareSelectedFolders].join(",")}`;
  };

  const buildShareMessage = (url: string) => {
    const name = clientName ? `${clientName}, ` : "";
    return `${name}הגלריה מהאירוע שלכם מוכנה לצפייה ובחירת תמונות 📸\n${url}`;
  };

  const shareViaWhatsapp = () => {
    const text = buildShareMessage(buildShareUrl());
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
    setShareOpen(false);
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
            expires_at: expiryMonths
              ? addMonths(new Date(gallery.published_at), expiryMonths).toISOString()
              : null,
          }
        : {};
    const patch = {
      title: editTitle.trim() || "הגלריה שלכם",
      shoot_date: eventId ? gallery.shoot_date : editShootDate || null,
      client_email: editClientEmail.trim() || null,
      allow_downloads: editAllowDownloads,
      theme,
      cover_text_position: coverTextPosition,
      cover_shape: coverShape,
      cover_photo_id: coverPhotoId,
      title_font_override: titleFontOverride,
      grid_style_override: gridStyleOverride,
      expiry_months: expiryMonths,
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
  const visiblePhotos = photos
    .filter((p) => (showFavoritesOnly ? p.is_favorite : true))
    .filter((p) => (activeFolderId ? p.folder_id === activeFolderId : true));
  // The photographer's own management grid mirrors the same resolved style the client actually
  // sees — no separate local toggle, so there's only ever one layout control to reason about.
  const resolvedGridStyle = gallery.grid_style_override ?? galleryThemeById(gallery.theme).gridStyle;

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-1.5">
        <Link href="/galleries" className="flex items-center gap-1 text-sm tracking-wide text-ink-soft">
          → כל הגלריות
        </Link>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setEditTitle(gallery.title);
              setEditShootDate(gallery.shoot_date ?? "");
              setEditClientEmail(gallery.client_email ?? "");
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
          {gallery.published && (
            <a
              href={`/gallery/${gallery.access_token}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="תצוגה מקדימה של הגלריה"
              title="תצוגה מקדימה של הגלריה"
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
      <h1 className="text-[22px] font-bold mb-1 font-display">{clientName || gallery.title}</h1>
      {eventDate ? (
        <p className="text-xs mb-5 text-ink-soft">{new Date(eventDate).toLocaleDateString("he-IL")}</p>
      ) : (
        gallery.shoot_date && (
          <p className="text-xs mb-5 text-ink-soft">{new Date(gallery.shoot_date).toLocaleDateString("he-IL")}</p>
        )
      )}

      {isArchived && (
        <div className="rounded-xl px-3.5 py-2.5 mb-3.5 text-xs bg-[#FBEEEC] text-rose">
          הגלריה בארכיון ותימחק סופית בתאריך{" "}
          {gallery.permanent_delete_at && new Date(gallery.permanent_delete_at).toLocaleDateString("he-IL")}. הקישור
          ללקוח אינו פעיל יותר.
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
            💜 {showFavoritesOnly ? "מציג רק מועדפים" : "הצגת מועדפים בלבד"} ({favoriteCount})
          </button>
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
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0">
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
          {folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => setActiveFolderId(folder.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold ${BTN_PRESS}`}
              style={{
                background: activeFolderId === folder.id ? "var(--color-amber-deep)" : "var(--color-chip)",
                color: activeFolderId === folder.id ? "#fff" : "var(--color-ink-soft)",
              }}
            >
              {folder.name}
            </button>
          ))}
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
          className={`shrink-0 ms-auto flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-semibold bg-white border border-line text-ink ${BTN_PRESS}`}
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
        <div ref={pinchContainerRef} className="mb-4" style={{ touchAction: "pan-y" }}>
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
                >
                  <Image
                    src={photo.url}
                    alt={photo.original_filename}
                    fill
                    sizes="(max-width: 768px) 33vw, 20vw"
                    className="object-cover"
                    style={lightboxIndex !== i ? { viewTransitionName: `mgr-photo-${photo.id}` } : undefined}
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
                    style={{ height: cellSize, width: ratio * cellSize, flexGrow: 1 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={optimizedImageUrl(photo.url, 640)}
                      alt={photo.original_filename}
                      className="absolute inset-0 w-full h-full object-cover"
                      style={lightboxIndex !== i ? { viewTransitionName: `mgr-photo-${photo.id}` } : undefined}
                      onLoad={(e) => {
                        const img = e.currentTarget;
                        const r = img.naturalWidth / img.naturalHeight;
                        setMgrAspectRatios((prev) => (prev[photo.id] ? prev : { ...prev, [photo.id]: r }));
                      }}
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
                return (
                  <button
                    key={photo.id}
                    onPointerDown={() => startPress(photo)}
                    onPointerUp={cancelPress}
                    onPointerLeave={cancelPress}
                    onClick={() => handlePhotoClick(photo, i)}
                    className="relative w-full mb-1.5 rounded-lg overflow-hidden bg-line block break-inside-avoid"
                    style={framed ? { padding: 4, border: "1px solid var(--color-line)" } : undefined}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={optimizedImageUrl(photo.url, 640)}
                      alt={photo.original_filename}
                      className="w-full h-auto block"
                      style={lightboxIndex !== i ? { viewTransitionName: `mgr-photo-${photo.id}` } : undefined}
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
        className={`rounded-lg border-2 border-dashed transition-colors ${isDragging ? "border-amber-deep bg-amber-bg" : "border-line"}`}
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
          className={`w-full flex items-center justify-center py-3 text-sm font-semibold text-ink cursor-pointer ${BTN_PRESS}`}
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

      {error && <p className="text-xs text-rose mt-2 whitespace-pre-line">{error}</p>}

      <div className="mt-3 space-y-2">
        {!gallery.published && (
          <p className="text-[11px] text-ink-soft text-center">
            משך שמירת הגלריה: {expiryMonths ? EXPIRY_OPTIONS.find((o) => o.value === expiryMonths)?.label : "ללא הגבלת זמן"} — ניתן לשנות בהגדרות הגלריה
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
            src={optimizedImageUrl(visiblePhotos[lightboxIndex].url, 1920)}
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
          allowDownloads={editAllowDownloads}
          setAllowDownloads={setEditAllowDownloads}
          expiryMonths={expiryMonths}
          setExpiryMonths={setExpiryMonths}
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
          style={{ background: "rgba(46,49,66,0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
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
        />
      )}

      {shareOpen && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ background: "rgba(46,49,66,0.45)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
          onClick={() => setShareOpen(false)}
        >
          <div className="w-full max-w-sm rounded-3xl p-5 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
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
  allowDownloads,
  setAllowDownloads,
  expiryMonths,
  setExpiryMonths,
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
  allowDownloads: boolean;
  setAllowDownloads: (v: boolean) => void;
  expiryMonths: 1 | 3 | 6 | null;
  setExpiryMonths: (v: 1 | 3 | 6 | null) => void;
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
        background: "rgba(46,49,66,0.45)",
        backdropFilter: entered && !closing ? "blur(16px)" : "blur(0px)",
        WebkitBackdropFilter: entered && !closing ? "blur(16px)" : "blur(0px)",
        transition: `backdrop-filter ${CLOSE_ANIMATION_MS + 60}ms ease, -webkit-backdrop-filter ${CLOSE_ANIMATION_MS + 60}ms ease`,
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
                      value={expiryMonths ?? "indefinite"}
                      onChange={(e) => setExpiryMonths(e.target.value === "indefinite" ? null : (Number(e.target.value) as 1 | 3 | 6))}
                      className="w-full rounded-lg px-2 py-2 text-sm border border-line bg-white"
                    >
                      <option value={1}>חודש</option>
                      <option value={3}>3 חודשים</option>
                      <option value={6}>חצי שנה</option>
                      <option value="indefinite">ללא הגבלת זמן</option>
                    </select>
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
