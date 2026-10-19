// Turns what the intake assistant collected in a conversation (leads.details) into a ready-to-review
// starting point for the quote builder (EventPricingCalculator): client and event fields, the shoot
// hours, and the supplier rows that match what the client asked the coverage to include. Pure (no
// React, no DB) so it can be tested on its own. Nothing here sends anything: the photographer still
// reviews every field in the builder and taps send.
import type { LeadQuoteDetails } from "@/lib/leadQuote";
import type { IntakeDetails, PriceQuoteTemplateRow, PricingSupplier } from "@/lib/types";
import { readQuoteDiscount, type QuoteDiscountType } from "@/lib/quoteDiscount";

// The builder's own fixed line for the shoot itself (hours × rate); never a vendor row.
const SHOOT_ITEM = "צילום אירוע";

// A quote line's details: a saved item's note in the builder, or part of a free-text row's name.
const detailsOf = (it: { details?: string }) => (it.details ?? "").trim();
const nameWithDetails = (it: { item: string; details?: string }) => (detailsOf(it) ? `${it.item} (${detailsOf(it)})` : it.item);

export type PrefillVendorRow = {
  // A saved supplier's id, or "__custom__" for a free-text row (name in customName).
  supplierId: string;
  customName: string;
  // A saved item's note, its details on the quote (a free-text row's details join its name).
  note?: string;
  price: number;
  // Why the row is there (for the summary shown above the rows, and for tests).
  reason: CoverageCategory | "template" | "sent";
};

export type LeadQuotePrefill = {
  clientName: string;
  clientPhone: string;
  eventType: string;
  eventDate: string; // YYYY-MM-DD or ""
  eventLocation: string;
  startTime: string; // HH:MM or ""
  endTime: string; // HH:MM or ""
  vendorRows: PrefillVendorRow[];
  // The saved template for this event that fits the request best (its items are the base rows).
  templateId: string | null;
  // What the client asked for, by category, in the order it was asked.
  requested: CoverageCategory[];
  // Short lines from the conversation for the photographer to keep in mind while reviewing
  // (guests, morning/evening, wishes...). Shown in the builder only, never put on the quote.
  hints: string[];
  // Reopened from the quote already sent to the lead (buildPrefillFromSentQuote), not from the
  // conversation: these carry the rest of that quote over as it was.
  sent?: {
    at: string; // ISO, when it was sent
    mode: "event" | "freelance";
    hours: number | null; // a freelance quote's hours; an event quote's come from its times
    shootPrice: number | null; // a freelance quote's "צילום אירוע" line, so the rate gives the same price
    taxStatus: "exempt" | "licensed";
    notes: string;
    discount: { type: QuoteDiscountType; value: number } | null;
  };
};

export type CoverageCategory = "photo" | "video" | "secondVideo" | "album" | "magnets" | "drone" | "prints" | "clip" | "stream";

type CategoryDef = { key: CoverageCategory; stems: string[]; label: string };

// Order matters when classifying a supplier name that mentions two things ("צילום וידאו" is video,
// "מגנטים + צילום" is magnets): the more specific product wins, plain photography is last.
const CATEGORIES: CategoryDef[] = [
  { key: "stream", stems: ["שידור", "לייב", "live", "stream"], label: "שידור חי" },
  { key: "clip", stems: ["קליפ", "טריילר", "היילייט", "highlight", "trailer", "clip"], label: "קליפ" },
  { key: "video", stems: ["וידאו", "וידיאו", "הסרטה", "video"], label: "צילום וידאו" },
  { key: "drone", stems: ["רחפנ", "drone"], label: "רחפן" },
  { key: "magnets", stems: ["מגנט", "magnet"], label: "מגנטים" },
  { key: "album", stems: ["אלבומ", "album"], label: "אלבום" },
  { key: "prints", stems: ["הדפס", "הגדל", "print"], label: "הדפסות" },
  { key: "photo", stems: ["תמונ", "צילומ", "סטילס", "צלמ", "photo", "still"], label: "צילום סטילס" },
];

