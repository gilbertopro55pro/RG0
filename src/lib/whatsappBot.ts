import type { SupabaseClient } from "@supabase/supabase-js";
import { PACKAGE_LABELS, type PackageType } from "@/lib/stages";
import type { EventTypeRow, PackagePriceRow } from "@/lib/types";
import { scheduleLeadFollowUps } from "@/lib/leadFollowUp";

const ANTHROPIC_MODEL = "claude-sonnet-5";
const MAX_TOOL_ROUNDS = 4;

type ClaudeMessage = { role: "user" | "assistant"; content: unknown };

type BotConversation = {
  id: string;
  photographer_id: string;
  client_phone: string;
  state: "collecting_info" | "quoted" | "waitlisted" | "closed" | "abandoned";
  collected: Record<string, unknown>;
  messages: ClaudeMessage[];
  lead_id?: string | null;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

async function callClaude(system: string, messages: ClaudeMessage[], tools: object[]) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": requireEnv("ANTHROPIC_API_KEY"),
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 1024, system, messages, tools }),
  });
  if (!res.ok) throw new Error(`שגיאת Claude API: ${await res.text()}`);
  return res.json();
}

function buildTools(eventTypeNames: string[]) {
  return [
    {
      name: "check_availability",
      description: "בודק אם תאריך מסוים פנוי ביומן של הצלם/ת",
      input_schema: {
        type: "object",
        properties: { date: { type: "string", description: "תאריך בפורמט YYYY-MM-DD" } },
        required: ["date"],
      },
    },
    {
      name: "create_quote",
      description:
        "יוצר הצעת מחיר (או פנייה ליצירת קשר ישיר אם החבילה לא מתומחרת אוטומטית) ומעביר אותה לאישור הצלם/ת, לאחר שהתאריך אומת כפנוי",
      input_schema: {
        type: "object",
        properties: {
          clientName: { type: "string" },
          eventDate: { type: "string", description: "YYYY-MM-DD" },
          eventType: { type: "string", enum: eventTypeNames, description: "סוג האירוע, בדיוק כפי שמופיע ברשימה" },
          package: { type: "string", enum: ["stills", "stills_reel", "stills_video", "full", "full_second"] },
          location: { type: "string" },
        },
        required: ["clientName", "eventDate", "eventType", "package"],
      },
    },
    {
      name: "add_to_waitlist",
      description: "מוסיף את הלקוח לרשימת המתנה כי התאריך המבוקש תפוס",
      input_schema: {
        type: "object",
        properties: {
          clientName: { type: "string" },
          eventDate: { type: "string", description: "YYYY-MM-DD" },
          notes: { type: "string" },
        },
        required: ["clientName", "eventDate"],
      },
    },
  ];
}

async function executeTool(
  supabase: SupabaseClient,
  conversation: BotConversation,
  eventTypes: EventTypeRow[],
  name: string,
  input: Record<string, string>
): Promise<{ result: unknown; conversationPatch: Partial<BotConversation> }> {
  const photographerId = conversation.photographer_id;
  const clientPhone = conversation.client_phone;

  if (name === "check_availability") {
    const { data: conflicting } = await supabase
      .from("events")
      .select("client_name")
      .eq("photographer_id", photographerId)
      .eq("event_date", input.date)
      .maybeSingle<{ client_name: string }>();
    return { result: { available: !conflicting }, conversationPatch: {} };
  }

  if (name === "create_quote") {
    const pkg = input.package as PackageType;
    const eventType = eventTypes.find((t) => t.name.trim() === input.eventType?.trim());

    let amount: number | null = null;
    if (eventType) {
      const { data: priceRow } = await supabase
        .from("package_prices")
        .select("price")
        .eq("event_type_id", eventType.id)
        .eq("package", pkg)
        .maybeSingle<{ price: number | null }>();
      amount = priceRow?.price ?? null;
    }

    const leadFields = {
      photographer_id: photographerId,
      name: input.clientName,
      phone: clientPhone,
      event_date_interest: input.eventDate,
      package_interest: pkg,
      event_type_name: input.eventType,
      status: amount !== null ? "quoted" : "new",
      quoted_amount: amount,
      quote_note: amount !== null
        ? `נוצר אוטומטית ע"י בוט הוואטסאפ${input.location ? ` · מיקום: ${input.location}` : ""}`
        : `הבוט לא מצא מחיר אוטומטי לשילוב הזה, נדרשת יצירת קשר ישירה עם הלקוח.${input.location ? ` מיקום: ${input.location}` : ""}`,
      quote_sent_at: amount !== null ? new Date().toISOString() : null,
    };

    const isNewLead = !conversation.lead_id;
    const { data: lead } = isNewLead
      ? await supabase.from("leads").insert(leadFields).select().single<{ id: string }>()
      : await supabase.from("leads").update(leadFields).eq("id", conversation.lead_id).select().single<{ id: string }>();

    if (isNewLead && lead?.id) {
      await scheduleLeadFollowUps(supabase, lead.id, photographerId);
    }

    return {
      result:
        amount !== null
          ? { quotedAmount: amount, packageLabel: PACKAGE_LABELS[pkg] }
          : { needsManualContact: true },
      conversationPatch: { state: "quoted", lead_id: lead?.id } as unknown as Partial<BotConversation>,
    };
  }

  if (name === "add_to_waitlist") {
    await supabase.from("waitlist").insert({
      photographer_id: photographerId,
      requested_date: input.eventDate,
      client_name: input.clientName,
      client_phone: clientPhone,
      notes: input.notes || null,
    });
    return { result: { added: true }, conversationPatch: { state: "waitlisted" } };
  }

  return { result: { error: "unknown tool" }, conversationPatch: {} };
}

