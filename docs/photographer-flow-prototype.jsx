import React, { useState, useEffect, useMemo } from "react";
import { Camera, Calendar, Check, Plus, ChevronRight, Bell, CreditCard, X, Film, Image as ImageIcon, Music, Album, Truck, Clock } from "lucide-react";

// ---------- Fonts ----------
function useFonts() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Frank+Ruhl+Libre:wght@500;700;900&family=Rubik:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500&display=swap";
    document.head.appendChild(link);
    return () => document.head.removeChild(link);
  }, []);
}

// ---------- Design tokens ----------
const C = {
  paper: "#F6F7FB",      // soft pastel lavender-blue backdrop
  ink: "#2E3142",        // deep slate ink
  inkSoft: "#7B7F94",
  amber: "#8B93E8",      // pastel periwinkle — primary accent
  amberDeep: "#6169C4",
  amberBg: "#EBEDFB",
  sage: "#6FBE9A",        // pastel mint — done / success
  sageBg: "#E3F5EC",
  rose: "#E8A0A0",
  peach: "#F3C9A0",
  line: "#E4E6F1",
  card: "#FFFFFF",
};

const shadowSm = "0 1px 2px rgba(46,49,66,0.04), 0 4px 14px rgba(46,49,66,0.05)";
const shadowMd = "0 2px 6px rgba(46,49,66,0.06), 0 12px 28px rgba(46,49,66,0.09)";

const display = { fontFamily: "'Frank Ruhl Libre', serif" };
const mono = { fontFamily: "'IBM Plex Mono', monospace" };

// ---------- Stage definitions ----------
const STAGE_DEFS = {
  event_closing: { label: "סגירת האירוע", icon: Check, type: "checkpoint" },
  shoot_day: { label: "יום הצילום", icon: Camera, type: "checkpoint" },
  backup: { label: "גיבוי חומר גולמי", icon: Film, type: "internal" },
  culling: { label: "מיון תמונות", icon: ImageIcon, type: "internal" },
  photo_editing: { label: "עריכת תמונות", icon: ImageIcon, type: "internal" },
  gallery_upload: { label: "העלאת גלריה ל-wfolio", icon: ImageIcon, type: "internal", notifyClient: "הגלריה מוכנה — אפשר לבחור תמונות" },
  client_photo_selection: { label: "בחירת תמונות (לאלבום)", icon: ImageIcon, type: "checkpoint" },
  client_song_selection: { label: "בחירת שיר לקליפ", icon: Music, type: "checkpoint" },
  video_editing: { label: "עריכת וידאו", icon: Film, type: "internal" },
  video_approval: { label: "אישור וידאו", icon: Film, type: "checkpoint", notifyClient: "הוידאו מוכן לצפייה ואישור" },
  album_design: { label: "עיצוב אלבום", icon: Album, type: "internal" },
  album_approval: { label: "אישור עיצוב אלבום", icon: Album, type: "checkpoint", notifyClient: "עיצוב האלבום מוכן לאישור" },
  album_production: { label: "הפקת/הדפסת אלבום", icon: Album, type: "internal" },
  final_delivery: { label: "מסירה סופית", icon: Truck, type: "checkpoint", notifyClient: "כל החומרים שלכם מוכנים!" },
  second_shooter_coordination: { label: "תיאום צלם שני", icon: Camera, type: "internal" },
};

const PACKAGE_FLOWS = {
  stills: ["event_closing", "shoot_day", "backup", "culling", "photo_editing", "gallery_upload", "final_delivery"],
  stills_reel: ["event_closing", "shoot_day", "backup", "culling", "photo_editing", "gallery_upload",
    "client_song_selection", "video_editing", "video_approval", "final_delivery"],
  stills_video: ["event_closing", "shoot_day", "backup", "culling", "photo_editing", "gallery_upload",
    "client_song_selection", "video_editing", "video_approval", "final_delivery"],
  full: ["event_closing", "shoot_day", "backup", "culling", "photo_editing", "gallery_upload",
    "client_photo_selection", "client_song_selection", "video_editing", "video_approval",
    "album_design", "album_approval", "album_production", "final_delivery"],
  full_second: ["event_closing", "second_shooter_coordination", "shoot_day", "backup", "culling", "photo_editing", "gallery_upload",
    "client_photo_selection", "client_song_selection", "video_editing", "video_approval",
    "album_design", "album_approval", "album_production", "final_delivery"],
};