const NEGATIONS = ["בלי", "ללא", "לא צריכ", "לא רוצ", "לא מעוניינ", "without", "no"].map((w) => normalizeHe(w));
// Lead-ins the client uses for something optional ("אפשרות למגנטים"): still a request, the
// photographer can remove it, but they shouldn't end up in a free-text row's name.
const OPTIONAL_PREFIXES = /^(?:ו?(?:גם|אולי|אפשרות|אופציה|אופציית|תוספת|עם)\s*(?:ל|של\s+)?)+/;

// Folds the spellings people actually type onto one form: case, final letters, niqqud, quotes,
// hyphens, double vav/yod ("מצוה"/"מצווה", "וידיאו"/"וידאו" both still match their stems).
export function normalizeHe(s: string): string {
  return s
    .toLowerCase()
    .replace(/[֑-ׇ]/g, "")
    .replace(/[״"׳'`]/g, "")
    .replace(/[-_/]+/g, " ")
    .replace(/ם/g, "מ")
    .replace(/ן/g, "נ")
    .replace(/ץ/g, "צ")
    .replace(/ף/g, "פ")
    .replace(/ך/g, "כ")
    .replace(/וו/g, "ו")
    .replace(/יי/g, "י")
    .replace(/\s+/g, " ")
    .trim();
}

const NORM_CATEGORIES = CATEGORIES.map((c) => ({ ...c, stems: c.stems.map(normalizeHe) }));

// Explicit words for stills. "צלם"/"צילום" alone also appear inside "צלם וידאו" / "צילום רחפן",
// so they only count as photography when nothing more specific is in the same phrase.
const EXPLICIT_PHOTO = ["תמונ", "סטילס", "photo", "still"].map(normalizeHe);

function categoriesIn(text: string): CoverageCategory[] {
  const n = normalizeHe(text);
  // In the order the client wrote them ("תמונות ווידאו" → photo, then video).
  const found = NORM_CATEGORIES.map((c) => ({ key: c.key, at: Math.min(...c.stems.map((s) => (n.includes(s) ? n.indexOf(s) : Infinity))) }))
    .filter((c) => c.at !== Infinity)
    .sort((a, b) => a.at - b.at)
    .map((c) => c.key);
  if (found.length > 1 && found.includes("photo") && !EXPLICIT_PHOTO.some((s) => n.includes(s))) {
    return found.filter((c) => c !== "photo");
  }
  return found;
}

// The one category a supplier/item name belongs to (first in CATEGORIES order), or null.
export function classifyName(name: string): CoverageCategory | null {
  const n = normalizeHe(name);
  return NORM_CATEGORIES.find((c) => c.stems.some((s) => n.includes(s)))?.key ?? null;
}

type Segment = { text: string; categories: CoverageCategory[] };

// Splits the coverage text into the separate things asked for ("תמונות, אלבום דיגיטלי מעוצב,
// אפשרות למגנטים"), drops the ones the client said no to, and tags each with its categories.
export function parseCoverage(coverage: string | undefined, videoCrew?: string): Segment[] {
  const segments: Segment[] = [];
  for (const raw of (coverage ?? "").split(/[,،;\n]|\s\+\s|\sוגם\s/)) {
    const text = raw.trim();
    if (!text) continue;
    const n = normalizeHe(text);
    if (NEGATIONS.some((w) => n === w || n.startsWith(`${w} `) || n.includes(` ${w} `) || (w.length > 2 && n.startsWith(w)))) continue;
    const categories = categoriesIn(text);
    if (categories.length) segments.push({ text, categories });
  }
  // A second crew member for video ("כן, צריך צלם וידאו" / "שני אנשי צוות").
  const crew = normalizeHe(videoCrew ?? "");
  if (crew && segments.some((s) => s.categories.includes("video"))) {
    const negative = /^(לא|אינ|בלי|ללא|no)\b/.test(crew) || /לא צריכ|לא רוצ|אינ צורכ/.test(crew);
    if (!negative) segments.push({ text: videoCrew!.trim(), categories: ["secondVideo"] });
  }
  return segments;
}

function words(s: string): string[] {
  return normalizeHe(s)
    .split(" ")
    .map((w) => w.replace(/^[והבלמש](?=\S{3,})/, ""))
    .filter((w) => w.length >= 2);
}

const ADD_ON = /(^| )(שני|שניה|נוספ|נוספת|תוספת|second|extra|add)( |$)/;

// The supplier in `category` that best matches what the client wrote (most shared words), ties to
// the first in the photographer's own list order. An add-on ("צלם שני", "תוספת מגנטים") only when
// the client asked for one: for "תמונות" the main stills supplier, not the second photographer
// (seen on the admin's real list, 2026-10-01).
function bestSupplier(suppliers: PricingSupplier[], category: CoverageCategory, askedText: string, taken: Set<string>): PricingSupplier | null {
  const candidates = suppliers.filter((s) => !taken.has(s.id) && classifyName(s.name) === category);
  if (!candidates.length) return null;
  const asked = new Set(words(askedText));
  const addOn = (name: string) => ADD_ON.test(normalizeHe(name));
  const askedAddOn = addOn(askedText);
  let best = candidates[0];
  let bestScore = -Infinity;
  for (const s of candidates) {
    const score =
      words(s.name).filter((w) => asked.has(w) || [...asked].some((a) => a.startsWith(w) || w.startsWith(a))).length - (addOn(s.name) && !askedAddOn ? 2 : 0);
    if (score > bestScore) {
      best = s;
      bestScore = score;
    }
  }
  return best;
}

// For "צלם וידאו נוסף": a supplier that is clearly the second video person, else a second video
// supplier that isn't already used, else a free-text row.
function secondVideoSupplier(suppliers: PricingSupplier[], taken: Set<string>): PricingSupplier | null {
  const video = suppliers.filter((s) => !taken.has(s.id) && classifyName(s.name) === "video");
  return video.find((s) => /נוספ|שני|second|צלמ/.test(normalizeHe(s.name))) ?? null;
}

function cleanLabel(text: string): string {
  return text.trim().replace(OPTIONAL_PREFIXES, "").trim() || text.trim();
}

function hhmm(t: string | undefined): string {
  const m = /^(\d{1,2}):(\d{2})/.exec((t ?? "").trim());
  if (!m) return "";
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return "";
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

// Names a template may use for the same event: a bar/bat mitzvah morning is often saved as
// "עלייה לתורה" / "הנחת תפילין" (the admin's templates are all "עלייה לתורה - ...", 2026-10-01).
function eventNames(eventType: string | undefined): string[] {
  const ev = normalizeHe(eventType ?? "");
  if (!ev) return [];
  const names = [ev];
  if (/(בר|בת) ?מצו/.test(ev) || /עלי[הת] לתורה|תפילינ/.test(ev)) names.push("בר מצוה", "בת מצוה", "עליה לתורה", "תפילינ");
  return [...new Set(names)];
}

function templateMatchesEvent(t: PriceQuoteTemplateRow, eventType: string | undefined): boolean {
  const n = normalizeHe(t.name);
  const flat = n.replace(/ /g, "");
  return eventNames(eventType).some((e) => n.includes(e) || flat.includes(e.replace(/ /g, "")));
}

// The saved template for this event that fits what the client asked for best: among the templates
// named for the event type, the one covering the most requested categories with the fewest
// categories nobody asked for ("סטילס, וידאו ואלבום, מגנטים" for photos + album + magnets: three
// covered, one extra; better than "סטילס" alone).
export function matchTemplate(templates: PriceQuoteTemplateRow[], eventType: string | undefined, requested: CoverageCategory[] = []): PriceQuoteTemplateRow | null {
  const candidates = templates.filter((t) => templateMatchesEvent(t, eventType));
  if (!candidates.length) return null;
  const score = (t: PriceQuoteTemplateRow) => {
    const cats = new Set(t.items.map((it) => classifyName(it.item)).filter((c): c is CoverageCategory => !!c));
    const covered = requested.filter((c) => cats.has(c)).length;
    const extra = [...cats].filter((c) => !requested.includes(c)).length;
    return covered * 2 - extra;
  };
  return candidates.reduce((best, t) => (score(t) > score(best) ? t : best), candidates[0]);
}

export function buildLeadQuotePrefill(input: {
  details: IntakeDetails;
  // Fallbacks from the lead row itself, for anything the conversation didn't collect.
  leadName?: string | null;
  leadPhone?: string | null;
  // photographers.pricing_suppliers
  suppliers: PricingSupplier[];
  // price_quote_templates rows
  templates: PriceQuoteTemplateRow[];
}): LeadQuotePrefill {
  const { details: d, suppliers, templates } = input;
  const rows: PrefillVendorRow[] = [];
  const taken = new Set<string>();
  const coveredCategories = new Set<CoverageCategory>();

  const segments = parseCoverage(d.coverage, d.videoCrew);
  const asked = [...new Set(segments.flatMap((sg) => sg.categories))];
  const template = matchTemplate(templates, d.eventType, asked);
  if (template) {
    for (const it of template.items) {
      if (it.item === SHOOT_ITEM) continue;
      // The template's items for what wasn't asked for are left out (its video lines for a client
      // who wants photos, an album and magnets). Items with no category (fees, travel) stay.
      const itemCat = classifyName(it.item);
      if (asked.length && itemCat && !asked.includes(itemCat)) continue;
      // Same item→row matching the builder uses when a template is picked by hand.
      const s = suppliers.find((sup) => sup.name === it.item);
      if (s) taken.add(s.id);
      rows.push(
        s
          ? // The template's price for this package, not the supplier's list price on its own.
            { supplierId: s.id, customName: "", note: detailsOf(it), price: typeof it.price === "number" ? it.price : s.price, reason: "template" }
          : { supplierId: "__custom__", customName: nameWithDetails(it), price: it.price, reason: "template" }
      );
      const cat = classifyName(it.item);
      if (cat) coveredCategories.add(cat);
    }
  }

  const requested: CoverageCategory[] = [];
  for (const seg of segments) {
    for (const cat of seg.categories) {
      if (requested.includes(cat)) continue;
      requested.push(cat);
      if (coveredCategories.has(cat)) continue;
      coveredCategories.add(cat);
      const s = cat === "secondVideo" ? secondVideoSupplier(suppliers, taken) : bestSupplier(suppliers, cat, seg.text, taken);
      if (s) {
        taken.add(s.id);
        rows.push({ supplierId: s.id, customName: "", price: s.price, reason: cat });
        continue;
      }
      // Plain photography is already the builder's own "צילום אירוע" line (hours × rate).
      if (cat === "photo") continue;
      const label =
        cat === "secondVideo"
          ? "צלם וידאו נוסף"
          : seg.categories.length === 1
            ? cleanLabel(seg.text)
            : CATEGORIES.find((c) => c.key === cat)!.label;
      rows.push({ supplierId: "__custom__", customName: label, price: 0, reason: cat });
    }
  }

  const hints: string[] = [];
  if (d.eventSlot) hints.push(d.eventSlot === "morning" ? "אירוע בוקר" : d.eventSlot === "afternoon" ? "אירוע צהריים" : "אירוע ערב");
  if (d.guests?.trim()) hints.push(`${d.guests.trim()} מוזמנים`);
  if (d.dateUndecided && d.approxDate?.trim()) hints.push(`תאריך משוער: ${d.approxDate.trim()}`);
  if (d.coverage?.trim()) hints.push(`ביקשו: ${d.coverage.trim()}`);
  if (d.videoCrew?.trim()) hints.push(`צלם וידאו נוסף: ${d.videoCrew.trim()}`);
  if (d.wishes?.trim()) hints.push(`בקשות: ${d.wishes.trim()}`);

  return {
    clientName: (d.clientName || input.leadName || "").trim(),
    clientPhone: (d.phone || input.leadPhone || "").trim(),
    eventType: (d.eventType ?? "").trim(),
    eventDate: !d.dateUndecided && /^\d{4}-\d{2}-\d{2}$/.test(d.eventDate ?? "") ? d.eventDate! : "",
    eventLocation: (d.location ?? "").trim(),
    startTime: hhmm(d.startTime),
    endTime: hhmm(d.endTime),
    vendorRows: rows,
    templateId: template?.id ?? null,
    requested,
    hints,
  };
}

// "עדכון הצעת מחיר" on a lead the builder already sent a quote to: start from that quote
// (leads.quote_details) as it went out, not from the assistant's conversation again, so a price typed
// by hand or a row added or removed isn't lost (found 2026-10-11: a manual 1,800 came back empty).
// Items match a saved supplier by name but keep the price that was sent.
export function buildPrefillFromSentQuote(input: {
  quote: LeadQuoteDetails;
  leadName?: string | null;
  leadPhone?: string | null;
  suppliers: PricingSupplier[];
}): LeadQuotePrefill {
  const { quote: q, suppliers } = input;
  const shoot = q.items.find((it) => it.item === SHOOT_ITEM);
  const startTime = hhmm(q.startTime);
  const endTime = hhmm(q.endTime);
  // A freelance quote has only the shoot line, with its hours as the details ("6 שעות") and no times.
  const freelanceHours = !startTime && shoot ? /^(\d+(?:\.\d+)?)\s*שעות$/.exec(shoot.details.trim()) : null;
  const mode = freelanceHours && q.items.length === 1 ? "freelance" : "event";
  return {
    clientName: (input.leadName ?? "").trim(),
    clientPhone: (input.leadPhone ?? "").trim(),
    eventType: (q.eventType ?? "").trim(),
    eventDate: /^\d{4}-\d{2}-\d{2}$/.test(q.eventDate ?? "") ? q.eventDate! : "",
    eventLocation: (q.eventLocation ?? "").trim(),
    startTime,
    endTime,
    // An event quote's priced shoot line (hours × rate, before the builder stopped pricing hours
    // outside freelance mode) comes back as a row with its price, so the total stays as it went out.
    vendorRows: q.items
      .filter((it) => it.item !== SHOOT_ITEM || (mode === "event" && it.price > 0))
      .map((it) => {
        const s = suppliers.find((sup) => sup.name === it.item);
        return s
          ? { supplierId: s.id, customName: "", note: detailsOf(it), price: it.price, reason: "sent" as const }
          : { supplierId: "__custom__", customName: nameWithDetails(it), price: it.price, reason: "sent" as const };
      }),
    templateId: null,
    requested: [],
    hints: [],
    sent: {
      at: q.createdAt,
      mode,
      hours: freelanceHours ? Number(freelanceHours[1]) : null,
      shootPrice: mode === "freelance" && shoot ? shoot.price : null,
      taxStatus: q.showVat ? "licensed" : "exempt",
      notes: q.notes ?? "",
      discount: readQuoteDiscount(q.discount),
    },
  };
}

// Whether the builder sent this lead a quote it can reopen (the simple amount form saves no items).
export function hasSentQuote(quote: LeadQuoteDetails | null | undefined): quote is LeadQuoteDetails {
  return !!quote && Array.isArray(quote.items) && quote.items.length > 0;
}

// Whether a lead has anything from the assistant worth pre-filling the builder with.
export function hasQuotePrefill(details: IntakeDetails | null | undefined): details is IntakeDetails {
  return !!details && Object.values(details).some((v) => typeof v === "string" && v.trim() !== "");
}
