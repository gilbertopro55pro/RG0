// Guide-video recorder for Gilberto (myframeflow.com). Usage: node record.js <scenario-key>
// Env: GF_STATE = Playwright storageState JSON of the logged-in test account (NEVER inside the repo)
//      GF_OUT   = output dir for the raw .webm + <key>.json (default: $TMPDIR/guide-video)
//      GF_VER   = current CHANGELOG version (so the "what's new" modal stays closed)
const { chromium } = require("playwright-core"); const fs = require("fs");
const KEY = process.argv[2];
const B = "https://myframeflow.com";
const W = 480, H = 780;
const PORTAL = "/portal/25dcc897-5e51-478d-8bb1-66701dad8cb6";
const GID = "156b4f30-cb50-46a8-80ff-70febd8b996f";

const OVERLAY = `
(() => {
  if (window.__gf) return;
  const css = document.createElement("style");
  css.textContent = \`
    #gf-cap{position:fixed;left:10px;right:10px;bottom:14px;z-index:2147483646;direction:rtl;font-family:Heebo,sans-serif;
      background:rgba(24,22,19,.94);color:#fffaf0;border-radius:16px;padding:15px 18px;font-size:20px;line-height:1.5;font-weight:600;border-top:3px solid #c9a15a;
      box-shadow:0 10px 30px rgba(0,0,0,.25);opacity:0;transform:translateY(8px);transition:opacity .35s cubic-bezier(.16,1,.3,1),transform .45s cubic-bezier(.16,1,.3,1)}
    #gf-cap.on{opacity:1;transform:none} #gf-cap{pointer-events:none} #gf-cap.top{bottom:auto;top:84px}
    #gf-cur{position:fixed;z-index:2147483647;width:30px;height:30px;margin:-15px 0 0 -15px;border-radius:50%;pointer-events:none;
      border:2px solid #c9a15a;background:rgba(210,173,104,.28);opacity:0;transition:left .7s cubic-bezier(.16,1,.3,1),top .7s cubic-bezier(.16,1,.3,1),opacity .3s}
    #gf-mk{position:fixed;left:0;right:0;bottom:0;height:6px;z-index:2147483647;background:#ff00ff;display:none;pointer-events:none}
    #gf-cur.on{opacity:1} #gf-cur.tap{animation:gftap .45s ease-out}
    @keyframes gftap{0%{transform:scale(1)}40%{transform:scale(.7)}100%{transform:scale(1)}}
    #gf-end{position:fixed;inset:0;z-index:2147483647;background:#f2efe9;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;
      font-family:Heebo,sans-serif;color:#1c1b19;opacity:0;transition:opacity .5s}
    #gf-end.on{opacity:1} #gf-end img{width:112px;height:112px;border-radius:26px;box-shadow:0 12px 30px rgba(28,27,25,.18)}
    #gf-end b{font-size:22px} #gf-end span{font-size:13px;color:#625e56}\`;
  document.head.appendChild(css);
  const cap = document.createElement("div"); cap.id = "gf-cap"; document.body.appendChild(cap);
  const mk = document.createElement("div"); mk.id = "gf-mk"; document.body.appendChild(mk);
  const cur = document.createElement("div"); cur.id = "gf-cur"; cur.style.left = "240px"; cur.style.top = "600px"; document.body.appendChild(cur);
  window.__gf = {
    say(t){ cap.classList.remove("on"); setTimeout(()=>{ cap.textContent=t; cap.classList.add("on"); }, t && cap.textContent ? 250 : 0); },
    move(x,y){ cur.classList.add("on"); cur.style.left=x+"px"; cur.style.top=y+"px"; },
    tap(){ cur.classList.remove("tap"); void cur.offsetWidth; cur.classList.add("tap"); },
    hide(){ cur.classList.remove("on"); },
    top(v){ cap.classList.toggle("top", !!v); },
    mark(v){ mk.style.display = v ? "block" : "none"; },
    end(){ document.getElementById("boot-splash")?.remove(); cap.classList.remove("on"); cur.classList.remove("on"); const e=document.createElement("div"); e.id="gf-end";
      e.innerHTML='<img src="'+window.__gfIcon+'" alt=""><b>גילברטו</b><span>ניהול אירועים לצלמים</span>'; document.body.appendChild(e); document.body.appendChild(mk);
      return e.querySelector("img").decode().catch(()=>{}).then(()=>requestAnimationFrame(()=>e.classList.add("on"))); }
  };
})();`;

