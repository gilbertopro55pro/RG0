"use client";

import ClientMessageSheet from "@/components/ClientMessageSheet";
import type { MagnetClientInfo } from "@/lib/magnetApproval";
import type { MagnetFrameDesignRow } from "@/lib/types";
import { useT } from "@/i18n/client";

export type SharedMagnetDesign = MagnetFrameDesignRow & { event: { id: string; client_name: string; event_date: string } | null };

// Sending a magnet frame to the client for approval (stage 3): the message with the portal link,
// in ClientMessageSheet like every message to a client. The send itself shares the frame in the
// portal (PATCH shareWithClient), recorded on the way out like the other client messages.
export default function SendForApprovalSheet({
  designId,
  info,
  onShared,
  onClose,
}: {
  designId: string;
  // From GET /api/magnet-frames/<id>/client, with a client and a message (the frame has an event).
  info: MagnetClientInfo & { client: NonNullable<MagnetClientInfo["client"]>; message: string };
  onShared?: (design: SharedMagnetDesign) => void;
  onClose: () => void;
}) {
  const t = useT();
  const record = () => {
    fetch(`/api/magnet-frames/${designId}`, {
      method: "PATCH",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shareWithClient: true }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { design?: SharedMagnetDesign } | null) => {
        if (data?.design) onShared?.(data.design);
      })
      .catch(() => {});
  };
  return (
    <ClientMessageSheet
      title={t("שליחת עיצוב המגנטים ל{name}", { name: info.client.name })}
      intro={t("הלקוח יראה את המסגרת בפורטל, ויוכל לאשר אותה או להשאיר הערה. אפשר לערוך את ההודעה לפני השליחה.")}
      initialText={info.message}
      lang={info.client.lang}
      phone={info.client.phone}
      email={info.client.email}
      subject={info.subject}
      onSend={record}
      onClose={onClose}
    />
  );
}

// Whether the frame can be sent: it has an event, and the client a phone or an email.
export function canSendForApproval(info: MagnetClientInfo | null): info is MagnetClientInfo & { client: NonNullable<MagnetClientInfo["client"]>; message: string } {
  return !!info?.client && !!info.message && (!!info.client.phone || !!info.client.email);
}
