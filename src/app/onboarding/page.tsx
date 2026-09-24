import { hasAppAccess } from "@/lib/subscription";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Photographer } from "@/lib/types";
import OnboardingView from "@/components/OnboardingView";

export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: Promise<{ google_connected?: string; google_error?: string }>;
}) {
  const { google_connected, google_error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: photographer } = await supabase
    .from("photographers")
    .select("*")
    .eq("id", user.id)
    .maybeSingle<Photographer>();
  if (!photographer) redirect("/");
  if (!hasAppAccess(photographer)) {
    redirect("/billing");
  }
  // Already completed (or dismissed) once before — this screen only fires the first time.
  if (photographer.onboarding_completed) redirect("/");

  return (
    <OnboardingView
      photographer={photographer}
      googleConnectedNotice={google_connected === "1"}
      googleErrorNotice={google_error === "1"}
    />
  );
}