(async () => {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--lang=he-IL"], env: { ...process.env, LANG: "he_IL.UTF-8", LANGUAGE: "he" }, proxy: { server: process.env.HTTPS_PROXY } });
  const OUT = process.env.GF_OUT || require("path").join(require("os").tmpdir(), "guide-video"); fs.mkdirSync(OUT, { recursive: true });
  const state = JSON.parse(fs.readFileSync(process.env.GF_STATE, "utf8"));
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, ignoreHTTPSErrors: true, locale: "he-IL", timezoneId: "Asia/Jerusalem", storageState: state, recordVideo: { dir: OUT, size: { width: W, height: H } } });
  await ctx.addInitScript((VER) => { try {
    for (const k of ["galleries", "client-portals", "leads", "waitlist", "analytics", "quote-builder"]) localStorage.setItem("guide-video-autoplay-" + k, "1");
    localStorage.setItem("changelog-seen-version", VER); localStorage.setItem("install-prompt-dismissed", "1"); localStorage.setItem("theme", "light");
  } catch {} }, process.env.GF_VER);
  await ctx.route(/myframeflow\.com|supabase\.co/, async (route) => { for (let a = 0; a < 5; a++) { try { const r = await route.fetch({ timeout: 60000 }); return route.fulfill({ response: r }); } catch { await new Promise((r) => setTimeout(r, 700 * (a + 1))); } } return route.abort(); });
  const page = await ctx.newPage(); global.__pg = page;
  const t0 = Date.now();
  const sleep = (ms) => page.waitForTimeout(ms);
  const go = async (path) => { await off(); for (let a = 0; a < 3; a++) { try { await page.goto(B + path, { waitUntil: "domcontentloaded", timeout: 60000 }); break; } catch {} }
    await page.waitForFunction(() => document.body.classList.contains("app-content-in") || !document.getElementById("boot-splash"), null, { timeout: 60000 }).catch(() => {});
    await sleep(3000); await page.evaluate(OVERLAY); await on(); };
  const say = async (t) => { if (!(await page.evaluate(() => !!window.__gf).catch(() => false))) { await page.waitForLoadState("domcontentloaded").catch(() => {}); await sleep(2500); await page.evaluate(OVERLAY); await on(); } await page.evaluate((t) => window.__gf.say(t), t); };
  const capTop = (v) => page.evaluate((v) => window.__gf.top(v), v);
  const point = async (loc) => { const el = typeof loc === "string" ? page.locator(loc).first() : loc.first(); await el.scrollIntoViewIfNeeded({ timeout: 8000 }).catch(() => {}); const b = await el.boundingBox({ timeout: 8000 }).catch(() => null); if (!b) { console.log("point miss", String(loc)); return; } await page.evaluate(([x, y]) => window.__gf.move(x, y), [b.x + b.width / 2, b.y + b.height / 2]); await sleep(800); };
  const tap = async (loc) => { await point(loc); await page.evaluate(() => window.__gf.tap()); await sleep(250); await (typeof loc === "string" ? page.locator(loc).first() : loc.first()).click().catch(() => {}); };
  const scroll = async (y) => { await page.evaluate((y) => window.scrollBy({ top: y, behavior: "smooth" }), y); await sleep(900); };
  let start = 0;
  const segs = []; let segOn = null;
  const on = async () => { await page.evaluate(() => window.__gf && window.__gf.mark(1)).catch(() => {}); };
  const off = async () => { await page.evaluate(() => window.__gf && window.__gf.mark(0)).catch(() => {}); };

  const navTap = async (loc, ready) => { await point(loc); await page.evaluate(() => window.__gf.tap()); await sleep(250); await off(); await loc.first().click().catch(() => {}); await ready.first().waitFor({ state: "visible", timeout: 60000 }).catch(() => {}); await sleep(2200); await page.evaluate(OVERLAY); await page.evaluate(() => { const c = document.getElementById("gf-cap"); if (c) { c.textContent = ""; c.classList.remove("on"); } }); await on(); };
  await require(`./scenarios/${KEY}.js`)({ page, go, say, point, tap, scroll, sleep, navTap, capTop, on, off, OVERLAY, GID, PORTAL });
  await page.evaluate(async (d) => { window.__gfIcon = d; await window.__gf.end(); }, "data:image/png;base64," + fs.readFileSync(require("path").resolve(__dirname, "../../../public/icons/icon-512.png")).toString("base64")); await sleep(2200); await off();
  const video = page.video(); const tend = (Date.now() - t0) / 1000; await ctx.close(); await browser.close();
  const src = await video.path();
  fs.writeFileSync(`${OUT}/${KEY}.json`, JSON.stringify({ src, start: start / 1000, segs, tend }));
  console.log(KEY, "recorded", src, "start", (start / 1000).toFixed(1));
})().catch(async (e) => { console.error("FATAL", e.message); try { await global.__pg.screenshot({ path: `${process.env.GF_OUT || require("os").tmpdir()}/fatal.png` }); } catch {} process.exit(1); });
