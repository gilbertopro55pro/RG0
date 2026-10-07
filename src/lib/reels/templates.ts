// Reels from a gallery's photos (owner, 2026-10-07, admin only for now): the photographer picks
// photos, a platform (its size) and one of five templates, edits the text, previews it live, and
// exports a real MP4 in the browser (see render.ts for the frames, encode.ts for the file).

export type ReelPlatformId = "ig-reel" | "ig-post" | "tiktok" | "fb-reel" | "fb-post";

export type ReelPlatform = { id: ReelPlatformId; label: string; width: number; height: number; note: string };

// Sizes the platforms recommend (all at 1080 wide). Reels and TikTok are 9:16; a feed post is
// 4:5 on Instagram and 1:1 on Facebook.
export const REEL_PLATFORMS: ReelPlatform[] = [
  { id: "ig-reel", label: "אינסטגרם רילס", width: 1080, height: 1920, note: "9:16" },
  { id: "tiktok", label: "טיקטוק", width: 1080, height: 1920, note: "9:16" },
  { id: "fb-reel", label: "פייסבוק רילס", width: 1080, height: 1920, note: "9:16" },
  { id: "ig-post", label: "אינסטגרם פוסט", width: 1080, height: 1350, note: "4:5" },
  { id: "fb-post", label: "פייסבוק פוסט", width: 1080, height: 1080, note: "1:1" },
];

// Every transition the engine draws (see transitions.ts), grouped in the picker by category like
// CapCut's (owner, 2026-10-07: "the transitions should be more varied and random").
export type ReelTransition =
  | "fade"
  | "slide"
  | "push"
  | "zoom"
  | "dipblack"
  | "blur"
  | "dipwhite"
  | "flash"
  | "leak"
  | "glitch"
  | "grain"
  | "circle"
  | "diagonal"
  | "edges"
  | "tiles"
  | "blob"
  | "flip"
  | "cube"
  | "rotate"
  | "shake"
  | "slam"
  | "zoomblur"
  | "trio";

export type ReelTransitionCategory = "basic" | "light" | "glitch" | "mask" | "3d" | "motion";

export const REEL_TRANSITION_CATEGORIES: { id: ReelTransitionCategory; label: string }[] = [
  { id: "basic", label: "בסיסי" },
  { id: "light", label: "אור" },
  { id: "glitch", label: "גליץ'" },
  { id: "mask", label: "מסכה" },
  { id: "3d", label: "תלת־ממד" },
  { id: "motion", label: "תנועה ורטט" },
];

// `min` is the shortest the transition can run (seconds, at the template's own pace): a tile or a
// rotation needs longer than the template's own (e.g. 0.18s for the fast beat) to read at all.
export const REEL_TRANSITIONS: { id: ReelTransition; label: string; category: ReelTransitionCategory; min: number }[] = [
  { id: "fade", label: "דהייה", category: "basic", min: 0.4 },
  { id: "slide", label: "החלקה לצד", category: "basic", min: 0.35 },
  { id: "push", label: "דחיפה למעלה", category: "basic", min: 0.35 },
  { id: "zoom", label: "זום החוצה", category: "basic", min: 0.35 },
  { id: "dipblack", label: "מעבר דרך שחור", category: "basic", min: 0.6 },
  { id: "blur", label: "טשטוש", category: "light", min: 0.5 },
  { id: "dipwhite", label: "הבזק שחר", category: "light", min: 0.6 },
  { id: "flash", label: "הבזק", category: "light", min: 0.18 },
  { id: "leak", label: "דליפת אור", category: "light", min: 0.7 },
  { id: "glitch", label: "גליץ'", category: "glitch", min: 0.35 },
  { id: "grain", label: "גרעין", category: "glitch", min: 0.5 },
  { id: "circle", label: "עיגול נפתח", category: "mask", min: 0.5 },
  { id: "diagonal", label: "פס אלכסוני", category: "mask", min: 0.5 },
  { id: "edges", label: "קצוות דהויים", category: "mask", min: 0.6 },
  { id: "tiles", label: "אריחים", category: "mask", min: 0.6 },
  { id: "blob", label: "חור קרוע", category: "mask", min: 0.6 },
  { id: "flip", label: "היפוך", category: "3d", min: 0.5 },
  { id: "cube", label: "קובייה", category: "3d", min: 0.5 },
  { id: "rotate", label: "סיבוב לתוך המקום", category: "3d", min: 0.55 },
  { id: "shake", label: "רטט", category: "motion", min: 0.35 },
  { id: "slam", label: "נחיתה", category: "motion", min: 0.45 },
  { id: "zoomblur", label: "זום מטושטש", category: "motion", min: 0.4 },
  { id: "trio", label: "כרטיס נכנס", category: "motion", min: 0.55 },
];

export function transitionInfo(id: ReelTransition) {
  return REEL_TRANSITIONS.find((x) => x.id === id) ?? REEL_TRANSITIONS[0];
}
export type ReelMotion = "kenburns" | "punch" | "pan" | "drift";
export type ReelFrame = "full" | "framed" | "split";
export type ReelTextStyle = "serif" | "bold" | "cinema" | "magazine" | "modern";

export type ReelTemplate = {
  id: string;
  label: string;
  description: string;
  // The pace the template is made for: seconds per photo, and the transition into the next one
  // (the actual time per photo comes from the reel's length and the timeline).
  photoSeconds: number;
  transitionSeconds: number;
  // The transitions this template mixes at random (the photographer can change the mix).
  transitions: ReelTransition[];
  motion: ReelMotion;
  frame: ReelFrame;
  letterbox: boolean;
  grain: boolean;
  textStyle: ReelTextStyle;
  // The colour the text and any thin lines use by default.
  accent: string;
};

