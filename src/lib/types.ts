import type { PackageType, StageKey } from "@/lib/stages";

export type SubscriptionStatus = "incomplete" | "active" | "past_due" | "canceled" | "trialing";

export type Photographer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  plan: "monthly" | "annual";
  google_calendar_connected: boolean;
  google_calendar_color_id: string | null;
  whatsapp_signature: string | null;
  whatsapp_bot_enabled: boolean;
  payplus_customer_uid: string | null;
  payplus_recurring_uid: string | null;
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
  created_at: string;
};

export type EventRow = {
  id: string;
  photographer_id: string;
  client_name: string;
  client_phone: string | null;
  package: PackageType | null;
  custom_package_id: string | null;
  event_date: string;
  event_location: string | null;
  arrival_time: string | null;
  event_start_time: string | null;
  event_end_time: string | null;
  google_calendar_event_id: string | null;
  client_access_token: string;
  album_design_pdf_path: string | null;
  album_design_pdf_filename: string | null;
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

export type TeamMember = {
  id: string;
  photographer_id: string;
  name: string;
  email: string;
  created_at: string;
};
