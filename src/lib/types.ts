import type { PackageType, StageKey, SubscriptionPlan } from "@/lib/stages";

export type SubscriptionStatus = "incomplete" | "active" | "past_due" | "canceled" | "trialing";

export type InvoiceProvider = "finbot" | "green_invoice";

export type Photographer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  plan: SubscriptionPlan;
  google_calendar_connected: boolean;
  google_calendar_color_id: string | null;
  google_calendar_import_color_id: string | null;
  apple_calendar_connected: boolean;
  apple_calendar_email: string | null;
  apple_calendar_app_password: string | null;
  apple_calendar_url: string | null;
  apple_calendar_display_name: string | null;
  whatsapp_signature: string | null;
  custom_contract_terms: string | null;
  whatsapp_bot_enabled: boolean;
  // Intake assistant (עוזר פניות, migration 0129) — see lib/intakeAssistant.ts.
  intake_bot_enabled: boolean;
  intake_bot_faq: IntakeFaqItem[];
  intake_bot_reply_hours: number;
  intake_bot_extra_question: string | null;
  intake_chat_token: string;
  // The Cloud API number that serves this photographer's intake bot on WhatsApp (migration 0131).
  whatsapp_bot_phone_number_id: string | null;
  // Own WhatsApp Business greeting text (migration 0132); null = defaultWhatsAppGreeting.
  intake_whatsapp_greeting: string | null;
  payplus_customer_uid: string | null;
  payplus_recurring_uid: string | null;
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
  auto_renew: boolean;
  cancel_at_period_end: boolean;
  renewal_reminder_sent_at: string | null;
  trial_ends_at: string | null;
  signup_plan: string | null;
  trial_reminder_sent_at: string | null;
  // Trial data retention (migration 0128) — see lib/accountDeletion.ts.
  keep_account: boolean;
  trial_deletion_warned_at: string | null;
  trial_deletion_final_warned_at: string | null;
  lead_follow_up_enabled: boolean;
  finbot_api_key: string | null;
  business_tax_status: "exempt" | "licensed";
  invoice_provider: InvoiceProvider;
  green_invoice_api_id: string | null;
  green_invoice_api_secret: string | null;
  logo_storage_path: string | null;
  brand_color: string | null;
  portfolio_enabled: boolean;
  portfolio_slug: string | null;
  portfolio_bio: string | null;
  business_id: string | null;
  hourly_shoot_rate: number;
  pricing_suppliers: PricingSupplier[];
  quote_event_type_suggestions: string[];
  onboarding_completed: boolean;
  welcome_video_seen: boolean;
  pending_plan: SubscriptionPlan | null;
  pending_plan_effective_at: string | null;
  created_at: string;
};

export type PricingSupplier = {
  id: string;
  name: string;
  price: number;
};

export type PriceQuoteItem = {
  item: string;
  details: string;
  price: number;
};

