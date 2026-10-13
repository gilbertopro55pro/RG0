import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit } from "@/lib/rateLimit";

const ANTHROPIC_MODEL = "claude-sonnet-5";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "יש להתחבר מחדש" }, { status: 401 });
  }

  const { stageLabel, currentText }: { stageLabel?: string; currentText?: string } = await request.json();
  if (!stageLabel || !currentText?.trim()) {
    return NextResponse.json({ error: "שדות חובה חסרים" }, { status: 400 });
  }
  // Each call is a paid model request: a generous ceiling per photographer, and a message length
  // that fits a WhatsApp update (audit 2026-10-13).
  if (stageLabel.length > 200 || currentText.length > 2000) {
    return NextResponse.json({ error: "ההודעה ארוכה מדי" }, { status: 400 });
  }
  const { allowed } = await checkRateLimit(`ai-rewrite:${user.id}`, { maxRequests: 40, windowSeconds: 3600 });
  if (!allowed) {
    return NextResponse.json({ error: "יותר מדי בקשות לניסוח. נסו שוב בעוד שעה" }, { status: 429 });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "שירות ה-AI אינו זמין כרגע" }, { status: 500 });
  }

  const system = [
    "אתה עוזר לצלם/ת אירועים לנסח מחדש הודעת עדכון קצרה שנשלחת ללקוח בוואטסאפ.",
    `ההודעה עוסקת בנושא: ${stageLabel}.`,
    "כתוב נוסח חדש ושונה מהמקור, באותו סגנון, טון ואורך בערך, עברית, ישירה, חמה ולא רשמית מדי.",
    "שמור בדיוק על התגיות הבאות אם הן מופיעות במקור, בלי לשנות את הכתיב שלהן: {{שם}} (שם הלקוח), {{שלב}} (שם השלב), והמילה \"קישור:\" (מקום שבו יתווסף קישור).",
    "החזר אך ורק את נוסח ההודעה עצמה, בלי מרכאות, בלי הסברים, בלי כותרת.",
  ].join(" ");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 400,
      system,
      messages: [{ role: "user", content: currentText }],
    }),
  });

  if (!res.ok) {
    return NextResponse.json({ error: "שגיאה בפנייה ל-AI, נסו שוב" }, { status: 502 });
  }

  const data = await res.json();
  const text = data.content?.find((b: { type: string }) => b.type === "text")?.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "לא התקבל נוסח מה-AI, נסו שוב" }, { status: 502 });
  }

  return NextResponse.json({ text });
}
