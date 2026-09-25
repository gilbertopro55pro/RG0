// Runs a real conversation with the intake assistant on the LIVE site, as a client would, and
// prints each reply with its latency.
//
//   NODE_PATH=<dir with playwright-core> node chat-test.js <chat key> "message 1" "message 2" ...
//
// <chat key> = the photographer's portfolio slug or intake_chat_token (test account: studio-or).
// Each run is a NEW conversation: it counts toward that photographer's monthly cap and the
// per-IP limit of 6 new conversations a day (lib/intakeChatAccess.ts, api/intake-chat).
const { chromium } = require("playwright-core");

const [key, ...messages] = process.argv.slice(2);
if (!key || messages.length === 0) {
  console.error('usage: node chat-test.js <chat key> "message" ["message" ...]');
  process.exit(2);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
  });
  const ctx = await browser.newContext({ viewport: { width: 400, height: 860 }, ignoreHTTPSErrors: true, locale: "he-IL" });
  await ctx.route(/myframeflow\.com|supabase\.co/, async (route) => {
    for (let a = 0; a < 5; a++) {
      try { return route.fulfill({ response: await route.fetch({ timeout: 90000 }) }); } catch { await new Promise((r) => setTimeout(r, 700 * (a + 1))); }
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  await page.goto(`https://myframeflow.com/chat/${encodeURIComponent(key)}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForFunction(() => !document.getElementById("boot-splash"), null, { timeout: 60000 }).catch(() => {});
  await page.evaluate(() => document.getElementById("boot-splash")?.remove());
  const input = page.locator("#intake-msg");
  if (!(await input.count())) {
    console.log("No chat input — the page shows the fallback inquiry form (assistant off / plan / cap).");
    await browser.close();
    return;
  }
  await page.waitForFunction(() => !document.querySelector("#intake-msg")?.disabled, null, { timeout: 30000 });
  const bubbles = page.locator("div.max-w-\\[86\\%\\]");
  for (const m of messages) {
    const before = await bubbles.count();
    const t0 = Date.now();
    await input.fill(m);
    await page.locator('button[aria-label="שליחה"]').click();
    await page.waitForFunction((n) => document.querySelectorAll("div.max-w-\\[86\\%\\]").length >= n + 2, before, { timeout: 90000 }).catch(() => {});
    console.log(`\n> ${m}\n< (${((Date.now() - t0) / 1000).toFixed(1)}s) ${await bubbles.last().innerText()}`);
  }
  await browser.close();
})();
