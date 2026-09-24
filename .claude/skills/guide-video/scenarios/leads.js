// Guide video "leads". Run: node ../record.js leads  (see SKILL.md)
module.exports = async ({ page, go, say, point, tap, scroll, sleep, navTap, capTop, on, off, OVERLAY, GID, PORTAL }) => {
  await go("/leads");
  await say("כל פנייה חדשה של לקוח פוטנציאלי מתחילה כאן, כליד."); await sleep(4200);
  await point(page.locator("select").first()); await say("כל ליד עובר בין סטטוסים: חדש, יצרתי קשר, נשלחה הצעת מחיר, נסגר."); await sleep(4800);
  await point(page.locator("button", { hasText: "הצעת מחיר" })); await say("ישר מתוך הליד בונים ושולחים הצעת מחיר מותאמת, בלי לצאת מהעמוד."); await sleep(4800);
  await point(page.locator("button", { hasText: "המרה לאירוע" })); await say("כשהלקוח מאשר, לחיצה אחת הופכת את הליד לאירוע מלא, עם כל הפרטים."); await sleep(4800);
  await scroll(260); await say("לליד שלא ענה, המערכת שולחת הודעות מעקב אוטומטיות, כדי שאף פנייה לא תישכח."); await sleep(4800);
  await scroll(-400); await tap(page.locator("button", { hasText: "+" })); await say("פנייה חדשה? לוחצים על ליד חדש ומוסיפים אותה בכמה שניות."); await sleep(4500);
};
