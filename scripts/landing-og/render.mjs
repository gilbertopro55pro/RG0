// Renders the landing page's link-preview images (public/og/landing-{he,en,ru}.jpg, 1200×630, owner
// 2026-10-11: "the landing page with the logo small at the top left"). Static files on purpose:
// next/og can't shape Hebrew right to left, Chromium can. Re-run it whenever the hero headline,
// eyebrow or CTA changes (texts below mirror src/i18n/dict/landing.ts).
//
// Run from a scratch folder that holds:
//   fonts.css + fonts/  the live site's Rubik @font-face rules with their woff2 files (from the
//                       CSS that https://myframeflow.com/ links, url(fonts/<file>) rewritten)
//   founder.jpg         a copy of public/landing/founder.jpg
//   PWC=<playwright-core folder> node scripts/landing-og/render.mjs <that folder>
// then copy <folder>/landing-*.jpg to public/og/ (keep each under 300KB for WhatsApp).
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const pw = await import(pathToFileURL(path.join(process.env.PWC, "index.js")).href);
const { chromium } = pw.default ?? pw;
const dir = process.argv[2];
const L = {
  he: { dir: "rtl", word: "גילברטו", eyebrow: "מערכת ניהול לצלמי אירועים, שפותחה בידי צלם אירועים", h1a: "צלמים, אתם מתמקדים בצילום,", h1b: "ואת הניהול אנחנו לוקחים על עצמנו.", cta: "להתחיל 14 ימי ניסיון חינם", fine: "ללא כרטיס אשראי", cap: "רועי גלברט, צלם אירועים ומייסד גילברטו" },
  en: { dir: "ltr", word: "Gilberto", eyebrow: "A management system for event photographers, developed by an event photographer", h1a: "Photographers, you focus on the shooting,", h1b: "and we take the management off your hands.", cta: "Start your 14-day free trial", fine: "No credit card needed", cap: "Roei Gelbert, event photographer and founder of Gilberto" },
  ru: { dir: "ltr", word: "Гилберто", eyebrow: "Система управления для фотографов мероприятий, созданная фотографом мероприятий", h1a: "Фотографы, вы сосредоточены на съёмке,", h1b: "а всё управление мы берём на себя.", cta: "Начать 14 дней бесплатно", fine: "Без банковской карты", cap: "Рои Гелберт, фотограф мероприятий и основатель Гилберто" },
};
const page = (l) => `<!doctype html><html><head><meta charset="utf-8"><style>
${fs.readFileSync(dir + "/fonts.css", "utf8")}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;background:#0b1220;overflow:hidden}
.og{position:relative;width:1200px;height:630px;padding:44px 56px 48px;font-family:Rubik,sans-serif;color:#f4f6fa;display:flex;flex-direction:column;background:radial-gradient(900px 500px at ${l.dir === "rtl" ? "85% 0%" : "15% 0%"},#16223a 0%,#0b1220 70%)}
.top{display:flex;align-items:center;justify-content:space-between;gap:24px;min-height:40px;direction:ltr}
.logo{display:flex;align-items:center;gap:10px;direction:${l.dir};flex:none}
.mark{width:34px;height:34px;border-radius:8px;background:#8f6f2f;color:#fff;display:flex;align-items:center;justify-content:center}
.word{font-weight:700;font-size:21px;letter-spacing:-.01em}
.eyebrow{display:flex;align-items:center;gap:10px;color:#aeb8cc;font-size:17px;direction:${l.dir};text-align:start;min-width:0}
.eyebrow i{width:9px;height:9px;border-radius:2px;background:#8f6f2f;flex:none}
.main{flex:1;display:flex;gap:44px;align-items:center;direction:${l.dir};margin-top:18px}
.text{flex:1;min-width:0;display:flex;flex-direction:column;gap:26px}
h1{font-weight:700;line-height:1.07;letter-spacing:-.03em;color:#fff;text-wrap:balance}
h1 span{color:#c9a15a}
.cta{display:flex;align-items:center;gap:18px}
.btn{height:58px;padding:0 28px;background:#8f6f2f;color:#fff;font-weight:700;font-size:22px;display:inline-flex;align-items:center;gap:12px;border-radius:1px}
.btn svg{${l.dir === "ltr" ? "transform:rotate(180deg)" : ""}}
.fine{color:#8792ab;font-size:18px}
.card{flex:none;width:250px;display:flex;flex-direction:column;gap:12px;background:#131c2e;border:1px solid #1c2638;border-radius:16px;padding:14px}
.card img{width:100%;height:262px;object-fit:cover;object-position:50% 20%;border-radius:4px;border:1px solid #33405a}
.card span{color:#aeb8cc;font-size:15px;line-height:1.35}
</style></head><body><div class="og" dir="${l.dir}">
<div class="top">
  <div class="logo"><span class="mark"><svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg></span><span class="word">${l.word}</span></div>
  <div class="eyebrow"><i></i>${l.eyebrow}</div>
</div>
<div class="main">
  <div class="text">
    <h1 id="h">${l.h1a} <span>${l.h1b}</span></h1>
    <div class="cta"><span class="btn">${l.cta}<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg></span><span class="fine">${l.fine}</span></div>
  </div>
  <div class="card"><img src="founder.jpg" alt=""><span>${l.cap}</span></div>
</div>
</div></body></html>`;
{
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
  for (const [lang, l] of Object.entries(L)) {
    fs.writeFileSync(`${dir}/og-${lang}.html`, page(l));
    const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
    await p.goto(`file://${dir}/og-${lang}.html`);
    await p.evaluate(() => document.fonts.ready);
    // The largest headline that fits the space left of the photo card.
    const size = await p.evaluate(() => {
      const h = document.getElementById("h"), main = document.querySelector(".main"), text = document.querySelector(".text");
      for (let s = 74; s >= 40; s -= 2) { h.style.fontSize = s + "px"; if (text.scrollHeight <= main.clientHeight - 4 && h.scrollHeight <= 330) return s; }
      return 40;
    });
    await p.screenshot({ path: `${dir}/landing-${lang}.jpg`, type: "jpeg", quality: 88 });
    console.log(lang, "headline px", size, fs.statSync(`${dir}/landing-${lang}.jpg`).size, "bytes");
    await p.close();
  }
  await b.close();
}
