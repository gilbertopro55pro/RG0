// Renders the share links' link-preview images (public/og/go-{1,2,3}.jpg, app/go/[variant], owner
// 2026-10-11): the same hero card with three hooks, one with the founder's photo and two with the
// logo instead. Same run folder and steps as render.mjs (fonts.css + fonts/, founder.jpg):
//   PWC=<playwright-core folder> node scripts/landing-og/variants.mjs <that folder>
// then copy <folder>/go-*.jpg to public/og/. Keep the hooks in sync with app/go/[variant]/page.tsx.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pw = await import(pathToFileURL(path.join(process.env.PWC, "index.js")).href);
const { chromium } = pw.default ?? pw;
const dir = process.argv[2];
const CAM = (s) => `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>`;
const ARROW = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>`;
const V = {
  1: {
    smallLogo: true,
    h1a: "הצילום נגמר בחצות.", h1b: "הוואטסאפים לא.",
    sub: "גילברטו לוקחת על עצמה את ההודעות, החוזים והתשלומים, ואתם חוזרים לצלם.",
    side: `<div class="card"><img src="founder.jpg" alt=""><span>רועי גלברט, צלם אירועים ומייסד גילברטו</span></div>`,
  },
  2: {
    smallLogo: false,
    h1a: "<em>4.5</em> שעות על כל אירוע,", h1b: "ואף אחת מהן מאחורי המצלמה.",
    sub: "הודעות, חוזים, תזכורות ובחירת תמונות. גילברטו לוקחת את רוב העבודה הזו.",
    side: `<div class="brand"><span class="bigmark">${CAM(118)}</span><span class="bigword">גילברטו</span><span class="tag">פחות ניהול. יותר צילום.</span></div>`,
  },
  3: {
    smallLogo: false,
    h1a: "כמה אירועים הפסדתם", h1b: "כי עניתם מאוחר מדי?",
    sub: "עוזר הפניות של גילברטו עונה ללקוחות מיד, גם בשתיים בלילה, ובודק ביומן שהתאריך פנוי.",
    side: `<div class="brand chat"><div class="row"><span class="mark">${CAM(22)}</span><span class="word">גילברטו</span></div>
      <div class="msg in"><small>02:14</small>היי, ה-14.12 עדיין פנוי? מחפשים צלם לחתונה</div>
      <div class="msg out"><small>02:14 · עוזר הפניות</small>כן, התאריך פנוי! איפה האירוע, ובערך כמה אורחים?</div></div>`,
  },
};
const page = (v) => `<!doctype html><html><head><meta charset="utf-8"><style>
${fs.readFileSync(dir + "/fonts.css", "utf8")}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;background:#0b1220;overflow:hidden}
.og{position:relative;width:1200px;height:630px;padding:44px 56px 48px;font-family:Rubik,sans-serif;color:#f4f6fa;display:flex;flex-direction:column;background:radial-gradient(900px 520px at 85% 0%,#17243d 0%,#0b1220 70%)}
.top{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:40px;direction:ltr}
.logo{display:flex;align-items:center;gap:10px;direction:rtl;flex:none}
.mark{width:34px;height:34px;border-radius:8px;background:#8f6f2f;color:#fff;display:flex;align-items:center;justify-content:center;flex:none}
.word{font-weight:700;font-size:21px}
.eyebrow{display:flex;align-items:center;gap:10px;color:#aeb8cc;font-size:17px;direction:rtl;margin-left:auto}
.eyebrow i{width:9px;height:9px;border-radius:2px;background:#8f6f2f;flex:none}
.main{flex:1;display:flex;gap:48px;align-items:center;direction:rtl;margin-top:14px}
.text{flex:1;min-width:0;display:flex;flex-direction:column;gap:22px}
h1{font-weight:800;line-height:1.06;letter-spacing:-.03em;color:#fff;text-wrap:balance}
h1 span{color:#c9a15a;display:block}
h1 em{font-style:normal;color:#c9a15a}
.sub{color:#aeb8cc;font-size:24px;line-height:1.45;max-width:640px}
.cta{display:flex;align-items:center;gap:18px;margin-top:4px}
.btn{height:56px;padding:0 26px;background:#8f6f2f;color:#fff;font-weight:700;font-size:21px;display:inline-flex;align-items:center;gap:12px;border-radius:1px}
.fine{color:#8792ab;font-size:18px}
.card{flex:none;width:250px;display:flex;flex-direction:column;gap:12px;background:#131c2e;border:1px solid #1c2638;border-radius:16px;padding:14px}
.card img{width:100%;height:262px;object-fit:cover;object-position:50% 20%;border-radius:4px;border:1px solid #33405a}
.card span{color:#aeb8cc;font-size:15px;line-height:1.35}
.brand{flex:none;width:300px;display:flex;flex-direction:column;align-items:center;gap:14px;background:#131c2e;border:1px solid #1c2638;border-radius:20px;padding:34px 20px}
.bigmark{width:170px;height:170px;border-radius:38px;background:#8f6f2f;color:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 24px 60px rgba(201,161,90,.25)}
.bigword{font-weight:800;font-size:48px;letter-spacing:-.02em}
.tag{color:#aeb8cc;font-size:18px}
.chat{align-items:stretch;gap:12px;padding:20px;width:330px}
.chat .row{display:flex;align-items:center;gap:10px;direction:rtl;margin-bottom:4px}
.msg{font-size:17px;line-height:1.4;padding:10px 13px;border-radius:12px;max-width:92%;direction:rtl}
.msg small{display:block;font-size:12.5px;color:#8792ab;margin-bottom:3px}
.msg.in{background:#1d2a40;color:#e9edf5;align-self:flex-start;border-start-start-radius:3px}
.msg.out{background:#8f6f2f;color:#fff;align-self:flex-end;border-start-end-radius:3px}
.msg.out small{color:#f3e7cc}
</style></head><body><div class="og" dir="rtl">
<div class="top">
  ${v.smallLogo ? `<div class="logo"><span class="mark">${CAM(19)}</span><span class="word">גילברטו</span></div>` : ""}
  <div class="eyebrow"><i></i>מערכת ניהול לצלמי אירועים, שפותחה בידי צלם אירועים</div>
</div>
<div class="main">
  <div class="text">
    <h1 id="h">${v.h1a} <span>${v.h1b}</span></h1>
    <p class="sub">${v.sub}</p>
    <div class="cta"><span class="btn">להתחיל 14 ימי ניסיון חינם${ARROW}</span><span class="fine">ללא כרטיס אשראי</span></div>
  </div>
  ${v.side}
</div>
</div></body></html>`;
{
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  for (const [key, v] of Object.entries(V)) {
    fs.writeFileSync(`${dir}/go-${key}.html`, page(v));
    const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
    await p.goto(`file://${dir}/go-${key}.html`);
    await p.evaluate(() => document.fonts.ready);
    const size = await p.evaluate(() => {
      const h = document.getElementById("h"), main = document.querySelector(".main"), text = document.querySelector(".text");
      for (let s = 76; s >= 40; s -= 2) { h.style.fontSize = s + "px"; if (text.scrollHeight <= main.clientHeight - 4 && h.scrollHeight <= 250) return s; }
      return 40;
    });
    await p.screenshot({ path: `${dir}/go-${key}.jpg`, type: "jpeg", quality: 88 });
    console.log(key, "headline px", size, fs.statSync(`${dir}/go-${key}.jpg`).size, "bytes");
    await p.close();
  }
  await b.close();
}
