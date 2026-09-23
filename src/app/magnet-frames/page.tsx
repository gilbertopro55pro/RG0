import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import type { Photographer } from "@/lib/types";
import MagnetFrameEditor from "@/components/MagnetFrameEditor";
import BackLink from "@/components/BackLink";

// Admin-only for now (see the standing "עדכון אדמין" staged-rollout process) — replaces the old
// AI-generated /frame-designer tool (removed): this one is a plain white mat the photographer
// designs by hand, not something a model generates.
export default async function MagnetFramesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: photographer } = await supabase.from("photographers").select("*").eq("id", user.id).maybeSingle<Photographer>();
  if (!photographer || photographer.email !== ADMIN_EMAIL) redirect("/");

  return (
    <div className="max-w-md lg:max-w-none lg:w-[80%] mx-auto px-4 pt-7 pb-10 w-full">
      <BackLink href="/" label="חזרה לדף הבית" className="mb-5" />
      <h1 className="text-[26px] font-bold font-display mb-5">עיצוב מסגרת מגנט</h1>
      <MagnetFrameEditor />
    </div>
  );
}
