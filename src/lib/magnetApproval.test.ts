import { describe, expect, it } from "vitest";
import {
  CLEARED_CLIENT_APPROVAL,
  MAGNET_COMMENT_MAX,
  clientGreetingName,
  magnetApprovalMessage,
  magnetApprovalStatus,
  magnetApprovalSubject,
  parsePortalMagnetAction,
  shareWithClientPatch,
  type MagnetApprovalFields,
} from "@/lib/magnetApproval";

const row = (p: Partial<MagnetApprovalFields>): MagnetApprovalFields => ({
  client_shared_at: null,
  client_approved_at: null,
  client_comment: null,
  client_comment_at: null,
  updated_at: "2026-10-20T10:00:00.000000+00:00",
  ...p,
});

describe("magnetApprovalStatus", () => {
  it("is not shared until the photographer sends it", () => {
    expect(magnetApprovalStatus(row({}))).toBe("not_shared");
    // An old approval doesn't show once the share was stopped.
    expect(magnetApprovalStatus(row({ client_approved_at: "2026-10-21T10:00:00Z" }))).toBe("not_shared");
  });

  it("waits for the client once shared", () => {
    expect(magnetApprovalStatus(row({ client_shared_at: "2026-10-21T09:00:00Z" }))).toBe("waiting");
  });

  it("is approved, and changed after the approval when the frame was saved since", () => {
    const approved = row({ client_shared_at: "2026-10-21T09:00:00Z", client_approved_at: "2026-10-21T12:00:00.123456+00:00" });
    expect(magnetApprovalStatus(approved)).toBe("approved");
    expect(magnetApprovalStatus({ ...approved, updated_at: "2026-10-21T12:00:00.123+00:00" })).toBe("approved");
    expect(magnetApprovalStatus({ ...approved, updated_at: "2026-10-21T12:05:00+00:00" })).toBe("changed_after_approval");
  });

  it("shows the client's comment until the frame is sent again", () => {
    const commented = row({ client_shared_at: "2026-10-21T09:00:00Z", client_comment: "להגדיל את השמות", client_comment_at: "2026-10-21T11:00:00Z" });
    expect(magnetApprovalStatus(commented)).toBe("comment");
    // Sent again after the comment: waiting for the client again.
    expect(magnetApprovalStatus({ ...commented, client_shared_at: "2026-10-21T15:00:00Z" })).toBe("waiting");
    // An approval after a comment wins.
    expect(magnetApprovalStatus({ ...commented, client_approved_at: "2026-10-21T16:00:00Z" })).toBe("approved");
    // An empty comment isn't one.
    expect(magnetApprovalStatus({ ...commented, client_comment: "  " })).toBe("waiting");
  });
});

describe("shareWithClientPatch", () => {
  const now = "2026-10-22T08:00:00.000Z";
  it("shares now, and keeps an approval of this very design", () => {
    expect(shareWithClientPatch(row({}), now)).toEqual({ client_shared_at: now });
    expect(shareWithClientPatch(row({ client_shared_at: "2026-10-21T09:00:00Z", client_approved_at: "2026-10-21T12:00:00Z" }), now)).toEqual({ client_shared_at: now });
  });

  it("asks again for approval when the frame changed after it", () => {
    const changed = row({ client_shared_at: "2026-10-21T09:00:00Z", client_approved_at: "2026-10-21T12:00:00Z", updated_at: "2026-10-21T13:00:00Z" });
    const patch = shareWithClientPatch(changed, now);
    expect(patch).toEqual({ client_shared_at: now, client_approved_at: null });
    expect(magnetApprovalStatus({ ...changed, ...patch })).toBe("waiting");
  });

  it("puts a comment behind the new share", () => {
    const commented = row({ client_shared_at: "2026-10-21T09:00:00Z", client_comment: "x", client_comment_at: "2026-10-21T11:00:00Z" });
    expect(magnetApprovalStatus({ ...commented, ...shareWithClientPatch(commented, now) })).toBe("waiting");
  });

  it("clears everything when the frame leaves its event", () => {
    expect(magnetApprovalStatus(row({ ...CLEARED_CLIENT_APPROVAL }))).toBe("not_shared");
  });
});

