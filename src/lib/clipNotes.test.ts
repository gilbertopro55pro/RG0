import { describe, expect, it } from "vitest";
import { PACKAGE_FLOWS, STAGE_LABELS, type PackageType } from "@/lib/stages";
import { stageRole } from "@/lib/clientReminders";
import { CLIP_NOTES_MAX, clipNotesLogText, packageHasClip, parseClipNotes } from "@/lib/clipNotes";

// The client's notes for the clip (owner, 2026-10-25).

describe("parseClipNotes", () => {
  it("keeps the text with its line breaks, trimmed", () => {
    expect(parseClipNotes("  שיהיה את סבתא בריקוד\nבלי הנאומים  ")).toBe("שיהיה את סבתא בריקוד\nבלי הנאומים");
  });

  it("turns Windows line breaks into plain ones and drops control characters", () => {
    expect(parseClipNotes("a\r\nb\rc\u0000d\u0007e\tf")).toBe("a\nb\ncde\tf");
  });

  it("keeps at most two empty lines in a row", () => {
    expect(parseClipNotes("a\n\n\n\n\n\nb")).toBe("a\n\n\nb");
  });

  it("cuts at the maximum", () => {
    expect(parseClipNotes("א".repeat(CLIP_NOTES_MAX + 50))).toHaveLength(CLIP_NOTES_MAX);
  });

  it("an empty text clears the notes; anything that isn't text is rejected", () => {
    expect(parseClipNotes("   \n ")).toBe("");
    expect(parseClipNotes(undefined)).toBeNull();
    expect(parseClipNotes(42)).toBeNull();
    expect(parseClipNotes({ notes: "x" })).toBeNull();
  });
});

describe("packageHasClip", () => {
  const builtIn = (pkg: PackageType) => PACKAGE_FLOWS[pkg].map((key) => ({ role: stageRole(key), label: STAGE_LABELS[key] }));

  it("every built-in package with a song stage has a clip, and only those", () => {
    const withClip = (Object.keys(PACKAGE_FLOWS) as PackageType[]).filter((p) => packageHasClip(builtIn(p)));
    expect(withClip.sort()).toEqual(
      [
        "full",
        "full_second",
        "stills_reel",
        "stills_video",
        "freelance_video_film_clip",
        "freelance_video_film_clip_teaser",
        "freelance_video_film_clip_reels",
      ].sort()
    );
  });

  it("a custom package counts by a song stage or a stage that names the clip", () => {
    expect(packageHasClip([{ role: null, label: "עריכת קליפ" }])).toBe(true);
    expect(packageHasClip([{ role: stageRole(null, { name: "בחירת שירים" }), label: "בחירת שירים" }])).toBe(true);
    expect(packageHasClip([{ role: null, label: "Clip editing" }])).toBe(true);
    expect(packageHasClip([{ role: null, label: "עריכת תמונות" }, { role: null, label: "מסירה" }])).toBe(false);
    expect(packageHasClip([])).toBe(false);
  });
});

describe("clipNotesLogText", () => {
  it("says whether the notes were written, changed or cleared", () => {
    expect(clipNotesLogText("דנה ואורי", null, "הערה")).toBe("דנה ואורי כתבו הערות לקליפ");
    expect(clipNotesLogText("דנה ואורי", "ישנה", "חדשה")).toBe("דנה ואורי עדכנו את ההערות לקליפ");
    expect(clipNotesLogText("דנה ואורי", "ישנה", "")).toBe("דנה ואורי מחקו את ההערות לקליפ");
  });
});
