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

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "bmp"];
const ALLOWED_ACCEPT = "image/jpeg,image/png,image/gif,image/bmp";

function isAllowedImageFile(file: File): boolean {
  const ext = file.name.split(".").pop()?.toLowerCase();
  return !!ext && ALLOWED_EXTENSIONS.includes(ext);
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
  const [layout, setLayout] = useState<"grid" | "mosaic">("grid");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

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
  const [expiryMonths, setExpiryMonths] = useState<1 | 3 | 6 | null>(initialGallery.expiry_months);
  const [uploading, setUploading] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [renewing, setRenewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [editTitle, setEditTitle] = useState(initialGallery.title);
  const [editShootDate, setEditShootDate] = useState(initialGallery.shoot_date ?? "");
  const [editClientEmail, setEditClientEmail] = useState(initialGallery.client_email ?? "");
  const [editAllowDownloads, setEditAllowDownloads] = useState(initialGallery.allow_downloads);
  const [savingDetails, setSavingDetails] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [actionSheetPhoto, setActionSheetPhoto] = useState<PhotoWithUrl | null>(null);
  const [deleteConfirmPhoto, setDeleteConfirmPhoto] = useState<PhotoWithUrl | null>(null);
  const [shareStatus, setShareStatus] = useState<string | null>(null);

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
    const { data } = await supabase.storage
      .from("galleries")
      .createSignedUrl(photo.storage_path, 300, { download: photo.original_filename });
    if (!data?.signedUrl) return;
    const a = document.createElement("a");
    a.href = data.signedUrl;
    a.download = photo.original_filename;
    a.click();
  };

  const downloadSelectedPhotos = () => {
    const selected = photos.filter((p) => selectedIds.has(p.id));
    selected.forEach((photo, i) => {
      setTimeout(() => downloadPhotoNow(photo), i * 150);
    });
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
    for (let i = 0; i < items.length; i++) {
      const { file, folderId } = items[i];
      setUploading(`מעלה ${i + 1} מתוך ${items.length}...`);
      const path = `${user.id}/${gallery.id}/${crypto.randomUUID()}-${file.name}`;
      const { error: uploadError } = await supabase.storage.from("galleries").upload(path, file);
      if (uploadError) {
        setError(`שגיאה בהעלאת ${file.name}: ${uploadError.message}`);
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
    }
    setUploading(null);
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
      setError(insertError?.message ?? "שגיאה ביצירת התיקייה");
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
    await supabase.storage.from("galleries").remove([photo.storage_path]);
    await supabase.from("gallery_photos").delete().eq("id", photo.id);
    if (gallery.cover_photo_id === photo.id) {
      await supabase.from("galleries").update({ cover_photo_id: null }).eq("id", gallery.id);
      setGallery((g) => ({ ...g, cover_photo_id: null }));
    }
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

  const saveDetails = async () => {
    setSavingDetails(true);
    const patch = {
      title: editTitle.trim() || "הגלריה שלכם",
      shoot_date: eventId ? gallery.shoot_date : editShootDate || null,
      client_email: editClientEmail.trim() || null,
      allow_downloads: editAllowDownloads,
    };
    const { error: updateError } = await supabase.from("galleries").update(patch).eq("id", gallery.id);
    if (updateError) {
      setError(updateError.message);
      setSavingDetails(false);
      return;
    }
    setGallery((g) => ({ ...g, ...patch }));
    setSavingDetails(false);
    setShowEditDetails(false);
  };

  const isArchived = !!gallery.archived_at;
  const favoriteCount = photos.filter((p) => p.is_favorite).length;
  const visiblePhotos = photos
    .filter((p) => (showFavoritesOnly ? p.is_favorite : true))
    .filter((p) => (activeFolderId ? p.folder_id === activeFolderId : true));

  return (
    <div className="pb-8">
      <div className="flex items-center justify-between mb-1.5">
        <Link href="/galleries" className="flex items-center gap-1 text-sm tracking-wide text-ink-soft">
          ← כל הגלריות
        </Link>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowEditDetails(true)}
            className="text-xs font-medium text-amber-deep underline"
          >
            עריכת פרטי הגלריה
          </button>
          {gallery.published && (
            <a
              href={`/gallery/${gallery.access_token}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-amber-deep underline"
            >
              תצוגה מקדימה ←
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
        <button
          onClick={() => setShowFavoritesOnly((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 mb-3 text-xs font-semibold ${BTN_PRESS}`}
          style={{
            background: showFavoritesOnly ? "var(--color-amber-bg)" : "var(--color-chip)",
            color: showFavoritesOnly ? "var(--color-amber-deep)" : "var(--color-ink-soft)",
          }}
        >
          💜 {showFavoritesOnly ? "מציג רק מועדפים" : "הצגת מועדפים בלבד"} ({favoriteCount})
        </button>
      )}

      <div className="flex items-center gap-1.5 mb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto flex-1 min-w-0">
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
          {folders.map((folder) => (
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
        <div className="flex rounded-lg border border-line overflow-hidden">
          <button
            onClick={() => setLayout("grid")}
            className={`px-3 py-1.5 text-xs font-semibold ${BTN_PRESS}`}
            style={{ background: layout === "grid" ? "var(--color-ink)" : "#fff", color: layout === "grid" ? "#fff" : "var(--color-ink-soft)" }}
          >
            רשת
          </button>
          <button
            onClick={() => setLayout("mosaic")}
            className={`px-3 py-1.5 text-xs font-semibold ${BTN_PRESS}`}
            style={{ background: layout === "mosaic" ? "var(--color-ink)" : "#fff", color: layout === "mosaic" ? "#fff" : "var(--color-ink-soft)" }}
          >
            פסיפס
          </button>
        </div>
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
          {layout === "grid" ? (
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
                {gallery.cover_photo_id === photo.id && (
                  <span className="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded-full bg-black/60 text-white">
                    שער
                  </span>
                )}
                {selectedIds.size > 0 ? (
                  <span
                    className="absolute top-1 left-1 h-5 w-5 rounded-full border-2 flex items-center justify-center"
                    style={{
                      borderColor: "#ffffff",
                      background: selectedIds.has(photo.id) ? "var(--color-amber-deep)" : "rgba(0,0,0,0.35)",
                    }}
                  >
                    {selectedIds.has(photo.id) && <span className="text-white text-[10px] leading-none">✓</span>}
                  </span>
                ) : (
                  photo.is_favorite && (
                    <span className="absolute top-1 left-1 text-[11px] h-5 w-5 rounded-full bg-black/50 text-white flex items-center justify-center">
                      💜
                    </span>
                  )
                )}
              </button>
            ))}
          </div>
          ) : (
          <div className="gap-1.5" style={{ columnWidth: `${cellSize}px` }}>
            {visiblePhotos.map((photo, i) => (
              <button
                key={photo.id}
                onPointerDown={() => startPress(photo)}
                onPointerUp={cancelPress}
                onPointerLeave={cancelPress}
                onClick={() => handlePhotoClick(photo, i)}
                className="relative w-full mb-1.5 rounded-lg overflow-hidden bg-line block break-inside-avoid"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={optimizedImageUrl(photo.url, 640)}
                  alt={photo.original_filename}
                  className="w-full h-auto block"
                  style={lightboxIndex !== i ? { viewTransitionName: `mgr-photo-${photo.id}` } : undefined}
                />
                {gallery.cover_photo_id === photo.id && (
                  <span className="absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded-full bg-black/60 text-white">
                    שער
                  </span>
                )}
                {selectedIds.size > 0 ? (
                  <span
                    className="absolute top-1 left-1 h-5 w-5 rounded-full border-2 flex items-center justify-center"
                    style={{
                      borderColor: "#ffffff",
                      background: selectedIds.has(photo.id) ? "var(--color-amber-deep)" : "rgba(0,0,0,0.35)",
                    }}
                  >
                    {selectedIds.has(photo.id) && <span className="text-white text-[10px] leading-none">✓</span>}
                  </span>
                ) : (
                  photo.is_favorite && (
                    <span className="absolute top-1 left-1 text-[11px] h-5 w-5 rounded-full bg-black/50 text-white flex items-center justify-center">
                      💜
                    </span>
                  )
                )}
              </button>
            ))}
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
            משך שמירת הגלריה: {expiryMonths ? EXPIRY_OPTIONS.find((o) => o.value === expiryMonths)?.label : "ללא הגבלת זמן"} — ניתן לשנות בעריכת פרטי הגלריה
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
          <button
            onClick={copyLink}
            className={`w-full rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink ${BTN_PRESS}`}
          >
            {copied ? "הקישור הועתק ✓" : "העתקת קישור לגלריה"}
          </button>
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

      {shareStatus && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 rounded-full px-4 py-2 text-xs font-semibold bg-ink text-white shadow-sheet">
          {shareStatus}
        </div>
      )}

      {/* Multi-select floating toolbar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 w-1/2 min-w-[220px] rounded-full px-2.5 py-2 bg-ink text-white shadow-sheet flex items-center justify-between gap-1.5">
          <button
            onClick={downloadSelectedPhotos}
            className={`flex items-center gap-0.5 text-[10px] font-semibold whitespace-nowrap ${BTN_PRESS}`}
          >
            ⬇ הורדה
          </button>
          <button onClick={selectAllVisible} className={`text-[10px] font-semibold whitespace-nowrap ${BTN_PRESS}`}>
            בחירת הכל
          </button>
          <span className="text-[10px] font-data font-semibold whitespace-nowrap">{selectedIds.size} נבחרו</span>
          <button
            onClick={clearSelection}
            aria-label="ביטול בחירה"
            title="ביטול בחירה"
            className={`shrink-0 h-5 w-5 rounded-full bg-white/15 flex items-center justify-center text-[10px] ${BTN_PRESS}`}
          >
            ✕
          </button>
        </div>
      )}

      {showEditDetails && (
        <EditGalleryDetailsModal
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
          canEditExpiry={!gallery.published}
          saving={savingDetails}
          onSave={saveDetails}
          onClose={() => setShowEditDetails(false)}
        />
      )}
    </div>
  );
}

function EditGalleryDetailsModal({
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
  canEditExpiry,
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
  canEditExpiry: boolean;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"details" | "permissions">("details");
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
        className={`w-full max-w-md rounded-3xl p-5 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto ${closing ? "edit-gallery-closing" : ""}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold font-display">עריכת פרטי הגלריה</h2>
          <button onClick={closeWithAnimation} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line">
            ✕
          </button>
        </div>

        <div className="flex gap-1.5 mb-4">
          <button
            onClick={() => setTab("details")}
            className="flex-1 rounded-full py-2 text-xs font-semibold"
            style={{
              background: tab === "details" ? "var(--color-ink)" : "var(--color-chip)",
              color: tab === "details" ? "var(--color-paper)" : "var(--color-ink-soft)",
            }}
          >
            פרטים
          </button>
          <button
            onClick={() => setTab("permissions")}
            className="flex-1 rounded-full py-2 text-xs font-semibold"
            style={{
              background: tab === "permissions" ? "var(--color-ink)" : "var(--color-chip)",
              color: tab === "permissions" ? "var(--color-paper)" : "var(--color-ink-soft)",
            }}
          >
            הרשאות ושמירה
          </button>
        </div>

        {tab === "details" ? (
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
              {canEditExpiry && (
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
              )}
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
