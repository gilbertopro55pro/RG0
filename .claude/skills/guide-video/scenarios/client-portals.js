// Guide video "client-portals". Run: node ../record.js client-portals  (see SKILL.md)
module.exports = async ({ page, go, say, point, tap, scroll, sleep, navTap, capTop, on, off, OVERLAY, GID, PORTAL }) => {
  await go("/client-portals");
  await say("לכל אירוע יש פורטל אישי ללקוח. הלקוח נכנס בלי סיסמה ובלי התחברות."); await sleep(4200);
  await tap(page.locator("button", { hasText: "העתקת קישור" })); await say("מעתיקים את הקישור ושולחים אותו בוואטסאפ או במייל."); await sleep(4200);
  await go(PORTAL);
  await say("כך הלקוח רואה את הפורטל: שלבי האירוע, מה כבר בוצע ומה הבא בתור."); await sleep(4800);
  await scroll(420); await say("בכל שלב מופיע מה הלקוח צריך לעשות, למשל לבחור תמונות או שיר."); await sleep(4800);
  await scroll(700); await say("ובסוף, מצב התשלומים: מה שולם ומה נשאר."); await sleep(4800);
};
