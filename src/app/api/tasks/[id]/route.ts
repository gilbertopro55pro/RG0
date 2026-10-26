import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { TASK_COLUMNS, parseTaskInput, type TaskRow } from "@/lib/tasks";

// One task of the daily to-do list (lib/tasks.ts): edit (title, notes, date, done) or delete. RLS
// keeps it to the user's own.
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  const parsed = parseTaskInput(await request.json().catch(() => null), true);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const patch: Record<string, unknown> = { ...parsed.value, updated_at: new Date().toISOString() };
  if (parsed.value.done !== undefined) patch.done_at = parsed.value.done ? new Date().toISOString() : null;
  const { data, error } = await supabase.from("tasks").update(patch).eq("id", id).select(TASK_COLUMNS).maybeSingle<TaskRow>();
  if (error) return NextResponse.json({ error: "השמירה נכשלה. נסו שוב." }, { status: 500 });
  if (!data) return NextResponse.json({ error: "המשימה לא נמצאה" }, { status: 404 });
  return NextResponse.json({ task: data });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) return NextResponse.json({ error: "המחיקה נכשלה. נסו שוב." }, { status: 500 });
  return NextResponse.json({ ok: true });
}
