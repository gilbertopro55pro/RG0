import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|manifest.json|sw.js|offline.html|icons/|guides/|splash/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|mp3|webm)$).*)",
  ],
};