export async function getOrCreateConversation(
  supabase: SupabaseClient,
  photographerId: string,
  clientPhone: string
): Promise<BotConversation> {
  const { data: existing } = await supabase
    .from("bot_conversations")
    .select("*")
    .eq("photographer_id", photographerId)
    .eq("client_phone", clientPhone)
    .maybeSingle<BotConversation>();
  if (existing) return existing;

  const { data: created } = await supabase
    .from("bot_conversations")
    .insert({ photographer_id: photographerId, client_phone: clientPhone })
    .select()
    .single<BotConversation>();
  return created!;
}

export async function runBotTurn(
  supabase: SupabaseClient,
  conversation: BotConversation,
  photographerName: string,
  incomingText: string
): Promise<string> {
  const [{ data: eventTypes }, { data: prices }] = await Promise.all([
    supabase.from("event_types").select("*").eq("photographer_id", conversation.photographer_id).returns<EventTypeRow[]>(),
    supabase.from("package_prices").select("*").eq("photographer_id", conversation.photographer_id).returns<PackagePriceRow[]>(),
  ]);
  const types = eventTypes ?? [];
  const priceRows = prices ?? [];

  const priceTable = types
    .map((t) => {
      const rows = priceRows.filter((p) => p.event_type_id === t.id);
      const line = (Object.keys(PACKAGE_LABELS) as PackageType[])
        .map((pkg) => {
          const row = rows.find((r) => r.package === pkg);
          const price = row?.price;
          return `${PACKAGE_LABELS[pkg]}: ${price != null ? `₪${price}` : "לא מוצע"}`;
        })
        .join(", ");
      return `- ${t.name}: ${line}`;
    })
    .join("\n");

  const today = new Date().toISOString().slice(0, 10);

  const system = `את/ה עוזר/ת AI של ${photographerName}, צלם/ת אירועים. תפקידך לשוחח עם לקוחות פוטנציאליים בוואטסאפ בעברית, בנימוס ובקצרה, כמו הודעת וואטסאפ אמיתית (לא ארוך מדי).
היום: ${today}.

סוגי אירועים ומחירון (חבילה = "לא מוצע" פירושו שאין תמחור אוטומטי, יש להציע חלופה אחרת מאותו סוג אירוע שכן מתומחרת, ואם כלל אין תמחור לסוג האירוע, לציין שהצלם/ת יחזור/תחזור אליהם ישירות עם הצעה):
${priceTable || "(הצלם/ת עדיין לא הגדיר/ה מחירון, בכל מקרה יש ליצור פנייה ולציין שיחזרו אליהם)"}

אסוף/י בהדרגה: שם מלא, תאריך האירוע המבוקש, סוג האירוע (מהרשימה למעלה בדיוק), וסוג החבילה הרצויה, ומיקום (אופציונלי).
ברגע שיש לך שם, תאריך, סוג אירוע וחבילה, קרא/י ל-check_availability. אם פנוי, קרא/י מיד ל-create_quote. אם תפוס, קרא/י ל-add_to_waitlist והסבר/י ללקוח שהוא נכנס לרשימת המתנה וש${photographerName} יחזור/תחזור אליו בנוגע לאפשרות של צלם/ת אחר/ת לאותו תאריך.
אל תמציא/י מחיר בעצמך, הסתמך/י רק על המחירון למעלה, ותמיד קרא/י ל-create_quote כדי לרשום את הפנייה במערכת.
אחרי create_quote, ציין/י בבירור שההזמנה תסוכם סופית מול ${photographerName}.`;

  const messages: ClaudeMessage[] = [...conversation.messages, { role: "user", content: incomingText }];
  const tools = buildTools(types.map((t) => t.name));

  let finalText = "מצטער/ת, לא הצלחתי לעבד את הבקשה כרגע. ננסה שוב בקרוב.";
  let conversationPatch: Partial<BotConversation> = {};

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await callClaude(system, messages, tools);
    const content: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, string> }> =
      response.content;

    messages.push({ role: "assistant", content });

    const toolUses = content.filter((b) => b.type === "tool_use");
    if (toolUses.length === 0) {
      finalText = content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      break;
    }

    const toolResults = [];
    for (const toolUse of toolUses) {
      const { result, conversationPatch: patch } = await executeTool(
        supabase,
        { ...conversation, ...conversationPatch },
        types,
        toolUse.name!,
        toolUse.input!
      );
      conversationPatch = { ...conversationPatch, ...patch };
      toolResults.push({ type: "tool_result", tool_use_id: toolUse.id, content: JSON.stringify(result) });
    }
    messages.push({ role: "user", content: toolResults });
  }

  await supabase
    .from("bot_conversations")
    .update({ messages, updated_at: new Date().toISOString(), ...conversationPatch })
    .eq("id", conversation.id);

  return finalText;
}
