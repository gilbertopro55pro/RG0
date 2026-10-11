// The emails an album export sends: the print house's files email, and the photographer's own
// notice (a plain export, or a copy of what went to the print house). Pure builders, so they can be
// checked without sending anything. In the Fly worker's render graph (via albumExportJobs.ts), so
// keep the imports to types only.
import type { TFn, TVars } from "@/i18n/translate";

type Email = { subject: string; text: string; html: string };

const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const nl2br = (v: string) => esc(v).replace(/\r?\n/g, "<br>");

const WRAP = `<div dir="rtl" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222">`;
const WRAP_LTR = `<div dir="ltr" style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#222">`;
const LINK = "color:#1a56c4;font-weight:bold";
const SMALL = "color:#666;font-size:13px";

// A translated line as HTML, with the given variables in bold.
function tHtml(t: TFn, key: string, bold: TVars, plain: TVars = {}): string {
  const marks: TVars = {};
  Object.keys(bold).forEach((name, i) => (marks[name] = `\u0001${i}\u0001`));
  let out = esc(t(key, { ...plain, ...marks }));
  Object.values(bold).forEach((value, i) => (out = out.replace(`\u0001${i}\u0001`, `<b>${esc(String(value))}</b>`)));
  return out;
}

// The album's own name, or the gallery's (the event) when the album kept the default name.
export function albumDisplayName(albumTitle: string | null | undefined, galleryTitle: string): string {
  const title = albumTitle?.trim();
  return !title || title === "האלבום שלכם" ? galleryTitle : `${title} (${galleryTitle})`;
}

// Goes to the photographer's print house, in the photographer's name, always in Hebrew. Written as
// a personal note (a plain subject, no "|" template, a signature with name, phone and email), since
// Gmail filed the old notification-style mail under the Updates tab (owner, 2026-10-06): no images,
// banners or buttons, the album's name stands out and the link reads "להורדת קובצי ההדפסה".
// It ends with short steps to get the next emails into the inbox (owner, 2026-10-11).
export function printHouseEmail(p: {
  albumName: string;
  pagesLine: string | null;
  downloadUrl: string;
  validUntil: string;
  notes: string;
  signatureLines: string[];
  // The address the email comes from, for "add it to your contacts".
  senderAddress: string;
}): Email {
  const tips = [
    "ג'ימייל במחשב: גוררים את המייל ללשונית \"ראשי\", ובשאלה אם לעשות זאת גם בהודעות הבאות לוחצים \"כן\".",
    "ג'ימייל בטלפון: פותחים את המייל, לוחצים על שלוש הנקודות ⋮ ← \"העברה אל\" ← \"ראשי\".",
    "אאוטלוק: אם המייל הגיע ל\"אחר\", לוחצים עליו בקליק ימני ← \"העבר אל ממוקד\" ← \"העבר תמיד אל ממוקד\".",
    "אם המייל הגיע לספאם: לוחצים \"לא ספאם\".",
    `מוסיפים את הכתובת ${p.senderAddress} לאנשי הקשר.`,
  ];
  const tipsTitle = "כדי שהמיילים הבאים יגיעו ישר לדואר הנכנס";
  const tipsWhen = "אם המייל הזה הגיע ללשונית \"עדכונים\", \"קידומי מכירות\" או לספאם:";

  const html =
    WRAP +
    `<p>שלום,</p>` +
    `<p>מצורפים קובצי ה-JPG להדפסה של האלבום <b>${esc(p.albumName)}</b>.</p>` +
    (p.pagesLine ? `<p><b>${esc(p.pagesLine)}</b></p>` : "") +
    `<p><a href="${esc(p.downloadUrl)}" style="${LINK}">להורדת קובצי ההדפסה</a><br><span style="${SMALL}">${esc(p.validUntil)}</span></p>` +
    (p.notes ? `<p><b>הנחיות והערות:</b><br>${nl2br(p.notes)}</p>` : "") +
    `<p>אם יש שאלה, אפשר פשוט להשיב למייל הזה.</p>` +
    `<p>תודה,<br>${p.signatureLines.map(esc).join("<br>")}</p>` +
    `<div style="${SMALL};border-top:1px solid #e5e5e5;margin-top:24px;padding-top:12px">` +
    `<b>${esc(tipsTitle)}</b><br>${esc(tipsWhen)}` +
    `<ul style="margin:6px 0 0;padding-inline-start:20px">${tips.map((tip) => `<li>${esc(tip)}</li>`).join("")}</ul>` +
    `</div>` +
    `</div>`;

  const text =
    `שלום,\n\nמצורפים קובצי ה-JPG להדפסה של האלבום "${p.albumName}".\n\n` +
    (p.pagesLine ? `${p.pagesLine}\n\n` : "") +
    `להורדת הקבצים:\n${p.downloadUrl}\n${p.validUntil}\n\n` +
    (p.notes ? `הנחיות והערות:\n${p.notes}\n\n` : "") +
    `אם יש שאלה, אפשר פשוט להשיב למייל הזה.\n\nתודה,\n${p.signatureLines.join("\n")}\n\n` +
    `---\n${tipsTitle}\n${tipsWhen}\n${tips.map((tip) => `• ${tip}`).join("\n")}`;

  return { subject: `קבצים להדפסה: אלבום ${p.albumName}`, text, html };
}