export const REEL_TEMPLATES: ReelTemplate[] = [
  {
    id: "soft",
    label: "קלאסי רך",
    description: "זום איטי ומעברי דהייה רכים, כותרת בסריף אלגנטי",
    photoSeconds: 2.6,
    transitionSeconds: 0.8,
    transitions: ["fade", "blur", "edges", "dipwhite", "leak", "circle", "trio"],
    motion: "kenburns",
    frame: "full",
    letterbox: false,
    grain: false,
    textStyle: "serif",
    accent: "#ffffff",
  },
  {
    id: "beat",
    label: "קצב מהיר",
    description: "חיתוכים מהירים עם הבזק וזום חד, טקסט בולט",
    photoSeconds: 0.9,
    transitionSeconds: 0.18,
    transitions: ["flash", "slam", "glitch", "shake", "zoomblur", "tiles", "slide", "flip"],
    motion: "punch",
    frame: "full",
    letterbox: false,
    grain: false,
    textStyle: "bold",
    accent: "#ffffff",
  },
  {
    id: "cinema",
    label: "קולנועי",
    description: "פסים שחורים, תנועה איטית לרוחב ומעבר דרך שחור",
    photoSeconds: 3,
    transitionSeconds: 1,
    transitions: ["dipblack", "leak", "blur", "diagonal", "edges", "grain", "slide"],
    motion: "pan",
    frame: "full",
    letterbox: true,
    grain: true,
    textStyle: "cinema",
    accent: "#e9d8b0",
  },
  {
    id: "magazine",
    label: "מגזין",
    description: "תמונה במסגרת לבנה על רקע מטושטש, החלקה בין התמונות",
    photoSeconds: 2.2,
    transitionSeconds: 0.5,
    transitions: ["slide", "push", "rotate", "tiles", "diagonal", "cube", "trio"],
    motion: "drift",
    frame: "framed",
    letterbox: false,
    grain: false,
    textStyle: "magazine",
    accent: "#1c1b19",
  },
  {
    id: "split",
    label: "מסך מפוצל",
    description: "שתי תמונות זו מעל זו שמתחלפות, עם זום פנימה במעברים",
    photoSeconds: 1.8,
    transitionSeconds: 0.45,
    transitions: ["zoom", "slide", "push", "flip", "cube", "glitch", "circle"],
    motion: "drift",
    frame: "split",
    letterbox: false,
    grain: false,
    textStyle: "modern",
    accent: "#ffffff",
  },
];

export type ReelTextPosition = "top" | "center" | "bottom";

// Each line of text has its own look (owner, 2026-10-07): font ("" = the template's), size (% of
// the template's), colour and rotation (degrees).
export type ReelLineStyle = { font: string; size: number; color: string; rotate: number };

export type ReelLineId = "title" | "subtitle" | "ending";

export type ReelText = {
  // Opens the reel, over the first photos.
  title: string;
  // Under the title, at the same time (date, type of event).
  subtitle: string;
  // On its own screen after the last photo (e.g. the studio's name).
  ending: string;
  position: ReelTextPosition;
  show: boolean;
  styles: Record<ReelLineId, ReelLineStyle>;
};

// How a photo that doesn't match the video's shape is shown (owner, 2026-10-07: a landscape photo
// in a vertical reel isn't cropped; black where there is no photo). "blur" fills that space with
// a soft copy of the photo instead, "cover" crops to fill the screen.
// How a photo that doesn't match the video's shape is shown. "blur" (the default, owner
// 2026-10-07): the whole photo over a blurred copy of itself; "black": black around it; "cover":
// cropped to fill the screen.
export type ReelFit = "black" | "blur" | "cover";

// The reel's length in seconds, picked from a list (owner, 2026-10-07).
export const REEL_LENGTHS = [5, 10, 15, 30, 60] as const;
export type ReelLength = (typeof REEL_LENGTHS)[number];

export type ReelMusic = {
  source: "none" | "library" | "upload";
  trackId: string; // library track (music.ts)
  volume: number; // 0-1
  offset: number; // seconds into the track where the reel starts
};

export type ReelSettings = {
  platform: ReelPlatformId;
  templateId: string;
  // null = no fixed length: the reel is as long as the times on the timeline add up to.
  length: ReelLength | null;
  fit: ReelFit;
  // Strength of the blurred background behind a whole photo, 0-100.
  blur: number;
  // The transitions to mix ([] = the template's own mix), and the seed of the random order
  // ("shuffle" picks a new one).
  transitions: ReelTransition[];
  seed: number;
  text: ReelText;
  music: ReelMusic;
};

export function defaultLineStyles(tpl: ReelTemplate): Record<ReelLineId, ReelLineStyle> {
  return {
    title: { font: "", size: 100, color: tpl.accent, rotate: 0 },
    subtitle: { font: "", size: 100, color: tpl.accent, rotate: 0 },
    ending: { font: "", size: 100, color: "#ffffff", rotate: 0 },
  };
}

export function platformById(id: ReelPlatformId): ReelPlatform {
  return REEL_PLATFORMS.find((p) => p.id === id) ?? REEL_PLATFORMS[0];
}

export function templateById(id: string): ReelTemplate {
  return REEL_TEMPLATES.find((t) => t.id === id) ?? REEL_TEMPLATES[0];
}
