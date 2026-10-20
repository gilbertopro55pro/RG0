import { describe, expect, it } from "vitest";
import { dateConflictMessage } from "@/lib/dateConflictMessage";
import { makeT } from "@/i18n/translate";

// Hebrew: the keys themselves, with the {name} placeholders filled in.
const t = makeT({});

describe("dateConflictMessage", () => {
  it("names the app's event, and offers to save anyway only when allowed", () => {
    expect(dateConflictMessage(t, { conflictSource: "event", conflictWith: " Dana " }, false)).toBe("כבר קיים אירוע בתאריך זה (Dana).");
    expect(dateConflictMessage(t, { conflictSource: "event", conflictWith: "Dana" }, true)).toBe("כבר קיים אירוע בתאריך זה (Dana). אפשר לשמור בכל זאת.");
  });

  it("names the calendar booking, or says something is there when it has no title", () => {
    expect(dateConflictMessage(t, { conflictSource: "calendar", conflictWith: "Cohen wedding" }, true)).toBe("ביומן Google שלכם כבר רשום בתאריך הזה: Cohen wedding.");
    expect(dateConflictMessage(t, { conflictSource: "calendar", conflictWith: "  " }, true)).toBe("ביומן Google שלכם כבר רשום משהו בתאריך הזה.");
    expect(dateConflictMessage(t, { conflictSource: "calendar" }, false)).toBe("ביומן Google שלכם כבר רשום משהו בתאריך הזה.");
  });

  it("falls back to the server's own error, then to a generic line", () => {
    expect(dateConflictMessage(t, { error: "שגיאה מהשרת" }, false)).toBe("שגיאה מהשרת");
    expect(dateConflictMessage(t, {}, false)).toBe("כבר קיים אירוע בתאריך זה");
  });

  it("translates through the photographer's dictionary", () => {
    const en = makeT({ "כבר קיים אירוע בתאריך זה ({name}).": "There's already an event on this date ({name})." });
    expect(dateConflictMessage(en, { conflictSource: "event", conflictWith: "Dana" }, false)).toBe("There's already an event on this date (Dana).");
  });
});
