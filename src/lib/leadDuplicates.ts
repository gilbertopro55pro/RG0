import type { createServiceRoleClient } from "@/lib/supabase/serviceRole";

type ServiceClient = ReturnType<typeof createServiceRoleClient>;

export type LeadMatch = {
  id: string;
  name: string;
  phone: string | null;
  event_date_interest: string | null;
  event_type_name: string | null;
  status: string;
  source: string | null;
  created_at: string;
};

// The photographer's leads with the same phone (any format: 050-..., +972..., 97250...), newest
// first. find_leads_by_phone (migration 0134) is service-role only, so callers pass a photographer
// id they already authenticated.
export async function findLeadsByPhone(service: ServiceClient, photographerId: string, phone: string | null | undefined): Promise<LeadMatch[]> {
  if (!phone || phone.replace(/\D/g, "").length < 9) return [];
  const { data, error } = await service.rpc("find_leads_by_phone", { p_photographer: photographerId, p_phone: phone });
  if (error) {
    console.error("find_leads_by_phone failed:", error);
    return [];
  }
  return (data ?? []) as LeadMatch[];
}
