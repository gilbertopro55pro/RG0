// Guide video "galleries". Run: node ../record.js galleries  (see SKILL.md)
// Captions match the premium-gallery redesign (2026-10-05). The published video was recorded locally
// (see SKILL.md, "Galleries video and teaser re-recorded locally"); this file is for a future live re-shoot.
// The client part needs the test gallery's access token: GF_GALLERY_TOKEN=<galleries.access_token>.
// Parts: photographer side in the default viewport; the client gallery looks best with touch on
// (hearts show on every photo), which the live recorder doesn't set, so hearts are tapped through the lightbox.
module.exports = async ({ page, go, say, point, tap, scroll, sleep, navTap, capTop, on, off, OVERLAY, GID }) => {
  await go("/galleries");
  await say("כאן יוצרים, מארגנים ושולחים ללקוחות את גלריות התמונות מהאירועים."); await sleep(3600);
  await navTap(page.locator(`a[href*="${GID}"]`).locator("visible=true"), page.getByText("העלאת תמונות").first());
  await say("מעלים תמונות בגרירה או ישר מהטלפון, ומארגנים אותן בתיקיות.");
  await point(page.locator("button", { hasText: "העלאת תמונות" }).locator("visible=true").last()); await sleep(2500);
  await tap(page.getByText("הגדרות גלריה").first()); await sleep(700);
  await tap(page.getByRole("button", { name: "עיצוב הגלריה" })); await sleep(500);
  await capTop(1);
  await say("בהגדרות › עיצוב הגלריה בוחרים ערכת נושא. החדשה היא ״פרימיום״.");
  await page.evaluate(() => { const b = [...document.querySelectorAll("button")].find((x) => x.textContent.trim() === "פרימיום"); b && b.scrollIntoView({ block: "center", behavior: "smooth" }); }); await sleep(1500);
  await tap(page.locator("button", { hasText: "פרימיום" }).last()); await sleep(900);
  await page.evaluate(() => document.querySelector(".max-h-\\[85vh\\]")?.scrollTo({ top: 0, behavior: "smooth" })); await sleep(600);
  await say("שער על כל המסך, פרק לכל תיקייה ותמונות בשורות. רואים הכל כאן מראש."); await sleep(4000);
  await capTop(0);
  await tap(page.getByRole("button", { name: "שמירת שינויים" })); await sleep(900);
  await capTop(1);
  await tap(page.getByRole("button", { name: "שיתוף", exact: true }).locator("visible=true").first()); await sleep(500);
  await say("כשהגלריה מוכנה, שולחים ללקוח קישור אישי. הוא נכנס בלי להתחבר."); await sleep(4200);
  await capTop(0);
  if (!process.env.GF_GALLERY_TOKEN) return console.log("GF_GALLERY_TOKEN not set: client part skipped");
  await go(`/gallery/${process.env.GF_GALLERY_TOKEN}`);
  await say("כך הלקוח רואה את הגלריה: תמונת שער על כל המסך, עם השמות והתאריך."); await sleep(3800);
  await scroll(760); await say("גוללים, וכל תיקייה מופיעה כפרק עם כותרת משלה."); await sleep(1200);
  await scroll(600); await sleep(600); await scroll(600); await sleep(800);
  await tap(page.locator("section button img").locator("visible=true").nth(2)); await sleep(900);
  await say("לחיצה על תמונה פותחת אותה על מסך שחור, עם לב והורדה."); await sleep(1200);
  await tap(page.getByRole("dialog").getByRole("button", { name: "הוספה למועדפים" }));
  await say("לב על תמונה מסמן אותה כמועדפת, ואתם רואים את הבחירה אצלכם."); await sleep(3000);
  await tap(page.getByRole("dialog").getByRole("button", { name: "סגירה" }));
  await say("בסרגל למעלה: המועדפים, הורדת כל התמונות ושיתוף הגלריה.");
  await point(page.getByRole("button", { name: /הורדת כל התמונות/ })); await sleep(1500);
  await point(page.getByRole("button", { name: "שיתוף הגלריה" })); await sleep(1600);
  // Reset afterwards: the heart is saved on the test gallery (gallery_photos.is_favorite).
};
