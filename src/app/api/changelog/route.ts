import { NextResponse, type NextRequest } from "next/server";
import { CHANGELOG, changesFor } from "@/lib/changelog";
import { getLang } from "@/i18n/server";

// The earlier versions for Settings › עדכונים (components/OlderUpdates.tsx), in the device's UI
// language. The page itself renders only the latest few.
export async function GET(request: NextRequest) {
  const from = Math.max(0, Number.parseInt(request.nextUrl.searchParams.get("from") ?? "0", 10) || 0);
  const lang = await getLang();
  return NextResponse.json({
    entries: CHANGELOG.slice(from).map((entry) => ({ version: entry.version, date: entry.date, changes: changesFor(entry, lang) })),
  });
}
