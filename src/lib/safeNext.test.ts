import { describe, expect, it } from "vitest";
import { safeNextPath } from "@/lib/safeNext";

describe("safeNextPath", () => {
  it("keeps a path on this site, with its query", () => {
    expect(safeNextPath("/album-corrections/a0f78f77-89b6-4ddb-b553-111d7c514482")).toBe("/album-corrections/a0f78f77-89b6-4ddb-b553-111d7c514482");
    expect(safeNextPath("/galleries/abc?openAlbum=1")).toBe("/galleries/abc?openAlbum=1");
    expect(safeNextPath("/events/1?closing=1#stages")).toBe("/events/1?closing=1#stages");
  });

  it("refuses another site", () => {
    for (const raw of ["https://evil.com", "//evil.com", "/\\evil.com", "\\\\evil.com", "evil.com", "/%5Cevil.com\\x", "javascript:alert(1)", " /events"]) {
      expect(safeNextPath(raw)).toBeNull();
    }
  });

  it("refuses control characters and very long values", () => {
    expect(safeNextPath("/events/1\n//evil.com")).toBeNull();
    expect(safeNextPath(`/${"a".repeat(2001)}`)).toBeNull();
  });

  it("skips the home screen, the login pages and the API", () => {
    expect(safeNextPath("/")).toBeNull();
    expect(safeNextPath("/login?next=/x")).toBeNull();
    expect(safeNextPath("/signup")).toBeNull();
    expect(safeNextPath("/api/tasks")).toBeNull();
  });

  it("refuses anything that isn't a string", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(["/events/1"])).toBeNull();
  });
});
