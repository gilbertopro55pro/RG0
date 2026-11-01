import { describe, expect, it } from "vitest";
import { isSelectionUpdateText, selectionUpdateText } from "@/lib/selectionNotice";

describe("the selection update line", () => {
  it("keeps the latest count, and is told apart from the final confirmation", () => {
    expect(selectionUpdateText(42)).toBe("הלקוח/ה עדכנו את בחירת התמונות מהגלריה, נבחרו כעת 42 תמונות");
    expect(isSelectionUpdateText(selectionUpdateText(3))).toBe(true);
    expect(isSelectionUpdateText("דנה סיימו לבחור תמונות מהגלריה, נבחרו 40 תמונות")).toBe(false);
    expect(isSelectionUpdateText(null)).toBe(false);
  });
});
