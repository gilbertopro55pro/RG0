// Guide video "analytics". Run: node ../record.js analytics  (see SKILL.md)
module.exports = async ({ page, go, say, point, tap, scroll, sleep, navTap, capTop, on, off, OVERLAY, GID, PORTAL }) => {
  await go("/analytics");
  await say("הדשבורד נותן תמונה עסקית מלאה: כמה הכנסתם בכל חודש."); await sleep(4200);
  await point(page.locator("select").first()); await say("בוחרים חודש או שנה, ורואים הכנסות בפועל מול הצפי."); await sleep(4800);
  await scroll(330); await say("גרף 12 החודשים מראה את המגמה לאורך כל השנה."); await sleep(4800);
  await scroll(420); await say("אילו חבילות הכי מבוקשות אצלכם."); await sleep(4200);
  await scroll(400); await say("ורשימת התשלומים שעוד פתוחים, כדי לדעת למי להזכיר."); await sleep(4800);
  await scroll(-2000); await point(page.locator("button", { hasText: "CSV" })); await say("אפשר לייצא את הנתונים, או לשלוח אותם במייל לרואה החשבון."); await sleep(4800);
};
