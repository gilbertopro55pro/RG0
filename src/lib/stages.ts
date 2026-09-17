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

export type PackageType =
  | "stills"
  | "stills_reel"
  | "stills_video"
  | "full"
  | "full_second"
  | "freelance_stills"
  | "freelance_video_raw"
  | "freelance_video_film"
  | "freelance_video_film_clip"
  | "freelance_video_film_clip_teaser"
  | "freelance_video_film_clip_reels";

export const STAGE_LABELS: Record<StageKey, string> = {
  event_closing: "סגירת האירוע",
  second_shooter_coordination: "תיאום צלם שני",
  shoot_day: "יום הצילום",
  backup: "גיבוי חומר גולמי",
  culling: "מיון תמונות",
  photo_editing: "עריכת תמונות",
  gallery_upload: "העלאת גלריה",
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

// Fallback text for the manual "שליחת עדכון ללקוח" button (EventDetailView's SendUpdateButton)
// when a stage has neither a saved override nor a topic-specific recommendation below.
// {{שם}} and {{שלב}} are substituted at send time; every occurrence of the literal word "קישור:"
// gets the client's portal link appended right after it.
export const DEFAULT_CLIENT_MESSAGE_TEMPLATE = "שלום {{שם}},\nעדכון לגבי האירוע שלכם: {{שלב}} ✓\nקישור: ";

// The five stages a photographer can actually customize in Settings → הודעות ללקוח/ה — the ones
// worth a real client-facing message, in flow order. Every other stage's SendUpdateButton still
// works, it just isn't editable there and falls back to DEFAULT_CLIENT_MESSAGE_TEMPLATE.
export const CUSTOMIZABLE_MESSAGE_STAGES: StageKey[] = [
  "event_closing",
  "shoot_day",
  "gallery_upload",
  "client_song_selection",
  "album_design",
];

// One recommended, topic-specific starting point per customizable stage — shown pre-filled in
// Settings and used as the send-time fallback for any stage the photographer hasn't overridden,
// so even an unsaved default reads like a real message instead of the generic one above.
export const RECOMMENDED_CLIENT_MESSAGE_TEMPLATES: Partial<Record<StageKey, string>> = {
  event_closing:
    "שלום {{שם}},\nהאירוע שלכם רשמית סגור אצלנו ביומן 🎉 נרגשים לצלם אתכם!\nבהמשך נעדכן אתכם כאן בכל שלב חשוב לקראת האירוע.\nקישור: ",
  shoot_day:
    "שלום {{שם}},\nהיום היום הגדול! מחכה לצלם אתכם ולתעד את הרגעים הכי משמעותיים שלכם 📸\nנתראה בקרוב!\nקישור: ",
  gallery_upload:
    "שלום {{שם}},\nהגלריה מהאירוע שלכם עלתה ומוכנה לצפייה! אפשר להיכנס עכשיו ולבחור את התמונות האהובות עליכם.\nקישור: ",
  client_song_selection:
    "שלום {{שם}},\nהגיע הזמן לבחור את השיר שילווה את קליפ הוידאו שלכם 🎵 כנסו ובחרו את השיר שהכי מדבר אליכם.\nקישור: ",
  album_design:
    "שלום {{שם}},\nעיצוב האלבום שלכם מוכן לצפייה! נשמח לשמוע מה אתם חושבים ולקבל הערות לפני שממשיכים להדפסה.\nקישור: ",
};

export function resolveClientMessageTemplate(stageKey: string, savedOverride: string | undefined | null): string {
  return (
    savedOverride ??
    RECOMMENDED_CLIENT_MESSAGE_TEMPLATES[stageKey as StageKey] ??
    DEFAULT_CLIENT_MESSAGE_TEMPLATE
  );
}

// Fields a photographer can insert into a client message template — the dropdown in Settings →
// הודעות ללקוח/ה offers these labels, and EventDetailView's sendWhatsAppUpdate resolves every
// token against that specific event's own card (date, location, times, payment amounts) at send
// time. "קישור: " is the one non-{{}} entry — see DEFAULT_CLIENT_MESSAGE_TEMPLATE's doc comment.
// Shared by every client-message template editor (Settings → הודעות ללקוח/ה, and the admin-only
// per-custom-stage message editor in CustomPackagesSettings.tsx) so they all offer the same
// emoji palette.
export const CLIENT_MESSAGE_EMOJI_OPTIONS = [
  "📸", "🎉", "✅", "💐", "🥂", "📅", "💌", "🙏",
  "😊", "❤️", "👏", "🎊", "📷", "✨", "💍", "👰",
  "🤵", "🎈", "🎁", "🌸", "🥳", "💯", "🔔", "📍",
];

// `insertText` is the exact text a token-insert dropdown drops into the textarea — deliberately
// its own field rather than derived from `label`, since the photographer-facing dropdown label
// ("שעת הגעה לצילומי משפחה") and the wording that actually belongs in a sent message ("צילומי
// משפחה: ") aren't always the same string.
export const CLIENT_MESSAGE_INSERT_OPTIONS: { label: string; token: string; insertText: string }[] = [
  { label: "תאריך האירוע", token: "{{תאריך}}", insertText: "תאריך: {{תאריך}}" },
  { label: "מיקום האירוע", token: "{{מיקום}}", insertText: "מיקום: {{מיקום}}" },
  { label: "שם הלקוח", token: "{{שם}}", insertText: "שם הלקוח: {{שם}}" },
  { label: "שעות האירוע", token: "{{שעות}}", insertText: "שעות עבודה: {{שעות}}" },
  { label: "שעת הגעה לצילומי משפחה", token: "{{צילומי_משפחה}}", insertText: "צילומי משפחה: {{צילומי_משפחה}}" },
  { label: "חבילה", token: "{{חבילה}}", insertText: "חבילת צילום: {{חבילה}}" },
  { label: "מקדמה", token: "{{מקדמה}}", insertText: "מקדמה: {{מקדמה}}" },
  { label: "יתרה לתשלום", token: "{{יתרה}}", insertText: "יתרה: {{יתרה}}" },
  { label: "שם השלב", token: "{{שלב}}", insertText: "שם השלב: {{שלב}}" },
  { label: "קישור", token: "קישור: ", insertText: "מצורף קישור לפורטל האישי שלכם למעקב התקדמות:\nקישור: " },
];

export const GENERIC_STAGE_UPDATE_TEMPLATE = "stage_update_v2";
export const REVIEW_REQUEST_DELAY_DAYS = 3;

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
  // Freelance bookings — no closing/backup/culling/editing/gallery pipeline, just the raw work
  // itself. Stills and raw video are both a single shoot-day checkpoint; the edited-video variants
  // add a video-approval checkpoint, and only the ones that actually include a clip (not a bare
  // film) also get a song-selection checkpoint first.
  freelance_stills: ["shoot_day"],
  freelance_video_raw: ["shoot_day"],
  freelance_video_film: ["shoot_day", "video_approval"],
  freelance_video_film_clip: ["shoot_day", "client_song_selection", "video_approval"],
  freelance_video_film_clip_teaser: ["shoot_day", "client_song_selection", "video_approval"],
  freelance_video_film_clip_reels: ["shoot_day", "client_song_selection", "video_approval"],
};

