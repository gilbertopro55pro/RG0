"use client";

import BodyPortal from "@/components/BodyPortal";
import ClientMessageSheet, { type ClientMessageChannel } from "@/components/ClientMessageSheet";
import { useT } from "@/i18n/client";
import type { AlbumClientInfo } from "@/lib/albumApproval";

// The album tool's "שליחה לאישור הלקוח/ה" (owner, 2026-10-27: the button only marked the album as
// sent, and nothing reached the client). The message with the gallery's short link that opens the
// album (lib/albumApproval.ts), in ClientMessageSheet like every message to a client; each way out
// opens on the tap itself, and the send is recorded on the way (POST …/album/send-to-client).

export async function fetchAlbumClientInfo(galleryId: string): Promise<AlbumClientInfo> {
  const res = await fetch(`/api/galleries/${galleryId}/album/send-to-client`);
  if (!res.ok) throw new Error(`send info ${res.status}`);
  return (await res.json()) as AlbumClientInfo;
}

export function recordAlbumSend(galleryId: string, channel: ClientMessageChannel): Promise<{ sent_at: string } | null> {
  return fetch(`/api/galleries/${galleryId}/album/send-to-client`, {
    method: "POST",
    keepalive: true,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ channel }),
  })
    .then((res) => (res.ok ? res.json() : null))
    .then((data: { album?: { sent_at: string } } | null) => data?.album ?? null)
    .catch(() => null);
}

export default function AlbumSendToClient({
  info,
  onSend,
  onClose,
}: {
  info: AlbumClientInfo;
  onSend: (channel: ClientMessageChannel) => void;
  onClose: () => void;
}) {
  const t = useT();
  return (
    <ClientMessageSheet
      title={info.client.name ? t("שליחת עיצוב האלבום ל{name}", { name: info.client.name }) : t("שליחת עיצוב האלבום ללקוח")}
      intro={t("הלקוח יפתח את האלבום בקישור, ידפדף בו, ובסוף יאשר את העיצוב או יסמן תיקונים. אפשר לערוך את ההודעה לפני השליחה.")}
      initialText={info.message}
      lang={info.client.lang}
      phone={info.client.phone}
      email={info.client.email}
      subject={info.subject}
      onSend={onSend}
      onClose={onClose}
    />
  );
}

// The client sees the album only in their gallery, so an unpublished one has to be published first.
export function AlbumSendNotice({ kind, onClose }: { kind: "unpublished" | "error"; onClose: () => void }) {
  const t = useT();
  return (
    <BodyPortal>
      <div
        className="fixed inset-0 z-[80] flex items-center justify-center p-4"
        style={{ background: "rgba(28, 27, 25, 0.45)" }}
        role="dialog"
        aria-modal="true"
        onClick={onClose}
      >
        <div className="w-full max-w-sm rounded-3xl p-5 bg-paper shadow-sheet" onClick={(e) => e.stopPropagation()}>
          <h2 className="text-lg font-bold font-display mb-2">{kind === "unpublished" ? t("הגלריה עוד לא פורסמה") : t("לא הצלחנו להכין את ההודעה")}</h2>
          <p className="text-sm text-ink-soft leading-relaxed mb-4">
            {kind === "unpublished"
              ? t("הלקוח רואה את האלבום בגלריה שלו, ולכן קודם מפרסמים את הגלריה (\"פרסום הגלריה ללקוח\" בעמוד הגלריה), ואז שולחים את האלבום מכאן.")
              : t("בדקו את החיבור לאינטרנט ונסו שוב.")}
          </p>
          <button onClick={onClose} className="w-full h-11 rounded-xl text-sm font-semibold bg-ink text-white">
            {t("הבנתי")}
          </button>
        </div>
      </div>
    </BodyPortal>
  );
}
