"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import {
  REEL_LENGTHS,
  REEL_PLATFORMS,
  REEL_TEMPLATES,
  REEL_TRANSITIONS,
  REEL_TRANSITION_CATEGORIES,
  defaultLineStyles,
  platformById,
  templateById,
  type ReelFit,
  type ReelLength,
  type ReelLineId,
  type ReelLineStyle,
  type ReelPlatformId,
  type ReelSettings,
  type ReelTemplate,
  type ReelTextPosition,
  type ReelTransition,
  type ReelTransitionCategory,
} from "@/lib/reels/templates";
import { activeMedia, drawReelFrame, drawTransitionPreview, loadReelImage, reelFonts, reelTimeline, transitionPool, type ReelFonts, type ReelImage } from "@/lib/reels/render";
import { REEL_TRACKS, trackById } from "@/lib/reels/music";
import { PreviewMusic, decodeTrack, musicGain, renderSoundtrack } from "@/lib/reels/audio";
import ReelTimelineEditor, { type TimelineClip } from "@/components/ReelTimelineEditor";
import { ALBUM_FONTS, ALBUM_FONT_CLASS_NAMES } from "@/lib/albumFonts";
import { exportReelMp4, ReelCancelledError, ReelUnsupportedError } from "@/lib/reels/encode";
import { useBusy } from "@/lib/updateResume";

// Reels from a gallery (owner, 2026-10-07, admin only while it's polished): pick photos, a
// platform, a template and a length, set each photo's time on the timeline, add music, edit the
// text, watch it live, and export a video file to
// download or share straight to Instagram / TikTok / Facebook from the phone. Everything happens
// in the browser (see src/lib/reels).

export type ReelBuilderPhoto = { id: string; thumbUrl: string; isFavorite: boolean };

const MAX_PHOTOS = 30;
const PREVIEW_W = 360;
const TEXT_COLORS = ["#ffffff", "#f4e7c8", "#c9a15a", "#b08d57", "#1c1b19", "#7a2e3a"];

type Tab = "style" | "photos" | "transitions" | "music" | "text";

// The photographer's own music file: at most this size (a few minutes of a normal song).
const MAX_MUSIC_BYTES = 40 * 1024 * 1024;
// Video clips from the device (owner, 2026-10-07): a few, each up to this size.
const MAX_VIDEOS = 6;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
const isVideoId = (id: string) => id.startsWith("video:");

type DeviceVideo = { file: File; url: string; el: HTMLVideoElement; duration: number; thumb: string };

// Loads a clip from the device: its first frames, size, length and a small thumbnail.
async function loadDeviceVideo(file: File): Promise<DeviceVideo> {
  const url = URL.createObjectURL(file);
  const el = document.createElement("video");
  el.muted = true;
  el.playsInline = true;
  el.preload = "auto";
  el.src = url;
  await new Promise<void>((resolve, reject) => {
    el.onloadeddata = () => resolve();
    el.onerror = () => reject(new Error("video"));
  });
  let duration = el.duration;
  if (!Number.isFinite(duration)) {
    // Some WebM files only report their length after a seek to the end.
    await new Promise<void>((resolve) => {
      el.ontimeupdate = () => resolve();
      el.currentTime = 1e7;
    });
    duration = el.duration;
  }
  await new Promise<void>((resolve) => {
    el.onseeked = () => resolve();
    el.currentTime = Math.min(0.5, duration / 3);
  });
  const c = document.createElement("canvas");
  c.width = 200;
  c.height = Math.max(1, Math.round((200 * el.videoHeight) / el.videoWidth));
  c.getContext("2d")!.drawImage(el, 0, 0, c.width, c.height);
  const thumb = c.toDataURL("image/jpeg", 0.75);
  el.onseeked = null;
  el.currentTime = 0;
  return { file, url, el, duration: Number.isFinite(duration) ? duration : 5, thumb };
}

const LINES: { id: ReelLineId; label: string; hint: string; placeholder: string }[] = [
  { id: "title", label: "כותרת", hint: "נפתחת עם הסרטון, על התמונות הראשונות, ונעלמת אחרי כמה שניות.", placeholder: "למשל: רון ונויה" },
  { id: "subtitle", label: "שורה שנייה", hint: "מופיעה מתחת לכותרת ובאותו זמן. מתאימה לתאריך או לסוג האירוע.", placeholder: "למשל: בר ובת מצווה · 08.10.2026" },
  { id: "ending", label: "טקסט סיום", hint: "מופיע לבד על המסך האחרון, אחרי התמונה האחרונה. מתאים לשם הסטודיו או לקישור.", placeholder: "למשל: שם הסטודיו" },
];

const FIT_OPTIONS: { id: ReelFit; label: string; hint: string }[] = [
  { id: "blur", label: "תמונה שלמה, רקע מטושטש", hint: "התמונה שלמה, ומסביבה עותק מטושטש של אותה תמונה" },
  { id: "black", label: "תמונה שלמה, רקע שחור", hint: "תמונה לרוחב בסרטון לאורך נשארת שלמה, עם שחור מעליה ומתחתיה" },
  { id: "cover", label: "מילוי המסך", hint: "התמונה ממלאת את כל המסך, והצדדים שלה נחתכים" },
];