export const PACKAGE_LABELS: Record<PackageType, string> = {
  stills: "סטילס בלבד",
  stills_reel: "סטילס + קליפ",
  stills_video: "סטילס + סרט ערוך",
  full: "חבילה מלאה",
  full_second: "חבילה מלאה + צלם שני",
  freelance_stills: "פרילנס סטילס",
  freelance_video_raw: "פרילנס וידאו גלם",
  freelance_video_film: "פרילנס וידאו כולל עריכה — סרט",
  freelance_video_film_clip: "פרילנס וידאו כולל עריכה — סרט וקליפ",
  freelance_video_film_clip_teaser: "פרילנס וידאו כולל עריכה — סרט, קליפ וטיזר",
  freelance_video_film_clip_reels: "פרילנס וידאו כולל עריכה — סרט, קליפ ורילס",
};

// The 4 "פרילנס וידאו כולל עריכה" sub-choices share one row in the new-event package <select>
// (see NewEventModal.tsx) — picking that row reveals this nested "מה כולל העריכה" dropdown
// instead of showing all 4 as separate top-level package options.
export const FREELANCE_VIDEO_EDIT_VARIANTS: { value: PackageType; label: string }[] = [
  { value: "freelance_video_film", label: "סרט" },
  { value: "freelance_video_film_clip", label: "סרט וקליפ" },
  { value: "freelance_video_film_clip_teaser", label: "סרט, קליפ וטיזר" },
  { value: "freelance_video_film_clip_reels", label: "סרט, קליפ ורילס" },
];

