// A real conversation with the intake assistant on the LIVE site, screenshotted at every visible
// change, for a promo video (SKILL.md "Promo video"). Interactive: the client's messages are read
// from <out>/in-0.txt, in-1.txt, …, so each one can answer what the assistant actually asked; the
// replies land in out-<i>.txt. Write "END" to the next in-file to stop.
//
//   PWC=<playwright-core dir> node chat-capture.js <out dir> studio-or
//   printf '%s' 'היי, ה-12.8.27 עדיין פנוי?' > <out dir>/in-0.txt   # then wait for out-0.txt
//
// Test account only (studio-or). Each run is a new conversation on its monthly cap. Never send a
// phone number: no phone = no lead and no emails (the idle cron only reports conversations with a
// lead). Screenshots are 900x1500 (300x500 at 3x), numbered in order (001-…png).
const { chromium } = require(process.env.PWC);
const fs = require("fs");
const path = require("path");

const [out, key] = process.argv.slice(2);
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
  });
  const ctx = await browser.newContext({ viewport: { width: 300, height: 500 }, deviceScaleFactor: 3, ignoreHTTPSErrors: true, locale: "he-IL", isMobile: true, hasTouch: true });
  await ctx.route(/myframeflow\.com|supabase\.co/, async (route) => {
    for (let a = 0; a < 5; a++) {
      try { return route.fulfill({ response: await route.fetch({ timeout: 90000 }) }); } catch { await new Promise((r) => setTimeout(r, 700 * (a + 1))); }
    }
    return route.abort();
  });
  // The chat scrolls smoothly to the newest message; shoot the settled position, not mid-scroll.
  await ctx.addInitScript(() => {
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (o) { return orig.call(this, typeof o === "object" ? { ...o, behavior: "instant" } : o); };
  });
  const page = await ctx.newPage();
  await page.goto(`https://myframeflow.com/chat/${encodeURIComponent(key)}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById("boot-splash"), null, { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(5000);
  await page.evaluate(() => document.getElementById("boot-splash")?.remove());
  // Headless Chromium draws backdrop-filter wrongly (crisp text through the frosted header). On a
  // phone the text behind is blurred away, so the header and input bar get the colour they show.
  await page.evaluate(() => {
    const rgba = (c) => (c.match(/[\d.]+/g) || []).map(Number);
    const paper = rgba(getComputedStyle(document.querySelector(".bg-paper")).backgroundColor);
    const css = [...document.querySelectorAll("header.sticky, div.sticky.bottom-0")].map((el, i) => {
      el.dataset.solid = i;
      const [r, g, b, a = 1] = rgba(getComputedStyle(el).backgroundColor);
      const mix = (c, p) => Math.round(c * a + p * (1 - a));
      return `[data-solid="${i}"]{backdrop-filter:none!important;-webkit-backdrop-filter:none!important;background:rgb(${mix(r, paper[0])},${mix(g, paper[1])},${mix(b, paper[2])})!important}`;
    });
    const st = document.createElement("style");
    st.textContent = css.join("");
    document.head.appendChild(st);
  });
  const input = page.locator("#intake-msg");
  if (!(await input.count())) {
    console.log("No chat input: the page shows the fallback inquiry form (assistant off / plan / cap).");
    await browser.close();
    return;
  }
  await page.waitForFunction(() => !document.querySelector("#intake-msg")?.disabled, null, { timeout: 30000 });
  await page.waitForTimeout(800);

  let n = 0, lastBuf = null;
  const log = [], t00 = Date.now();
  const shot = async (label) => {
    const buf = await page.screenshot({ type: "png" });
    if (lastBuf && buf.equals(lastBuf)) return;
    lastBuf = buf;
    const f = `${String(++n).padStart(3, "0")}-${label}.png`;
    fs.writeFileSync(path.join(out, f), buf);
    log.push({ f, t: (Date.now() - t00) / 1000 });
  };
  await shot("start");
  const bubbles = "div.max-w-\\[86\\%\\]";
  for (let i = 0; ; i++) {
    const inFile = path.join(out, `in-${i}.txt`);
    while (!fs.existsSync(inFile)) await new Promise((r) => setTimeout(r, 300));
    const m = fs.readFileSync(inFile, "utf8").trim();
    if (m === "END") break;
    // Typed a few characters at a time, so the video can show the client typing.
    await input.focus();
    for (let k = 0; k < m.length; k += 6) {
      await input.fill(m.slice(0, k + 6));
      await shot(`m${i}-type`);
    }
    const before = await page.locator(bubbles).count();
    const t0 = Date.now();
    await page.locator('button[aria-label="שליחה"]').click();
    // Until the typing dots are gone for good, shooting every change (the dots animate).
    for (;;) {
      await shot(`m${i}`);
      const done = await page.evaluate(() => !document.querySelector('[aria-label="מקליד"]'));
      if (done && (await page.locator(bubbles).count()) >= before + 2 && Date.now() - t0 > 1500) break;
      if (Date.now() - t0 > 120000) { console.log("timeout"); break; }
      await page.waitForTimeout(150);
    }
    await page.waitForTimeout(400);
    await shot(`m${i}-done`);
    const reply = (await page.locator(bubbles).allInnerTexts()).slice(before + 1).join("\n---\n");
    fs.writeFileSync(path.join(out, `out-${i}.txt`), reply);
    console.log(`\n> ${m}\n< (${((Date.now() - t0) / 1000).toFixed(1)}s)\n${reply}`);
  }
  fs.writeFileSync(path.join(out, "log.json"), JSON.stringify(log, null, 1));
  await browser.close();
})();
