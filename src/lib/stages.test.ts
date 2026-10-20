import { describe, expect, it } from "vitest";
import {
  CLIENT_MESSAGE_LINK_MARKER,
  CUSTOMIZABLE_MESSAGE_STAGES,
  DEFAULT_CLIENT_MESSAGE_TEMPLATE,
  DEFAULT_CLIENT_MESSAGE_TEMPLATE_I18N,
  FIXED_STAGES,
  PACKAGE_FLOWS,
  PACKAGE_LABELS,
  RECOMMENDED_CLIENT_MESSAGE_TEMPLATES,
  STAGE_LABELS,
  builtInClientMessageTemplate,
  currentStageIndex,
  customPackageFlow,
  isFixedStageName,
  packageLabel,
  resolveClientMessageTemplate,
  resolveLeadPackageLabel,
  type PackageType,
  type StageKey,
} from "@/lib/stages";
import { LANGS } from "@/i18n/config";

describe("FIXED_STAGES", () => {
  it("is event closing, then shoot day", () => {
    expect(FIXED_STAGES).toEqual(["event_closing", "shoot_day"]);
  });

  it("opens every non-freelance package with event closing, and every package has a shoot day", () => {
    for (const [pkg, flow] of Object.entries(PACKAGE_FLOWS) as [PackageType, StageKey[]][]) {
      expect(flow).toContain("shoot_day");
      if (!pkg.startsWith("freelance_")) expect(flow[0]).toBe("event_closing");
    }
  });

  it("starts every freelance package at the shoot day", () => {
    for (const [pkg, flow] of Object.entries(PACKAGE_FLOWS)) {
      if (pkg.startsWith("freelance_")) expect(flow[0]).toBe("shoot_day");
    }
  });

  it("never repeats a stage within a package", () => {
    for (const flow of Object.values(PACKAGE_FLOWS)) expect(new Set(flow).size).toBe(flow.length);
  });
});

describe("isFixedStageName", () => {
  it("matches the fixed stages' exact names, ignoring spaces around them", () => {
    expect(isFixedStageName("סגירת האירוע")).toBe(true);
    expect(isFixedStageName("יום הצילום")).toBe(true);
    expect(isFixedStageName("  יום הצילום \n")).toBe(true);
  });

  it("doesn't match other stages or near names", () => {
    expect(isFixedStageName("סגירת אירוע")).toBe(false);
    expect(isFixedStageName("יום צילום")).toBe(false);
    expect(isFixedStageName("עריכת תמונות")).toBe(false);
    expect(isFixedStageName("")).toBe(false);
  });
});

describe("customPackageFlow", () => {
  it("puts the fixed stages first, then the photographer's own in their order", () => {
    expect(
      customPackageFlow([
        { id: "c1", name: "פגישת היכרות" },
        { id: "c2", name: "עריכה" },
      ]),
    ).toEqual([
      { stage_key: "event_closing", custom_stage_id: null },
      { stage_key: "shoot_day", custom_stage_id: null },
      { stage_key: null, custom_stage_id: "c1" },
      { stage_key: null, custom_stage_id: "c2" },
    ]);
  });

  it("drops an old custom stage named like a fixed one", () => {
    expect(
      customPackageFlow([
        { id: "old1", name: "סגירת האירוע" },
        { id: "c1", name: "עריכה" },
        { id: "old2", name: " יום הצילום " },
        { id: "c2", name: "מסירה" },
      ]).map((s) => s.custom_stage_id ?? s.stage_key),
    ).toEqual(["event_closing", "shoot_day", "c1", "c2"]);
  });

  it("is just the fixed stages for a package with no stages of its own", () => {
    expect(customPackageFlow([])).toEqual([
      { stage_key: "event_closing", custom_stage_id: null },
      { stage_key: "shoot_day", custom_stage_id: null },
    ]);
  });
});

describe("package labels", () => {
  it("names a built-in package, or the custom one, or a generic custom label", () => {
    expect(packageLabel("full")).toBe("חבילה מלאה");
    expect(packageLabel(null, "החבילה של אור")).toBe("החבילה של אור");
    expect(packageLabel(null)).toBe("חבילה מותאמת אישית");
    expect(packageLabel(null, null)).toBe("חבילה מותאמת אישית");
  });

  it("reads a lead's package: a built-in key or custom:<id>", () => {
    const custom = [{ id: "abc", name: "חבילת זהב" }];
    expect(resolveLeadPackageLabel("stills", custom)).toBe(PACKAGE_LABELS.stills);
    expect(resolveLeadPackageLabel("custom:abc", custom)).toBe("חבילת זהב");
    expect(resolveLeadPackageLabel("custom:missing", custom)).toBeNull();
    expect(resolveLeadPackageLabel("nonsense", custom)).toBeNull();
    expect(resolveLeadPackageLabel(null, custom)).toBeNull();
  });

  it("has a label for every package and every stage", () => {
    for (const pkg of Object.keys(PACKAGE_FLOWS) as PackageType[]) expect(PACKAGE_LABELS[pkg]).toBeTruthy();
    for (const flow of Object.values(PACKAGE_FLOWS)) for (const s of flow) expect(STAGE_LABELS[s]).toBeTruthy();
  });
});

describe("currentStageIndex", () => {
  it("is the first stage not done", () => {
    expect(currentStageIndex([{ done: true }, { done: false }, { done: false }])).toBe(1);
    expect(currentStageIndex([{ done: false }, { done: true }])).toBe(0);
  });

  it("is past the end when everything is done, or there are no stages", () => {
    expect(currentStageIndex([{ done: true }, { done: true }])).toBe(2);
    expect(currentStageIndex([])).toBe(0);
  });
});

describe("client message templates", () => {
  it("has a built-in template for every customizable stage in every language, with the name and the link marker", () => {
    for (const lang of LANGS) {
      for (const stage of CUSTOMIZABLE_MESSAGE_STAGES) {
        const tpl = builtInClientMessageTemplate(stage, lang);
        expect(tpl).toContain("{{שם}}");
        expect(tpl).toContain(CLIENT_MESSAGE_LINK_MARKER[lang]);
      }
    }
  });

  it("falls back to the generic template for other stages", () => {
    expect(builtInClientMessageTemplate("backup")).toBe(DEFAULT_CLIENT_MESSAGE_TEMPLATE);
    expect(builtInClientMessageTemplate("backup", "en")).toBe(DEFAULT_CLIENT_MESSAGE_TEMPLATE_I18N.en);
    expect(builtInClientMessageTemplate("custom-stage-id", "ru")).toBe(DEFAULT_CLIENT_MESSAGE_TEMPLATE_I18N.ru);
  });

  it("uses the photographer's saved text over the built-in one", () => {
    expect(resolveClientMessageTemplate("event_closing", "שלום {{שם}}")).toBe("שלום {{שם}}");
    expect(resolveClientMessageTemplate("event_closing", undefined)).toBe(RECOMMENDED_CLIENT_MESSAGE_TEMPLATES.event_closing);
    expect(resolveClientMessageTemplate("event_closing", null, "en")).toBe(builtInClientMessageTemplate("event_closing", "en"));
  });
});
