// Guide video "overview". Run: node ../record.js overview  (see SKILL.md)
module.exports = async ({ page, go, say, point, tap, scroll, sleep, navTap, capTop, on, off, OVERLAY, GID, PORTAL }) => {
  const V = (sel) => page.locator(sel).locator("visible=true");
  await go("/");
  await say("ברוכים הבאים לגילברטו: כל העסק שלכם, במסך אחד."); await sleep(4200);
  await point(page.locator("button", { hasText: "אירוע חדש" })); await say("כל אירוע מתחיל כאן: פרטי הלקוח, תאריך, חבילה ומחיר."); await sleep(5000);
  await point(page.getByText(/צפי לחודש/).first()); await say("ההכנסות של החודש, מול הצפי שלכם."); await sleep(4500);
  await point(page.getByText("כלים", { exact: true })); await say("הכלים: הצעות מחיר, גלריות, פורטל לקוח, לידים, רשימת המתנה ודשבורד."); await sleep(5800);
  await point(page.getByPlaceholder(/חיפוש/)); await say("רשימת האירועים, עם חיפוש וסינון לפי סטטוס."); await sleep(4600);
  await point(page.getByText(/יתרה פתוחה|ממתין לחתימה/).first()); await say("תגיות מסמנות מה דורש טיפול: יתרה פתוחה, חוזה שממתין לחתימה."); await sleep(5200);
  await navTap(page.getByText("חתונה - דנה ואורי"), page.getByText("מסלול התהליך"));
  await say("בכרטיס האירוע נמצא הכול: תשלומים, פורטל, גלריה וחוזה."); await sleep(5000);
  await point(page.getByText(/מקדמה/).first()); await say("מסמנים תשלום שהתקבל, ומפיקים מסמך בלחיצה."); await sleep(5000);
  await point(page.locator("button", { hasText: "שליחה בוואטסאפ" })); await say("שולחים ללקוח קישור אישי לפורטל, ישר לוואטסאפ."); await sleep(5000);
  await page.getByText("מסלול התהליך").first().evaluate((e) => window.scrollTo({ top: e.getBoundingClientRect().top + window.scrollY - 120, behavior: "smooth" })); await sleep(900); await point(page.getByText("מסלול התהליך")); await say("מסלול התהליך מראה באיזה שלב האירוע, ומה הצעד הבא."); await sleep(5600);
  await scroll(-4000);
  await navTap(V('a[href="/galleries"]'), page.locator("h1", { hasText: "גלריות" })); await say("מהתפריט העליון עוברים בין המסכים: גלריות,"); await sleep(3800);
  await navTap(V('a[href="/leads"]'), page.getByText("עידן ברק")); await say("לידים ופניות,"); await sleep(3200);
  await navTap(V('a[href="/analytics"]'), page.locator("h1", { hasText: "ניתוח עסקי" })); await say("והדשבורד העסקי."); await sleep(3800);
  await point(V('a[href="/settings"]')); await say("בהגדרות מתאימים את המערכת לעסק, ושם גם כל סרטוני ההדרכה."); await sleep(5200);
};