// The photographer's own notice that an export is ready, in their language. The link reads
// "להורדת הקובץ" instead of the long signed storage address (owner, 2026-10-11).
export function photographerExportEmail(p: { t: TFn; rtl: boolean; formatLabel: string; albumName: string; downloadUrl: string }): Email {
  const { t } = p;
  const vars = { format: p.formatLabel, title: p.albumName };
  const html =
    (p.rtl ? WRAP : WRAP_LTR) +
    `<p>${esc(t("שלום,"))}</p>` +
    `<p>${tHtml(t, "ייצוא ה-{format} של האלבום \"{title}\" הסתיים ומוכן להורדה:", { title: p.albumName }, { format: p.formatLabel })}</p>` +
    `<p><a href="${esc(p.downloadUrl)}" style="${LINK}">${esc(t("להורדת הקובץ"))}</a><br><span style="${SMALL}">${esc(t("הקישור בתוקף לשבוע ימים."))}</span></p>` +
    `</div>`;
  const text = `${t("שלום,")}\n\n${t("ייצוא ה-{format} של האלבום \"{title}\" הסתיים ומוכן להורדה:", vars)}\n${p.downloadUrl}\n\n${t("הקישור בתוקף לשבוע ימים.")}`;
  return { subject: t("ייצוא {format} מוכן להורדה | {title}", vars), text, html };
}

// The photographer's copy of a send to the print house, in their language: what went where, the
// pages, the notes, and a copy of the files for themselves. Not the print house's tracked link, so
// opening it here never counts as the print house downloading (owner, 2026-10-11: "מייל מסודר כמו
// שבית הדפוס מקבל" instead of the export notice with the long link).
export function photographerPrintSentEmail(p: {
  t: TFn;
  rtl: boolean;
  albumName: string;
  // The print house as the photographer saved it (its label), or its address.
  house: string;
  houseEmail: string;
  pagesLine: string | null;
  printValidUntil: string | null;
  notes: string;
  copyUrl: string;
}): Email {
  const { t } = p;
  const houseShown = p.house === p.houseEmail ? p.houseEmail : `${p.house} (${p.houseEmail})`;
  const sentKey = "קובצי ה-JPG להדפסה של האלבום {title} נשלחו אל {house}.";
  const validKey = "הקישור של בית הדפוס בתוקף עד {date}.";
  const historyKey = "בחלון \"שליחה לבית דפוס\", תחת \"שליחות קודמות\", רואים מתי בית הדפוס הוריד את הקבצים ואפשר לחדש את הקישור.";
  const html =
    (p.rtl ? WRAP : WRAP_LTR) +
    `<p>${esc(t("שלום,"))}</p>` +
    `<p>${tHtml(t, sentKey, { title: p.albumName, house: houseShown })}</p>` +
    (p.pagesLine ? `<p><b>${esc(p.pagesLine)}</b></p>` : "") +
    (p.notes ? `<p><b>${esc(t("ההנחיות וההערות ששלחת:"))}</b><br>${nl2br(p.notes)}</p>` : "") +
    `<p>${p.printValidUntil ? `${esc(t(validKey, { date: p.printValidUntil }))}<br>` : ""}${esc(t(historyKey))}</p>` +
    `<p><a href="${esc(p.copyUrl)}" style="${LINK}">${esc(t("להורדת עותק של הקבצים"))}</a><br><span style="${SMALL}">${esc(t("הקישור בתוקף לשבוע ימים."))}</span></p>` +
    `</div>`;
  const text =
    `${t("שלום,")}\n\n${t(sentKey, { title: `"${p.albumName}"`, house: houseShown })}\n\n` +
    (p.pagesLine ? `${p.pagesLine}\n\n` : "") +
    (p.notes ? `${t("ההנחיות וההערות ששלחת:")}\n${p.notes}\n\n` : "") +
    (p.printValidUntil ? `${t(validKey, { date: p.printValidUntil })}\n` : "") +
    `${t(historyKey)}\n\n` +
    `${t("להורדת עותק של הקבצים")}:\n${p.copyUrl}\n${t("הקישור בתוקף לשבוע ימים.")}`;
  return { subject: t("נשלח לבית הדפוס: אלבום {title}", { title: p.albumName }), text, html };
}
