// Creates the Playwright session file record.js needs: node login.js
// Env: GF_EMAIL / GF_PASSWORD = the test account's credentials, passed for this one run only
//      GF_STATE = where to save the session JSON. Must be OUTSIDE the repo (e.g. the scratchpad).
// The password is never written anywhere by this script, and must not be put in any file,
// commit, log or chat message. Only the resulting session cookies are saved, to GF_STATE.
const { chromium } = require("playwright-core");

(async () => {
  const { GF_EMAIL, GF_PASSWORD, GF_STATE } = process.env;
  if (!GF_EMAIL || !GF_PASSWORD || !GF_STATE) throw new Error("GF_EMAIL, GF_PASSWORD and GF_STATE are required");
  if (require("path").resolve(GF_STATE).startsWith(require("path").resolve(__dirname, "../../.."))) throw new Error("GF_STATE must be outside the repo");
  const browser = await chromium.launch({ executablePath: process.env.GF_CHROME || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", proxy: process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined });
  const ctx = await browser.newContext({ ignoreHTTPSErrors: true, locale: "he-IL" });
  const page = await ctx.newPage();
  await page.goto("https://myframeflow.com/login", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.locator('input[type="email"]').first().fill(GF_EMAIL);
  await page.locator('input[type="password"]').first().fill(GF_PASSWORD);
  await page.locator('input[type="password"]').first().press("Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 90000 });
  await ctx.storageState({ path: GF_STATE });
  console.log("session saved");
  await browser.close();
})().catch((e) => { console.error("login failed:", e.message); process.exit(1); });
