import { randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { buildGoogleAuthUrl } from "@/lib/google";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(buildGoogleAuthUrl(state));
  res.cookies.set("google_oauth_state", state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return res;
}
