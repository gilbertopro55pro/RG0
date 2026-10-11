// Drives the LIVE app as the test account, step by step, for promo footage (SKILL.md "Promo video",
// the quote fix in video 3). Each step is a file <dir>/cmd-<i>.js: the body of an async function
// with (page, shot, sleep) that returns text; the result goes to out-<i>.txt. Write "END" to stop.
// Look at each screenshot before writing the next step.
//
//   PWC=<playwright-core dir> node live-drive.js <dir> <GF_STATE session file> <CHANGELOG[0].version>
//
// Phone viewport 360x720 at 3x (1080x2160 screenshots). WhatsApp links are caught (their URL goes to
// popups.txt), so "send to the client" saves the quote without leaving the page. Test account only.
const { chromium } = require(process.env.PWC);
const fs = require("fs"), path = require("path");
const [dir, state, ver] = process.argv.slice(2);
(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}) });
  const ctx = await browser.newContext({ storageState: state, viewport: { width: 360, height: 720 }, deviceScaleFactor: 3, ignoreHTTPSErrors: true, locale: "he-IL", isMobile: true, hasTouch: true });
  await ctx.route(/wa\.me|whatsapp\.com/, (r) => r.fulfill({ status: 200, contentType: "text/html", body: "<p>whatsapp</p>" }));
  await ctx.route(/myframeflow\.com|supabase\.co/, async (route) => {
    for (let a = 0; a < 5; a++) { try { return route.fulfill({ response: await route.fetch({ timeout: 90000 }) }); } catch { await new Promise((r) => setTimeout(r, 700 * (a + 1))); } }
    return route.abort();
  });
  await ctx.addInitScript((VER) => { try {
    for (const k of ["galleries", "client-portals", "leads", "waitlist", "analytics", "quote-builder"]) localStorage.setItem("guide-video-autoplay-" + k, "1");
    localStorage.setItem("changelog-seen-version", VER); localStorage.setItem("install-prompt-dismissed", "1"); localStorage.setItem("theme", "light");
  } catch {} }, ver);
  await ctx.addInitScript(() => {
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (o) { return orig.call(this, typeof o === "object" ? { ...o, behavior: "instant" } : o); };
  });
  const page = await ctx.newPage();
  ctx.on("page", (p) => { if (p !== page) { fs.appendFileSync(path.join(dir, "popups.txt"), p.url() + "\n"); p.close().catch(() => {}); } });
  page.on("pageerror", (e) => fs.appendFileSync(path.join(dir, "errors.txt"), e.message + "\n"));
  page.on("dialog", (d) => { fs.appendFileSync(path.join(dir, "dialogs.txt"), d.type() + ": " + d.message() + "\n"); d.accept().catch(() => {}); });
  let n = 0;
  const shot = async (name) => { const f = path.join(dir, `${String(++n).padStart(3, "0")}-${name || "s"}.png`); await page.screenshot({ path: f }); return f; };
  const sleep = (ms) => page.waitForTimeout(ms);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (let i = 0; ; i++) {
    const f = path.join(dir, `cmd-${i}.js`);
    while (!fs.existsSync(f)) await new Promise((r) => setTimeout(r, 300));
    const code = fs.readFileSync(f, "utf8");
    if (code.trim() === "END") break;
    let out;
    try { out = await new AsyncFunction("page", "shot", "sleep", code)(page, shot, sleep); } catch (e) { out = "ERROR " + e.message; }
    fs.writeFileSync(path.join(dir, `out-${i}.txt`), typeof out === "string" ? out : JSON.stringify(out, null, 1) ?? "ok");
  }
  await browser.close();
})();
