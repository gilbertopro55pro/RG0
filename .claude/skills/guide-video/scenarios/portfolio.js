// Guide video "portfolio". Run: node ../record.js portfolio  (see SKILL.md)
module.exports = async ({ page, go, say, point, tap, scroll, sleep, navTap, capTop, on, off, OVERLAY, GID, PORTAL }) => {
  const V = (sel) => page.locator(sel).locator("visible=true");
  const pickTab = async (id) => { await page.locator("select").first().selectOption(id); await sleep(900); };
  await go("/settings"); await off(); for (let a = 0; a < 40; a++) { await sleep(1500); await page.locator("select").first().selectOption("profile"); await pickTab("portfolio"); if (await page.getByText("העלאת תמונות ישירות לפורטפוליו").first().isVisible()) break; } await page.evaluate(() => window.scrollTo(0, 0)); await on();
  await point(page.locator("select").first()); await say("הפורטפוליו הוא תיק עבודות ציבורי: עמוד אחד עם העבודות הכי טובות שלכם."); await sleep(5400);
  await point(V('[aria-label="פורטפוליו ציבורי"]')); await say("מפעילים אותו כאן, ובוחרים כתובת קצרה וטקסט פתיחה."); await sleep(5000);
  await point(page.getByText("העלאת תמונות ישירות לפורטפוליו")); await say("מעלים תמונות ישר לפורטפוליו, ומסדרים אותן בלשוניות לפי נושא."); await sleep(5400);
  await point(page.getByText("תמונות לרצועה הראשית")); await say("מסמנים בכוכב את התמונות שיופיעו ברצועה הראשית, בראש העמוד."); await sleep(5400);
  await point(V("button:has-text('העתקת קישור')")); await say("ומשתפים את הפורטפוליו עם לקוחות: בקישור, בוואטסאפ או בקוד QR."); await sleep(5400);
  await scroll(-4000); await navTap(V('a[href="/galleries"]'), page.locator(`a[href*="${GID}"]`));
  await say("אפשר להוסיף לפורטפוליו גלריה שלמה: לחיצה כפולה על הגלריה."); await point(page.locator(`a[href*="${GID}"]`)); await sleep(1200);
  await capTop(1); await page.evaluate(() => window.__gf.tap()); await page.locator(`a[href*="${GID}"]`).first().dblclick().catch(() => {}); await sleep(2200);
  await point(page.locator("button", { hasText: "הוספה לפורטפוליו" })); await say("ואז בוחרים הוספה לפורטפוליו, ואת הנושא שבו היא תופיע."); await sleep(4800);
  await go(`/galleries/${GID}`); await off(); await page.locator('img[alt="IMG_4108.JPG"]').first().waitFor({ timeout: 60000 }).catch(() => {}); await sleep(1500); await on();
  const ph = page.locator('img[alt="IMG_4108.JPG"]').first();
  await point(ph); await say("או תמונה בודדת: לחיצה כפולה על התמונה בגלריה,"); await sleep(1800);
  await capTop(1); await page.evaluate(() => window.__gf.tap()); await ph.dblclick().catch(() => {}); await sleep(1500);
  await point(page.locator("button", { hasText: "הוספה לפורטפוליו הציבורי" })); await say("ובוחרים הוספה לפורטפוליו הציבורי."); await sleep(3000);
  await tap(page.locator("button", { hasText: "הוספה לפורטפוליו הציבורי" })); await sleep(900);
  const inp = page.locator('input[list="portfolio-category-suggestions"]'); await point(inp); await inp.fill("חתונות").catch(() => {}); await say("בוחרים נושא, והתמונה עולה לפורטפוליו מייד."); await sleep(3800);
  await tap(page.getByRole("button", { name: "הוספה לפורטפוליו", exact: true }).last()); await sleep(1500); await capTop(0);
  await go("/p/studio-or"); await off(); await page.getByText("חתונות", { exact: true }).first().waitFor({ timeout: 60000 }).catch(() => {}); await sleep(2500); await page.evaluate(OVERLAY); await on();
  await say("כך הלקוחות רואים את הפורטפוליו: רצועה ראשית, וכמה מילים עליכם."); await sleep(5200);
  await scroll(620); const cat = page.getByText("חתונות", { exact: true }).locator("visible=true").first(); await point(cat); await say("הם יכולים לסנן לפי נושא,"); await sleep(3200);
  await scroll(450); await say("ולדפדף בכל העבודות שלכם, מכל מכשיר."); await sleep(4200);
};
