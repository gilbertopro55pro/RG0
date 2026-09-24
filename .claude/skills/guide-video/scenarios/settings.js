// Guide video "settings". Run: node ../record.js settings  (see SKILL.md)
module.exports = async ({ page, go, say, point, tap, scroll, sleep, navTap, capTop, on, off, OVERLAY, GID, PORTAL }) => {
  const sel = page.locator("select").first();
  const pickTab = async (id, text, ms) => { await page.evaluate(() => window.scrollTo({ top: 0, behavior: "smooth" })); await sleep(700); await point(sel); await page.evaluate(() => window.__gf.tap()); await say(text); await sel.selectOption(id); await sleep(ms + 700); };
  await go("/settings");
  await point(sel); await say("בהגדרות מתאימים את המערכת לעסק שלכם. בוחרים נושא מהרשימה."); await sleep(5200);
  await say("פרופיל: פרטי העסק, חיבור ליומן, וחיבור לספק חשבוניות."); await scroll(500); await sleep(4200); await scroll(500); await sleep(1500);
  await pickTab("pricing", "תמחור וחבילות: סוגי אירועים, מחירים, וחבילות עם שלבי עבודה משלכם.", 4000); await scroll(450); await sleep(2000);
  await pickTab("quotes", "הצעות מחיר: תבניות מוכנות, לוגו ופרטי העסק שיופיעו בכל הצעה.", 5200);
  await pickTab("appearance", "מראה: מעבר בין מצב בהיר למצב כהה.", 4200);
  await pickTab("account", "מנוי וצוות: המנוי, נפח האחסון, מיתוג, ואנשי צוות.", 4000); await scroll(500); await sleep(2000);
  await pickTab("client_messages", "הודעות ללקוח: הנוסח של כל הודעה שהמערכת שולחת, במילים שלכם.", 5200);
  await pickTab("contract_template", "תבנית חוזה: החוזה שנשלח ללקוחות לחתימה דיגיטלית.", 5000);
  await pickTab("portfolio", "פורטפוליו: תיק העבודות הציבורי שלכם.", 4200);
    await pickTab("guides", "מדריכים: כל סרטוני ההדרכה, במקום אחד.", 4200);
  await pickTab("updates", "ועדכונים: כל מה שחדש במערכת.", 4200);
};