export default function ReelBuilder({
  galleryId,
  galleryTitle,
  dateLabel,
  studioName,
  photos,
  initialSelection,
  onClose,
}: {
  galleryId: string;
  galleryTitle: string;
  dateLabel: string | null;
  studioName: string | null;
  photos: ReelBuilderPhoto[];
  initialSelection: string[];
  onClose: () => void;
}) {
  const t = useT();
  const [tab, setTab] = useState<Tab>("style");
  const [selected, setSelected] = useState<string[]>(() => initialSelection.slice(0, MAX_PHOTOS));
  const [picking, setPicking] = useState(false);
  const [settings, setSettings] = useState<ReelSettings>(() => ({
    platform: "ig-reel",
    templateId: REEL_TEMPLATES[0].id,
    length: 15,
    fit: "blur",
    blur: 60,
    // Every reel starts without music (owner, 2026-10-07).
    music: { source: "none", trackId: REEL_TRACKS[0].id, volume: 0.8, offset: 0 },
    transitions: [],
    seed: 1,
    text: {
      title: galleryTitle,
      subtitle: dateLabel ?? "",
      ending: studioName ?? "",
      position: "bottom",
      show: true,
      styles: defaultLineStyles(REEL_TEMPLATES[0]),
    },
  }));
  const [images, setImages] = useState<Map<string, ReelImage>>(new Map());
  // Times the photographer set on the timeline (seconds per segment, keyed by its first photo);
  // null = the automatic split.
  const [durState, setDurState] = useState<{ keys: string[]; durs: number[] } | null>(null);
  const [upload, setUpload] = useState<{ file: File; url: string } | null>(null);
  const [musicError, setMusicError] = useState<string | null>(null);
  const [musicBuffer, setMusicBuffer] = useState<AudioBuffer | null>(null);
  const playerRef = useRef<PreviewMusic | null>(null);
  // Set whenever the music has to (re)start at the preview's current time: a seek, a new track,
  // a new start point, play after pause.
  const musicKeyRef = useRef("");
  const [videos, setVideos] = useState<Map<string, DeviceVideo>>(new Map());
  const [videoError, setVideoError] = useState<string | null>(null);
  const [addingVideo, setAddingVideo] = useState(false);
  // Timeline snapping (magnet), on unless the photographer turns it off.
  const [snap, setSnap] = useState(true);
  const seekCountRef = useRef(0);
  const [fonts, setFonts] = useState<ReelFonts | null>(null);
  const [playing, setPlaying] = useState(true);
  const [exporting, setExporting] = useState<number | null>(null);
  const [result, setResult] = useState<{ url: string; blob: Blob } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelRef = useRef(false);
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  // Carries every album font's CSS variable, so a picked font's real family name can be read.
  const fontProbeRef = useRef<HTMLDivElement | null>(null);
  const timeRef = useRef(0);
  // The preview's play position for the progress bar, refreshed a few times a second.
  const [previewTime, setPreviewTime] = useState(0);
  useBusy("reel-export", exporting !== null ? t("יצירת הרילס") : null);

  const platform = platformById(settings.platform);
  const tpl = templateById(settings.templateId);
  const readyIds = useMemo(() => selected.filter((id) => images.has(id)), [selected, images]);
  const readyImages = useMemo(() => readyIds.map((id) => images.get(id)!), [readyIds, images]);
  const track = settings.music.source === "library" ? trackById(settings.music.trackId) : null;
  const bpm = track?.bpm ?? null;
  // Each segment is keyed by its (first) photo, so the times the photographer set travel with the
  // photo when it's moved, and fall back to the automatic split when photos are added or removed.
  const perSeg = tpl.frame === "split" ? 2 : 1;
  const segKeys = useMemo(() => {
    const keys: string[] = [];
    for (let i = 0; i < readyIds.length; i += perSeg) keys.push(readyIds[i]);
    return keys;
  }, [readyIds, perSeg]);
  const custom = useMemo(() => {
    if (!durState) return null;
    const byKey = new Map(durState.keys.map((k, i) => [k, durState.durs[i]]));
    const used = segKeys.slice(0, durState.keys.length);
    if (used.length !== durState.keys.length || used.some((k) => !byKey.has(k))) return null;
    return used.map((k) => byKey.get(k)!);
  }, [durState, segKeys]);
  // Each segment's video length (null for photos), so a clip gets its own time.
  const segVideo = useMemo(() => {
    const out: (number | null)[] = [];
    for (let i = 0; i < readyImages.length; i += perSeg) {
      const clipLens = readyImages.slice(i, i + perSeg).map((im) => im.video?.duration ?? null).filter((d): d is number => d != null);
      out.push(clipLens.length ? Math.max(...clipLens) : null);
    }
    return out;
  }, [readyImages, perSeg]);
  const timeline = useMemo(() => reelTimeline(readyImages.length, tpl, settings, custom, bpm, segVideo), [readyImages.length, tpl, settings, custom, bpm, segVideo]);
  // Jumps the preview (and its music) to time t.
  const seek = (time: number) => {
    timeRef.current = time;
    seekCountRef.current++;
    setPreviewTime(time);
  };
  const pool = transitionPool(tpl, settings);

  useEffect(() => {
    reelFonts().then(setFonts);
  }, []);

  // The album fonts picked for the lines: their family is read from the probe and loaded before
  // drawing (until then the line draws in the template's font).
  const pickedFonts = Array.from(new Set(Object.values(settings.text.styles).map((s) => s.font).filter(Boolean))).sort().join("|");
  useEffect(() => {
    if (!fonts || !fontProbeRef.current || !pickedFonts) return;
    const css = getComputedStyle(fontProbeRef.current);
    const hebrew = css.getPropertyValue("--font-af-heebo-hebrew").trim();
    for (const key of pickedFonts.split("|")) {
      if (fonts.families[key]) continue;
      const own = css.getPropertyValue(`--font-af-${key}`).trim();
      if (!own) continue;
      const family = [own, hebrew, "sans-serif"].filter(Boolean).join(", ");
      document.fonts
        .load(`400 40px ${family}`, "אבג abc")
        .catch(() => [])
        .then(() => setFonts((f) => (f ? { ...f, families: { ...f.families, [key]: family } } : f)));
    }
  }, [pickedFonts, fonts]);

  // Photos load as they're picked (same-origin, so the canvas stays exportable).
  useEffect(() => {
    let alive = true;
    for (const id of selected) {
      if (images.has(id) || isVideoId(id)) continue;
      loadReelImage(`/api/galleries/${galleryId}/photos/${id}/image?size=1600`)
        .then((img) => {
          if (alive) setImages((prev) => new Map(prev).set(id, img));
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [selected, galleryId, images]);

  // The music for the preview, decoded once per track or file.
  const musicUrl = settings.music.source === "library" ? track?.url ?? null : settings.music.source === "upload" ? upload?.url ?? null : null;
  const musicKey = settings.music.source === "upload" && upload ? `upload:${upload.file.name}:${upload.file.size}` : musicUrl;
  useEffect(() => {
    if (!musicUrl || !musicKey) return;
    let alive = true;
    decodeTrack(musicKey, async () => (upload && settings.music.source === "upload" ? upload.file.arrayBuffer() : (await fetch(musicUrl)).arrayBuffer()))
      .then((buf) => alive && setMusicBuffer(buf))
      .catch(() => alive && setMusicError(t("לא הצלחנו לקרוא את קובץ המוזיקה.")));
    return () => {
      alive = false;
      setMusicBuffer(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicKey]);
  useEffect(() => () => playerRef.current?.close(), []);

  // Live preview: the same frames as the export, drawn small. With music, the music is the clock
  // (so it plays without a single jump) and the picture follows it.
  useEffect(() => {
    const canvas = previewRef.current;
    if (!canvas || !fonts) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let raf = 0;
    let last = -1;
    let uiTick = 0;
    const loop = (now: number) => {
      if (last < 0) last = now;
      const total = timeline.total;
      const player = playerRef.current;
      const buffer = settings.music.source === "none" ? null : musicBuffer;
      if (buffer && playing && player) {
        const key = `${musicKey}|${settings.music.offset}|${total}|${seekCountRef.current}`;
        if (key !== musicKeyRef.current) {
          musicKeyRef.current = key;
          player.play(buffer, timeRef.current, settings.music.offset);
        }
      } else if (player?.running) {
        player.stop();
        musicKeyRef.current = "";
      }
      if (buffer && playing && player?.running) {
        let tt = player.time();
        if (tt >= total) {
          player.play(buffer, 0, settings.music.offset);
          tt = 0;
        }
        timeRef.current = tt;
        player.setGain(musicGain(tt, total, settings.music.volume));
      } else if (playing && total > 0) {
        // (A frame's timestamp can be a hair before `last`, so never step back in time.)
        timeRef.current = (timeRef.current + Math.max(0, now - last) / 1000) % total;
      }
      last = now;
      // Video clips: the one on screen plays at the right point; the others wait.
      const act = new Map(activeMedia(timeRef.current, timeline, tpl, settings, readyImages.length).map((a) => [a.index, a.local]));
      readyImages.forEach((img, i) => {
        if (!img.live || !img.video) return;
        const v = img.el as HTMLVideoElement;
        const local = act.get(i);
        if (local == null) {
          if (!v.paused) v.pause();
          return;
        }
        const want = Math.min(local, Math.max(0, img.video.duration - 0.05));
        if (playing) {
          if (v.paused && local < img.video.duration - 0.05) v.play().catch(() => {});
          if (Math.abs(v.currentTime - want) > 0.3) v.currentTime = want;
        } else {
          if (!v.paused) v.pause();
          if (Math.abs(v.currentTime - want) > 0.04) v.currentTime = want;
        }
      });
      drawReelFrame(ctx, canvas.width, canvas.height, timeRef.current, timeline, tpl, settings, readyImages, fonts);
      if (++uiTick % 6 === 0) setPreviewTime(timeRef.current);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [fonts, playing, timeline, tpl, settings, readyImages, musicBuffer, musicKey]);

  useEffect(() => () => {
    if (upload) URL.revokeObjectURL(upload.url);
  }, [upload]);

  useEffect(() => () => {
    if (result) URL.revokeObjectURL(result.url);
  }, [result]);

  const setText = (patch: Partial<ReelSettings["text"]>) => setSettings((s) => ({ ...s, text: { ...s.text, ...patch } }));
  const setLineStyle = (line: ReelLineId, patch: Partial<ReelLineStyle>) =>
    setSettings((s) => ({ ...s, text: { ...s.text, styles: { ...s.text.styles, [line]: { ...s.text.styles[line], ...patch } } } }));
  const chooseTemplate = (tp: ReelTemplate) => {
    // A new template brings its own colours and its own mix of transitions; fonts, sizes and
    // rotations the photographer set stay.
    setSettings((s) => {
      const d = defaultLineStyles(tp);
      const styles = { ...s.text.styles };
      for (const id of Object.keys(styles) as ReelLineId[]) styles[id] = { ...styles[id], color: d[id].color };
      return { ...s, templateId: tp.id, transitions: [], text: { ...s.text, styles } };
    });
    seek(0);
  };
  const toggleTransition = (id: ReelTransition) =>
    setSettings((s) => {
      const current = transitionPool(templateById(s.templateId), s);
      const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
      return next.length ? { ...s, transitions: next } : s;
    });
  // Moves segment `from` to `to` on the timeline (both photos of a split segment move together).
  const reorderSegments = (from: number, to: number) => {
    const groups: string[][] = [];
    for (let i = 0; i < selected.length; i += perSeg) groups.push(selected.slice(i, i + perSeg));
    if (from >= groups.length || to >= groups.length) return;
    const [g] = groups.splice(from, 1);
    groups.splice(to, 0, g);
    setSelected(groups.flat());
    // The current times travel with their photos.
    if (!durState) setDurState({ keys: segKeys.slice(0, timeline.segments), durs: timeline.durs.slice() });
  };
  const chooseUpload = (file: File | undefined) => {
    setMusicError(null);
    if (!file) return;
    if (!file.type.startsWith("audio/") && !/\.(mp3|m4a|aac|wav|ogg|oga|flac)$/i.test(file.name)) {
      setMusicError(t("זה לא נראה כמו קובץ מוזיקה. אפשר MP3, M4A, WAV או AAC."));
      return;
    }
    if (file.size > MAX_MUSIC_BYTES) {
      setMusicError(t("הקובץ גדול מדי (עד 40MB)."));
      return;
    }
    setUpload({ file, url: URL.createObjectURL(file) });
    setSettings((s) => ({ ...s, music: { ...s.music, source: "upload", offset: 0 } }));
  };
  const addVideos = async (files: FileList | null) => {
    setVideoError(null);
    if (!files?.length) return;
    setAddingVideo(true);
    try {
      for (const file of Array.from(files)) {
        if (videos.size >= MAX_VIDEOS) {
          setVideoError(t("אפשר להוסיף עד {n} קטעי וידאו.", { n: MAX_VIDEOS }));
          break;
        }
        if (!file.type.startsWith("video/") && !/\.(mp4|mov|m4v|webm)$/i.test(file.name)) {
          setVideoError(t("זה לא נראה כמו קובץ וידאו. אפשר MP4, MOV או WebM."));
          continue;
        }
        if (file.size > MAX_VIDEO_BYTES) {
          setVideoError(t("קטע הווידאו גדול מדי (עד 500MB)."));
          continue;
        }
        try {
          const v = await loadDeviceVideo(file);
          const id = `video:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          setVideos((prev) => new Map(prev).set(id, v));
          setImages((prev) => new Map(prev).set(id, { el: v.el, width: v.el.videoWidth, height: v.el.videoHeight, live: true, video: { duration: v.duration } }));
          setSelected((prev) => (prev.length >= MAX_PHOTOS ? prev : [...prev, id]));
        } catch {
          setVideoError(t("הדפדפן לא הצליח לפתוח את קטע הווידאו הזה."));
        }
      }
    } finally {
      setAddingVideo(false);
    }
  };
  const removeItem = (id: string) => {
    setSelected((prev) => prev.filter((x) => x !== id));
    if (isVideoId(id)) {
      const v = videos.get(id);
      if (v) {
        v.el.pause();
        URL.revokeObjectURL(v.url);
      }
      setVideos((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
  };
  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_PHOTOS ? prev : [...prev, id]));
  const move = (id: string, dir: -1 | 1) =>
    setSelected((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = prev.slice();
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const runExport = async () => {
    if (!fonts || readyImages.length === 0) return;
    setError(null);
    setResult(null);
    cancelRef.current = false;
    setExporting(0);
    setPlaying(false);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = platform.width;
      canvas.height = platform.height;
      const ctx = canvas.getContext("2d")!;
      let audio: AudioBuffer | null = null;
      if (musicUrl) {
        try {
          const key = settings.music.source === "upload" && upload ? `upload:${upload.file.name}:${upload.file.size}` : musicUrl;
          const buffer = await decodeTrack(key, async () => (upload && settings.music.source === "upload" ? upload.file.arrayBuffer() : (await fetch(musicUrl)).arrayBuffer()));
          audio = await renderSoundtrack(buffer, { offset: settings.music.offset, total: timeline.total, volume: settings.music.volume });
        } catch {
          setMusicError(t("לא הצלחנו לקרוא את קובץ המוזיקה, הסרטון ייווצר בלי מוזיקה."));
        }
      }
      // Video clips are decoded frame by frame at exactly the moments the file needs (the preview's
      // <video> elements only play approximately in time).
      const exportImages = readyImages.slice();
      const feeds: { frames: Set<number>; next: () => Promise<void> }[] = [];
      const clipIdx = readyImages.map((im, i) => (im.live ? i : -1)).filter((i) => i >= 0);
      if (clipIdx.length) {
        const { Input, BlobSource, ALL_FORMATS, CanvasSink } = await import("mediabunny");
        const frameCount = Math.max(1, Math.round(timeline.total * 30));
        for (const i of clipIdx) {
          const dv = videos.get(readyIds[i]);
          const img = readyImages[i];
          if (!dv || !img.video) continue;
          const input = new Input({ source: new BlobSource(dv.file), formats: ALL_FORMATS });
          const trackIn = await input.getPrimaryVideoTrack();
          if (!trackIn || !(await trackIn.canDecode())) {
            setVideoError(t("הדפדפן לא יכול לפענח את אחד מקטעי הווידאו, הוא יופיע כתמונה קפואה."));
            continue;
          }
          const first = await trackIn.getFirstTimestamp();
          const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
          const w = Math.max(2, Math.round(img.width * scale));
          const h = Math.max(2, Math.round(img.height * scale));
          const holder = document.createElement("canvas");
          holder.width = w;
          holder.height = h;
          const hctx = holder.getContext("2d")!;
          hctx.drawImage(img.el, 0, 0, w, h);
          const frames = new Set<number>();
          const stamps: number[] = [];
          for (let f = 0; f < frameCount; f++) {
            const hit = activeMedia(f / 30, timeline, tpl, settings, readyImages.length).find((a) => a.index === i);
            if (!hit) continue;
            frames.add(f);
            stamps.push(first + Math.min(hit.local, Math.max(0, img.video.duration - 0.04)));
          }
          const sink = new CanvasSink(trackIn, { width: w, height: h, fit: "fill", poolSize: 1 });
          const it = sink.canvasesAtTimestamps(stamps)[Symbol.asyncIterator]();
          feeds.push({
            frames,
            next: async () => {
              const r = await it.next();
              if (!r.done && r.value) hctx.drawImage(r.value.canvas, 0, 0, w, h);
            },
          });
          exportImages[i] = { el: holder, width: w, height: h, live: true, video: img.video };
        }
      }
      const blob = await exportReelMp4({
        audio,
        canvas,
        total: timeline.total,
        prepare: feeds.length
          ? async (_time, frame) => {
              for (const fd of feeds) if (fd.frames.has(frame)) await fd.next();
            }
          : undefined,
        draw: (time) => drawReelFrame(ctx, canvas.width, canvas.height, time, timeline, tpl, settings, exportImages, fonts),
        onProgress: (f) => setExporting(f),
        isCancelled: () => cancelRef.current,
      });
      setResult({ url: URL.createObjectURL(blob), blob });
    } catch (e) {
      if (e instanceof ReelCancelledError) return;
      setError(e instanceof ReelUnsupportedError ? t("הדפדפן הזה לא תומך ביצירת וידאו. נסו בכרום או בספארי מעודכן.") : t("יצירת הרילס נכשלה, נסו שוב."));
    } finally {
      setExporting(null);
      setPlaying(true);
    }
  };

  const fileName = () => {
    const ext = result?.blob.type === "video/webm" ? "webm" : "mp4";
    return `reel-${settings.platform}.${ext}`;
  };
  const canShareFile = () => {
    if (!result || typeof navigator === "undefined" || !navigator.canShare) return false;
    try {
      return navigator.canShare({ files: [new File([result.blob], fileName(), { type: result.blob.type })] });
    } catch {
      return false;
    }
  };
  const share = async () => {
    if (!result) return;
    try {
      await navigator.share({ files: [new File([result.blob], fileName(), { type: result.blob.type })], title: galleryTitle });
    } catch {
      // Cancelled by the user.
    }
  };

  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${active ? "bg-ink text-white border-ink" : "bg-white border-line text-ink hover:border-amber-deep"}`;
  const sectionTitle = "font-display text-[15px] font-semibold text-ink mb-1";
  const sectionHint = "text-[11px] text-ink-soft mb-2.5 leading-relaxed";
  const previewH = Math.round((PREVIEW_W * platform.height) / platform.width);
  const thumbOf = new Map([...photos.map((p) => [p.id, p.thumbUrl] as const), ...[...videos].map(([id, v]) => [id, v.thumb] as const)]);
  const tabs: { id: Tab; label: string }[] = [
    { id: "style", label: t("סגנון") },
    { id: "photos", label: t("תמונות") },
    { id: "transitions", label: t("מעברים") },
    { id: "music", label: t("מוזיקה") },
    { id: "text", label: t("טקסט") },
  ];

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-2 sm:p-4"
      style={{ background: "rgba(20, 18, 15, 0.78)" }}
      onClick={onClose}
      onPointerDownCapture={() => {
        playerRef.current ??= new PreviewMusic();
        playerRef.current.resume().then((woke) => {
          if (woke) seekCountRef.current++;
        });
      }}
    >
      <div ref={fontProbeRef} className={ALBUM_FONT_CLASS_NAMES} style={{ display: "none" }} aria-hidden="true" />
      <div className="w-full max-w-5xl max-h-full overflow-y-auto rounded-md bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b border-line">
          <div>
            <h2 className="text-xl font-semibold font-display tracking-tight">{t("יצירת רילס")}</h2>
            <p className="text-[11px] text-ink-soft mt-0.5">{t("בטא · זמין כרגע רק בחשבון האדמין")}</p>
          </div>
          <button onClick={onClose} className="h-9 w-9 rounded-full bg-white border border-line flex items-center justify-center text-ink-soft" aria-label={t("סגירה")}>
            ✕
          </button>
        </div>

        <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] p-4 sm:p-6">
          <div className="min-w-0 order-2 md:order-1">
            <div className="flex gap-5 border-b border-line mb-5 overflow-x-auto" role="tablist">
              {tabs.map((tb) => (
                <button
                  key={tb.id}
                  role="tab"
                  aria-selected={tab === tb.id}
                  onClick={() => setTab(tb.id)}
                  className={`pb-2.5 -mb-px text-sm whitespace-nowrap border-b-2 transition-colors ${tab === tb.id ? "border-amber-deep text-ink font-semibold" : "border-transparent text-ink-soft"}`}
                >
                  {tb.label}
                </button>
              ))}
            </div>

            {tab === "style" && (
              <div className="space-y-6">
                <section>
                  <p className={sectionTitle}>{t("פלטפורמה")}</p>
                  <p className={sectionHint}>{t("קובע את גודל הסרטון לפי הרשת שאליה הוא עולה.")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {REEL_PLATFORMS.map((p) => (
                      <button key={p.id} onClick={() => setSettings((s) => ({ ...s, platform: p.id as ReelPlatformId }))} className={chip(settings.platform === p.id)}>
                        {t(p.label)} <span className="opacity-60 font-data ms-0.5">{p.note}</span>
                      </button>
                    ))}
                  </div>
                </section>

                <section>
                  <p className={sectionTitle}>{t("תבנית")}</p>
                  <p className={sectionHint}>{t("התנועה, המעברים והטקסט של הסרטון. אפשר לשנות כל אחד מהם אחר כך.")}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {REEL_TEMPLATES.map((tp) => {
                      const active = settings.templateId === tp.id;
                      return (
                        <button
                          key={tp.id}
                          onClick={() => chooseTemplate(tp)}
                          className={`text-start rounded-md border p-3 transition-colors ${active ? "border-amber-deep bg-amber-bg" : "border-line bg-white hover:border-amber-deep"}`}
                        >
                          <span className="block text-sm font-semibold font-display">{t(tp.label)}</span>
                          <span className="block text-[11px] text-ink-soft leading-snug mt-1">{t(tp.description)}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section>
                  <p className={sectionTitle}>{t("תמונה שלא מתאימה לגודל הסרטון")}</p>
                  <p className={sectionHint}>{t("למשל תמונה לרוחב בסרטון לאורך.")}</p>
                  <div className="grid gap-1.5 sm:grid-cols-3">
                    {FIT_OPTIONS.map((o) => (
                      <button
                        key={o.id}
                        onClick={() => setSettings((s) => ({ ...s, fit: o.id }))}
                        className={`text-start rounded-md border p-2.5 transition-colors ${settings.fit === o.id ? "border-amber-deep bg-amber-bg" : "border-line bg-white hover:border-amber-deep"}`}
                      >
                        <span className="block text-xs font-semibold">{t(o.label)}</span>
                        <span className="block text-[11px] text-ink-soft leading-snug mt-0.5">{t(o.hint)}</span>
                      </button>
                    ))}
                  </div>
                </section>

                {settings.fit === "blur" && (
                  <section>
                    <p className={sectionTitle}>{t("עוצמת הטשטוש של הרקע")}</p>
                    <SliderNumber value={settings.blur} min={0} max={100} step={5} suffix="%" onChange={(v) => setSettings((s) => ({ ...s, blur: v }))} />
                  </section>
                )}
              </div>
            )}

            {tab === "photos" && (
              <section>
                <div className="flex items-center justify-between mb-1">
                  <p className={sectionTitle}>{t("תמונות ({n} מתוך {max})", { n: selected.length, max: MAX_PHOTOS })}</p>
                  <button onClick={() => setPicking((v) => !v)} className="text-xs font-semibold text-amber-deep underline underline-offset-2">
                    {picking ? t("סיום הבחירה") : t("בחירת תמונות")}
                  </button>
                </div>
                <p className={sectionHint}>{t("הסדר כאן הוא הסדר בסרטון. החצים מזיזים תמונה קדימה או אחורה.")}</p>
                <label className={`mb-3 flex items-center justify-between gap-3 rounded-md border border-dashed p-3 cursor-pointer transition-colors ${addingVideo ? "opacity-60" : "border-line bg-white hover:border-amber-deep"}`}>
                  <span>
                    <span className="block text-sm font-semibold">{addingVideo ? t("טוען את הווידאו…") : t("הוספת וידאו מהמכשיר")}</span>
                    <span className="block text-[11px] text-ink-soft">{t("קטע וידאו נכנס לרילס כמו תמונה, ומתנגן באורך שלו. הסאונד של הקטע לא נכנס, רק המוזיקה.")}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-amber-deep">▶ {t("וידאו")}</span>
                  <input type="file" accept="video/*,.mp4,.mov,.m4v,.webm" multiple className="hidden" disabled={addingVideo} onChange={(e) => { addVideos(e.target.files); e.target.value = ""; }} />
                </label>
                {videoError && <p className="text-xs text-rose -mt-1.5 mb-2">{videoError}</p>}
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {selected.map((id, i) => (
                    <div key={id} className="relative shrink-0 w-16">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={thumbOf.get(id)} alt="" className="h-20 w-16 object-cover rounded-sm" />
                      <span className="absolute top-0.5 start-0.5 min-w-4 h-4 px-1 rounded-sm bg-black/70 text-white text-[10px] flex items-center justify-center font-data">{i + 1}</span>
                      {isVideoId(id) && <span className="absolute bottom-6 start-0.5 rounded-sm bg-black/70 px-1 text-[10px] text-white">▶ {(videos.get(id)?.duration ?? 0).toFixed(1)}s</span>}
                      <button onClick={() => removeItem(id)} className="absolute top-0.5 end-0.5 h-4 w-4 rounded-sm bg-black/70 text-white text-[10px] flex items-center justify-center" aria-label={t("הסרה מהרילס")}>
                        ✕
                      </button>
                      <div className="flex justify-between mt-0.5">
                        <button onClick={() => move(id, -1)} disabled={i === 0} className="text-xs px-1 disabled:opacity-30" aria-label={t("הקדמה")}>
                          →
                        </button>
                        <button onClick={() => move(id, 1)} disabled={i === selected.length - 1} className="text-xs px-1 disabled:opacity-30" aria-label={t("דחייה")}>
                          ←
                        </button>
                      </div>
                    </div>
                  ))}
                  {selected.length === 0 && <p className="text-xs text-ink-soft py-6">{t("בחרו תמונות כדי להתחיל")}</p>}
                </div>
                {picking && (
                  <div className="mt-2 grid grid-cols-5 sm:grid-cols-8 gap-1 max-h-72 overflow-y-auto">
                    {photos.map((p) => {
                      const order = selected.indexOf(p.id);
                      return (
                        <button key={p.id} onClick={() => toggle(p.id)} className="relative aspect-square">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={p.thumbUrl} alt="" loading="lazy" decoding="async" className={`h-full w-full object-cover rounded-sm ${order >= 0 ? "ring-2 ring-amber-deep" : ""}`} />
                          {order >= 0 && (
                            <span className="absolute top-0.5 start-0.5 min-w-4 h-4 px-1 rounded-sm bg-amber-deep text-white text-[10px] flex items-center justify-center font-data">{order + 1}</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {tab === "transitions" && (
              <TransitionPicker
                tpl={tpl}
                settings={settings}
                images={readyImages}
                pool={pool}
                onToggle={toggleTransition}
                onTemplateMix={() => setSettings((s) => ({ ...s, transitions: [] }))}
                onAll={() => setSettings((s) => ({ ...s, transitions: REEL_TRANSITIONS.map((x) => x.id) }))}
                onShuffle={() => setSettings((s) => ({ ...s, seed: (s.seed % 9973) + 1 + Math.floor(Math.random() * 500) }))}
                sectionTitle={sectionTitle}
                sectionHint={sectionHint}
              />
            )}

            {tab === "music" && (
              <div className="space-y-5">
                <section>
                  <p className={sectionTitle}>{t("מוזיקה")}</p>
                  <p className={sectionHint}>{t("כל השירים בספרייה מקוריים ונכתבו בשביל המערכת: מותר להשתמש בהם בכל רשת, בלי תמלוגים ובלי קרדיט. החיתוכים בין התמונות נופלים על הקצב של השיר.")}</p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <button
                      onClick={() => setSettings((s) => ({ ...s, music: { ...s.music, source: "none" } }))}
                      className={`text-start rounded-md border p-2.5 ${settings.music.source === "none" ? "border-amber-deep bg-amber-bg" : "border-line bg-white hover:border-amber-deep"}`}
                    >
                      <span className="block text-sm font-semibold">{t("בלי מוזיקה")}</span>
                    </button>
                    {REEL_TRACKS.map((tr) => {
                      const on = settings.music.source === "library" && settings.music.trackId === tr.id;
                      return (
                        <button
                          key={tr.id}
                          onClick={() => {
                            setSettings((s) => ({ ...s, music: { ...s.music, source: "library", trackId: tr.id, offset: 0 } }));
                            setPlaying(true);
                            seek(0);
                          }}
                          className={`text-start rounded-md border p-2.5 transition-colors ${on ? "border-amber-deep bg-amber-bg" : "border-line bg-white hover:border-amber-deep"}`}
                        >
                          <span className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold font-display">{t(tr.label)}</span>
                            <span className="text-[10px] text-ink-soft font-data">{tr.bpm} BPM</span>
                          </span>
                          <span className="block text-[11px] text-ink-soft mt-0.5">{t(tr.mood)}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
                <section>
                  <p className={sectionTitle}>{t("מוזיקה משלי")}</p>
                  <p className={sectionHint}>{t("העלאת קובץ מהמכשיר (MP3, M4A, WAV). האחריות על זכויות היוצרים של שיר שמועלה היא של מי שמעלה אותו.")}</p>
                  <label className={`flex items-center justify-between gap-3 rounded-md border p-3 cursor-pointer ${settings.music.source === "upload" ? "border-amber-deep bg-amber-bg" : "border-line bg-white hover:border-amber-deep"}`}>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold truncate">{upload ? upload.file.name : t("בחירת קובץ מוזיקה")}</span>
                      {upload && settings.music.source !== "upload" && <span className="block text-[11px] text-ink-soft">{t("לחיצה כדי להשתמש בו שוב")}</span>}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-amber-deep">{upload ? t("החלפה") : t("העלאה")}</span>
                    <input
                      type="file"
                      accept="audio/*,.mp3,.m4a,.aac,.wav"
                      className="hidden"
                      onChange={(e) => chooseUpload(e.target.files?.[0])}
                      onClick={(e) => {
                        if (upload && settings.music.source !== "upload") {
                          e.preventDefault();
                          setSettings((s) => ({ ...s, music: { ...s.music, source: "upload" } }));
                        }
                      }}
                    />
                  </label>
                  {musicError && <p className="text-xs text-rose mt-1.5">{musicError}</p>}
                </section>
                {musicUrl && (
                  <section className="space-y-3">
                    <div>
                      <p className={sectionTitle}>{t("עוצמה")}</p>
                      <SliderNumber value={Math.round(settings.music.volume * 100)} min={0} max={100} step={5} suffix="%" onChange={(v) => setSettings((s) => ({ ...s, music: { ...s.music, volume: v / 100 } }))} />
                    </div>
                    <div>
                      <p className={sectionTitle}>{t("התחלה מתוך השיר")}</p>
                      <p className={sectionHint}>{t("מאיזו שנייה בשיר הסרטון מתחיל, למשל כדי לדלג על הפתיחה.")}</p>
                      <SliderNumber
                        value={Math.round(settings.music.offset * 10) / 10}
                        min={0}
                        max={Math.max(1, Math.floor((track?.seconds ?? musicBuffer?.duration ?? 60) - 1))}
                        step={track ? 60 / track.bpm : 0.5}
                        suffix="s"
                        onChange={(v) => {
                          // A library track starts on a beat, so the cuts stay on the music's beat.
                          const snapped = track ? Math.round(v / (60 / track.bpm)) * (60 / track.bpm) : v;
                          setSettings((s) => ({ ...s, music: { ...s.music, offset: Math.max(0, snapped) } }));
                          seek(0);
                        }}
                      />
                    </div>
                  </section>
                )}
              </div>
            )}

            {tab === "text" && (
              <div className="space-y-4">
                <label className="flex items-center justify-between rounded-md border border-line bg-white px-3 py-2.5">
                  <span className="text-sm font-semibold">{t("טקסט על הסרטון")}</span>
                  <input type="checkbox" checked={settings.text.show} onChange={(e) => setText({ show: e.target.checked })} style={{ accentColor: "var(--color-amber-deep)" }} className="h-4 w-4" />
                </label>
                {settings.text.show && (
                  <>
                    <div>
                      <p className={sectionTitle}>{t("מיקום הכותרת")}</p>
                      <div className="flex gap-1.5">
                        {(["top", "center", "bottom"] as ReelTextPosition[]).map((pos) => (
                          <button key={pos} onClick={() => setText({ position: pos })} className={chip(settings.text.position === pos)}>
                            {pos === "top" ? t("למעלה") : pos === "center" ? t("במרכז") : t("למטה")}
                          </button>
                        ))}
                      </div>
                    </div>
                    {LINES.map((line) => (
                      <LineEditor
                        key={line.id}
                        label={t(line.label)}
                        hint={t(line.hint)}
                        placeholder={t(line.placeholder)}
                        value={settings.text[line.id]}
                        onValue={(v) => setText({ [line.id]: v } as Partial<ReelSettings["text"]>)}
                        style={settings.text.styles[line.id]}
                        onStyle={(patch) => setLineStyle(line.id, patch)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          <div className="order-1 md:order-2 flex flex-col items-center gap-2.5 md:sticky md:top-0 self-start w-full md:w-auto">
            <canvas
              ref={previewRef}
              width={PREVIEW_W}
              height={previewH}
              className="bg-black rounded-sm max-w-full"
              style={{ width: "min(300px, 70vw)", height: "auto", maxHeight: "62vh", objectFit: "contain", boxShadow: "0 18px 40px -18px rgba(0,0,0,0.55), 0 0 0 1px rgba(0,0,0,0.06)" }}
            />
            <div className="flex items-center gap-2 text-xs text-ink-soft w-full max-w-[300px]">
              <button onClick={() => setPlaying((v) => !v)} className="h-8 w-8 rounded-full bg-white border border-line flex items-center justify-center" aria-label={playing ? t("עצירה") : t("ניגון")}>
                {playing ? "❚❚" : "▶"}
              </button>
              <div className="flex-1 h-[3px] bg-line overflow-hidden">
                <div className="h-full bg-amber-deep" style={{ width: `${timeline.total ? (Math.min(previewTime, timeline.total) / timeline.total) * 100 : 0}%` }} />
              </div>
              <span className="font-data">{timeline.total.toFixed(1)}s</span>
            </div>
            {readyImages.length < selected.length && <p className="text-[11px] text-ink-soft">{t("טוען תמונות…")}</p>}

            {exporting !== null ? (
              <div className="w-full max-w-[300px] rounded-md border border-line bg-white p-3 text-center">
                <div className="mx-auto mb-2 h-6 w-6 rounded-full border-2 border-line border-t-amber-deep animate-spin" />
                <p className="text-sm font-semibold">{t("יוצר את הסרטון… {pct}%", { pct: Math.round(exporting * 100) })}</p>
                <button onClick={() => (cancelRef.current = true)} className="mt-2 text-xs text-ink-soft underline">
                  {t("ביטול")}
                </button>
              </div>
            ) : (
              <button
                onClick={runExport}
                disabled={!fonts || readyImages.length === 0}
                className="w-full max-w-[300px] h-11 rounded-md bg-ink text-white text-sm font-semibold tracking-wide disabled:opacity-50"
              >
                {t("יצירת הסרטון")}
              </button>
            )}
            {error && <p className="text-xs text-rose max-w-[300px] text-center">{error}</p>}
            {result && (
              <div className="w-full max-w-[300px] space-y-2">
                <video src={result.url} controls playsInline className="w-full rounded-sm bg-black" style={{ maxHeight: "40vh" }} />
                <div className="flex gap-2">
                  <a href={result.url} download={fileName()} className="flex-1 h-10 rounded-md bg-white border border-line text-sm font-semibold flex items-center justify-center">
                    {t("הורדה")}
                  </a>
                  {canShareFile() && (
                    <button onClick={share} className="flex-1 h-10 rounded-md bg-amber-deep text-white text-sm font-semibold">
                      {t("שיתוף לרשתות")}
                    </button>
                  )}
                </div>
                {result.blob.type === "video/webm" && (
                  <p className="text-[11px] text-ink-soft">{t("הדפדפן הזה יצר קובץ WebM. לאינסטגרם ולטיקטוק עדיף ליצור את הסרטון בכרום או בספארי בטלפון, שמייצרים MP4.")}</p>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="border-t border-line px-4 sm:px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <p className="font-display text-[15px] font-semibold">{t("ציר הזמן")}</p>
              <p className="text-[11px] text-ink-soft">
                {t("גוררים את הקו הזהוב בין שתי תמונות כדי לשנות את הזמן שלהן, ואת הידית שעל התמונה כדי להזיז אותה.")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {durState ? (
                <button onClick={() => setDurState(null)} className="text-xs font-semibold text-amber-deep underline underline-offset-2">
                  {t("חלוקה אוטומטית")}
                </button>
              ) : (
                <span className="text-[11px] text-ink-soft">{bpm ? t("חלוקה אוטומטית לפי הקצב של השיר") : t("חלוקה אוטומטית שווה")}</span>
              )}
              <label className="flex items-center gap-1.5">
                <span className="text-xs font-semibold">{t("אורך הרילס")}</span>
                <select
                  value={settings.length ?? ""}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    setSettings((s) => ({ ...s, length: Number(e.target.value) as ReelLength }));
                    setDurState(null);
                    seek(0);
                  }}
                  className="h-9 rounded-md border border-line bg-white px-2 text-sm font-data"
                >
                  {settings.length == null && <option value="">{t("ללא אורך קבוע · {n} שניות", { n: timeline.total.toFixed(1) })}</option>}
                  {REEL_LENGTHS.map((l) => (
                    <option key={l} value={l}>
                      {t("{n} שניות", { n: l })}
                    </option>
                  ))}
                </select>
              </label>
              {settings.length != null && (
                <button
                  type="button"
                  onClick={() => {
                    // No fixed length: the times stay as they are now, and each photo's time can
                    // then grow or shrink on its own (the reel's length follows).
                    setDurState({ keys: segKeys.slice(0, timeline.segments), durs: timeline.durs.slice() });
                    setSettings((s) => ({ ...s, length: null }));
                  }}
                  className="h-9 px-3 rounded-md border border-line bg-white text-xs font-semibold text-ink-soft hover:border-amber-deep"
                  title={t("ביטול האורך הקבוע: כל תמונה מקבלת את הזמן שלה, והרילס באורך שמתקבל")}
                >
                  {t("ביטול")}
                </button>
              )}
            </div>
          </div>
          {timeline.dropped > 0 && (
            <p className="text-[11px] text-rose mb-2">
              {t("{n} תמונות לא נכנסות באורך הזה (לכל תמונה צריך לפחות חצי שנייה). אפשר להאריך את הרילס או להוריד תמונות.", { n: timeline.dropped })}
            </p>
          )}
          {readyImages.length > 0 ? (
            <ReelTimelineEditor
              clips={segKeys.slice(0, timeline.segments).map<TimelineClip>((key, k) => {
                const ids = readyIds.slice(k * perSeg, k * perSeg + perSeg);
                return { key, thumbs: ids.map((id) => thumbOf.get(id) ?? ""), video: ids.some(isVideoId) };
              })}
              durs={timeline.durs}
              starts={timeline.starts}
              total={timeline.total}
              tail={timeline.tail}
              time={previewTime}
              beat={bpm ? 60 / bpm : null}
              onSeek={seek}
              onDurs={(durs) => setDurState({ keys: segKeys.slice(0, timeline.segments), durs })}
              onReorder={reorderSegments}
              free={!timeline.fixed}
              snap={snap}
              onSnap={setSnap}
            />
          ) : (
            <p className="text-xs text-ink-soft py-4">{t("בחרו תמונות כדי לראות את ציר הזמן")}</p>
          )}
        </div>
      </div>
    </div>
  );
}

// A slider with a box for typing the exact value (every slider in the system takes both).
function SliderNumber({ value, min, max, step, suffix, onChange }: { value: number; min: number; max: number; step: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1" style={{ accentColor: "var(--color-amber-deep)" }} />
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        className="w-16 h-8 rounded-md border border-line bg-white px-1.5 text-xs font-data text-center"
      />
      <span className="text-[11px] text-ink-soft w-3">{suffix}</span>
    </div>
  );
}

// The transitions by category, each a small live loop of the move between two of the chosen
// photos (like CapCut's picker). Tapping one adds it to, or takes it out of, the random mix.
function TransitionPicker({
  tpl,
  settings,
  images,
  pool,
  onToggle,
  onTemplateMix,
  onAll,
  onShuffle,
  sectionTitle,
  sectionHint,
}: {
  tpl: ReelTemplate;
  settings: ReelSettings;
  images: ReelImage[];
  pool: ReelTransition[];
  onToggle: (id: ReelTransition) => void;
  onTemplateMix: () => void;
  onAll: () => void;
  onShuffle: () => void;
  sectionTitle: string;
  sectionHint: string;
}) {
  const t = useT();
  const [category, setCategory] = useState<ReelTransitionCategory>("basic");
  const canvases = useRef(new Map<ReelTransition, HTMLCanvasElement>());
  const shown = REEL_TRANSITIONS.filter((x) => x.category === category);
  const sample = useMemo(() => images.slice(0, 4), [images]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    let last = 0;
    const loop = (now: number) => {
      // ~30 frames a second is plenty for thumbnails.
      if (now - last > 33) {
        last = now;
        const q = (((now - start) / 1000) % 2.2) / 2.2;
        for (const [id, c] of canvases.current) {
          const ctx = c.getContext("2d");
          if (ctx) drawTransitionPreview(ctx, c.width, c.height, id, q, tpl, settings, sample);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tpl, settings, sample, category]);

  const usingTemplate = settings.transitions.length === 0;

  return (
    <section>
      <p className={sectionTitle}>{t("מעברים")}</p>
      <p className={sectionHint}>{t("המעברים המסומנים מתחלפים באקראי בין התמונות, בלי אותו מעבר פעמיים ברצף. לחיצה מוסיפה או מורידה מעבר.")}</p>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <button onClick={onTemplateMix} className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${usingTemplate ? "bg-ink text-white border-ink" : "bg-white border-line"}`}>
          {t("המעברים של התבנית")}
        </button>
        <button onClick={onAll} className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${pool.length === REEL_TRANSITIONS.length ? "bg-ink text-white border-ink" : "bg-white border-line"}`}>
          {t("כל המעברים")}
        </button>
        <button onClick={onShuffle} className="px-3 py-1.5 rounded-md text-xs font-semibold border bg-white border-line">
          ⤮ {t("ערבוב מחדש")}
        </button>
        <span className="text-[11px] text-ink-soft ms-auto">{t("{n} מעברים בשימוש", { n: pool.length })}</span>
      </div>
      <div className="flex gap-4 border-b border-line mb-3 overflow-x-auto">
        {REEL_TRANSITION_CATEGORIES.map((c) => {
          const count = REEL_TRANSITIONS.filter((x) => x.category === c.id && pool.includes(x.id)).length;
          return (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`pb-2 -mb-px text-xs whitespace-nowrap border-b-2 ${category === c.id ? "border-amber-deep text-ink font-semibold" : "border-transparent text-ink-soft"}`}
            >
              {t(c.label)}
              {count > 0 && <span className="ms-1 text-amber-deep font-data">{count}</span>}
            </button>
          );
        })}
      </div>
      {sample.length < 2 && <p className="text-[11px] text-ink-soft mb-2">{t("בחרו לפחות שתי תמונות כדי לראות את המעברים.")}</p>}
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
        {shown.map((x) => {
          const on = pool.includes(x.id);
          return (
            <button key={x.id} onClick={() => onToggle(x.id)} className="text-center group">
              <span className={`relative block overflow-hidden rounded-sm transition-shadow ${on ? "ring-2 ring-amber-deep" : "ring-1 ring-line"}`}>
                <canvas
                  ref={(el) => {
                    if (el) canvases.current.set(x.id, el);
                    else canvases.current.delete(x.id);
                  }}
                  width={120}
                  height={150}
                  className="block w-full h-auto bg-black"
                />
                {on && (
                  <span className="absolute top-1 end-1 h-5 w-5 rounded-full bg-amber-deep text-white text-[11px] flex items-center justify-center shadow">✓</span>
                )}
              </span>
              <span className={`block text-[11px] mt-1 ${on ? "text-ink font-semibold" : "text-ink-soft"}`}>{t(x.label)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// One line of text: what it's for, its words, and its look (font, size, rotation, colour). Every
// slider also takes a typed value.
function LineEditor({
  label,
  hint,
  placeholder,
  value,
  onValue,
  style,
  onStyle,
}: {
  label: string;
  hint: string;
  placeholder: string;
  value: string;
  onValue: (v: string) => void;
  style: ReelLineStyle;
  onStyle: (patch: Partial<ReelLineStyle>) => void;
}) {
  const t = useT();
  const field = "h-9 rounded-md border border-line bg-white px-2 text-sm";
  const numberBox = (val: number, min: number, max: number, onChange: (v: number) => void, suffix: string) => (
    <span className="flex items-center gap-1">
      <input
        type="number"
        min={min}
        max={max}
        value={val}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.max(min, Math.min(max, v)));
        }}
        className="w-16 h-8 rounded-md border border-line bg-white px-1.5 text-xs font-data text-center"
      />
      <span className="text-[11px] text-ink-soft w-3">{suffix}</span>
    </span>
  );
  return (
    <div className="rounded-md border border-line bg-white p-3.5 space-y-2.5">
      <div>
        <p className="font-display text-sm font-semibold">{label}</p>
        <p className="text-[11px] text-ink-soft leading-relaxed">{hint}</p>
      </div>
      <input value={value} onChange={(e) => onValue(e.target.value)} placeholder={placeholder} className={`w-full ${field}`} />
      <div className="grid gap-2 sm:grid-cols-2">
        <label className="block">
          <span className="text-[11px] text-ink-soft">{t("גופן")}</span>
          <select value={style.font} onChange={(e) => onStyle({ font: e.target.value })} className={`w-full mt-0.5 ${field}`}>
            <option value="">{t("לפי התבנית")}</option>
            <optgroup label={t("עברית")}>
              {ALBUM_FONTS.filter((f) => f.category === "hebrew").map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </optgroup>
            <optgroup label={t("אנגלית בלבד")}>
              {ALBUM_FONTS.filter((f) => f.category === "latin").map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <div>
          <span className="text-[11px] text-ink-soft">{t("צבע")}</span>
          <div className="flex items-center gap-1.5 mt-1">
            {TEXT_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => onStyle({ color: c })}
                className="h-6 w-6 rounded-full shrink-0"
                style={{ background: c, boxShadow: style.color.toLowerCase() === c ? "0 0 0 2px #fff, 0 0 0 4px var(--color-amber-deep)" : "0 0 0 1px var(--color-line)" }}
                aria-label={c}
              />
            ))}
            <input type="color" value={style.color} onChange={(e) => onStyle({ color: e.target.value })} className="h-7 w-8 shrink-0 cursor-pointer bg-transparent" aria-label={t("צבע אחר")} />
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-ink-soft w-12 shrink-0">{t("גודל")}</span>
        <input type="range" min={40} max={250} step={5} value={style.size} onChange={(e) => onStyle({ size: Number(e.target.value) })} className="flex-1" style={{ accentColor: "var(--color-amber-deep)" }} />
        {numberBox(style.size, 40, 250, (v) => onStyle({ size: v }), "%")}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-ink-soft w-12 shrink-0">{t("סיבוב")}</span>
        <input type="range" min={-45} max={45} step={1} value={style.rotate} onChange={(e) => onStyle({ rotate: Number(e.target.value) })} className="flex-1" style={{ accentColor: "var(--color-amber-deep)" }} />
        {numberBox(style.rotate, -45, 45, (v) => onStyle({ rotate: v }), "°")}
      </div>
    </div>
  );
}
