import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: teamMemberId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { data: teamMember } = await supabase
    .from("team_members")
    .select("id, photographer_id")
    .eq("id", teamMemberId)
    .single<{ id: string; photographer_id: string }>();

  if (!teamMember || teamMember.photographer_id !== user.id) {
    return NextResponse.json({ error: "לא נמצא" }, { status: 404 });
  }

  const serviceRole = createServiceRoleClient();
  const { error } = await serviceRole.auth.admin.deleteUser(teamMemberId);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
