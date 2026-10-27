import { describe, expect, it } from "vitest";
import { albumApprovalByEvent, albumApprovalMessage, isAlbumReminderDays, printSizeNote } from "@/lib/albumApproval";

// Sending the album design to the client for approval (owner, 2026-10-27).
describe("albumApprovalMessage", () => {
  it("greets the client, carries the link and signs once", () => {
    const text = albumApprovalMessage({ clientName: "דנה כהן", link: "https://myframeflow.com/s/gAbc?album=1", signature: "סטודיו אור", senderName: "אור", lang: "he" });
    expect(text.startsWith("שלום דנה,\n")).toBe(true);
    expect(text).toContain("https://myframeflow.com/s/gAbc?album=1");
    expect(text).toContain("לאשר אותו או לסמן תיקונים");
    expect(text.endsWith("\n\nסטודיו אור")).toBe(true);
    expect(text).not.toContain("\nאור");
  });
  it("signs with the name without a signature, and keeps a couple's whole name", () => {
    const text = albumApprovalMessage({ clientName: "רותם ודניאל", link: "L", signature: "  ", senderName: "אור", lang: "he" });
    expect(text.startsWith("שלום רותם ודניאל,")).toBe(true);
    expect(text.endsWith("\n\nאור")).toBe(true);
  });
  it("speaks the client's language", () => {
    expect(albumApprovalMessage({ clientName: "Dana Cohen", link: "L", signature: null, senderName: null, lang: "en" }).startsWith("Hi Dana,")).toBe(true);
    expect(albumApprovalMessage({ clientName: "Анна", link: "L", signature: null, senderName: null, lang: "ru" }).startsWith("Здравствуйте, Анна!")).toBe(true);
  });
  it("drops the greeting line when there's no name", () => {
    const text = albumApprovalMessage({ clientName: "", link: "L", signature: null, senderName: null, lang: "he" });
    expect(text.startsWith("עיצוב האלבום מוכן")).toBe(true);
  });
});

describe("isAlbumReminderDays", () => {
  it("takes whole days from 1 to 14", () => {
    expect(isAlbumReminderDays(1)).toBe(true);
    expect(isAlbumReminderDays(14)).toBe(true);
    expect(isAlbumReminderDays(0)).toBe(false);
    expect(isAlbumReminderDays(15)).toBe(false);
    expect(isAlbumReminderDays("3")).toBe(false);
  });
});

describe("albumApprovalByEvent", () => {
  const row = (eventId: string | null, status: string, sent: string | null, approved: string | null = null) => ({
    status,
    sent_at: sent,
    approved_at: approved,
    gallery: { event_id: eventId },
  });
  it("reads sent, approved and corrections", () => {
    const out = albumApprovalByEvent([
      row("e1", "sent", "2026-10-27T08:00:00Z"),
      row("e2", "approved", "2026-10-20T08:00:00Z", "2026-10-22T08:00:00Z"),
      row("e3", "changes_requested", "2026-10-21T08:00:00Z"),
    ]);
    expect(out.e1).toEqual({ kind: "sent", at: "2026-10-27T08:00:00Z" });
    expect(out.e2).toEqual({ kind: "approved", at: "2026-10-22T08:00:00Z" });
    expect(out.e3).toEqual({ kind: "changes", at: "2026-10-21T08:00:00Z" });
  });
  it("skips drafts, albums sent before the date was kept, and galleries without an event", () => {
    const out = albumApprovalByEvent([row("e1", "draft", null), row("e2", "sent", null), row(null, "sent", "2026-10-27T08:00:00Z")]);
    expect(out).toEqual({});
  });
  it("takes the album that moved last when an event has two", () => {
    const out = albumApprovalByEvent([row("e1", "sent", "2026-10-20T08:00:00Z"), row("e1", "sent", "2026-10-25T08:00:00Z")]);
    expect(out.e1).toEqual({ kind: "sent", at: "2026-10-25T08:00:00Z" });
  });
  it("accepts the gallery as an array (Supabase embed)", () => {
    const out = albumApprovalByEvent([{ status: "sent", sent_at: "2026-10-27T08:00:00Z", approved_at: null, gallery: [{ event_id: "e9" }] }]);
    expect(out.e9).toEqual({ kind: "sent", at: "2026-10-27T08:00:00Z" });
  });
});

describe("printSizeNote", () => {
  it("names the album's size", () => {
    expect(printSizeNote({ width_cm: 60, height_cm: "30.00" }, [{ width_cm: null, height_cm: null }])).toBe("מידות האלבום: 60×30 ס״מ");
  });
  it("names a cover, or another page, with a size of its own", () => {
    const note = printSizeNote({ width_cm: 60, height_cm: 30 }, [
      { width_cm: 32, height_cm: 32 },
      { width_cm: null, height_cm: null },
      { width_cm: 60, height_cm: 30 },
      { width_cm: 30.5, height_cm: 30 },
    ]);
    expect(note).toBe("מידות האלבום: 60×30 ס״מ\nמידות הכריכה: 32×32 ס״מ\nמידות עמוד 4: 30.5×30 ס״מ");
  });
});
