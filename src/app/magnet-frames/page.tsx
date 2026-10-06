import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { ADMIN_EMAIL } from "@/lib/admin";
import { designToolsAllowed } from "@/lib/designTools";
import { hasAppAccess } from "@/lib/subscription";
import type { Photographer } from "@/lib/types";
import MagnetFrameEditor from "@/components/MagnetFrameEditor";
import BackLink from "@/components/BackLink";
import { getT } from "@/i18n/server";

// פרו / פרו+ (designToolsAllowed, same rule as the album designer). Replaces the old AI-generated
// /frame-designer tool (removed): this one is a plain white mat the photographer designs by hand.
export default async function MagnetFramesPage() {
  const supabase = await createClient();
  const t = await getT();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: photographer } = await supabase.from("photographers").select("*").eq("id", user.id).maybeSingle<Photographer>();
  if (!photographer || !designToolsAllowed(photographer)) redirect("/");
  if (photographer.email !== ADMIN_EMAIL && !hasAppAccess(photographer)) redirect("/billing");

  return (
    // The editor renders its own title row (title, help, save) and sizes itself to the screen, so the
    // bottom padding stays small: the page itself doesn't scroll.
    <div className="max-w-md sm:max-w-none sm:w-[85%] lg:w-[80%] mx-auto px-4 pt-5 pb-4 w-full">
      <BackLink href="/" label={t("חזרה לדף הבית")} className="mb-3" />
      <MagnetFrameEditor />
    </div>
  );
}
