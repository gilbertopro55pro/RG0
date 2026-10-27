// Marking a stage done from the event page (api/events/[id]/stages): whether the client gets the
// stage's update. A stage that takes the album-design PDF can be marked by hand without one
// (owner, 2026-10-27: "לסמן את שלב אישור עיצוב האלבום גם בלי להעלות קובץ"): the client approved
// outside the app, or the design went out another way. Then there's no file to send, so no update
// either. The standard "אישור עיצוב אלבום" stage never notifies from here: its PDF and message go
// out on upload (api/events/[id]/album-design).
export function stageMarkNotifies({
  done,
  hasNotifyText,
  requiresAlbumPdf,
  hasPdfInRequest,
  isStandardAlbumApproval,
}: {
  done: boolean;
  hasNotifyText: boolean;
  requiresAlbumPdf: boolean;
  hasPdfInRequest: boolean;
  isStandardAlbumApproval: boolean;
}): boolean {
  if (!done || !hasNotifyText || isStandardAlbumApproval) return false;
  return !(requiresAlbumPdf && !hasPdfInRequest);
}
