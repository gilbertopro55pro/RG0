export type StageKey =
  | "event_closing"
  | "second_shooter_coordination"
  | "shoot_day"
  | "backup"
  | "culling"
  | "photo_editing"
  | "gallery_upload"
  | "client_photo_selection"
  | "client_song_selection"
  | "video_editing"
  | "video_approval"
  | "album_design"
  | "album_approval"
  | "album_production"
  | "final_delivery";

export type PackageType = "stills" | "stills_reel" | "stills_video" | "full" | "full_second";

export const STAGE_LABELS: Record<StageKey, string> = {
  event_closing: "סגירת האירוע",
  second_shooter_coordination: "תיאום צלם שני",
  shoot_day: "יום הצילום",
  backup: "גיבוי חומר גולמי",
  culling: "מיון תמונות",
  photo_editing: "עריכת תמונות",
  gallery_upload: "העלאת גלריה ל-wfolio",
  client_photo_selection: "בחירת תמונות (לאלבום)",
  client_song_selection: "בחירת שיר לקליפ",
  video_editing: "עריכת וידאו",
  video_approval: "אישור וידאו",
  album_design: "עיצוב אלבום",
  album_approval: "אישור עיצוב אלבום",
  album_production: "הפקת/הדפסת אלבום",
  final_delivery: "מסירה סופית",
};

export const STAGE_TYPE: Record<StageKey, "internal" | "checkpoint"> = {
  event_closing: "checkpoint",
  second_shooter_coordination: "internal",
  shoot_day: "checkpoint",
  backup: "internal",
  culling: "internal",
  photo_editing: "internal",
  gallery_upload: "internal",
  client_photo_selection: "checkpoint",
  client_song_selection: "checkpoint",
  video_editing: "internal",
  video_approval: "checkpoint",
  album_design: "internal",
  album_approval: "checkpoint",
  album_production: "internal",
  final_delivery: "checkpoint",
};

export const STAGE_NOTIFY_CLIENT: Partial<Record<StageKey, string>> = {
  gallery_upload: "הגלריה מוכנה — אפשר לבחור תמונות",
  video_approval: "הוידאו מוכן לצפייה ואישור",
  album_approval: "עיצוב האלבום מוכן לאישור",
  final_delivery: "כל החומרים שלכם מוכנים!",
};

// Meta-approved WhatsApp template names for each checkpoint that auto-notifies the client.
// Business-initiated messages must use an approved template outside the 24h session window.
// album_approval is deliberately absent — it always sends via ALBUM_DESIGN_TEMPLATE (document
// header) instead, since completing that stage requires the album design PDF to be attached.
export const STAGE_TEMPLATE_NAME: Partial<Record<StageKey, string>> = {
  gallery_upload: "gallery_ready_v2",
  video_approval: "video_ready_v2",
  final_delivery: "final_delivery_v2",
};

// Template with a DOCUMENT header component — separate from STAGE_TEMPLATE_NAME because it needs
// sendWhatsAppDocumentTemplate (header parameter), not the plain body-only sendWhatsAppTemplate.
export const ALBUM_DESIGN_TEMPLATE = "album_design_ready_v1";

export const GENERIC_STAGE_UPDATE_TEMPLATE = "stage_update_v2";
export const EVENT_BOOKING_CONFIRMATION_TEMPLATE = "event_booking_confirmation_v2";
export const PORTAL_LINK_TEMPLATE = "portal_link_ready_v1";
export const REVIEW_REQUEST_TEMPLATE = "review_request_v1";
export const REVIEW_REQUEST_DELAY_DAYS = 3;
export const PAYMENT_REMINDER_TEMPLATE = "payment_reminder_v1";

// Three fixed-body templates, sent days apart to a lead who hasn't replied — only the client's
// name varies (WhatsApp template review doesn't allow free-form body text per-photographer, the
// same constraint review_request_v1 already lives within). Delays are from lead creation.
export const LEAD_FOLLOW_UP_TEMPLATES = [
  { template: "lead_follow_up_1_v1", delayDays: 2 },
  { template: "lead_follow_up_2_v1", delayDays: 5 },
  { template: "lead_follow_up_3_v1", delayDays: 10 },
] as const;

// Sent to the PHOTOGRAPHER's own phone (not the client) when a client acts on the in-gallery
// album proofing tool — this is the first template in the app sent in that direction, so it goes
// through the same shared WhatsApp number as everything else; Meta doesn't distinguish "our own
// photographer" from any other recipient. {{1}} = client name, {{2}} = action (הערה חדשה על
// האלבום / אישרו את עיצוב האלבום הסופי).
export const ALBUM_ACTIVITY_TEMPLATE = "album_activity_v1";

export const PACKAGE_FLOWS: Record<PackageType, StageKey[]> = {
  stills: ["event_closing", "shoot_day", "backup", "culling", "photo_editing", "gallery_upload", "final_delivery"],
  stills_reel: [
    "event_closing", "shoot_day", "backup", "culling", "photo_editing", "gallery_upload",
    "client_song_selection", "video_editing", "video_approval", "final_delivery",
  ],
  stills_video: [
    "event_closing", "shoot_day", "backup", "culling", "photo_editing", "gallery_upload",
    "client_song_selection", "video_editing", "video_approval", "final_delivery",
  ],
  full: [
    "event_closing", "shoot_day", "backup", "culling", "photo_editing", "gallery_upload",
    "client_photo_selection", "client_song_selection", "video_editing", "video_approval",
    "album_design", "album_approval", "album_production", "final_delivery",
  ],
  full_second: [
    "event_closing", "second_shooter_coordination", "shoot_day", "backup", "culling", "photo_editing", "gallery_upload",
    "client_photo_selection", "client_song_selection", "video_editing", "video_approval",
    "album_design", "album_approval", "album_production", "final_delivery",
  ],
};

export const PACKAGE_LABELS: Record<PackageType, string> = {
  stills: "סטילס בלבד",
  stills_reel: "סטילס + קליפ",
  stills_video: "סטילס + סרט ערוך",
  full: "חבילה מלאה",
  full_second: "חבילה מלאה + צלם שני",
};

export function packageLabel(pkg: PackageType | null, customName?: string | null): string {
  return pkg ? PACKAGE_LABELS[pkg] : (customName ?? "חבילה מותאמת אישית");
}

export function currentStageIndex(orderedStages: { done: boolean }[]): number {
  for (let i = 0; i < orderedStages.length; i++) {
    if (!orderedStages[i].done) return i;
  }
  return orderedStages.length;
}

export const SUBSCRIPTION_PLANS = {
  monthly: { label: "חודשי", pricePerMonth: 50, note: "חיוב כל חודש, אפשר לבטל בכל עת", badge: undefined as string | undefined },
  annual: { label: "שנתי", pricePerMonth: 42, note: "חיוב שנתי של ₪500 · חוסך 2 חודשים", badge: "הכי משתלם" as string | undefined },
} as const;

export type SubscriptionPlan = keyof typeof SUBSCRIPTION_PLANS;