export function packageLabel(pkg: PackageType | null, customName?: string | null): string {
  return pkg ? PACKAGE_LABELS[pkg] : (customName ?? "חבילה מותאמת אישית");
}

// Resolves a lead's stored `package_interest` value into a display label. Unlike events (which use
// a normalized `package` enum column + a separate `custom_package_id` FK), leads store package
// selection as a single text column — either a built-in PackageType key, or `custom:<id>` pointing
// into custom_packages — so this parses that string form directly instead of joining a column.
export function resolveLeadPackageLabel(value: string | null, customPackages: { id: string; name: string }[]): string | null {
  if (!value) return null;
  if (value.startsWith("custom:")) {
    return customPackages.find((p) => p.id === value.slice(7))?.name ?? null;
  }
  return (PACKAGE_LABELS as Record<string, string>)[value] ?? null;
}

export function currentStageIndex(orderedStages: { done: boolean }[]): number {
  for (let i = 0; i < orderedStages.length; i++) {
    if (!orderedStages[i].done) return i;
  }
  return orderedStages.length;
}

// "tier" separates the two SKUs of each plan family (פרו vs. פרו+) for feature gates
// (team size, branding) that care about the tier, not the billing cadence — see
// src/app/api/team-members/route.ts and the branding fields on Photographer. "cycleMonths" is the
// single source of truth for each plan's billing cadence — src/lib/payplus.ts (PayPlus's own
// `recurring_range` param) and the mid-cycle plan-switch timing logic both derive from this
// instead of duplicating it, so client components can reason about cycle length without pulling
// in payplus.ts (which imports Node's `crypto` and can't be bundled for the browser). "tierName"
// is the product-facing brand name for the tier (shown standalone, e.g. on the landing page's
// monthly/annual toggle) — "label" stays the fuller "<tier> — <cycle>" form used where the
// billing cadence needs to be named alongside the tier (plan-switch buttons, admin dashboard).
// "regularPricePerMonth" is display-only marketing copy for the landing page's launch-pricing
// strikethrough (see PricingToggle/PlanComparison) — it is NOT what anyone is actually billed.
// "pricePerMonth" is the real, currently-active price and stays exactly what PayPlus charges;
// bumping it later to the regular price is a separate, deliberate future change to this same
// field, not something regularPricePerMonth does automatically. The annual regular figures follow
// the same "10 months' worth over 12" shape as the real annualAmount values below (700 = 10×70,
// 1200 = 10×120), divided by 12 and rounded, same as pricePerMonth already is for the real prices.
export const SUBSCRIPTION_PLANS = {
  basic_monthly: { label: "פרו סטארט — חודשי", tierName: "פרו סטארט", pricePerMonth: 25, regularPricePerMonth: 32, note: "חיוב כל חודש, אפשר לבטל בכל עת", badge: undefined as string | undefined, tier: "basic" as const, cycleMonths: 1, annualAmount: null as number | null },
  basic_annual: { label: "פרו סטארט — שנתי", tierName: "פרו סטארט", pricePerMonth: 19, regularPricePerMonth: 25, note: "חיוב שנתי של ₪228 · חוסך 3 חודשים", badge: "הכי זול" as string | undefined, tier: "basic" as const, cycleMonths: 12, annualAmount: 228 },
  monthly: { label: "פרו — חודשי", tierName: "פרו", pricePerMonth: 59, regularPricePerMonth: 70, note: "חיוב כל חודש, אפשר לבטל בכל עת", badge: undefined as string | undefined, tier: "standard" as const, cycleMonths: 1, annualAmount: null as number | null },
  annual: { label: "פרו — שנתי", tierName: "פרו", pricePerMonth: 42, regularPricePerMonth: 58, note: "חיוב שנתי של ₪500 · חוסך 2 חודשים", badge: "הכי משתלם" as string | undefined, tier: "standard" as const, cycleMonths: 12, annualAmount: 500 },
  studio_pro_monthly: { label: "פרו+ — חודשי", tierName: "פרו+", pricePerMonth: 119, regularPricePerMonth: 145, note: "חיוב כל חודש, אפשר לבטל בכל עת", badge: undefined as string | undefined, tier: "studio_pro" as const, cycleMonths: 1, annualAmount: null as number | null },
  studio_pro_annual: { label: "פרו+ — שנתי", tierName: "פרו+", pricePerMonth: 83, regularPricePerMonth: 100, note: "חיוב שנתי של ₪990 · חוסך 2 חודשים", badge: "המסלול המלא" as string | undefined, tier: "studio_pro" as const, cycleMonths: 12, annualAmount: 990 },
} as const;

