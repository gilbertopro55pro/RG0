import webpush from "web-push";
import { createServiceRoleClient } from "@/lib/supabase/serviceRole";

// Phone notifications (Web Push, owner 2026-10-01). A photographer turns them on per device in
// settings (components/PushNotificationsSettings.tsx → api/push/subscribe); the server sends to
// every device they have. What's sent (owner's choice, kept short on purpose so notifications stay
// worth reading): a new lead from the assistant, a client approving a quote / signing a contract,
// a client approving an album design or leaving album comments.
//
// iPhone: only when the app was added to the home screen (iOS 16.4+), an Apple rule. Android: in
// the browser too. Keys: NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (Vercel).
// Sending never throws: a notification is a bonus on top of the email, never a reason for the
// action that triggered it to fail.

export type PushPayload = {
  title: string;
  body: string;
  // Opened when the notification is tapped (an app path, e.g. "/leads").
  url: string;
  // Same tag = the newer notification replaces the older one instead of stacking.
  tag?: string;
};

let configured: boolean | null = null;
function configure(): boolean {
  if (configured !== null) return configured;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    configured = false;
    return false;
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:support@myframeflow.com", pub, priv);
  configured = true;
  return true;
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

export async function sendPushToPhotographer(photographerId: string, payload: PushPayload): Promise<number> {
  try {
    if (!configure()) return 0;
    const supabase = createServiceRoleClient();
    const { data: subs } = await supabase
      .from("push_subscriptions")
      .select("id, endpoint, p256dh, auth")
      .eq("photographer_id", photographerId)
      .returns<Sub[]>();
    if (!subs?.length) return 0;
    const body = JSON.stringify(payload);
    let sent = 0;
    await Promise.all(
      subs.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: 24 * 3600, urgency: "high" });
          sent++;
          await supabase.from("push_subscriptions").update({ last_success_at: new Date().toISOString() }).eq("id", s.id);
        } catch (e) {
          const status = (e as { statusCode?: number }).statusCode;
          // 404/410: the device unsubscribed or the app was removed — forget it.
          if (status === 404 || status === 410) await supabase.from("push_subscriptions").delete().eq("id", s.id);
          else console.error("Push send failed:", photographerId, status ?? e);
        }
      })
    );
    return sent;
  } catch (e) {
    console.error("Push send error:", photographerId, e);
    return 0;
  }
}
