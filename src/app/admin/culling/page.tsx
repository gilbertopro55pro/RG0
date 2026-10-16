import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import CullingLabeler from "@/components/CullingLabeler";

// Photo culling, round 0 (owner, 2026-10-16): the admin labels the photos of a test gallery by hand
// ("מודל סינון", a folder per event), so the culling engine can be measured against real answers.
// Admin only.
export default async function CullingLabelsPage({ searchParams }: { searchParams: Promise<{ gallery?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.email !== ADMIN_EMAIL) redirect("/");

  const { gallery } = await searchParams;
  const { data: galleries } = await supabase
    .from("galleries")
    .select("id, title")
    .eq("photographer_id", user.id)
    .not("is_portfolio_only", "is", true)
    .order("created_at", { ascending: false })
    .returns<{ id: string; title: string }[]>();
  const list = galleries ?? [];
  const initial = list.find((g) => g.id === gallery)?.id ?? list.find((g) => g.title.trim() === "מודל סינון")?.id ?? null;

  return (
    <div className="max-w-3xl mx-auto px-4 pt-7 pb-10 w-full">
      <CullingLabeler userId={user.id} galleries={list} initialGalleryId={initial} />
    </div>
  );
}
