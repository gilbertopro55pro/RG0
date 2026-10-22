// Runs the magnet frame flow end to end on the LIVE site, the way a photographer does it:
// /magnet-frames (the list) → "מסגרת חדשה" with a size and a template → the editor, where it adds
// a text and one element and waits for the autosave → downloads each orientation's PNG (and the
// PSD with GF_PSD=1) → deletes the test frame (keep it with GF_KEEP=1).
//
//   GF_STATE=<scratch>/qa-state.json NODE_PATH=<dir with playwright-core> \
//     [GF_SIZE=20x15|15x10|10x7.5|10x7|9x9] [GF_TEMPLATE="קלאסי אלגנטי"] node export-test.js [outDir]
//
// Creates (and then deletes) its own frame — run it on the test account only.
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const outDir = process.argv[2] || process.cwd();
if (!process.env.GF_STATE) {
  console.error("usage: GF_STATE=… node export-test.js [outDir]");
  process.exit(2);
}
const SIZE = process.env.GF_SIZE || "20x15";
const TEMPLATE = process.env.GF_TEMPLATE || "קלאסי אלגנטי";
// The size buttons read width×height of the landscape frame.
const sizeLabel = { "20x15": "20×15", "15x10": "15×10", "10x7.5": "10×7.5", "10x7": "10×7", "9x9": "9×9" }[SIZE];

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--lang=he-IL"],
    ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
  });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, storageState: process.env.GF_STATE, acceptDownloads: true, ignoreHTTPSErrors: true, locale: "he-IL" });
  // The sandbox proxy drops Chromium requests to these hosts now and then; retry them.
  await ctx.route(/myframeflow\.com|supabase\.co/, async (route) => {
    for (let a = 0; a < 5; a++) {
      try { return route.fulfill({ response: await route.fetch({ timeout: 60000 }) }); } catch { await new Promise((r) => setTimeout(r, 700 * (a + 1))); }
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  page.on("response", (r) => {
    if (/\/api\/magnet-frames/.test(r.url())) console.log("api:", r.request().method(), r.status(), r.url().replace(/^.*\/api/, "/api"));
  });
  const settle = async () => {
    await page.waitForFunction(() => !document.getElementById("boot-splash"), null, { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => document.getElementById("boot-splash")?.remove());
    // The "install the app" card sits over buttons in the bottom corner.
    const notNow = page.getByRole("button", { name: "לא עכשיו" });
    if (await notNow.count()) await notNow.first().click().catch(() => {});
  };

  await page.goto("https://myframeflow.com/magnet-frames", { waitUntil: "domcontentloaded", timeout: 90000 });
  if (!page.url().includes("/magnet-frames")) {
    console.log("redirected to", page.url(), "(no access for this account)");
    await browser.close();
    process.exit(1);
  }
  await settle();

  // A new frame: the list's button, or (no frames yet) the template gallery is already shown.
  const newBtn = page.getByRole("button", { name: "מסגרת חדשה" }).first();
  await newBtn.waitFor({ timeout: 60000 }).catch(() => {});
  if (await newBtn.count()) await newBtn.click();
  const name = `בדיקה אוטומטית ${new Date().toISOString().slice(11, 19)}`;
  await page.getByPlaceholder("למשל: מגנטים לחתונה של רותם ודניאל").fill(name);
  await page.getByRole("button", { name: sizeLabel, exact: true }).click();
  await page.getByRole("button", { name: "הכל", exact: true }).click().catch(() => {});
  await page.getByText(TEMPLATE, { exact: true }).first().click();
  await page.getByRole("button", { name: "יצירת המסגרת" }).click();
  await page.waitForURL(/\/magnet-frames\/[0-9a-f-]{36}/, { timeout: 60000 });
  const designId = page.url().match(/magnet-frames\/([0-9a-f-]{36})/)[1];
  console.log("created:", designId, SIZE, TEMPLATE);
  await settle();

  await page.getByRole("button", { name: "+ הוספת טקסט" }).waitFor({ timeout: 60000 });
  await page.getByRole("button", { name: "+ הוספת טקסט" }).click();
  await page.getByRole("tab", { name: "אלמנטים" }).click();
  await page.waitForTimeout(800);
  await page.locator("button[title]:visible").filter({ has: page.locator("img") }).first().click();
  // The autosave (a second after the last change) shows "נשמר".
  const saved = page.waitForResponse((r) => r.url().endsWith("/api/magnet-frames") && r.request().method() === "POST", { timeout: 60000 });
  console.log("autosave:", (await saved).status());
  await page.locator("[aria-live=polite]", { hasText: "נשמר" }).waitFor({ timeout: 30000 });

  // Under each preview: "PNG" and "PSD" buttons, landscape first (a square size has one frame).
  const frames = await page.getByRole("button", { name: "PNG", exact: true }).count();
  const formats = process.env.GF_PSD ? ["PNG", "PSD"] : ["PNG"];
  for (let index = 0; index < frames; index++) {
    const orientation = index === 0 ? "landscape" : "portrait";
    for (const format of formats) {
      const btn = page.getByRole("button", { name: format, exact: true }).nth(index);
      const [d] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }).catch(() => null), btn.click()]);
      if (!d) { console.log(orientation, format, "download: NONE"); continue; }
      const file = path.join(outDir, `magnet-${SIZE}-${orientation}.${format.toLowerCase()}`);
      await d.saveAs(file);
      console.log(orientation, format, "download:", file, fs.statSync(file).size, "bytes");
    }
  }
  const err = await page.getByText(/שגיאה/).first().textContent({ timeout: 1500 }).catch(() => null);
  if (err) console.log("error on page:", err);
  await page.screenshot({ path: path.join(outDir, `magnet-${SIZE}-end.png`) });

  if (!process.env.GF_KEEP) {
    const status = await page.evaluate(async (id) => (await fetch(`/api/magnet-frames/${id}`, { method: "DELETE" })).status, designId);
    console.log("deleted test frame:", status);
  }
  await browser.close();
})();