export type PriceQuoteRow = {
  id: string;
  photographer_id: string;
  client_name: string;
  client_phone: string | null;
  client_email: string | null;
  items: PriceQuoteItem[];
  subtotal: number;
  vat_amount: number;
  total: number;
  sent_at: string | null;
  sent_via: "email" | "whatsapp" | null;
  quote_name: string | null;
  event_hours: number | null;
  hourly_rate_used: number | null;
  event_type: string | null;
  event_date: string | null;
  event_location: string | null;
  work_start_time: string | null;
  work_end_time: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type PriceQuoteTemplateRow = {
  id: string;
  photographer_id: string;
  name: string;
  items: PriceQuoteItem[];
  created_at: string;
};

export type EventRow = {
  id: string;
  photographer_id: string;
  client_name: string;
  // Free-text occasion (e.g. "עלייה לתורה") — display-only prefix on the event card via
  // eventDisplayName(); client_name itself stays the plain client name for messages/contracts.
  event_type: string | null;
  client_phone: string | null;
  client_email: string | null;
  package: PackageType | null;
  custom_package_id: string | null;
  event_date: string;
  event_location: string | null;
  arrival_time: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  google_calendar_event_id: string | null;
  apple_calendar_event_uid: string | null;
  client_access_token: string;
  album_design_pdf_path: string | null;
  album_design_pdf_filename: string | null;
  resolution_note: string | null;
  notes: string | null;
  contract_template_id: string | null;
  contract_skipped: boolean;
  // Set only by the calendar-scan bulk-import flow (see ProfileSettingsView.tsx) — highlights this
  // event on the list differently until a saved edit clears it back to false.
  needs_review: boolean;
  // True when the photographer explicitly flagged this as covered by a freelance photographer on
  // their behalf (set via the calendar-scan same-slot-collision checkbox). EventsListView.tsx
  // treats an event as "freelance" when this is true OR package is one of the freelance_* types.
  is_freelance: boolean;
  // Set only by an explicit "סגירת אירוע" + confirmation (cleared by "שחזור אירוע") — marking every
  // stage done does NOT close an event. Drives the events list's "הושלמו" filter.
  closed_at: string | null;
  // "YYYY-MM" the unpaid balance was recognized in at closing (see closeEvent.ts) — null if nothing was.
  closed_balance_month: string | null;
  created_at: string;
};

export type ContractTemplateRow = {
  id: string;
  photographer_id: string;
  name: string;
  terms: string;
  created_at: string;
  updated_at: string;
};

export type CustomPackageRow = {
  id: string;
  photographer_id: string;
  name: string;
  price: number | null;
  sort_order: number;
  created_at: string;
};

export type CustomPackageStageRow = {
  id: string;
  package_id: string;
  photographer_id: string;
  name: string;
  sort_order: number;
  notify_client: boolean;
  notify_text: string | null;
  requires_album_pdf: boolean;
  created_at: string;
};

export type PrintHouseEmailRow = {
  id: string;
  photographer_id: string;
  email: string;
  label: string;
  is_default: boolean;
  created_at: string;
};

export type ClientMessageTemplateRow = {
  id: string;
  photographer_id: string;
  stage_key: string;
  body: string;
  updated_at: string;
};

export type FrameOrientation = "portrait" | "landscape";

// A photographer-placed text element on a magnet frame design — draggable, with independent
// font/size/color and an optional drop shadow (blur + distance are independently controllable per
// the "עדכון אדמין" spec, not coupled to one intensity slider like the album editor's photo
// shadows). xPct/yPct are the element's CENTER as a percentage of its own canvas's width/height.
export type MagnetFrameTextElement = {
  id: string;
  type: "text";
  text: string;
  xPct: number;
  yPct: number;
  fontKey: string;
  fontSizePx: number;
  color: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  shadowEnabled: boolean;
  shadowBlurPx: number;
  shadowDistancePx: number;
};

// A dropped decorative element — a built-in ALBUM_ORNAMENTS entry (ornamentId, recolorable via
// `color`), a built-in MAGNET_FRAME_FLORALS raster illustration (floralId, a shared library asset
// under public/magnet-elements — composited as-is like customElementAssetId below, since it's a
// real painted image, not a recolorable procedural SVG), or the photographer's own uploaded image
// (customElementAssetId, a MagnetFrameCustomElementRow id — same "composited as-is" treatment).
// Only one of the three is ever set, same "picking one clears the others" rule as the frame-level
// texture fields. sizePct is a percentage of the canvas's own SHORTER side, so the same element
// reads at a consistent physical size whether it landed on the landscape or the portrait canvas.
export type MagnetFrameDecorationElement = {
  id: string;
  type: "decoration";
  ornamentId?: string;
  floralId?: string;
  customElementAssetId?: string;
  xPct: number;
  yPct: number;
  sizePct: number;
  color: string;
};

export type MagnetFrameElement = MagnetFrameTextElement | MagnetFrameDecorationElement;

// A photographer-uploaded decorative element image — kept across every future design (not scoped
// to one), same pattern as MagnetFrameCustomTextureRow.
export type MagnetFrameCustomElementRow = {
  id: string;
  photographer_id: string;
  storage_path: string;
  original_filename: string;
  created_at: string;
};

// The card's own style — shared by both orientations of one design (a style choice, not a
// per-element placement). borderRatioPct is the white mat's thickness (top/left/right) as a % of
// the canvas's shorter side; bottomBorderRatioPct is the SAME kind of value but for the bottom
// edge only, independent of borderRatioPct (a classic "bottom-weighted mat" look) — it starts
// equal to borderRatioPct so an untouched design shows no visual difference until the photographer
// actually drags it. cornerRadiusPct rounds only the INNER photo-cutout corners (the outer card
// edge always stays square) as a % of the cutout's own half-shorter-side, so 100 always means "as
// round as it can go" regardless of the cutout's actual size.
// frameColor/frameColorOpacity tint the white mat itself (0 opacity = pure white, exactly today's
// look; higher opacity mixes in more of frameColor) — applied UNDER any texture, like dyeing the
// paper before a pattern is printed on it.
// textureId picks a built-in MAGNET_FRAME_TEXTURES entry; customTextureAssetId (a
// MagnetFrameCustomTextureRow id) overrides it when set. Only one is ever "active" — selecting one
// clears the other in the editor — but both fields exist so a save never loses whichever the
// photographer had chosen.
export type MagnetFrameSettings = {
  borderRatioPct: number;
  bottomBorderRatioPct: number;
  cornerRadiusPct: number;
  frameColor: string;
  frameColorOpacity: number;
  shadowEnabled: boolean;
  shadowOpacity: number;
  shadowBlurPx: number;
  shadowDistancePx: number;
  textureId: string | null;
  textureOpacity: number;
  customTextureAssetId: string | null;
};

// One saved design. landscape_elements (20x15cm) is what the photographer edits directly;
// portrait_elements (15x20cm) is auto-derived at save time — see MagnetFrameEditor.tsx.
export type MagnetFrameDesignRow = {
  id: string;
  photographer_id: string;
  event_id: string | null;
  landscape_elements: MagnetFrameElement[];
  portrait_elements: MagnetFrameElement[];
  frame_settings: MagnetFrameSettings;
  created_at: string;
  updated_at: string;
};

// A photographer-uploaded texture image, tiled across the mat the same way a built-in
// MAGNET_FRAME_TEXTURES entry is — see composeMagnetFrameTexture in magnetFrame.ts.
export type MagnetFrameCustomTextureRow = {
  id: string;
  photographer_id: string;
  storage_path: string;
  original_filename: string;
  created_at: string;
};

export type ContractStatus = "draft" | "sent" | "signed";

export type EventContractRow = {
  id: string;
  event_id: string;
  sign_token: string;
  contract_text: string;
  status: ContractStatus;
  signer_name: string | null;
  signer_ip: string | null;
  signed_at: string | null;
  signature_data_url: string | null;
  created_at: string;
};

export type LeadStatus = "new" | "contacted" | "quoted" | "won" | "lost";

export type IntakeFaqItem = { q: string; a: string };

// What the intake assistant collected in a conversation (leads.details / bot_conversations.collected).
export type IntakeDetails = {
  eventType?: string;
  eventDate?: string; // YYYY-MM-DD
  dateAvailable?: boolean;
  // The client hasn't set a date yet — then approxDate ("קיץ 2027", "מרץ") stands in for it.
  dateUndecided?: boolean;
  approxDate?: string;
  location?: string;
  guests?: string;
  startTime?: string;
  endTime?: string;
  wishes?: string;
  clientName?: string;
  phone?: string;
  email?: string;
};

export type LeadRow = {
  id: string;
  photographer_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  event_date_interest: string | null;
  // A built-in PackageType key, or `custom:<custom_packages.id>` for a photographer's own package
  // (see resolveLeadPackageLabel in @/lib/stages) — plain text column, not a DB enum.
  package_interest: string | null;
  status: LeadStatus;
  notes: string | null;
  quoted_amount: number | null;
  quote_token: string;
  quote_note: string | null;
  quote_sent_at: string | null;
  // Set the moment the client taps "אישור ההצעה" on the public /quotes/[token] page — distinct
  // from converted_event_id (set later, once the follow-up questionnaire actually creates the
  // event), so the page can tell "not yet approved" / "approved, questionnaire pending" / "done"
  // apart. Part of the admin-gated quote-approval-to-event flow (see quotes/[token]/page.tsx).
  quote_approved_at: string | null;
  // "manual" (added by the photographer) or "assistant" (the intake assistant, migration 0129).
  source: string;
  bot_conversation_id: string | null;
  details: IntakeDetails | null;
  // The client left before every required detail was collected (but left a phone number).
  needs_details: boolean;
  converted_event_id: string | null;
  event_type_name: string | null;
  created_at: string;
};

export type EventTypeRow = {
  id: string;
  photographer_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

// price === null means "not offered for this event type — contact the photographer directly"
// Exactly one of package / custom_package_id is set.
export type PackagePriceRow = {
  id: string;
  photographer_id: string;
  event_type_id: string;
  package: PackageType | null;
  custom_package_id: string | null;
  price: number | null;
};

export type WaitlistRow = {
  id: string;
  photographer_id: string;
  requested_date: string;
  client_name: string;
  client_phone: string | null;
  lead_id: string | null;
  notes: string | null;
  created_at: string;
};

// Owner-only via RLS — never selectable by an assigned team member.
export type EventPaymentRow = {
  event_id: string;
  deposit_amount: number;
  balance_amount: number;
  deposit_paid: boolean;
  balance_paid: boolean;
  balance_due_date: string | null;
  deposit_paid_at: string | null;
  balance_paid_at: string | null;
  deposit_document_url: string | null;
  balance_document_url: string | null;
  // Set only for a partial payment (deposit_paid/balance_paid stay false) — the remaining balance
  // is always computed live from deposit_amount/balance_amount rather than stored, so it can never
  // go stale if the declared amount itself is edited later.
  deposit_paid_amount: number | null;
  balance_paid_amount: number | null;
  // Private, photographer-only free text (never shown on the client portal) — what the remaining
  // balance on that leg covers.
  deposit_notes: string | null;
  balance_notes: string | null;
};

export type EventStageRow = {
  id: string;
  event_id: string;
  stage_key: StageKey | null;
  custom_stage_id: string | null;
  stage_order: number;
  done: boolean;
  done_at: string | null;
};

export type EventNotificationRow = {
  id: string;
  event_id: string;
  text: string;
  created_at: string;
  is_client_action: boolean;
  read_at: string | null;
};

export type GalleryRow = {
  id: string;
  event_id: string | null;
  photographer_id: string;
  title: string;
  // false = title tracks the linked event's client_name live (kept in sync whenever the event is
  // renamed); true = the photographer explicitly typed a title in gallery settings, which then
  // stays exactly as they set it regardless of later event renames. See migration
  // 0102_gallery_title_customized.sql and createEvent.ts / GalleryManageView.tsx's saveSettings.
  title_customized: boolean;
  access_token: string;
  password: string | null;
  published: boolean;
  cover_photo_id: string | null;
  // Percentage (0-100) of the cover photo to keep centered once it's cropped to the banner's fixed
  // aspect ratio — see coverAspectRatio in galleryTheme.ts. Defaults to 50/50 (dead-center).
  cover_focal_x: number;
  cover_focal_y: number;
  expiry_months: 1 | 3 | 6 | null;
  expiry_days: 7 | 14 | 30 | 90 | 180 | 365 | null;
  published_at: string | null;
  expires_at: string | null;
  archived_at: string | null;
  archive_reason: "expired" | "manual" | null;
  permanent_delete_at: string | null;
  restored_once: boolean;
  selection_confirmed_at: string | null;
  shoot_date: string | null;
  client_email: string | null;
  client_phone: string | null;
  allow_downloads: boolean;
  allow_client_upload: boolean;
  reminder_sent_at: string | null;
  whatsapp_reminder_sent_at: string | null;
  theme: string;
  palette: string;
  cover_text_position: string;
  cover_shape: string;
  title_font_override: string | null;
  grid_style_override: string | null;
  slideshow_photo_ids: string[];
  ftp_username: string | null;
  ftp_password: string | null;
  is_portfolio_only: boolean;
  // false = not yet set up by the photographer (a leftover from the now-removed auto-create-on-
  // every-event path) — stays linked to its event but hidden from the photographer's own galleries
  // list until they explicitly set it up via the event card's gallery flow. See migration
  // 0120_gallery_activated.sql.
  activated: boolean;
  created_at: string;
};

export type GalleryPhotoRow = {
  id: string;
  gallery_id: string;
  photographer_id: string;
  storage_path: string;
  preview_storage_path: string | null;
  preview_blur_data_url: string | null;
  preview_aspect_ratio: number | null;
  original_filename: string;
  file_size_bytes: number;
  sort_order: number;
  is_favorite: boolean;
  // Free-text note the CLIENT attaches via the diamond icon next to the favorite heart (e.g.
  // "קנבס") — never set by the photographer side. Null means no label.
  custom_label: string | null;
  folder_id: string | null;
  culling_status: "pending" | "kept" | "rejected";
  in_portfolio: boolean;
  portfolio_category: string | null;
  // Starred for the public portfolio's hero strip — max 25 per photographer, enforced by the
  // enforce_portfolio_featured trigger (migration 0125), which also clears it on leaving the portfolio.
  portfolio_featured: boolean;
  created_at: string;
};

export type GalleryPhotoFaceRow = {
  id: string;
  gallery_id: string;
  photo_id: string;
  cluster_id: string;
  box_x: number;
  box_y: number;
  box_width: number;
  box_height: number;
  descriptor: number[];
  created_at: string;
};

export type GalleryFolderRow = {
  id: string;
  gallery_id: string;
  photographer_id: string;
  name: string;
  sort_order: number;
  created_at: string;
};

export type GalleryZipJobStatus = "pending" | "processing" | "ready" | "failed";

export type GalleryZipJobRow = {
  id: string;
  gallery_id: string;
  batch_id: string;
  part_index: number;
  part_count: number;
  photo_ids: string[];
  status: GalleryZipJobStatus;
  storage_path: string | null;
  error_message: string | null;
  processed_count: number;
  total_count: number;
  quality: "full" | "web";
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export type AlbumExportFormat = "jpg" | "psd" | "pdf";
export type AlbumExportJobStatus = "pending" | "processing" | "ready" | "failed" | "cancelled";

export type GalleryAlbumExportJobRow = {
  id: string;
  album_id: string;
  gallery_id: string;
  photographer_id: string;
  format: AlbumExportFormat;
  from_page: number;
  to_page: number;
  quality: "high" | "web" | null;
  status: AlbumExportJobStatus;
  processed_count: number;
  total_count: number;
  storage_path: string | null;
  error_message: string | null;
  send_to_email: string | null;
  // PDF only — which entry of QUALITY_STEPS (albumExportJobs.ts) the NEXT invocation should try.
  // Lets a size-fitting retry pass run as its own fresh invocation instead of looping inline inside
  // one, so a timeout mid-loop no longer restarts every quality step from the top.
  pdf_quality_step_index: number;
  // PDF only — how many pages of the CURRENT quality-step attempt are already rendered into the
  // in-progress document (see generateAlbumPdf's resumeFromDoc/pageRange). Lets a pass render in
  // small page batches, each its own invocation, instead of the whole pass in one call.
  pdf_page_index: number;
  created_at: string;
  updated_at: string;
  expires_at: string;
};

export type AlbumStatus = "draft" | "sent" | "approved" | "changes_requested";

export type AlbumSpreadLayout = "split" | "feature" | "stack" | "custom";

// Positions/sizes are percentages of the page box (0-100, origin top-left) — plain LTR
// coordinates regardless of the app's RTL UI, since a free-form canvas has no inherent reading
// direction to inherit and this keeps the same math correct in the builder, the client viewer,
// and the PDF export (which also works in a top-left-ish coordinate convention once flipped).
export type AlbumPhotoFilter = "none" | "bw" | "sepia";

export type AlbumPhotoElement = {
  id: string;
  type: "photo";
  // null = an empty frame, shown as a "+" placeholder until the photographer assigns a photo —
  // this is what a template application creates before anything is filled in.
  photoId: string | null;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  focalX: number;
  focalY: number;
  filter?: AlbumPhotoFilter;
  borderWidth?: number;
  borderColor?: string;
  rotation?: number; // degrees, -180..180, default 0
  opacity?: number; // 0-100, default 100
  blur?: number; // 0-100 (an arbitrary intensity scale, not raw px), default 0
  shadow?: number; // 0-100 drop-shadow intensity (also its opacity), default 0
  // Independent overrides for the shadow's offset/softness — undefined means "derive from `shadow`
  // itself", same coupled behavior as before these existed, so every already-saved album renders
  // unchanged until a photographer explicitly drags one of these.
  shadowDistance?: number; // 0-100, default undefined (falls back to `shadow`)
  shadowBlur?: number; // 0-100, default undefined (falls back to `shadow`)
  // Direction the shadow is cast in, degrees 0-360: 0=right, 90=down, 180=left, 270=up (clockwise,
  // screen space). undefined defaults to 45 (down-right) EVERYWHERE this is read — the fixed
  // direction every shadow used before this field existed — so an already-designed album's shadow
  // never visually shifts just because this shipped; only an explicit drag of the angle slider
  // writes a real value.
  shadowAngle?: number;
  zoom?: number; // 100-400, extra scale on top of the object-fit:cover baseline, default 100
  lockAspect?: boolean; // when true, corner-handle resizing preserves the width/height ratio
  maskId?: string; // id into ALBUM_MASKS (src/lib/albumMasks.ts) — an alpha mask applied over the cropped photo
  // Color/tone adjustments, all -100..100, undefined/0 = no change from the original photo. Kept
  // orthogonal to `filter` (bw/sepia) and `blur` above — those are one-click presets, these are
  // fine-grained per-photo grading. See albumAdjustments.ts for the shared math applied identically
  // in the live builder, the client proofing view, and every export format.
  exposure?: number;
  contrast?: number;
  highlights?: number;
  shadows2?: number; // suffixed to avoid colliding with the unrelated page-level `shadow` above
  whites?: number;
  blacks?: number;
  temp?: number; // white balance: cool (-) to warm (+)
  tint?: number; // green (-) to magenta (+)
  vibrance?: number;
  saturation2?: number; // suffixed — `filter: "bw"` already means "fully desaturated" and is separate
  // 0-100 edge-enhancement intensity, default 0/undefined. Kept OUT of the exposure/contrast/etc
  // group above and out of albumAdjustments.ts's shared math entirely — see albumSharpen.ts's own
  // top comment for why (a spatial convolution, not a per-pixel curve).
  sharpness?: number;
  // When true, blocks both move and resize (see startDrag's own guard in AlbumSpreadCanvasEditor.tsx)
  // — a photographer's final-position safeguard against nudging something out of place by accident.
  // Still selectable (so the lock can be toggled back off) and still fully editable in every OTHER
  // way (color/effects/etc) — only position and size are frozen.
  locked?: boolean;
};

// Points on the album's fixed 1600pt-wide PDF reference canvas (same canvas the PDF proof export
// already uses) — every renderer (builder CSS, client viewer CSS, JPG/PSD raster, PDF) converts
// this one absolute unit to its own pixel/point space, so a given size looks the same proportion
// of the page everywhere regardless of the album's physical cm dimensions.
export type AlbumFontSizePt = number; // 2-96

export type AlbumTextElement = {
  id: string;
  type: "text";
  text: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct?: number; // resize-handle box height; font size is independent (set via fontSize)
  fontSize: AlbumFontSizePt;
  fontFamily?: string; // key into ALBUM_FONTS (src/lib/albumFonts.ts) — default "heebo"
  // A CSS-valid color — "white"/"black" (legacy literal values) or a "#rrggbb" hex from the
  // palette picker (see TEXT_COLOR_PALETTE in src/lib/textColor.ts).
  color: string;
  align: "right" | "center" | "left";
  shadow?: number; // 0-100 drop-shadow intensity, default 0 — same 0-100 scale as AlbumPhotoElement.shadow
  glow?: number; // 0-100 outer-glow intensity (soft white halo, for light text over busy photos), default 0
  locked?: boolean; // see AlbumPhotoElement.locked's own comment
};

// A standalone decorative overlay graphic (see src/lib/albumOrnaments.ts) — distinct from a mask
// (which clips a photo's own pixels): an ornament is its own positioned/resizable element,
// recolorable via `color`, not tied to any specific photo.
export type AlbumOrnamentElement = {
  id: string;
  type: "ornament";
  // Exactly one of these is set: `ornamentId` for a built-in procedural ornament (albumOrnaments.ts,
  // recolorable via `color`), `customOrnamentId` for a photographer-uploaded image (rendered as-is
  // unless `color` is set too, in which case it's tinted via an alpha-mask over that solid color —
  // same technique either way, just applied to an uploaded raster instead of a currentColor SVG).
  ornamentId?: string;
  customOrnamentId?: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  color?: string;
  rotation?: number;
  opacity?: number;
  shadow?: number; // 0-100, same scale/meaning as AlbumPhotoElement.shadow
  shadowAngle?: number; // degrees 0-360, same convention/default as AlbumPhotoElement.shadowAngle
  borderWidth?: number; // px, same scale/meaning as AlbumPhotoElement.borderWidth
  borderColor?: string;
  locked?: boolean; // see AlbumPhotoElement.locked's own comment
};

// A freely positioned solid-color geometric shape — a plain rectangle by default, or clipped to
// any of the same ALBUM_MASKS "shape-*" outlines (circle, star, hexagon, etc.) used to mask
// photos. `maskId` here isn't limited to "shape-*" — any mask in the bank can be applied, exactly
// like on a photo.
export type AlbumShapeElement = {
  id: string;
  type: "shape";
  maskId?: string;
  xPct: number;
  yPct: number;
  widthPct: number;
  heightPct: number;
  color: string;
  rotation?: number;
  opacity?: number;
  shadow?: number;
  shadowAngle?: number; // degrees 0-360, same convention/default as AlbumPhotoElement.shadowAngle
  borderWidth?: number;
  borderColor?: string;
  // undefined = the normal solid-fill (optionally mask-clipped) shape. The two outline kinds have
  // no fill at all — borderWidth/borderColor double as the stroke's own width/color instead of a
  // decorative extra border, and maskId is unused (a stroke can't be silhouette-clipped the way a
  // fill can). "line" is still a plain solid fill (unlike the two outline kinds) — it's just a
  // thin bar — the tag exists only so the UI can show it a dedicated thickness slider and let it
  // resize past the page edge like the two true outline kinds.
  shapeStyle?: "rect-outline" | "circle-outline" | "line";
  locked?: boolean; // see AlbumPhotoElement.locked's own comment
};

export type AlbumElement = AlbumPhotoElement | AlbumTextElement | AlbumOrnamentElement | AlbumShapeElement;

// A frame is a photo element's shape (position/size) plus a few optional presentation fields
// (rotation/border/shadow) — the reusable unit a template stores. The presentation fields exist
// so styles like a "scattered" scrapbook look (tilted, polaroid-bordered frames) survive being
// saved and re-applied as a template; older templates simply omit them.
export type AlbumFrame = Pick<AlbumPhotoElement, "id" | "xPct" | "yPct" | "widthPct" | "heightPct"> &
  Partial<Pick<AlbumPhotoElement, "rotation" | "borderWidth" | "borderColor" | "shadow" | "shadowAngle">>;

export type AlbumTemplateRow = {
  id: string;
  photographer_id: string;
  name: string;
  frames: AlbumFrame[];
  created_at: string;
};

// A whole-book template — one frame layout per page, in order — as opposed to AlbumTemplateRow
// which is a single page's frames.
export type AlbumBookTemplateRow = {
  id: string;
  photographer_id: string;
  name: string;
  style: string;
  pages: AlbumFrame[][];
  created_at: string;
};

export type GalleryAlbumRow = {
  id: string;
  gallery_id: string;
  photographer_id: string;
  title: string;
  status: AlbumStatus;
  cover_photo_id: string | null;
  width_cm: number;
  height_cm: number;
  safe_margin_cm: number;
  approved_at: string | null;
  created_at: string;
};

export type GalleryAlbumSpreadRow = {
  id: string;
  album_id: string;
  sort_order: number;
  photo_id_1: string;
  photo_id_2: string | null;
  layout: AlbumSpreadLayout;
  focal_x_1: number;
  focal_y_1: number;
  focal_x_2: number;
  focal_y_2: number;
  elements: AlbumElement[];
  background_photo_id: string | null;
  background_blur: number; // 0-100
  background_opacity: number; // 0-100
  background_zoom: number; // 100-400, same convention as AlbumPhotoElement.zoom, default 100
  // Per-spread physical-size override, in cm — null means "use the album's own width_cm/
  // height_cm". Only ever set on a cover page created at a custom size.
  width_cm: number | null;
  height_cm: number | null;
  created_at: string;
};

export type GalleryAlbumCommentRow = {
  id: string;
  album_id: string;
  spread_id: string;
  text: string;
  created_at: string;
};

// Single-row heartbeat the PDF export worker writes on every poll tick — see
// src/lib/renderWorkerHealth.ts and migration 0103_worker_status.sql.
export type WorkerStatusRow = {
  id: 1;
  code_hash: string;
  last_heartbeat_at: string;
};

export type TeamMember = {
  id: string;
  photographer_id: string;
  name: string;
  email: string;
  created_at: string;
};
