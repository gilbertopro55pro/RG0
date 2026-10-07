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

export type ReelTransition = "fade" | "flash" | "slide" | "zoom" | "black";
export type ReelMotion = "kenburns" | "punch" | "pan" | "drift";
export type ReelFrame = "full" | "framed" | "split";
export type ReelTextStyle = "serif" | "bold" | "cinema" | "magazine" | "modern";

export type ReelTemplate = {
  id: string;
  label: string;
  description: string;
  // Seconds each photo stays (before the speed setting), and the transition into the next one.
  photoSeconds: number;
  transitionSeconds: number;
  transition: ReelTransition;
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
    transition: "fade",
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
    transition: "flash",
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
    transition: "black",
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
    transition: "slide",
    motion: "drift",
    frame: "framed",
    letterbox: false,
    grain: false,
    textStyle: "magazine",
    accent: "#ffffff",
  },
  {
    id: "split",
    label: "מסך מפוצל",
    description: "שתי תמונות זו מעל זו שמתחלפות, עם זום פנימה במעברים",
    photoSeconds: 1.8,
    transitionSeconds: 0.45,
    transition: "zoom",
    motion: "drift",
    frame: "split",
    letterbox: false,
    grain: false,
    textStyle: "modern",
    accent: "#ffffff",
  },
];

export type ReelTextPosition = "top" | "center" | "bottom";

export type ReelText = {
  title: string;
  subtitle: string;
  // Shown on the last seconds (e.g. the studio's name).
  ending: string;
  position: ReelTextPosition;
  color: string;
  show: boolean;
};

export type ReelSettings = {
  platform: ReelPlatformId;
  templateId: string;
  // 0.6 = faster, 1.6 = slower.
  speed: number;
  text: ReelText;
};

export function platformById(id: ReelPlatformId): ReelPlatform {
  return REEL_PLATFORMS.find((p) => p.id === id) ?? REEL_PLATFORMS[0];
}

export function templateById(id: string): ReelTemplate {
  return REEL_TEMPLATES.find((t) => t.id === id) ?? REEL_TEMPLATES[0];
}
