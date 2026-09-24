// Signup → email confirmation → login → trial → /billing → PayPlus checkout link, on the LIVE site.
// Stops before card entry (the sandbox can't reach payments.payplus.co.il anyway).
//
//   NODE_PATH=<dir with playwright-core> node signup-billing-test.js <workDir>
//
// Creates a NEW account: gilbertopro55+qa-signup-<stamp>@gmail.com (emails land in the owner's
// inbox), phone 05899<stamp>. The password is random, lives only in this process, never printed.
// After "WAITING_FOR_CONFIRM" confirm the email (SQL in SKILL.md), then `touch <workDir>/confirmed.flag`.
const { chromium } = require("playwright-core");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const workDir = process.argv[2] || process.cwd();
const flag = path.join(workDir, "confirmed.flag");

(async () => {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    ...(process.env.HTTPS_PROXY ? { proxy: { server: process.env.HTTPS_PROXY } } : {}),
  });
  const ctx = await browser.newContext({ viewport: { width: 430, height: 900 }, ignoreHTTPSErrors: true, locale: "he-IL" });
  await ctx.route(/myframeflow\.com|supabase\.co/, async (route) => {
    for (let a = 0; a < 5; a++) {
      try { return route.fulfill({ response: await route.fetch({ timeout: 60000 }) }); } catch { await new Promise((r) => setTimeout(r, 700 * (a + 1))); }
    }
    return route.abort();
  });
  const page = await ctx.newPage();
  const clean = async () => (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
  const ready = async () => {
    await page.waitForFunction(() => !document.getElementById("boot-splash"), null, { timeout: 60000 }).catch(() => {});
    await page.evaluate(() => document.getElementById("boot-splash")?.remove());
  };
  page.on("response", async (r) => {
    if (/\/api\/(auth\/signup|payplus\/)/.test(r.url())) {
      let body = "";
      try { body = (await r.text()).replace(/https:\/\/\S+?(?=")/g, (u) => u.split("?")[0]).slice(0, 200); } catch {}
      console.log("api:", r.status(), r.url().replace(/^.*\/api/, "/api"), body);
    }
  });

  const stamp = Date.now().toString().slice(-6);
  const email = `gilbertopro55+qa-signup-${stamp}@gmail.com`;
  const phone = `05899${stamp.slice(-5)}`;
  const password = crypto.randomBytes(12).toString("base64url") + "Aa1!";
  console.log("account:", email, phone);

  // 1. Signup (plan פרו monthly), expect the "נדרש אימות מייל" screen.
  await page.goto("https://myframeflow.com/signup", { waitUntil: "domcontentloaded", timeout: 90000 });
  await ready();
  await page.locator("select").first().selectOption("monthly");
  await page.getByRole("button", { name: "התחלת תקופת הניסיון" }).click();
  await page.locator("input").nth(0).fill("QA הרשמה " + stamp);
  await page.locator('input[type="tel"]').fill(phone);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole("button", { name: "יצירת חשבון" }).click();
  await page.waitForTimeout(8000);
  console.log("after signup:", (await clean()).slice(0, 120));

  // 2. Same phone again must be refused (one trial per phone).
  const dup = await page.evaluate(async (p) => {
    const r = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "dup", phone: p, email: `gilbertopro55+qa-dup-${Date.now()}@gmail.com`, password: "x".repeat(10) + "A1!", plan: "monthly" }) });
    return r.status;
  }, phone);
  console.log("duplicate phone signup status (expect 409):", dup);

  // 3. Login before confirming → Hebrew "not confirmed" message.
  await page.goto("https://myframeflow.com/login", { waitUntil: "domcontentloaded", timeout: 90000 });
  await ready();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('input[type="password"]').press("Enter");
  await page.waitForTimeout(5000);
  console.log("login before confirm:", (await clean()).match(/כתובת המייל עדיין לא אומתה|Email not confirmed/)?.[0] ?? "(no message)");

  console.log("WAITING_FOR_CONFIRM");
  for (let i = 0; i < 180 && !fs.existsSync(flag); i++) await new Promise((r) => setTimeout(r, 2000));

  // 4. Login → onboarding (first login) → /billing in trial → checkout link.
  await page.goto("https://myframeflow.com/login", { waitUntil: "domcontentloaded", timeout: 90000 });
  await ready();
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('input[type="password"]').press("Enter");
  await page.waitForTimeout(8000);
  console.log("after login:", page.url());
  await page.goto("https://myframeflow.com/billing", { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForTimeout(4000);
  console.log("billing:", (await clean()).slice(0, 220));
  const checkout = page.waitForResponse((r) => r.url().endsWith("/api/payplus/checkout"), { timeout: 60000 });
  await page.getByRole("button", { name: "מעבר לתשלום מאובטח" }).click();
  const res = await checkout;
  const data = await res.json().catch(() => ({}));
  console.log("checkout:", res.status(), data.url ? "payment link on " + new URL(data.url).host : data.error);
  await browser.close();
})();