export type SubscriptionPlan = keyof typeof SUBSCRIPTION_PLANS;
export type SubscriptionTier = "basic" | "standard" | "studio_pro";

export const TEAM_MEMBER_LIMIT_BY_TIER: Record<SubscriptionTier, number> = {
  basic: 1,
  standard: 2,
  studio_pro: 3,
};

// Business decision, 2026-09-16: standard ("פרו") picked up a real cap too (was unlimited) — see
// TEAM_MEMBER_LIMIT_BY_TIER's own history and the storage-usage data that originally motivated the
// entry tier's cap above. studio_pro ("פרו+") stays the one genuinely unlimited tier. See
// checkStorageQuota in storageQuota.ts for where this is actually enforced (at upload-URL mint
// time, every upload path) — a null entry here short-circuits that check entirely for the tier.
export const STORAGE_CAP_BYTES_BY_TIER: Record<SubscriptionTier, number | null> = {
  basic: 100 * 1024 * 1024 * 1024,
  standard: 750 * 1024 * 1024 * 1024,
  studio_pro: null,
};

// Closed, bounded set of gallery retention windows — the main lever a capped tier has over its own
// storage footprint. Days, not months, because "week" and "14 days" aren't whole months. The DB
// trigger (enforce_gallery_expiry_by_plan, migration 0084 + 0116 + this tier's own follow-up) is
// the actual enforcement; this list is what the UI offers, so a mismatch here just means an option
// that gets silently rejected server-side, not a hole in the cap itself.
export const GALLERY_EXPIRY_OPTIONS: { value: 7 | 14 | 30 | 90 | 180 | 365; label: string }[] = [
  { value: 7, label: "שבוע" },
  { value: 14, label: "14 יום" },
  { value: 30, label: "חודש" },
  { value: 90, label: "3 חודשים" },
  { value: 180, label: "6 חודשים" },
  { value: 365, label: "שנה" },
];

export const GALLERY_EXPIRY_OPTIONS_BY_TIER: Record<SubscriptionTier, typeof GALLERY_EXPIRY_OPTIONS> = {
  basic: GALLERY_EXPIRY_OPTIONS.filter((o) => o.value <= 14),
  standard: GALLERY_EXPIRY_OPTIONS.filter((o) => o.value <= 90),
  studio_pro: GALLERY_EXPIRY_OPTIONS,
};
