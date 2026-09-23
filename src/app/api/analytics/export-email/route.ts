import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/resend";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { email, csv, filename, monthLabel }: { email: string; csv: string; filename: string; monthLabel: string } =
    await request.json();

  if (!email?.trim() || !csv?.trim() || !filename?.trim()) {
    return NextResponse.json({ error: "חסרים פרטים לשליחה" }, { status: 400 });
  }

  try {
    await sendEmail({
      to: email.trim(),
      subject: `נתוני הכנסות | ${monthLabel} | גילברטו`,
      text: `מצורף קובץ הנתונים עבור ${monthLabel}.\n\nנשלח ממערכת גילברטו, ניהול אירועים לצלמים.`,
      attachments: [{ filename, content: Buffer.from(csv, "utf-8").toString("base64") }],
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "שליחת המייל נכשלה" }, { status: 500 });
  }
}
