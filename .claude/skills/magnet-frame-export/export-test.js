// Runs the magnet frame flow end to end on the LIVE site, the way a photographer does it:
// opens /magnet-frames, adds a text and one element, saves, then downloads the landscape (20×15)
// and portrait (15×20) PNGs and prints what came back.
//
//   GF_STATE=<scratch>/qa-state.json NODE_PATH=<dir with playwright-core> node export-test.js [outDir]
//
// Saving updates the account's (single, latest) design — run it on the test account only.
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const outDir = process.argv[2] || process.cwd();
if (!process.env.GF_STATE) {
  console.error("usage: GF_STATE=… node export-test.js [outDir]");
  process.exit(2);
}

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

  await page.goto("https://myframeflow.com/magnet-frames", { waitUntil: "domcontentloaded", timeout: 90000 });
  if (!page.url().includes("/magnet-frames")) {
    console.log("redirected to", page.url(), "(no access for this account)");
    await browser.close();
    process.exit(1);
  }
  await page.waitForFunction(() => !document.getElementById("boot-splash"), null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => document.getElementById("boot-splash")?.remove());
  await page.getByRole("button", { name: "+ הוספת טקסט" }).waitFor({ timeout: 60000 });
  // The "install the app" card sits over the editor's buttons in the bottom corner.
  const notNow = page.getByRole("button", { name: "לא עכשיו" });
  if (await notNow.count()) await notNow.first().click().catch(() => {});

  await page.getByRole("button", { name: "+ הוספת טקסט" }).click();
  await page.getByRole("button", { name: "אלמנטים" }).click();
  await page.waitForTimeout(800);
  await page.locator("button[title]:visible").filter({ has: page.locator("img") }).first().click();
  await page.waitForTimeout(500);

  const saved = page.waitForResponse((r) => r.url().endsWith("/api/magnet-frames") && r.request().method() === "POST", { timeout: 60000 });
  await page.getByRole("button", { name: "שמירה", exact: true }).click();
  console.log("save:", (await saved).status());

  for (const [label, name] of [["מסגרת לרוחב (20×15)", "landscape"], ["מסגרת לאורך (15×20)", "portrait"]]) {
    const btn = page.getByRole("button", { name: label });
    await btn.waitFor({ timeout: 30000 });
    const [d] = await Promise.all([page.waitForEvent("download", { timeout: 120000 }).catch(() => null), btn.click()]);
    if (!d) { console.log(name, "download: NONE"); continue; }
    const file = path.join(outDir, `magnet-${name}.png`);
    await d.saveAs(file);
    console.log(name, "download:", file, fs.statSync(file).size, "bytes");
  }
  const err = await page.getByText(/שגיאה/).first().textContent({ timeout: 1500 }).catch(() => null);
  if (err) console.log("error on page:", err);
  await page.screenshot({ path: path.join(outDir, "magnet-end.png") });
  await browser.close();
})();
