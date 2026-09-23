// Guide video "waitlist". Run: node ../record.js waitlist  (see SKILL.md)
module.exports = async ({ page, go, say, point, tap, scroll, sleep, navTap, capTop, on, off, OVERLAY, GID, PORTAL }) => {
  await go("/waitlist");
  await say("כשלקוח מבקש תאריך שכבר תפוס, מוסיפים אותו לרשימת ההמתנה במקום לוותר עליו."); await sleep(4500);
  await point(page.locator("text=משפחת אברהם")); await say("כל רשומה שומרת את התאריך המבוקש, הטלפון והערות."); await sleep(4800);
  await point(page.locator("button", { hasText: "התאריך התפנה" })); await say("התפנה התאריך? לחיצה אחת הופכת את הרשומה לאירוע, עם כל הפרטים."); await sleep(4800);
  await point(page.locator("button", { hasText: "אישור האירוע" })); await say("הלקוח הסתדר אחרת? מסמנים ומתעדים איך הפנייה נסגרה."); await sleep(4800);
  await page.evaluate(() => window.__gf.hide()); await say("כך אף פנייה לא הולכת לאיבוד, גם כשהיומן מלא."); await sleep(4200);
};
