"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/i18n/client";
import {
  REEL_BEAT_FX,
  REEL_LENGTHS,
  REEL_PLATFORMS,
  REEL_TEMPLATES,
  REEL_TRANSITIONS,
  REEL_TRANSITION_CATEGORIES,
  defaultLineStyles,
  platformById,
  templateById,
  type ReelBeatFx,
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
import { MIN_SEGMENT, activeMedia, drawReelFrame, drawTransitionPreview, loadReelImage, reelFonts, reelTimeline, transitionPool, type ReelFonts, type ReelImage, type ReelTempo } from "@/lib/reels/render";
import { drawFxPreview } from "@/lib/reels/beatFx";
import { detectTempoFromBuffer, type DetectedTempo } from "@/lib/reels/tempo";
import { createClient } from "@/lib/supabase/client";
import { REEL_TRACKS, trackById } from "@/lib/reels/music";
import { PreviewMusic, decodeTrack, musicGain, renderSoundtrack } from "@/lib/reels/audio";
import ReelTimelineEditor, { type TimelineClip } from "@/components/ReelTimelineEditor";
import { ALBUM_FONTS, ALBUM_FONT_CLASS_NAMES } from "@/lib/albumFonts";
import { exportReelMp4, ReelCancelledError, ReelUnsupportedError } from "@/lib/reels/encode";
import { FIT_MIN_VISIBLE } from "@/lib/reels/scene";
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
// Video clips (owner, 2026-10-07 from the device; 2026-10-15 also the gallery's own videos): a
// few, a device file up to this size (a gallery video is already within its plan's limit).
const MAX_VIDEOS = 10;
const MAX_VIDEO_BYTES = 500 * 1024 * 1024;
// "video:<n>" a clip from the device, "video:g:<id>" one of the gallery's videos (gallery_videos).
const isVideoId = (id: string) => id.startsWith("video:");
const galleryClipId = (videoId: string) => `video:g:${videoId}`;

type GalleryVideo = { id: string; name: string; size: number | null };
type ClipSource = { kind: "file"; file: File } | { kind: "gallery"; videoId: string };
type ClipVideo = { source: ClipSource; url: string; el: HTMLVideoElement; duration: number; thumb: string };
// The photographer's in-point (seconds into the clip), how it fits the reel's shape (null: like the
// photos; clips fill the screen by default, owner 2026-10-15: "crop them to the format"), and where
// a cropped clip is cut (0-1).
type ClipOptions = { start: number; focus: number; fit: ReelFit | null };
const CLIP_DEFAULTS: ClipOptions = { start: 0, focus: 0.5, fit: "cover" };

// A gallery video's playback address: a signed link to the file in storage, good for 30 minutes
// (the storage allows reading it from the page, so frames can be drawn and exported).
async function galleryVideoUrl(galleryId: string, videoId: string): Promise<string> {
  const res = await fetch(`/api/galleries/${galleryId}/videos/${videoId}/url`);
  const data = (await res.json().catch(() => ({}))) as { url?: string };
  if (!res.ok || !data.url) throw new Error("video-url");
  return data.url;
}

// Loads a clip: its first frames, size, length and a small thumbnail. A gallery video streams from
// storage (only the parts that play are downloaded, so a long film costs little).
async function loadClipVideo(src: string, remote: boolean): Promise<{ el: HTMLVideoElement; duration: number; thumb: string }> {
  const el = document.createElement("video");
  el.muted = true;
  el.playsInline = true;
  el.preload = "auto";
  if (remote) el.crossOrigin = "anonymous";
  el.src = src;
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
  let thumb = "";
  try {
    const c = document.createElement("canvas");
    c.width = 200;
    c.height = Math.max(1, Math.round((200 * el.videoHeight) / el.videoWidth));
    c.getContext("2d")!.drawImage(el, 0, 0, c.width, c.height);
    thumb = c.toDataURL("image/jpeg", 0.75);
  } catch {
    // No thumbnail; the clip still plays.
  }
  el.onseeked = null;
  el.currentTime = 0;
  return { el, duration: Number.isFinite(duration) ? duration : 5, thumb };
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
    fx: null,
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
  // The song the photographer will add in Instagram or TikTok (music source "sync").
  const [syncSong, setSyncSong] = useState<{ file: File; url: string } | null>(null);
  const [musicError, setMusicError] = useState<string | null>(null);
  // The decoded music, with the track or file it belongs to.
  const [musicBuf, setMusicBuf] = useState<{ key: string; buffer: AudioBuffer } | null>(null);
  // The tempo found in an uploaded song (null: no steady beat), per file.
  const [uploadTempo, setUploadTempo] = useState<{ key: string; tempo: DetectedTempo | null } | null>(null);
  const playerRef = useRef<PreviewMusic | null>(null);
  // Set whenever the music has to (re)start at the preview's current time: a seek, a new track,
  // a new start point, play after pause.
  const musicKeyRef = useRef("");
  const [videos, setVideos] = useState<Map<string, ClipVideo>>(new Map());
  const [clipOpts, setClipOpts] = useState<Map<string, ClipOptions>>(new Map());
  const [editingClip, setEditingClip] = useState<string | null>(null);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [addingVideo, setAddingVideo] = useState(false);
  // The gallery's own videos (gallery_videos), and the ones loading right now.
  const [galleryVideos, setGalleryVideos] = useState<GalleryVideo[]>([]);
  const [loadingClips, setLoadingClips] = useState<Set<string>>(new Set());
  // Timeline snapping (magnet), on unless the photographer turns it off.
  const [snap, setSnap] = useState(true);
  const seekCountRef = useRef(0);
  const [fonts, setFonts] = useState<ReelFonts | null>(null);
  const [playing, setPlaying] = useState(true);
  const [exporting, setExporting] = useState<number | null>(null);
  // `silent`: made for a song added in the app, with the second the song starts at there.
  const [result, setResult] = useState<{ url: string; blob: Blob; silent: { offset: number } | null } | null>(null);
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
  // A clip plays from its in-point, for what's left of it after that, cut where the photographer set.
  const readyImages = useMemo(
    () =>
      readyIds.map((id) => {
        const img = images.get(id)!;
        const clip = videos.get(id);
        const o = clipOpts.get(id);
        if (!img.video || !clip || !o) return img;
        const start = Math.max(0, Math.min(o.start, clip.duration - MIN_SEGMENT));
        return { ...img, video: { start, duration: Math.max(MIN_SEGMENT, clip.duration - start) }, focus: o.focus, fit: o.fit ?? undefined };
      }),
    [readyIds, images, videos, clipOpts]
  );
  const track = settings.music.source === "library" ? trackById(settings.music.trackId) : null;
  // A song file from the device: the photographer's own music, or the one for the app.
  const ownSong = settings.music.source === "upload" ? upload : settings.music.source === "sync" ? syncSong : null;
  const syncMode = settings.music.source === "sync";
  const musicUrl = track ? track.url : ownSong?.url ?? null;
  const musicKey = ownSong ? `file:${ownSong.file.name}:${ownSong.file.size}` : musicUrl;
  const musicBuffer = musicBuf && musicBuf.key === musicKey ? musicBuf.buffer : null;
  const detected = ownSong && uploadTempo && uploadTempo.key === musicKey ? uploadTempo.tempo : null;
  // The music's tempo: a library track's is known (and it starts on a beat); an uploaded song's is
  // detected. The phase is where its first beat falls in the reel, after the start point in the song.
  const tempo = useMemo<ReelTempo | null>(() => {
    const at = (bpmValue: number, firstBeat: number): ReelTempo => {
      const beatLen = 60 / bpmValue;
      let phase = (((firstBeat - settings.music.offset) % beatLen) + beatLen) % beatLen;
      // Within a few hundredths of a second of a beat is on it (no one hears that).
      if (phase < 0.03 || beatLen - phase < 0.03) phase = 0;
      return { bpm: bpmValue, phase };
    };
    if (track) return at(track.bpm, 0);
    if (detected) return at(detected.bpm, detected.firstBeat);
    return null;
  }, [track, detected, settings.music.offset]);
  const bpm = tempo?.bpm ?? null;
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
  const timeline = useMemo(() => reelTimeline(readyImages.length, tpl, settings, custom, tempo, segVideo), [readyImages.length, tpl, settings, custom, tempo, segVideo]);
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

  // The gallery's own videos, to put in the reel like photos (RLS: only the photographer's own).
  useEffect(() => {
    let alive = true;
    createClient()
      .from("gallery_videos")
      .select("id, original_filename, file_size_bytes")
      .eq("gallery_id", galleryId)
      .order("sort_order", { ascending: true })
      .returns<{ id: string; original_filename: string | null; file_size_bytes: number | null }[]>()
      .then(({ data }) => {
        if (alive) setGalleryVideos((data ?? []).map((v) => ({ id: v.id, name: v.original_filename || t("וידאו"), size: v.file_size_bytes })));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryId]);

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
  useEffect(() => {
    if (!musicUrl || !musicKey) return;
    let alive = true;
    decodeTrack(musicKey, async () => (ownSong ? ownSong.file.arrayBuffer() : (await fetch(musicUrl)).arrayBuffer()))
      .then((buffer) => alive && setMusicBuf({ key: musicKey, buffer }))
      .catch(() => alive && setMusicError(t("לא הצלחנו לקרוא את קובץ המוזיקה.")));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [musicKey]);

  // An uploaded song's tempo, found once per file (owner, 2026-10-15: the beat templates work with
  // the photographer's own music too). The reel then starts on the song's first beat.
  useEffect(() => {
    if (!ownSong || !musicBuffer || !musicKey || uploadTempo?.key === musicKey) return;
    const timer = setTimeout(() => {
      let found: DetectedTempo | null = null;
      try {
        found = detectTempoFromBuffer(musicBuffer);
      } catch {
        found = null;
      }
      setUploadTempo({ key: musicKey, tempo: found });
      // A song for the app keeps its start (0:00 is the one point the photographer can hit exactly
      // there); the cuts move onto its beat instead (the timeline's phase).
      if (settings.music.source === "sync") return;
      // A first beat right at the start (or a hair before the next one) needs no skip.
      const firstBeat = found ? found.firstBeat : 0;
      if (found && firstBeat > 0.03 && 60 / found.bpm - firstBeat > 0.03) {
        setSettings((s) => (s.music.source === "upload" && s.music.offset === 0 ? { ...s, music: { ...s.music, offset: firstBeat } } : s));
      }
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.music.source, musicBuffer, musicKey, uploadTempo]);
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
        const want = img.video.start + Math.min(local, Math.max(0, img.video.duration - 0.05));
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
      // A beat template comes with the track it's made for, when the reel has no music yet.
      const music = tp.beat && s.music.source === "none" ? { ...s.music, source: "library" as const, trackId: tp.beat.track, offset: 0 } : s.music;
      return { ...s, templateId: tp.id, transitions: [], fx: null, music, text: { ...s.text, styles } };
    });
    if (tp.beat) setPlaying(true);
    seek(0);
  };
  // The effects on now (the template's own until the photographer picks), and a tap on one.
  const fxOn = useMemo<ReelBeatFx[]>(() => settings.fx ?? (tpl.fx ? Array.from(new Set([...tpl.fx.cut, ...(tpl.fx.pulse ?? []), ...(tpl.fx.accent ?? [])])) : []), [settings.fx, tpl]);
  const toggleFx = (id: ReelBeatFx) => setSettings((s) => ({ ...s, fx: fxOn.includes(id) ? fxOn.filter((x) => x !== id) : [...fxOn, id] }));
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
  // The song for Instagram or TikTok: same checks, its own slot, and it starts at 0:00.
  const chooseSyncSong = (file: File | undefined) => {
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
    if (syncSong) URL.revokeObjectURL(syncSong.url);
    setSyncSong({ file, url: URL.createObjectURL(file) });
    setSettings((s) => ({ ...s, music: { ...s.music, source: "sync", offset: 0 } }));
    setPlaying(true);
    seek(0);
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
        const url = URL.createObjectURL(file);
        try {
          const v = await loadClipVideo(url, false);
          const id = `video:${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          addClip(id, { ...v, source: { kind: "file", file }, url });
        } catch {
          URL.revokeObjectURL(url);
          setVideoError(t("הדפדפן לא הצליח לפתוח את קטע הווידאו הזה."));
        }
      }
    } finally {
      setAddingVideo(false);
    }
  };
  // A loaded clip joins the reel (at the end, like a picked photo).
  const addClip = (id: string, clip: ClipVideo) => {
    setVideos((prev) => new Map(prev).set(id, clip));
    setImages((prev) => new Map(prev).set(id, { el: clip.el, width: clip.el.videoWidth, height: clip.el.videoHeight, live: true, video: { duration: clip.duration, start: 0 } }));
    setClipOpts((prev) => new Map(prev).set(id, CLIP_DEFAULTS));
    setSelected((prev) => (prev.length >= MAX_PHOTOS || prev.includes(id) ? prev : [...prev, id]));
  };
  // One of the gallery's videos in or out of the reel. It streams from storage; a signed link that
  // ran out (after 30 minutes) is renewed when the player hits it.
  const toggleGalleryVideo = async (gv: GalleryVideo) => {
    const id = galleryClipId(gv.id);
    setVideoError(null);
    if (selected.includes(id)) {
      removeItem(id);
      return;
    }
    if (loadingClips.has(gv.id)) return;
    if (videos.size >= MAX_VIDEOS) {
      setVideoError(t("אפשר להוסיף עד {n} קטעי וידאו.", { n: MAX_VIDEOS }));
      return;
    }
    setLoadingClips((prev) => new Set(prev).add(gv.id));
    try {
      const url = await galleryVideoUrl(galleryId, gv.id);
      const v = await loadClipVideo(url, true);
      let renewedAt = 0;
      v.el.addEventListener("error", () => {
        if (Date.now() - renewedAt < 60_000) return;
        renewedAt = Date.now();
        const at = v.el.currentTime;
        galleryVideoUrl(galleryId, gv.id)
          .then((fresh) => {
            v.el.src = fresh;
            v.el.currentTime = at;
          })
          .catch(() => {});
      });
      addClip(id, { ...v, source: { kind: "gallery", videoId: gv.id }, url });
    } catch {
      setVideoError(t("לא הצלחנו לפתוח את הסרטון מהגלריה. ייתכן שהדפדפן לא תומך בפורמט שלו."));
    } finally {
      setLoadingClips((prev) => {
        const next = new Set(prev);
        next.delete(gv.id);
        return next;
      });
    }
  };
  const removeItem = (id: string) => {
    setSelected((prev) => prev.filter((x) => x !== id));
    if (editingClip === id) setEditingClip(null);
    if (isVideoId(id)) {
      const v = videos.get(id);
      if (v) {
        v.el.pause();
        if (v.source.kind === "file") URL.revokeObjectURL(v.url);
        else v.el.removeAttribute("src");
      }
      setVideos((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
      setImages((prev) => {
        const next = new Map(prev);
        next.delete(id);
        return next;
      });
    }
  };
  // Where a clip starts in the reel (to show it in the preview while it's being edited).
  const clipTime = (id: string) => {
    const seg = Math.floor(readyIds.indexOf(id) / perSeg);
    return seg >= 0 && seg < timeline.segments ? timeline.starts[seg] : null;
  };
  const setClip = (id: string, patch: Partial<ClipOptions>) => {
    setClipOpts((prev) => new Map(prev).set(id, { ...(prev.get(id) ?? CLIP_DEFAULTS), ...patch }));
    const at = clipTime(id);
    if (at !== null) seek(at + 0.01);
  };
  // Which way a clip is cut to fit the reel's shape ("x": its sides, "y": top and bottom), or null
  // when it's shown whole (the same rule as drawPhoto in scene.ts).
  const clipCropAxis = (el: HTMLVideoElement, fit: ReelFit): "x" | "y" | null => {
    if (tpl.frame === "framed" || !el.videoWidth || !el.videoHeight) return null;
    const rw = platform.width;
    const rh = tpl.frame === "split" ? platform.height / 2 : platform.height;
    const cover = Math.max(rw / el.videoWidth, rh / el.videoHeight);
    const visible = Math.min(rw / el.videoWidth, rh / el.videoHeight) / cover;
    if (visible > 0.995 || (fit !== "cover" && visible < FIT_MIN_VISIBLE)) return null;
    return el.videoWidth / el.videoHeight > rw / rh ? "x" : "y";
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
      // A song for the app stays out of the file: the photographer adds it there.
      if (musicUrl && musicKey && !syncMode) {
        try {
          const buffer = await decodeTrack(musicKey, async () => (ownSong ? ownSong.file.arrayBuffer() : (await fetch(musicUrl)).arrayBuffer()));
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
        const { Input, BlobSource, UrlSource, ALL_FORMATS, CanvasSink } = await import("mediabunny");
        const openTrack = (source: InstanceType<typeof BlobSource> | InstanceType<typeof UrlSource>) => new Input({ source, formats: ALL_FORMATS }).getPrimaryVideoTrack();
        const frameCount = Math.max(1, Math.round(timeline.total * 30));
        for (const i of clipIdx) {
          const dv = videos.get(readyIds[i]);
          const img = readyImages[i];
          if (!dv || !img.video) continue;
          let trackIn: Awaited<ReturnType<typeof openTrack>> = null;
          try {
            if (dv.source.kind === "file") trackIn = await openTrack(new BlobSource(dv.source.file));
            else {
              // A gallery video is read from storage in parts (only what the reel uses); a browser
              // that won't read parts of it gets the whole file.
              const url = await galleryVideoUrl(galleryId, dv.source.videoId);
              try {
                trackIn = await openTrack(new UrlSource(url, { getRetryDelay: (n) => (n < 3 ? 1 : null) }));
              } catch {
                trackIn = await openTrack(new BlobSource(await (await fetch(url)).blob()));
              }
            }
          } catch {
            trackIn = null;
          }
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
            stamps.push(first + img.video.start + Math.min(hit.local, Math.max(0, img.video.duration - 0.04)));
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
          // The same clip (its in-point, fit and crop), drawn from the decoded frames.
          exportImages[i] = { ...img, el: holder, width: w, height: h };
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
      setResult({ url: URL.createObjectURL(blob), blob, silent: syncMode ? { offset: settings.music.offset } : null });
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
                    {REEL_TEMPLATES.filter((tp) => !tp.beat).map((tp) => (
                      <TemplateCard key={tp.id} tp={tp} active={settings.templateId === tp.id} onPick={() => chooseTemplate(tp)} />
                    ))}
                  </div>
                </section>

                <section>
                  <p className={sectionTitle}>{t("על הביט")}</p>
                  <p className={sectionHint}>
                    {t("כמו בקאפקאט: כל חיתוך נופל בדיוק על הביט של השיר, עם אפקט שמכה עליו. כל תבנית באה עם שיר מהספרייה, ואפשר להחליף אותו או להעלות שיר משלכם.")}
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {REEL_TEMPLATES.filter((tp) => tp.beat).map((tp) => (
                      <TemplateCard key={tp.id} tp={tp} active={settings.templateId === tp.id} onPick={() => chooseTemplate(tp)} />
                    ))}
                  </div>
                  {tpl.beat && !tempo && (
                    <p className="text-[11px] text-rose mt-2">
                      {ownSong && uploadTempo?.key === musicKey
                        ? t("לא זיהינו קצב קבוע בשיר שהעליתם, ולכן החיתוכים לא נופלים על הביט. אפשר לבחור שיר מהספרייה.")
                        : t("כדי שהחיתוכים ייפלו על הביט, בחרו שיר בלשונית המוזיקה.")}
                    </p>
                  )}
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
                {galleryVideos.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-semibold mb-0.5">{t("סרטונים מהגלריה")}</p>
                    <p className="text-[11px] text-ink-soft mb-1.5">{t("לחיצה מוסיפה את הסרטון לרילס. אחרי שהוא נוסף, ✂ על התמונה הקטנה שלו בוחר מאיזו שנייה הוא מתחיל ואיזה חלק מהפריים נשאר.")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {galleryVideos.map((gv) => {
                        const on = selected.includes(galleryClipId(gv.id));
                        const busy = loadingClips.has(gv.id);
                        return (
                          <button
                            key={gv.id}
                            onClick={() => toggleGalleryVideo(gv)}
                            disabled={busy}
                            className={`flex items-center gap-2 max-w-full rounded-md border px-2.5 py-1.5 text-xs transition-colors ${on ? "border-amber-deep bg-amber-bg font-semibold" : "border-line bg-white hover:border-amber-deep"} ${busy ? "opacity-60" : ""}`}
                          >
                            <span className="shrink-0 text-amber-deep">{busy ? <span className="inline-block h-3 w-3 rounded-full border-2 border-line border-t-amber-deep animate-spin align-middle" /> : on ? "✓" : "▶"}</span>
                            <span className="truncate max-w-[180px]" dir="auto">{gv.name}</span>
                            {gv.size ? <span className="shrink-0 text-[10px] text-ink-soft font-data">{Math.max(1, Math.round(gv.size / 1048576))}MB</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
                {videoError && <p className="text-xs text-rose -mt-1.5 mb-2">{videoError}</p>}
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {selected.map((id, i) => (
                    <div key={id} className="relative shrink-0 w-16">
                      {thumbOf.get(id) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbOf.get(id)} alt="" className={`h-20 w-16 object-cover rounded-sm ${editingClip === id ? "ring-2 ring-amber-deep" : ""}`} />
                      ) : (
                        <span className={`flex h-20 w-16 items-center justify-center rounded-sm bg-ink text-white/80 text-lg ${editingClip === id ? "ring-2 ring-amber-deep" : ""}`}>▶</span>
                      )}
                      <span className="absolute top-0.5 start-0.5 min-w-4 h-4 px-1 rounded-sm bg-black/70 text-white text-[10px] flex items-center justify-center font-data">{i + 1}</span>
                      {isVideoId(id) && <span className="absolute bottom-6 start-0.5 rounded-sm bg-black/70 px-1 text-[10px] text-white">▶ {(videos.get(id)?.duration ?? 0).toFixed(1)}s</span>}
                      {isVideoId(id) && (
                        <button
                          onClick={() => setEditingClip((cur) => (cur === id ? null : id))}
                          className={`absolute top-5 end-0.5 h-4 w-4 rounded-sm text-[10px] flex items-center justify-center ${editingClip === id ? "bg-amber-deep text-white" : "bg-black/70 text-white"}`}
                          aria-label={t("עריכת קטע הווידאו")}
                        >
                          ✂
                        </button>
                      )}
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
                {editingClip && videos.has(editingClip) && selected.includes(editingClip) && (
                  <ClipEditor
                    clip={videos.get(editingClip)!}
                    options={clipOpts.get(editingClip) ?? CLIP_DEFAULTS}
                    reelFit={settings.fit}
                    framed={tpl.frame === "framed"}
                    cropAxis={clipCropAxis(videos.get(editingClip)!.el, clipOpts.get(editingClip)?.fit ?? settings.fit)}
                    onChange={(patch) => setClip(editingClip, patch)}
                    onDone={() => setEditingClip(null)}
                  />
                )}
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
            {tab === "transitions" && (
              <FxPicker
                tpl={tpl}
                settings={settings}
                images={readyImages}
                on={fxOn}
                onToggle={toggleFx}
                onTemplate={() => setSettings((s) => ({ ...s, fx: null }))}
                onNone={() => setSettings((s) => ({ ...s, fx: [] }))}
                onBeat={!!bpm}
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
                  <p className={sectionTitle}>{t("שיר שאוסיף באינסטגרם או בטיקטוק")}</p>
                  <p className={sectionHint}>
                    {t("לשירים טרנדיים. מעלים כאן את קובץ השיר רק כדי שהחיתוכים ייפלו על הביט שלו, ושומעים אותו בתצוגה. הקובץ לא עולה לשרת, והסרטון ייצא בלי מוזיקה. את השיר מוסיפים באפליקציה, מאותה שנייה.")}
                  </p>
                  <label className={`flex items-center justify-between gap-3 rounded-md border p-3 cursor-pointer ${syncMode ? "border-amber-deep bg-amber-bg" : "border-line bg-white hover:border-amber-deep"}`}>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold truncate" dir="auto">{syncSong ? syncSong.file.name : t("בחירת קובץ השיר")}</span>
                      {syncSong && !syncMode && <span className="block text-[11px] text-ink-soft">{t("לחיצה כדי להשתמש בו שוב")}</span>}
                    </span>
                    <span className="shrink-0 text-xs font-semibold text-amber-deep">{syncSong ? t("החלפה") : t("העלאה")}</span>
                    <input
                      type="file"
                      accept="audio/*,.mp3,.m4a,.aac,.wav"
                      className="hidden"
                      onChange={(e) => {
                        chooseSyncSong(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                      onClick={(e) => {
                        if (syncSong && !syncMode) {
                          e.preventDefault();
                          setSettings((s) => ({ ...s, music: { ...s.music, source: "sync", offset: 0 } }));
                          seek(0);
                        }
                      }}
                    />
                  </label>
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
                </section>
                {musicError && <p className="text-xs text-rose -mt-3">{musicError}</p>}
                {ownSong && musicBuffer && (
                  <p className="text-[11px] text-ink-soft -mt-3">
                    {uploadTempo?.key !== musicKey
                      ? t("מזהה את הקצב של השיר…")
                      : detected
                        ? t("זיהינו קצב של {bpm} BPM: החיתוכים בין התמונות נופלים על הביט של השיר.", { bpm: Math.round(detected.bpm) })
                        : t("לא זיהינו קצב קבוע בשיר הזה, ולכן החיתוכים לא נופלים על הביט.")}
                  </p>
                )}
                {musicUrl && (
                  <section className="space-y-3">
                    {!syncMode && (
                      <div>
                        <p className={sectionTitle}>{t("עוצמה")}</p>
                        <SliderNumber value={Math.round(settings.music.volume * 100)} min={0} max={100} step={5} suffix="%" onChange={(v) => setSettings((s) => ({ ...s, music: { ...s.music, volume: v / 100 } }))} />
                      </div>
                    )}
                    <div>
                      <p className={sectionTitle}>{t("התחלה מתוך השיר")}</p>
                      <p className={sectionHint}>
                        {syncMode
                          ? t("באפליקציה תבחרו את אותה שנייה. הכי מדויק להתחיל מ-0:00: שם אי אפשר לפספס, ואינסטגרם וטיקטוק בוחרים לבד קטע מאמצע השיר, אז צריך לגרור להתחלה.")
                          : t("מאיזו שנייה בשיר הסרטון מתחיל, למשל כדי לדלג על הפתיחה.")}
                      </p>
                      {syncMode && (
                        <p className="text-sm font-semibold mb-1.5">
                          {t("באפליקציה, השיר מתחיל ב-")}
                          <span className="font-data" dir="ltr">
                            {clockTime(settings.music.offset)}
                          </span>
                        </p>
                      )}
                      <SliderNumber
                        value={Math.round(settings.music.offset * 10) / 10}
                        min={0}
                        max={Math.max(1, Math.floor((track?.seconds ?? musicBuffer?.duration ?? 60) - 1))}
                        step={syncMode ? 1 : bpm ? 60 / bpm : 0.5}
                        suffix="s"
                        onChange={(v) => {
                          // In the app a start can only be picked by the whole second; the cuts
                          // still land on the song's beat (the timeline shifts onto it).
                          if (syncMode) {
                            setSettings((s) => ({ ...s, music: { ...s.music, offset: Math.max(0, Math.round(v)) } }));
                            seek(0);
                            return;
                          }
                          // The reel starts on one of the song's beats (a library track's first beat
                          // is at 0, an uploaded song's where it was detected), so the cuts stay on it.
                          const first = track ? 0 : detected?.firstBeat ?? null;
                          let snapped = v;
                          if (bpm && first !== null) {
                            const beatLen = 60 / bpm;
                            snapped = first + Math.round((v - first) / beatLen) * beatLen;
                            if (snapped < 0) snapped += beatLen;
                          }
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
                {syncMode ? t("יצירת הסרטון (בלי מוזיקה)") : t("יצירת הסרטון")}
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
                {result.silent && <AppMusicSteps offset={result.silent.offset} songName={syncSong?.file.name ?? null} platform={settings.platform} />}
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
              phase={timeline.phase}
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

// A template in the picker; a beat template also names the track it's made for.
function TemplateCard({ tp, active, onPick }: { tp: ReelTemplate; active: boolean; onPick: () => void }) {
  const t = useT();
  const track = tp.beat ? trackById(tp.beat.track) : null;
  return (
    <button onClick={onPick} className={`text-start rounded-md border p-3 transition-colors ${active ? "border-amber-deep bg-amber-bg" : "border-line bg-white hover:border-amber-deep"}`}>
      <span className="block text-sm font-semibold font-display">{t(tp.label)}</span>
      <span className="block text-[11px] text-ink-soft leading-snug mt-1">{t(tp.description)}</span>
      {track && (
        <span className="block text-[10px] text-amber-deep font-semibold mt-1.5">
          ♪ {t(track.label)} <span className="font-data">· {track.bpm} BPM</span>
        </span>
      )}
    </button>
  );
}

// One video clip's options: where in it the reel's part starts, how it fits the reel's shape, and
// (when it's cropped) which part of the frame stays. The preview jumps to the clip on every change.
function ClipEditor({
  clip,
  options,
  reelFit,
  framed,
  cropAxis,
  onChange,
  onDone,
}: {
  clip: ClipVideo;
  options: ClipOptions;
  reelFit: ReelFit;
  framed: boolean;
  cropAxis: "x" | "y" | null;
  onChange: (patch: Partial<ClipOptions>) => void;
  onDone: () => void;
}) {
  const t = useT();
  const maxStart = Math.max(0, Math.floor((clip.duration - MIN_SEGMENT) * 10) / 10);
  const whole: ReelFit = reelFit === "cover" ? "blur" : reelFit;
  const fit = options.fit ?? reelFit;
  const fits: { id: ReelFit | null; label: string }[] = [
    { id: "cover", label: t("חיתוך למילוי המסך") },
    { id: whole, label: t("הסרטון שלם") },
    { id: null, label: t("כמו התמונות") },
  ];
  return (
    <div className="mt-3 rounded-md border border-line bg-white p-3.5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-sm font-semibold">{t("עריכת קטע הווידאו")}</p>
        <button onClick={onDone} className="text-xs font-semibold text-amber-deep underline underline-offset-2">
          {t("סיום")}
        </button>
      </div>
      <div>
        <p className="text-xs font-semibold">{t("התחלה מתוך הקטע")}</p>
        <p className="text-[11px] text-ink-soft mb-1">{t("מאיזו שנייה בסרטון הקטע מתחיל. הוא מתנגן משם, כל עוד הזמן שלו בציר נמשך. אורך הסרטון: {n} שניות.", { n: clip.duration.toFixed(1) })}</p>
        <SliderNumber value={Math.round(Math.min(options.start, maxStart) * 10) / 10} min={0} max={maxStart} step={0.1} suffix="s" onChange={(v) => onChange({ start: v })} />
      </div>
      {!framed && (
        <div>
          <p className="text-xs font-semibold mb-1">{t("התאמה לגודל הרילס")}</p>
          <div className="flex flex-wrap gap-1.5">
            {fits.map((f) => (
              <button
                key={f.label}
                onClick={() => onChange({ fit: f.id })}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition-colors ${options.fit === f.id ? "bg-ink text-white border-ink" : "bg-white border-line text-ink hover:border-amber-deep"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      )}
      {cropAxis ? (
        <div>
          <p className="text-xs font-semibold">{t("מיקום החיתוך")}</p>
          <p className="text-[11px] text-ink-soft mb-1">
            {cropAxis === "x" ? t("הסרטון רחב מהרילס ונחתך בצדדים. בחרו איזה חלק ממנו נשאר.") : t("הסרטון גבוה מהרילס ונחתך למעלה ולמטה. בחרו איזה חלק ממנו נשאר.")}
          </p>
          <div className="flex items-center gap-2" dir="ltr">
            <span className="text-[11px] text-ink-soft w-12 text-center">{cropAxis === "x" ? t("שמאל") : t("למעלה")}</span>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(options.focus * 100)}
              onChange={(e) => onChange({ focus: Number(e.target.value) / 100 })}
              className="flex-1"
              style={{ accentColor: "var(--color-amber-deep)" }}
            />
            <span className="text-[11px] text-ink-soft w-12 text-center">{cropAxis === "x" ? t("ימין") : t("למטה")}</span>
          </div>
        </div>
      ) : (
        !framed &&
        fit !== "cover" && <p className="text-[11px] text-ink-soft">{t("הסרטון מוצג שלם. כדי שימלא את המסך, בחרו \"חיתוך למילוי המסך\".")}</p>
      )}
    </div>
  );
}

// The on-beat effects, each a small live loop of a cut with the effect hitting on it. Tapping one
// adds it to, or takes it out of, the effects every cut gets.
function FxPicker({
  tpl,
  settings,
  images,
  on,
  onToggle,
  onTemplate,
  onNone,
  onBeat,
  sectionTitle,
  sectionHint,
}: {
  tpl: ReelTemplate;
  settings: ReelSettings;
  images: ReelImage[];
  on: ReelBeatFx[];
  onToggle: (id: ReelBeatFx) => void;
  onTemplate: () => void;
  onNone: () => void;
  onBeat: boolean;
  sectionTitle: string;
  sectionHint: string;
}) {
  const t = useT();
  const canvases = useRef(new Map<ReelBeatFx, HTMLCanvasElement>());
  const sample = useMemo(() => images.slice(0, 2), [images]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    let last = 0;
    const loop = (now: number) => {
      if (now - last > 33) {
        last = now;
        const q = (((now - start) / 1000) % 1.8) / 1.8;
        for (const [id, c] of canvases.current) {
          const ctx = c.getContext("2d");
          if (ctx) drawFxPreview(ctx, c.width, c.height, id, q, tpl, settings, sample);
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tpl, settings, sample]);

  return (
    <section className="mt-7">
      <p className={sectionTitle}>{t("אפקטים על הביט")}</p>
      <p className={sectionHint}>
        {onBeat
          ? t("האפקטים המסומנים מכים בכל חיתוך, והחיתוכים נופלים על הביט של השיר. לחיצה מוסיפה או מורידה אפקט.")
          : t("האפקטים המסומנים מכים בכל חיתוך. עם שיר מהספרייה, או שיר שזיהינו את הקצב שלו, החיתוכים נופלים על הביט.")}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
        <button onClick={onTemplate} className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${settings.fx === null ? "bg-ink text-white border-ink" : "bg-white border-line"}`}>
          {t("האפקטים של התבנית")}
        </button>
        <button onClick={onNone} className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${settings.fx !== null && on.length === 0 ? "bg-ink text-white border-ink" : "bg-white border-line"}`}>
          {t("בלי אפקטים")}
        </button>
        <span className="text-[11px] text-ink-soft ms-auto">{t("{n} אפקטים בשימוש", { n: on.length })}</span>
      </div>
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5">
        {REEL_BEAT_FX.map((x) => {
          const active = on.includes(x.id);
          return (
            <button key={x.id} onClick={() => onToggle(x.id)} className="text-center">
              <span className={`relative block overflow-hidden rounded-sm transition-shadow ${active ? "ring-2 ring-amber-deep" : "ring-1 ring-line"}`}>
                <canvas
                  ref={(el) => {
                    if (el) canvases.current.set(x.id, el);
                    else canvases.current.delete(x.id);
                  }}
                  width={120}
                  height={150}
                  className="block w-full h-auto bg-black"
                />
                {active && <span className="absolute top-1 end-1 h-5 w-5 rounded-full bg-amber-deep text-white text-[11px] flex items-center justify-center shadow">✓</span>}
              </span>
              <span className={`block text-[11px] mt-1 ${active ? "text-ink font-semibold" : "text-ink-soft"}`}>{t(x.label)}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

// "0:42" for a second in a song (as Instagram and TikTok show it).
function clockTime(seconds: number) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// How to add the song in Instagram or TikTok, from the same second, so the cuts land on its beat.
function AppMusicSteps({ offset, songName, platform }: { offset: number; songName: string | null; platform: ReelPlatformId }) {
  const t = useT();
  const [app, setApp] = useState<"instagram" | "tiktok">(platform === "tiktok" ? "tiktok" : "instagram");
  const time = clockTime(offset);
  const atStart = Math.round(offset) === 0;
  const steps =
    app === "instagram"
      ? [
          t("מעלים את הסרטון כרילס חדש."),
          t("לוחצים על סמל המוזיקה (♫) ובוחרים את אותו שיר."),
          atStart ? t("גוררים את השיר עד ההתחלה, 0:00. אינסטגרם בוחר לבד קטע מאמצע השיר, ולכן חייבים לגרור.") : t("גוררים את השיר עד שמוצגת השנייה {time}.", { time }),
          t("לוחצים על \"סיום\" ומפרסמים. אחרי הפרסום אי אפשר להחליף את השיר."),
        ]
      : [
          t("מעלים את הסרטון."),
          t("לוחצים על \"הוספת צליל\" ובוחרים את אותו שיר."),
          atStart ? t("לוחצים על המספריים (✂) וגוררים עד ההתחלה, 0:00.") : t("לוחצים על המספריים (✂) וגוררים עד {time}.", { time }),
          t("אם אין מספריים, טיקטוק לא מאפשר לבחור את תחילת השיר הזה, והחיתוכים לא ייפלו על הביט. כדאי לבחור שיר אחר."),
        ];
  return (
    <div className="rounded-md border border-amber-deep bg-amber-bg p-3 space-y-2">
      <p className="text-sm font-semibold">{t("עכשיו מוסיפים את השיר באפליקציה")}</p>
      {songName && (
        <p className="text-[11px] text-ink-soft truncate" dir="auto">
          ♪ {songName} · <span dir="ltr">{time}</span>
        </p>
      )}
      <div className="flex gap-1.5">
        {(["instagram", "tiktok"] as const).map((a) => (
          <button
            key={a}
            onClick={() => setApp(a)}
            className={`px-3 py-1 rounded-md text-xs font-semibold border ${app === a ? "bg-ink text-white border-ink" : "bg-white border-line"}`}
          >
            {a === "instagram" ? t("אינסטגרם") : t("טיקטוק")}
          </button>
        ))}
      </div>
      <ol className="list-decimal ps-5 space-y-1 text-xs leading-relaxed">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="text-[11px] text-ink-soft leading-relaxed">
        {t("צריך את אותה גרסה של השיר שהעליתם כאן, לא רמיקס או גרסה מקוצרת. בחשבון עסקי, באינסטגרם ובטיקטוק, רוב השירים הטרנדיים לא זמינים. בחשבון אישי או בחשבון יוצר הם זמינים.")}
      </p>
    </div>
  );
}
