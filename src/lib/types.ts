import type { PackageType, StageKey } from "@/lib/stages";

export type SubscriptionStatus = "incomplete" | "active" | "past_due" | "canceled" | "trialing";

export type InvoiceProvider = "finbot" | "green_invoice";

export type Photographer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  plan: "monthly" | "annual";
  google_calendar_connected: boolean;
  google_calendar_color_id: string | null;
  apple_calendar_connected: boolean;
  apple_calendar_email: string | null;
  apple_calendar_app_password: string | null;
  apple_calendar_url: string | null;
  apple_calendar_display_name: string | null;
  whatsapp_signature: string | null;
  whatsapp_bot_enabled: boolean;
  payplus_customer_uid: string | null;
  payplus_recurring_uid: string | null;
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
  auto_renew: boolean;
  cancel_at_period_end: boolean;
  renewal_reminder_sent_at: string | null;
  lead_follow_up_enabled: boolean;
  finbot_api_key: string | null;
  business_tax_status: "exempt" | "licensed";
  invoice_provider: InvoiceProvider;
  green_invoice_api_id: string | null;
  green_invoice_api_secret: string | null;
  created_at: string;
};

export type EventRow = {
  id: string;
  photographer_id: string;
  client_name: string;
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
  created_at: string;
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
  created_at: string;
};

export type LeadStatus = "new" | "contacted" | "quoted" | "won" | "lost";

export type LeadRow = {
  id: string;
  photographer_id: string;
  name: string;
  phone: string | null;
  email: string | null;
  event_date_interest: string | null;
  package_interest: PackageType | null;
  status: LeadStatus;
  notes: string | null;
  quoted_amount: number | null;
  quote_token: string;
  quote_note: string | null;
  quote_sent_at: string | null;
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
  access_token: string;
  password: string | null;
  published: boolean;
  cover_photo_id: string | null;
  expiry_months: 1 | 3 | 6 | null;
  published_at: string | null;
  expires_at: string | null;
  archived_at: string | null;
  permanent_delete_at: string | null;
  selection_confirmed_at: string | null;
  shoot_date: string | null;
  client_email: string | null;
  allow_downloads: boolean;
  reminder_sent_at: string | null;
  theme: string;
  palette: string;
  cover_text_position: string;
  cover_shape: string;
  title_font_override: string | null;
  grid_style_override: string | null;
  slideshow_photo_ids: string[];
  created_at: string;
};

export type GalleryPhotoRow = {
  id: string;
  gallery_id: string;
  photographer_id: string;
  storage_path: string;
  original_filename: string;
  file_size_bytes: number;
  sort_order: number;
  is_favorite: boolean;
  folder_id: string | null;
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
  shadow?: number; // 0-100 drop-shadow intensity, default 0
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
  color: "white" | "black";
  align: "right" | "center" | "left";
};

export type AlbumElement = AlbumPhotoElement | AlbumTextElement;

// A frame is a photo element's shape only (position/size) — the reusable unit a template stores.
export type AlbumFrame = Pick<AlbumPhotoElement, "id" | "xPct" | "yPct" | "widthPct" | "heightPct">;

export type AlbumTemplateRow = {
  id: string;
  photographer_id: string;
  name: string;
  frames: AlbumFrame[];
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
  created_at: string;
};

export type GalleryAlbumCommentRow = {
  id: string;
  album_id: string;
  spread_id: string;
  text: string;
  created_at: string;
};

export type TeamMember = {
  id: string;
  photographer_id: string;
  name: string;
  email: string;
  created_at: string;
};
