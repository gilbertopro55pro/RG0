import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Which build is live right now — polled by UpdateReloadGate so a tab left open across a deploy
// finds out it's running old code. See NEXT_PUBLIC_BUILD_ID in next.config.ts.
export function GET() {
  return NextResponse.json({ buildId: process.env.NEXT_PUBLIC_BUILD_ID }, { headers: { "Cache-Control": "no-store" } });
}
