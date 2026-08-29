// Step-by-step FTP setup guides per camera brand, shown in CameraSetupGuide.tsx with the
// gallery's actual FTP credentials substituted into each step. Verified against each brand's own
// current official manual/help-guide pages (Canon cam.start.canon, Sony helpguide.sony.net,
// Nikon onlinemanual.nikonimglib.com) — not written from memory alone, since exact menu wording
// changes across firmware versions and getting this wrong makes the guide worse than useless.
// Grouped by brand rather than exact model: recent bodies within a brand's mirrorless line
// (Canon EOS R5/R6/R3/R1, Sony A7 IV/A7R V/A9 III/A1, Nikon Z8/Z9/Z6III) share materially the
// same FTP menu structure — a photographer on a slightly different model within the same brand
// can still follow this with minor wording differences.

export type CameraBrand = "canon" | "sony" | "nikon" | "fujifilm";

export type CameraGuideStep = {
  title: string;
  detail?: string;
};

export const CAMERA_BRANDS: { id: CameraBrand; label: string }[] = [
  { id: "canon", label: "Canon" },
  { id: "sony", label: "Sony" },
  { id: "nikon", label: "Nikon" },
  { id: "fujifilm", label: "Fujifilm" },
];

// {{HOST}} / {{USERNAME}} / {{PASSWORD}} get replaced with the gallery's real generated values.
export const CAMERA_GUIDES: Record<CameraBrand, { models: string; note?: string; steps: CameraGuideStep[] }> = {
  canon: {
    models: "דגמי EOS R עם Wi-Fi מובנה (R5, R6, R3, R1, R6 Mark II ועוד)",
    steps: [
      { title: "בתפריט המצלמה, היכנסו ל-Wi-Fi settings והפעילו אותו (Enable)" },
      { title: "בחרו באייקון האלחוט (Wireless features) ← Wi-Fi/Bluetooth connection" },
      { title: "בחרו \"Transfer images to FTP server\"" },
      { title: "בחרו \"Add a device to connect to\", ואז שיטת חיבור לרשת (בד\"כ Wi-Fi רגיל של האירוע/נקודה חמה)" },
      { title: "כשמגיעים להגדרות השרת (FTP Server), בחרו מצב FTP (לא FTPS)" },
      { title: "Address setting — הזינו את כתובת השרת", detail: "{{HOST}}" },
      { title: "Port number setting — השאירו 00021" },
      { title: "Passive mode — חובה להפעיל (Enable)", detail: "בלי זה החיבור לא יעבוד" },
      { title: "Login method — Login name and password" },
      { title: "שם משתמש (User name)", detail: "{{USERNAME}}" },
      { title: "סיסמה (Password)", detail: "{{PASSWORD}}" },
      { title: "Target folder — בחרו Root folder" },
      { title: "שמרו, וודאו שמופיע חיבור תקין (לא Error 41 — אם כן, בדקו שוב ש-Passive mode פעיל)" },
    ],
  },
  sony: {
    models: "דגמי Alpha עם FTP מובנה (A7 IV, A7R V, A9 III, A1, A9 II ועוד)",
    note: "המצלמות של סוני תומכות רק ב-Passive mode — אין צורך לבחור, זה כך תמיד.",
    steps: [
      { title: "MENU ← אייקון הרשת (Network) ← FTP Transfer" },
      { title: "FTP Transfer Func. ← Server Setting ← Server 1 (השרת הראשון ברשימה)" },
      { title: "Display Name — שם חופשי לזיהוי (עד 8 תווים), למשל \"Gilberto\"" },
      { title: "Host Name — כתובת השרת", detail: "{{HOST}}" },
      { title: "Secure Protocol — השאירו כבוי (לא FTPES)" },
      { title: "Port number — 21" },
      { title: "Specify Directory — השאירו ריק" },
      { title: "User — שם המשתמש", detail: "{{USERNAME}}" },
      { title: "Password — הסיסמה", detail: "{{PASSWORD}}" },
      { title: "צאו מהתפריט, ודאו שהמצלמה מחוברת לרשת Wi-Fi עם גישה לאינטרנט, והפעילו FTP Function ← On" },
    ],
  },
  nikon: {
    models: "דגמי Z עם רשת מובנית (Z8, Z9, Z6III, Zf ועוד)",
    note: "בדגמים החדשים (Z8/Z9) לפעמים נדרש תוכנת מחשב \"Wireless Transmitter Utility\" ליצירת פרופיל רשת אלחוטית מורכב — אבל פרטי ה-FTP עצמם (כתובת, פורט, משתמש, סיסמה) מוזנים ישירות במצלמה.",
    steps: [
      { title: "לחצו על כפתור G, ואז נווטו לתפריט הרשת (Network Menu) ← Connect to FTP Server" },
      { title: "בחרו \"Create Profile\" (פרופיל חדש)" },
      { title: "הגדירו את הרשת האלחוטית (SSID + סיסמת ה-Wi-Fi) — הרשת חייבת גישה לאינטרנט" },
      { title: "בחלק ה-FTP Configuration: URL or IP address", detail: "{{HOST}}" },
      { title: "Port number — 21" },
      { title: "הפעילו PASV mode (חובה)" },
      { title: "בחרו \"user ID and password\" (לא anonymous)" },
      { title: "User ID", detail: "{{USERNAME}}" },
      { title: "Password", detail: "{{PASSWORD}}" },
      { title: "שמרו את הפרופיל וחברו — המצלמה תנסה להתחבר לשרת" },
    ],
  },
  fujifilm: {
    models: "דגמי X-H2 / X-T5 ועוד",
    note: "חשוב: ברוב מצלמות ה-X של פוג׳ifilm, FTP דורש אביזר חיצוני — File Transmitter FT-XH (גריפ נלווה) — המצלמה לבדה לרוב לא תומכת ב-FTP ישיר. בדקו אם יש לכם את האביזר הזה לפני שממשיכים.",
    steps: [
      { title: "חברו את גריפ ה-FT-XH למצלמה" },
      { title: "בתפריט המצלמה: Menu/OK ← NETWORK/USB SETTING" },
      { title: "בחרו FTP TRANSFER SETTING" },
      { title: "הזינו כתובת שרת", detail: "{{HOST}}" },
      { title: "פורט — 21" },
      { title: "הפעילו PASV mode" },
      { title: "שם משתמש", detail: "{{USERNAME}}" },
      { title: "סיסמה", detail: "{{PASSWORD}}" },
      { title: "חברו את הגריפ לרשת עם גישה לאינטרנט ושמרו" },
    ],
  },
};

export function fillGuideStep(step: CameraGuideStep, values: { host: string; username: string; password: string }): CameraGuideStep {
  const replace = (text?: string) =>
    text
      ?.replace("{{HOST}}", values.host)
      .replace("{{USERNAME}}", values.username)
      .replace("{{PASSWORD}}", values.password);
  return { title: replace(step.title) ?? step.title, detail: replace(step.detail) };
}
