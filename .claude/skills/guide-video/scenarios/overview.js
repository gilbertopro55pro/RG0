// Guide video "overview". Run: node ../record.js overview  (see SKILL.md)
module.exports = async ({ page, go, say, point, tap, scroll, sleep, navTap, capTop, on, off, OVERLAY, GID, PORTAL }) => {
  const V = (sel) => page.locator(sel).locator("visible=true");
  await go("/");
  await say("ברוכים הבאים לגילברטו. כל העסק שלכם, במקום אחד."); await sleep(4200);
  await point(page.locator("button", { hasText: "אירוע חדש" })); await say("כל אירוע חדש מתחיל כאן: פרטי הלקוח, תאריך, חבילה ומחיר."); await sleep(5000);
  await point(page.locator('section[aria-label="האירוע הבא"]')); await say("למעלה תמיד מחכה האירוע הבא: מתי, איפה, כמה נשאר לגבות, ומה השלב הבא."); await sleep(6000);
  await point(page.getByText(/^הכנסות ב/).first()); await say("מתחתיו, ההכנסות של החודש מול מה שצפוי להיכנס."); await sleep(4800);
  await point(page.locator('nav[aria-label="כלים"]')); await say("מכאן נכנסים לכלים: הצעות מחיר, גלריות, פורטל לקוח, לידים, רשימת המתנה ודשבורד."); await sleep(6000);
  await point(page.getByPlaceholder(/חיפוש/)); await say("וכאן כל האירועים, עם חיפוש וסינון."); await sleep(4200);
  await point(page.getByText(/יתרה פתוחה|ממתין לחתימה/).first()); await say("תגיות מסמנות מה דורש טיפול, למשל יתרה פתוחה או חוזה שעוד לא נחתם."); await sleep(5400);
  await navTap(page.getByRole("link", { name: "פתיחת האירוע" }), page.getByText("מסלול התהליך"));
  await say("בכרטיס האירוע נמצא הכול: פרטים, תשלומים, פורטל, גלריה וחוזה."); await sleep(5000);
  await point(page.locator('section[aria-label="מצב האירוע"]')); await say("למעלה רואים באיזה שלב האירוע נמצא, ומסמנים אותו כבוצע בלחיצה."); await sleep(5400);
  await point(page.getByText(/^מקדמה$/).first()); await say("מסמנים תשלום שהתקבל, ומפיקים מסמך בלחיצה אחת."); await sleep(5000);
  await point(page.locator("button", { hasText: "שליחה בוואטסאפ" })); await say("ושולחים ללקוח קישור אישי לפורטל, ישר לוואטסאפ."); await sleep(5000);
  await scroll(-4000);
  await navTap(V('a[href="/galleries"]'), page.locator("h1", { hasText: "גלריות" })); await say("מהתפריט העליון עוברים בין המסכים: גלריות,"); await sleep(3800);
  await navTap(V('a[href="/leads"]'), page.getByText("עידן ברק")); await say("לידים ופניות,"); await sleep(3200);
  await navTap(V('a[href="/analytics"]'), page.locator("h1", { hasText: "ניתוח עסקי" })); await say("והדשבורד העסקי."); await sleep(3800);
  await point(V('a[href="/settings"]')); await say("ובהגדרות מתאימים את המערכת לעסק שלכם. שם מחכים גם כל סרטוני ההדרכה."); await sleep(5600);
};