const PACKAGE_LABEL = {
  stills: "סטילס בלבד",
  stills_reel: "סטילס + קליפ",
  stills_video: "סטילס + סרט ערוך",
  full: "חבילה מלאה",
  full_second: "חבילה מלאה + צלם שני",
};

function makeInitialStages(pkg) {
  const flow = PACKAGE_FLOWS[pkg];
  const stages = {};
  flow.forEach((key, i) => { stages[key] = { done: i === 0, doneAt: i === 0 ? new Date().toISOString() : null }; });
  return stages;
}

function currentStageIndex(event) {
  const flow = PACKAGE_FLOWS[event.package];
  for (let i = 0; i < flow.length; i++) {
    if (!event.stages[flow[i]].done) return i;
  }
  return flow.length; // all done
}

// ---------- Storage ----------
async function loadProfile() {
  try {
    const res = await window.storage.get("photographer_profile", false);
    return res ? JSON.parse(res.value) : { name: "רועי גלברט", phone: "" };
  } catch {
    return { name: "רועי גלברט", phone: "" };
  }
}
async function saveProfile(profile) {
  try { await window.storage.set("photographer_profile", JSON.stringify(profile), false); } catch (e) { console.error(e); }
}

async function loadEvents() {
  try {
    const res = await window.storage.get("events", false);
    return res ? JSON.parse(res.value) : [];
  } catch {
    return [];
  }
}
async function saveEvents(events) {
  try { await window.storage.set("events", JSON.stringify(events), false); } catch (e) { console.error(e); }
}

// ---------- Seed demo data ----------
function seedEvent() {
  const stages = makeInitialStages("full");
  stages.shoot_day = { done: true, doneAt: new Date(Date.now() - 86400000 * 3).toISOString() };
  stages.backup = { done: true, doneAt: new Date(Date.now() - 86400000 * 2).toISOString() };
  return {
    id: "demo-1",
    clientName: "משפחת כהן",
    clientPhone: "0501234567",
    package: "full",
    eventDate: new Date(Date.now() - 86400000 * 3).toISOString().slice(0, 10),
    createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
    stages,
    payments: { deposit: 1500, balance: 3500, depositPaid: true, balancePaid: false, dueDate: new Date(Date.now() + 86400000 * 14).toISOString().slice(0, 10) },
    notifications: [
      { ts: new Date(Date.now() - 86400000 * 3).toISOString(), text: "האירוע צולם בהצלחה" },
      { ts: new Date(Date.now() - 86400000 * 2).toISOString(), text: "החומר גובה בהצלחה" },
    ],
  };
}

