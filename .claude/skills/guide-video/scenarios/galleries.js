// Guide video "galleries". Run: node ../record.js galleries  (see SKILL.md)
module.exports = async ({ page, go, say, point, tap, scroll, sleep, navTap, capTop, on, off, OVERLAY, GID, PORTAL }) => {
  await go("/galleries");
  await say("כאן יוצרים, מארגנים ושולחים ללקוחות את גלריות התמונות מהאירועים."); await sleep(4200);
  await tap(page.locator("button", { hasText: "גלריה חדשה" })); await say("יוצרים גלריה עצמאית מכאן, או ישירות מתוך כרטיס של אירוע קיים."); await sleep(4200);
  await page.keyboard.press("Escape"); await page.locator("button[aria-label='סגירה'], button:has(svg)").first().click({ timeout: 1500 }).catch(() => {}); await sleep(600);
  await navTap(page.locator(`a[href*="${GID}"]`), page.getByText("העלאת תמונות"));
  await say("מעלים תמונות בגרירה או מהטלפון, כולל קבצי HEIC מאייפון שמומרים אוטומטית."); await point(page.locator("button", { hasText: "העלאת תמונות" }).last()); await sleep(4500);
  await scroll(420); await say("מארגנים בתיקיות, קובעים תמונת שער ומסמנים מועדפות."); await sleep(4800);
  await scroll(-2000); await point(page.locator("button", { hasText: "העתקת קישור" }).first()); await say("כשהגלריה מוכנה, שולחים ללקוח קישור אישי. הוא נכנס בלי להתחבר."); await sleep(4800);
  await say("הלקוח בוחר תמונות, מוריד אותן, ואתם מקבלים עדכון על כל בחירה."); await sleep(4500);
};
