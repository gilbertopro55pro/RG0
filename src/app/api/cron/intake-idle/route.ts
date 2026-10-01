import { NextResponse, type NextRequest } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";
import { finalizeIdleConversations } from "@/lib/intakeAssistant";

export const runtime = "nodejs";
export const maxDuration = 60;

// Every few minutes: hands the photographer the assistant conversations that went quiet (see
// finalizeIdleConversations — the client gave the details and stopped answering).
export async function GET(request: NextRequest) {
  if (request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const result = await finalizeIdleConversations(createServiceRoleClient(), process.env.NEXT_PUBLIC_APP_URL ?? "https://myframeflow.com");
  return NextResponse.json(result);
}