describe("parsePortalMagnetAction", () => {
  it("accepts an approval and a trimmed comment", () => {
    expect(parsePortalMagnetAction({ action: "approve" })).toEqual({ action: "approve" });
    expect(parsePortalMagnetAction({ action: "comment", text: "  להחליף את הצבע  " })).toEqual({ action: "comment", text: "להחליף את הצבע" });
    expect(parsePortalMagnetAction({ action: "comment", text: "א".repeat(MAGNET_COMMENT_MAX) })).toEqual({ action: "comment", text: "א".repeat(MAGNET_COMMENT_MAX) });
  });

  it("refuses an empty, too long or unknown request", () => {
    expect(parsePortalMagnetAction(null)).toBeNull();
    expect(parsePortalMagnetAction("approve")).toBeNull();
    expect(parsePortalMagnetAction({ action: "delete" })).toBeNull();
    expect(parsePortalMagnetAction({ action: "comment", text: "   " })).toBeNull();
    expect(parsePortalMagnetAction({ action: "comment" })).toBeNull();
    expect(parsePortalMagnetAction({ action: "comment", text: 5 })).toBeNull();
    expect(parsePortalMagnetAction({ action: "comment", text: "א".repeat(MAGNET_COMMENT_MAX + 1) })).toBeNull();
  });
});

describe("clientGreetingName", () => {
  it("takes the first name of one person", () => {
    expect(clientGreetingName("דנה כהן")).toBe("דנה");
    expect(clientGreetingName("  Dana   Cohen ")).toBe("Dana");
    expect(clientGreetingName("אורי")).toBe("אורי");
  });

  it("keeps a couple's or a family's whole name", () => {
    expect(clientGreetingName("רותם ודניאל")).toBe("רותם ודניאל");
    expect(clientGreetingName("Rotem & Daniel")).toBe("Rotem & Daniel");
    expect(clientGreetingName("Rotem and Daniel")).toBe("Rotem and Daniel");
    expect(clientGreetingName("Анна и Борис")).toBe("Анна и Борис");
    expect(clientGreetingName("משפחת לוי")).toBe("משפחת לוי");
  });
});

describe("magnetApprovalMessage", () => {
  const link = "https://myframeflow.com/s/pABCDEFGHIJK#magnets";

  it("greets, links and signs with the signature", () => {
    expect(magnetApprovalMessage({ clientName: "דנה כהן", link, signature: "סטודיו אור 📸", senderName: "אור", lang: "he" })).toBe(
      `שלום דנה,\nעיצוב המגנטים לאירוע מוכן. אפשר לראות ולאשר אותו כאן:\n${link}\n\nסטודיו אור 📸`
    );
  });

  it("signs with the name when there's no signature, and with nothing when there's neither", () => {
    expect(magnetApprovalMessage({ clientName: "דנה", link, signature: "  ", senderName: "אור", lang: "he" }).endsWith("\n\nאור")).toBe(true);
    expect(magnetApprovalMessage({ clientName: "דנה", link, signature: null, senderName: null, lang: "he" }).endsWith(link)).toBe(true);
  });

  it("is in the client's language", () => {
    expect(magnetApprovalMessage({ clientName: "Dana Cohen", link, signature: null, senderName: "Or", lang: "en" })).toBe(
      `Hi Dana,\nThe magnet design for your event is ready. You can see and approve it here:\n${link}\n\nOr`
    );
    expect(magnetApprovalMessage({ clientName: "Анна", link, signature: null, senderName: null, lang: "ru" }).startsWith("Здравствуйте, Анна!")).toBe(true);
    expect(magnetApprovalSubject("he")).toBe("עיצוב המגנטים לאירוע");
    expect(magnetApprovalSubject("en")).toBe("Your magnet design");
  });
});
