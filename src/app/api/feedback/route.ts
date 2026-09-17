import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/resend";
import { notificationEmailFor } from "@/lib/notificationEmail";

const FEEDBACK_RECIPIENT = process.env.FEEDBACK_RECIPIENT_EMAIL || "contact_us@gilbertopro.com";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { message }: { message: string } = await request.json();
  if (!message?.trim()) {
    return NextResponse.json({ error: "יש לכתוב הודעה" }, { status: 400 });
  }

  const [{ data: photographer }, { data: teamMember }] = await Promise.all([
    supabase.from("photographers").select("name, email").eq("id", user.id).maybeSingle<{ name: string; email: string }>(),
    supabase.from("team_members").select("name, email").eq("id", user.id).maybeSingle<{ name: string; email: string }>(),
  ]);

  const senderName = photographer?.name ?? teamMember?.name ?? "משתמש לא מזוהה";
  const rawSenderEmail = photographer?.email ?? teamMember?.email ?? user.email ?? "לא ידוע";
  const senderEmail = notificationEmailFor(rawSenderEmail);

  try {
    await sendEmail({
      to: FEEDBACK_RECIPIENT,
      subject: `הצעה/בקשה חדשה ממערכת ניהול צילום אירועים — ${senderName}`,
      text: `שולח/ת: ${senderName} (${senderEmail})\n\n${message}`,
      replyTo: senderEmail,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "שליחת ההודעה נכשלה" },
      { status: 500 }
    );
  }
}
