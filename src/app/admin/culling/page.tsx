import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { ADMIN_EMAIL } from "@/lib/admin";
import Link from "next/link";
import CullingLabeler from "@/components/CullingLabeler";
import CullingBench from "@/components/CullingBench";
import { getT } from "@/i18n/server";

// Photo culling, round 0 (owner, 2026-10-16): the admin labels the photos of a test gallery by hand
// ("מודל סינון", a folder per event), so the culling engine can be measured against real answers.
// Round 1 (?tab=bench): the engine runs on the same gallery and is measured against the labels.
// Admin only.
export default async function CullingLabelsPage({ searchParams }: { searchParams: Promise<{ gallery?: string; tab?: string }> }) {
  const supabase = await createClient();
  const user = await getSessionUser();
  if (!user || user.email !== ADMIN_EMAIL) redirect("/");

  const { gallery, tab } = await searchParams;
  const t = await getT();
  const { data: galleries } = await supabase
    .from("galleries")
    .select("id, title")
    .eq("photographer_id", user.id)
    .not("is_portfolio_only", "is", true)
    .order("created_at", { ascending: false })
    .returns<{ id: string; title: string }[]>();
  const list = galleries ?? [];
  const initial = list.find((g) => g.id === gallery)?.id ?? list.find((g) => g.title.trim() === "מודל סינון")?.id ?? null;

  const bench = tab === "bench";
  const tabClass = (on: boolean) => `px-4 py-2 rounded-full text-sm font-semibold border ${on ? "bg-ink text-white border-ink" : "bg-white border-line text-ink-soft"}`;

  return (
    <div className="max-w-3xl mx-auto px-4 pt-7 pb-10 w-full">
      <div className="flex gap-2 mb-5">
        <Link href="/admin/culling" className={tabClass(!bench)}>
          {t("סימון")}
        </Link>
        <Link href="/admin/culling?tab=bench" className={tabClass(bench)}>
          {t("מדידת המנוע")}
        </Link>
      </div>
      {bench ? (
        <CullingBench userId={user.id} galleries={list} initialGalleryId={initial} />
      ) : (
        <CullingLabeler userId={user.id} galleries={list} initialGalleryId={initial} />
      )}
    </div>
  );
}
