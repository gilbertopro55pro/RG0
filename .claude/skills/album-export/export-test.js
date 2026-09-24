// Runs one album export end to end on the LIVE site, exactly the way a photographer does it:
// opens the gallery's album tool, clicks the export button, confirms the page-range dialog,
// follows the job until it's final, downloads the file and prints what came back.
//
//   GF_STATE=<scratch>/qa-state.json GF_GALLERY=<gallery id> NODE_PATH=<dir with playwright-core> \
//     node export-test.js pdf|jpg|psd|print [out dir]
//
// "print" (send to print house) needs a row in print_house_emails for the account, and really
// sends an email — see SKILL.md.
const { chromium } = require("playwright-core");
const fs = require("fs");
const path = require("path");

const BUTTON = { pdf: "ייצוא PDF", jpg: "ייצוא JPG (כל העמודים)", psd: "ייצוא PSD (פוטושופ)", print: "שליחה לבית דפוס" };
const format = process.argv[2];
const outDir = process.argv[3] || process.cwd();
const gallery = process.env.GF_GALLERY;
if (!BUTTON[format] || !gallery || !process.env.GF_STATE) {
  console.error("usage: GF_STATE=… GF_GALLERY=… node export-test.js pdf|jpg|psd|print [outDir]");
  process.exit(2);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--lang=he-IL"],
    ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
  });
  // Desktop viewport: the album tool refuses to run in portrait ("סובבו את המכשיר").
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, storageState: process.env.GF_STATE, acceptDownloads: true, ignoreHTTPSErrors: true, locale: "he-IL" });
  // Force the plain blob download path instead of Chrome's native save dialog (PDF offers one).
  await ctx.addInitScript(() => { try { window.showSaveFilePicker = undefined; } catch {} });
  // The sandbox proxy drops Chromium requests to these hosts now and then; retry them.
  await ctx.route(/myframeflow\.com|supabase\.co/, async (route) => {
    for (let a = 0; a < 5; a++) {
      try { return route.fulfill({ response: await route.fetch({ timeout: 60000 }) }); } catch { await new Promise((r) => setTimeout(r, 700 * (a + 1))); }
    }
    return route.abort();
  });
  const page = await ctx.newPage();

  let job = null;
  page.on("response", async (r) => {
    const u = r.url();
    if (r.request().method() === "POST" && /\/album\/(export-(pdf|jpg|psd)|send-to-print-house)$/.test(u)) {
      try { console.log("create job:", r.status(), JSON.stringify(await r.json())); } catch {}
    }
    if (/\/album\/export-jobs\//.test(u)) { try { job = await r.json(); } catch {} }
  });

  await page.goto(`https://myframeflow.com/galleries/${gallery}?openAlbum=1`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById("boot-splash"), null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => document.getElementById("boot-splash")?.remove());
  const btn = page.getByRole("button", { name: BUTTON[format] }).first();
  await btn.waitFor({ timeout: 60000 });
  await btn.click();
  await page.waitForTimeout(1500);

  const download = page.waitForEvent("download", { timeout: 600000 }).catch(() => null);
  if (format === "print") {
    // Sheet: pick the address (default preselected) → send → confirm "לשלוח את קובצי ה-JPG…".
    await page.getByRole("button", { name: "שליחה", exact: true }).last().click();
    await page.waitForTimeout(800);
    await page.getByRole("button", { name: "כן, שליחה" }).click();
  } else {
    const rangeOk = page.getByRole("button", { name: "הורדה" });
    if (await rangeOk.count()) await rangeOk.last().click();
  }

  const started = Date.now();
  while (Date.now() - started < 600000) {
    await page.waitForTimeout(3000);
    if (job) process.stdout.write(`\r${job.status} ${job.processedCount}/${job.totalCount}   `);
    if (job && ["ready", "failed", "cancelled"].includes(job.status)) break;
  }
  console.log("\nfinal:", job && { status: job.status, error: job.errorMessage, filename: job.filename });

  if (format !== "print") {
    const d = await Promise.race([download, new Promise((r) => setTimeout(() => r(null), 60000))]);
    let file = null;
    if (d) {
      file = path.join(outDir, `album-${format}${format === "pdf" ? ".pdf" : ".zip"}`);
      await d.saveAs(file);
      console.log("browser download:", file);
    } else if (job?.downloadUrl) {
      // Browser download failed (usually the proxy, not the app) — fetch the same signed URL.
      const r = await ctx.request.get(job.downloadUrl, { timeout: 300000 });
      file = path.join(outDir, `album-${format}-api${format === "pdf" ? ".pdf" : ".zip"}`);
      fs.writeFileSync(file, await r.body());
      console.log("download via signed URL (browser download failed):", r.status(), file);
    }
    if (file) console.log("bytes:", fs.statSync(file).size);
  }
  if (format === "print") {
    // Success toast: "נשלח בהצלחה ל-<label>"; failure toast carries the server's error.
    const toast = await page.getByText(/נשלח בהצלחה|נכשלה/).first().textContent({ timeout: 15000 }).catch(() => null);
    console.log("toast:", toast);
  }
  await page.screenshot({ path: path.join(outDir, `album-${format}-end.png`) });
  await browser.close();
})();