// ---------- Film-strip stage tracker ----------
function FilmStrip({ event, onToggle, onUndo, onSendWhatsApp }) {
  const flow = PACKAGE_FLOWS[event.package];
  const curIdx = currentStageIndex(event);
  return (
    <div className="space-y-1.5">
      {flow.map((key, i) => {
        const def = STAGE_DEFS[key];
        const st = event.stages[key];
        const Icon = def.icon;
        const isCurrent = i === curIdx;
        const locked = i > curIdx && key !== "event_closing";
        const canUndo = st.done && i === curIdx - 1 && key !== "event_closing";
        const waMessage = def.notifyClient || `עדכון לגבי האירוע: "${def.label}" הושלם.`;
        return (
          <div key={key} className="rounded-xl overflow-hidden transition-shadow" style={{ border: `1px solid ${st.done ? "#CFE0D1" : isCurrent ? "#E9D8AF" : C.line}`, boxShadow: isCurrent ? shadowSm : "none" }}>
            <button
              disabled={locked || key === "event_closing"}
              onClick={() => onToggle(key)}
              className="w-full flex items-center gap-3 px-3.5 py-3 text-right transition-colors disabled:cursor-not-allowed"
              style={{
                background: st.done ? C.sageBg : isCurrent ? "#FBF3E4" : "#F7F6F3",
                opacity: locked ? 0.5 : 1,
              }}
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                style={{ background: st.done ? C.sage : isCurrent ? C.amber : "#fff", border: `1px solid ${st.done ? C.sage : isCurrent ? C.amber : C.line}` }}
              >
                {st.done ? <Check size={14} color="#fff" /> : <Icon size={13} color={isCurrent ? "#fff" : C.inkSoft} />}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium truncate" style={{ color: C.ink }}>{def.label}</span>
                <span className="block text-[11px] tracking-wide" style={{ color: C.inkSoft, ...mono }}>
                  {def.type === "internal" ? "שלב פנימי" : "מול הלקוח"}{st.doneAt ? ` · ${new Date(st.doneAt).toLocaleDateString("he-IL")}` : ""}
                </span>
              </span>
              {isCurrent && !st.done && (
                <span className="text-[10px] px-2.5 py-1 rounded-full shrink-0 tracking-wide" style={{ background: C.amber, color: "#fff" }}>לסמן בוצע</span>
              )}
            </button>
            {st.done && (
              <div className="flex" style={{ borderTop: `1px solid ${C.line}` }}>
                <div className="flex-1">
                  <SendUpdateButton onSend={() => onSendWhatsApp(key, waMessage)} />
                </div>
                {canUndo && (
                  <button
                    onClick={() => onUndo(key)}
                    className="flex items-center justify-center gap-1.5 text-xs font-medium px-3.5 shrink-0"
                    style={{ background: "#fff", color: C.rose, borderRight: `1px solid ${C.line}` }}
                  >
                    ↺ ביטול סימון
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function SendUpdateButton({ onSend }) {
  const [sent, setSent] = useState(false);
  return (
    <button
      onClick={() => { onSend(); setSent(true); setTimeout(() => setSent(false), 2000); }}
      className="w-full flex items-center justify-center gap-1.5 text-xs font-medium py-2.5 transition-colors"
      style={{ background: sent ? C.sage : "#fff", color: sent ? "#fff" : C.sage }}
    >
      <Bell size={12} /> {sent ? "העדכון נשלח ✓" : "שליחת עדכון ללקוח בוואטסאפ"}
    </button>
  );
}

// ---------- Event card (list view) ----------
function EventCard({ event, onOpen }) {
  const flow = PACKAGE_FLOWS[event.package];
  const idx = currentStageIndex(event);
  const done = idx >= flow.length;
  const pct = Math.round((idx / flow.length) * 100);
  const nextLabel = done ? "הושלם" : STAGE_DEFS[flow[idx]].label;
  return (
    <button onClick={onOpen} className="w-full text-right rounded-2xl p-4 mb-3.5" style={{ background: C.card, border: `1px solid ${C.line}`, boxShadow: shadowSm }}>
      <div className="flex items-center justify-between mb-2.5">
        <span className="font-semibold text-base" style={{ ...display, color: C.ink }}>{event.clientName}</span>
        <span className="text-[10.5px] px-2.5 py-1 rounded-full tracking-wide" style={{ background: event.package.startsWith("full") ? "#F2E8D2" : "#EDEFEE", color: C.amberDeep, ...mono }}>
          {PACKAGE_LABEL[event.package]}
        </span>
      </div>
      <div className="flex items-center gap-1.5 mb-3.5 text-xs" style={{ color: C.inkSoft }}>
        <Calendar size={12} /> {new Date(event.eventDate).toLocaleDateString("he-IL")}
      </div>
      <div className="h-[5px] rounded-full mb-2.5" style={{ background: C.line }}>
        <div className="h-[5px] rounded-full transition-all" style={{ width: `${pct}%`, background: done ? C.sage : C.amber }} />
      </div>
      <div className="flex items-center justify-between text-xs">
        <span style={{ color: done ? C.sage : C.amberDeep, fontWeight: 600 }}>{done ? "✓ נמסר ללקוח" : `הבא בתור: ${nextLabel}`}</span>
        <ChevronRight size={14} style={{ color: C.inkSoft }} />
      </div>
    </button>
  );
}

// ---------- New event form ----------
function NewEventModal({ onClose, onCreate, photographerPhone }) {
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [pkg, setPkg] = useState("full");
  const [eventDate, setEventDate] = useState("");
  const [eventLocation, setEventLocation] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [deposit, setDeposit] = useState("");
  const [balance, setBalance] = useState("");

  const submit = () => {
    if (!clientName || !eventDate) return;
    const depositNum = Number(deposit) || 0;
    const balanceNum = Number(balance) || 0;
    const summaryMessage =
      `פרטי האירוע שלכם:\n` +
      `שם: ${clientName}\n` +
      `תאריך: ${new Date(eventDate).toLocaleDateString("he-IL")}\n` +
      `מיקום: ${eventLocation || "יעודכן"}\n` +
      `שעת הגעה לצילומי משפחה: ${arrivalTime || "יעודכן"}\n` +
      `מקדמה: ₪${depositNum}\n` +
      `יתרה לתשלום: ₪${balanceNum}`;
    const calendarMessage =
      `${PACKAGE_LABEL[pkg]} · ${clientName}\n` +
      `תאריך: ${new Date(eventDate).toLocaleDateString("he-IL")}\n` +
      `מקדמה: ₪${depositNum} · יתרה לתשלום: ₪${balanceNum}\n` +
      `לקוח/ה: ${clientName} · טלפון: ${clientPhone || "לא הוזן"}\n` +
      `שעת צילומי משפחה: ${arrivalTime || "יעודכן"}`;
    onCreate({
      id: "evt-" + Date.now(),
      clientName,
      clientPhone,
      package: pkg,
      eventDate,
      eventLocation,
      arrivalTime,
      createdAt: new Date().toISOString(),
      stages: makeInitialStages(pkg),
      payments: { deposit: depositNum, balance: balanceNum, depositPaid: false, balancePaid: false, dueDate: eventDate },
      notifications: [
        { ts: new Date().toISOString(), text: "האירוע נסגר במערכת" },
        { ts: new Date().toISOString(), text: `נשלחה הודעת וואטסאפ מהמספר של הצלם (${photographerPhone || "לא הוגדר טלפון צלם"}) ל-${clientPhone || "הלקוח"} עם פרטי האירוע: "${summaryMessage}"` },
        { ts: new Date().toISOString(), text: `האירוע נוסף אוטומטית ליומן Google של הצלם: "${calendarMessage}"` },
      ],
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(46,49,66,0.45)" }} dir="rtl">
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-8" style={{ background: C.paper, boxShadow: shadowMd }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold" style={{ ...display, color: C.ink }}>סגירת אירוע חדש</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center" style={{ background: "#fff", border: `1px solid ${C.line}` }}><X size={16} color={C.inkSoft} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: C.inkSoft }}>שם הלקוח</label>
            <input value={clientName} onChange={e => setClientName(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}`, background: "#fff" }} placeholder="לדוגמה: משפחת לוי" />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: C.inkSoft }}>טלפון הלקוח (לתזכורות בוואטסאפ)</label>
            <input type="tel" value={clientPhone} onChange={e => setClientPhone(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}`, background: "#fff", ...mono }} placeholder="050-1234567" />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: C.inkSoft }}>חבילה</label>
            <select
              value={pkg}
              onChange={e => setPkg(e.target.value)}
              className="w-full rounded-lg px-3 py-2.5 text-sm appearance-none"
              style={{ border: `1px solid ${C.line}`, background: `${C.amberBg} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236169C4' stroke-width='1.5' fill='none' fill-rule='evenodd'/%3E%3C/svg%3E") left 0.9rem center/10px 6px no-repeat`, color: C.ink, fontWeight: 500 }}
            >
              {Object.keys(PACKAGE_LABEL).map(p => (
                <option key={p} value={p}>{PACKAGE_LABEL[p]}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: C.inkSoft }}>תאריך האירוע</label>
            <input type="date" value={eventDate} onChange={e => setEventDate(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}`, background: "#fff" }} />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: C.inkSoft }}>מיקום האירוע</label>
            <input value={eventLocation} onChange={e => setEventLocation(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}`, background: "#fff" }} placeholder="לדוגמה: אולמי הגן, ראשון לציון" />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: C.inkSoft }}>שעת הגעה לצילומי משפחה</label>
            <input type="time" value={arrivalTime} onChange={e => setArrivalTime(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}`, background: "#fff" }} />
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs block mb-1" style={{ color: C.inkSoft }}>מקדמה (₪)</label>
              <input type="number" value={deposit} onChange={e => setDeposit(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}`, background: "#fff" }} />
            </div>
            <div className="flex-1">
              <label className="text-xs block mb-1" style={{ color: C.inkSoft }}>יתרה (₪)</label>
              <input type="number" value={balance} onChange={e => setBalance(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}`, background: "#fff" }} />
            </div>
          </div>
          <button onClick={submit} className="w-full rounded-lg py-3 text-sm font-semibold mt-2" style={{ background: C.ink, color: "#fff" }}>
            שמירת האירוע
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Event detail ----------
function NavAppSheet({ location, onClose }) {
  const encoded = encodeURIComponent(location);
  const apps = [
    { key: "waze", label: "Waze", url: `https://waze.com/ul?q=${encoded}&navigate=yes` },
    { key: "gmaps", label: "Google Maps", url: `https://www.google.com/maps/search/?api=1&query=${encoded}` },
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(46,49,66,0.45)" }} dir="rtl" onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-8" style={{ background: C.paper, boxShadow: shadowMd }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold" style={{ ...display, color: C.ink }}>ניווט אל האירוע</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center" style={{ background: "#fff", border: `1px solid ${C.line}` }}><X size={16} color={C.inkSoft} /></button>
        </div>
        <p className="text-xs mb-4" style={{ color: C.inkSoft }}>{location}</p>
        <div className="space-y-2">
          {apps.map(a => (
            <a key={a.key} href={a.url} target="_blank" rel="noopener noreferrer" onClick={onClose}
              className="w-full flex items-center justify-between rounded-xl px-4 py-3 text-sm font-medium"
              style={{ background: "#fff", border: `1px solid ${C.line}`, color: C.ink }}>
              {a.label} <ChevronRight size={14} style={{ color: C.inkSoft }} />
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function EventDetail({ event, onBack, onUpdate, photographerPhone }) {
  const [showNav, setShowNav] = useState(false);
  const toggleStage = (key) => {
    const def = STAGE_DEFS[key];
    const updated = { ...event, stages: { ...event.stages, [key]: { done: true, doneAt: new Date().toISOString() } } };
    const notif = [...event.notifications, { ts: new Date().toISOString(), text: `שלב "${def.label}" סומן כבוצע` }];
    if (def.notifyClient) notif.push({ ts: new Date().toISOString(), text: `התראה נשלחה ללקוח בוואטסאפ: "${def.notifyClient}"` });
    onUpdate({ ...updated, notifications: notif });
  };

  const undoStage = (key) => {
    const def = STAGE_DEFS[key];
    const updated = { ...event, stages: { ...event.stages, [key]: { done: false, doneAt: null } } };
    const notif = [...event.notifications, { ts: new Date().toISOString(), text: `בוטל סימון "בוצע" לשלב "${def.label}"` }];
    onUpdate({ ...updated, notifications: notif });
  };

  const togglePayment = (field) => {
    onUpdate({ ...event, payments: { ...event.payments, [field]: !event.payments[field] } });
  };

  const sendWhatsAppUpdate = (stageKey, message) => {
    const notif = [...event.notifications, { ts: new Date().toISOString(), text: `נשלחה הודעת וואטסאפ מהמספר של הצלם (${photographerPhone || "לא הוגדר טלפון צלם"}) ל-${event.clientPhone || "הלקוח"}: "${message}"` }];
    onUpdate({ ...event, notifications: notif });
  };

  return (
    <div dir="rtl" className="pb-8">
      <button onClick={onBack} className="flex items-center gap-1 text-sm mb-5 tracking-wide" style={{ color: C.inkSoft }}>
        <ChevronRight size={16} /> חזרה לאירועים
      </button>
      <h1 className="text-[26px] font-bold mb-1.5" style={{ ...display, color: C.ink }}>{event.clientName}</h1>
      <div className="flex items-center gap-3 text-xs mb-4 flex-wrap" style={{ color: C.inkSoft }}>
        <span className="flex items-center gap-1"><Calendar size={12} />{new Date(event.eventDate).toLocaleDateString("he-IL")}</span>
        <span>{PACKAGE_LABEL[event.package]}</span>
        {event.clientPhone && <span style={{ ...mono }}>📱 {event.clientPhone}</span>}
      </div>
      {(event.eventLocation || event.arrivalTime) && (
        <div className="rounded-xl px-3.5 py-2.5 mb-4 text-xs flex flex-wrap gap-x-4 gap-y-1.5" style={{ background: "#F1EFE9", color: C.inkSoft }}>
          {event.eventLocation && (
            <button onClick={() => setShowNav(true)} className="underline decoration-dotted" style={{ color: C.amberDeep }}>📍 {event.eventLocation}</button>
          )}
          {event.arrivalTime && <span>🕐 הגעה לצילומי משפחה: {event.arrivalTime}</span>}
        </div>
      )}
      {showNav && event.eventLocation && <NavAppSheet location={event.eventLocation} onClose={() => setShowNav(false)} />}

      <div className="rounded-2xl p-4 mb-5" style={{ background: C.card, border: `1px solid ${C.line}`, boxShadow: shadowSm }}>
        <div className="flex items-center gap-2 mb-3.5">
          <CreditCard size={15} color={C.amberDeep} />
          <span className="text-sm font-semibold tracking-wide" style={{ color: C.ink }}>תשלומים</span>
        </div>
        <div className="space-y-2">
          <button onClick={() => togglePayment("depositPaid")} className="w-full flex items-center justify-between text-sm rounded-xl px-3.5 py-2.5 transition-colors" style={{ background: event.payments.depositPaid ? C.sageBg : "#F7F6F3" }}>
            <span>מקדמה — ₪{event.payments.deposit}</span>
            <span style={{ color: event.payments.depositPaid ? C.sage : C.inkSoft, fontWeight: 600 }}>{event.payments.depositPaid ? "שולם ✓" : "ממתין"}</span>
          </button>
          <button onClick={() => togglePayment("balancePaid")} className="w-full flex items-center justify-between text-sm rounded-xl px-3.5 py-2.5 transition-colors" style={{ background: event.payments.balancePaid ? C.sageBg : "#F7F6F3" }}>
            <span>יתרה — ₪{event.payments.balance}</span>
            <span style={{ color: event.payments.balancePaid ? C.sage : C.inkSoft, fontWeight: 600 }}>{event.payments.balancePaid ? "שולם ✓" : `עד ${new Date(event.payments.dueDate).toLocaleDateString("he-IL")}`}</span>
          </button>
        </div>
      </div>

      <div className="mb-2.5 text-sm font-semibold tracking-wide" style={{ color: C.ink }}>מסלול התהליך</div>
      <FilmStrip event={event} onToggle={toggleStage} onUndo={undoStage} onSendWhatsApp={sendWhatsAppUpdate} />

      <div className="mt-7">
        <div className="flex items-center gap-2 mb-3.5">
          <Bell size={15} color={C.amberDeep} />
          <span className="text-sm font-semibold tracking-wide" style={{ color: C.ink }}>יומן התראות</span>
        </div>
        <div className="space-y-2">
          {[...event.notifications].reverse().map((n, i) => (
            <div key={i} className="text-xs rounded-xl px-3.5 py-2.5 flex items-start gap-2" style={{ background: "#F7F6F3", color: C.inkSoft }}>
              {n.text.includes("יומן Google") ? <Calendar size={11} className="mt-0.5 shrink-0" /> : <Clock size={11} className="mt-0.5 shrink-0" />}
              <span>{n.text} <span style={{ ...mono }}>· {new Date(n.ts).toLocaleString("he-IL", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" })}</span></span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Registration / pricing page ----------
function RegistrationModal({ onClose, onSave }) {
  const [step, setStep] = useState("plan"); // plan | details
  const [plan, setPlan] = useState("annual");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const PLANS = {
    monthly: { label: "חודשי", price: 50, note: "חיוב כל חודש, אפשר לבטל בכל עת" },
    annual: { label: "שנתי", price: 42, note: "חיוב שנתי של ₪500 · חוסך 2 חודשים", badge: "הכי משתלם" },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(46,49,66,0.45)" }} dir="rtl">
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 max-h-[88vh] overflow-y-auto" style={{ background: C.paper, boxShadow: shadowMd }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold" style={{ ...display, color: C.ink }}>
            {step === "plan" ? "הרשמה למערכת" : "פרטי הצלם"}
          </h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center" style={{ background: "#fff", border: `1px solid ${C.line}` }}><X size={16} color={C.inkSoft} /></button>
        </div>

        {step === "plan" && (
          <>
            <p className="text-sm mb-4" style={{ color: C.inkSoft }}>מנוי אחד לכל היכולות של המערכת - ניהול אירועים, מעקב שלבים ועדכוני לקוחות אוטומטיים.</p>
            <div className="mb-4">
              <label className="text-xs block mb-1.5" style={{ color: C.inkSoft }}>בחר/י מסלול תשלום</label>
              <select
                value={plan}
                onChange={e => setPlan(e.target.value)}
                className="w-full rounded-lg px-3 py-2.5 text-sm appearance-none font-medium"
                style={{ border: `1px solid ${C.line}`, background: `${C.amberBg} url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%236169C4' stroke-width='1.5' fill='none' fill-rule='evenodd'/%3E%3C/svg%3E") left 0.9rem center/10px 6px no-repeat`, color: C.ink }}
              >
                {Object.entries(PLANS).map(([key, p]) => (
                  <option key={key} value={key}>מנוי {p.label} — ₪{p.price}/חודש</option>
                ))}
              </select>
            </div>
            <div className="rounded-2xl p-4 relative mb-5" style={{ background: "#fff", border: `1.5px solid ${C.amber}`, boxShadow: shadowSm }}>
              {PLANS[plan].badge && (
                <span className="absolute -top-2.5 left-4 text-[10px] px-2 py-0.5 rounded-full tracking-wide" style={{ background: C.amber, color: "#fff" }}>{PLANS[plan].badge}</span>
              )}
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold" style={{ ...display, color: C.ink }}>₪{PLANS[plan].price}</span>
                <span className="text-xs" style={{ color: C.inkSoft }}>/ לחודש</span>
              </div>
              <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>{PLANS[plan].note}</div>
            </div>
            <button onClick={() => setStep("details")} className="w-full rounded-xl py-3 text-sm font-semibold" style={{ background: C.amberDeep, color: "#fff" }}>
              המשך להרשמה
            </button>
          </>
        )}

        {step === "details" && (
          <>
            <div className="rounded-xl px-3.5 py-2.5 mb-4 text-xs flex items-center justify-between" style={{ background: "#F1EFE9", color: C.inkSoft }}>
              <span>נבחר: מנוי {PLANS[plan].label} · ₪{PLANS[plan].price}/חודש</span>
              <button onClick={() => setStep("plan")} className="underline" style={{ color: C.amberDeep }}>שינוי</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs block mb-1" style={{ color: C.inkSoft }}>שם מלא</label>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}`, background: "#fff" }} />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: C.inkSoft }}>טלפון (ממנו יישלחו העדכונים ללקוחות)</label>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}`, background: "#fff", ...mono }} placeholder="050-1234567" />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: C.inkSoft }}>אימייל</label>
                <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}`, background: "#fff" }} />
              </div>
              <div>
                <label className="text-xs block mb-1" style={{ color: C.inkSoft }}>סיסמה</label>
                <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}`, background: "#fff" }} />
              </div>
              <button
                onClick={() => onSave({ name, phone, email, plan })}
                className="w-full rounded-xl py-3 text-sm font-semibold mt-2"
                style={{ background: C.ink, color: "#fff" }}
              >
                יצירת חשבון
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Photographer profile modal ----------
function ProfileModal({ profile, onClose, onSave }) {
  const [name, setName] = useState(profile.name);
  const [phone, setPhone] = useState(profile.phone);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" style={{ background: "rgba(46,49,66,0.45)" }} dir="rtl">
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-8" style={{ background: C.paper, boxShadow: shadowMd }}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold" style={{ ...display, color: C.ink }}>פרופיל הצלם</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center" style={{ background: "#fff", border: `1px solid ${C.line}` }}><X size={16} color={C.inkSoft} /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: C.inkSoft }}>שם הצלם</label>
            <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}`, background: "#fff" }} />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: C.inkSoft }}>מספר הטלפון שלך (ממנו יישלחו העדכונים ללקוחות)</label>
            <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} className="w-full rounded-lg px-3 py-2 text-sm" style={{ border: `1px solid ${C.line}`, background: "#fff", ...mono }} placeholder="050-1234567" />
          </div>
          <button onClick={() => { onSave({ name, phone }); onClose(); }} className="w-full rounded-lg py-3 text-sm font-semibold mt-2" style={{ background: C.ink, color: "#fff" }}>
            שמירה
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Main app ----------
export default function App() {
  useFonts();
  const [events, setEvents] = useState(null);
  const [profile, setProfile] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showRegistration, setShowRegistration] = useState(false);

  useEffect(() => {
    loadEvents().then(ev => {
      if (ev.length === 0) {
        const seeded = [seedEvent()];
        setEvents(seeded);
        saveEvents(seeded);
      } else {
        setEvents(ev);
      }
    });
    loadProfile().then(setProfile);
  }, []);

  const updateEvent = (updated) => {
    setEvents(prev => {
      const next = prev.map(e => e.id === updated.id ? updated : e);
      saveEvents(next);
      return next;
    });
  };

  const createEvent = (newEvent) => {
    setEvents(prev => {
      const next = [newEvent, ...prev];
      saveEvents(next);
      return next;
    });
  };

  const selected = useMemo(() => events?.find(e => e.id === selectedId), [events, selectedId]);

  if (events === null || profile === null) {
    return <div style={{ background: C.paper, height: "100vh" }} />;
  }

  return (
    <div dir="rtl" style={{ background: C.paper, minHeight: "100vh", fontFamily: "'Rubik', sans-serif" }}>
      <div className="max-w-md mx-auto px-4 pt-7 pb-10">
        {selected ? (
          <EventDetail event={selected} onBack={() => setSelectedId(null)} onUpdate={updateEvent} photographerPhone={profile.phone} />
        ) : (
          <>
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <button onClick={() => (profile.phone ? setShowProfile(true) : setShowRegistration(true))} className="text-xs tracking-wide" style={{ color: C.inkSoft }}>
                  שלום, {profile.name} {profile.phone ? "" : "· השלם/י הרשמה ⚠"}
                </button>
                <h1 className="text-[26px] font-bold mt-0.5" style={{ ...display, color: C.ink }}>האירועים שלי</h1>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => (profile.phone ? setShowProfile(true) : setShowRegistration(true))} className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: "#fff", border: `1px solid ${C.line}`, boxShadow: shadowSm }}>
                  <Camera size={16} color={C.inkSoft} />
                </button>
                <button onClick={() => setShowNew(true)} className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: C.ink, boxShadow: shadowSm }}>
                  <Plus size={18} color="#fff" />
                </button>
              </div>
            </div>
            <div className="h-px w-full mb-5 mt-3" style={{ background: C.line }} />
            <div className="text-xs mb-5 tracking-wide" style={{ color: C.inkSoft, ...mono }}>{events.length} אירועים פעילים</div>
            {events.map(ev => (
              <EventCard key={ev.id} event={ev} onOpen={() => setSelectedId(ev.id)} />
            ))}
            {events.length === 0 && (
              <div className="text-center py-16 text-sm" style={{ color: C.inkSoft }}>עדיין אין אירועים — לחצו על + כדי לסגור אירוע ראשון</div>
            )}
          </>
        )}
      </div>
      {showNew && <NewEventModal onClose={() => setShowNew(false)} onCreate={createEvent} photographerPhone={profile.phone} />}
      {showProfile && (
        <ProfileModal
          profile={profile}
          onClose={() => setShowProfile(false)}
          onSave={(p) => { setProfile(p); saveProfile(p); }}
        />
      )}
      {showRegistration && (
        <RegistrationModal
          onClose={() => setShowRegistration(false)}
          onSave={(p) => { const next = { name: p.name, phone: p.phone }; setProfile(next); saveProfile(next); setShowRegistration(false); }}
        />
      )}
    </div>
  );
}
