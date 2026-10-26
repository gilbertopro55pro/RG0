// The clip notes card on the portal page (PortalClipNotes) and the song stage's "שמירה ושליחה
// בוואטסאפ" (PortalStageActions) are separate components (owner, 2026-10-26). The card registers
// here while it's on screen, so the WhatsApp message carries the notes the client sees, saved or
// still being typed, and a typed draft is saved along with the songs. Set only in an effect, in the
// browser, so the server never holds one.
export type ClipNotesBridge = {
  // The notes on the screen: the field's text while editing, else the saved notes.
  current: () => string;
  // Saves the field's text when it differs from the saved notes.
  flush: () => void;
};

let bridge: ClipNotesBridge | null = null;

export function setClipNotesBridge(next: ClipNotesBridge): () => void {
  bridge = next;
  return () => {
    if (bridge === next) bridge = null;
  };
}

export function clipNotesBridge(): ClipNotesBridge | null {
  return bridge;
}
