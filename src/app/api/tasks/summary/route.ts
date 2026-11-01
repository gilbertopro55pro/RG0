import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { DIGEST_DEFAULT_MINUTES } from "@/lib/morningDigest";
import { israelToday, type TasksSummary } from "@/lib/tasks";

// The top nav's tasks entry (lib/tasks.ts, useNavTasks): whether this account is a photographer
// (team members get no tasks, like on the home screen), the number of open tasks for today and
// earlier days, and the daily reminder's settings for the panel. Asked after the page is up, not
// while it renders: the JWT checked locally (lib/supabase/sessionUser.ts) and two small queries
// side by side (the count uses tasks_user_open_idx).
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ photographer: false } satisfies TasksSummary, { status: 401, headers: NO_STORE });
  const supabase = await createClient();
  const [{ data: photographer, error }, { count }] = await Promise.all([
    supabase
      .from("photographers")
      .select("morning_digest, morning_digest_minutes")
      .eq("id", user.id)
      .maybeSingle<{ morning_digest: boolean | null; morning_digest_minutes: number | null }>(),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("done", false).lte("task_date", israelToday()),
  ]);
  // A failed lookup isn't "not a photographer": the nav keeps the entry and asks again later.
  if (error) return NextResponse.json({ error: "שגיאה בטעינה" }, { status: 500, headers: NO_STORE });
  if (!photographer) return NextResponse.json({ photographer: false } satisfies TasksSummary, { headers: NO_STORE });
  const summary: TasksSummary = {
    photographer: true,
    photographerId: user.id,
    openCount: count ?? 0,
    morningDigest: {
      enabled: photographer.morning_digest ?? true,
      minutes: photographer.morning_digest_minutes ?? DIGEST_DEFAULT_MINUTES,
    },
  };
  return NextResponse.json(summary, { headers: NO_STORE });
}
