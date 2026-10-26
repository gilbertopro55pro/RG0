import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionUser } from "@/lib/supabase/sessionUser";
import { TASK_COLUMNS, isIsoDate, israelToday, parseTaskInput, type TaskRow } from "@/lib/tasks";

// The daily to-do list (lib/tasks.ts). GET: the day's tasks, and on today the open ones left from
// earlier days. POST: a new task. Each user's own (RLS, user_id = auth.uid()).
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  const date = new URL(request.url).searchParams.get("date");
  if (!isIsoDate(date)) return NextResponse.json({ error: "תאריך לא תקין" }, { status: 400 });
  const today = israelToday();
  const supabase = await createClient();
  const [{ data: tasks, error }, { data: overdue }] = await Promise.all([
    supabase.from("tasks").select(TASK_COLUMNS).eq("task_date", date).order("created_at", { ascending: true }).returns<TaskRow[]>(),
    date === today
      ? supabase.from("tasks").select(TASK_COLUMNS).lt("task_date", today).eq("done", false).order("task_date", { ascending: true }).limit(200).returns<TaskRow[]>()
      : Promise.resolve({ data: [] as TaskRow[] }),
  ]);
  if (error) return NextResponse.json({ error: "שגיאה בטעינה" }, { status: 500 });
  return NextResponse.json({ today, tasks: tasks ?? [], overdue: overdue ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  const parsed = parseTaskInput(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  // An undone delete comes back as it was (done included).
  const { done, ...fields } = parsed.value;
  const { data, error } = await supabase
    .from("tasks")
    .insert({ ...fields, user_id: user.id, ...(done ? { done: true, done_at: new Date().toISOString() } : {}) })
    .select(TASK_COLUMNS)
    .single<TaskRow>();
  if (error || !data) return NextResponse.json({ error: "השמירה נכשלה. נסו שוב." }, { status: 500 });
  return NextResponse.json({ task: data });
}
