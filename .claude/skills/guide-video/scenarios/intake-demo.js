// Landing-page demo of the intake assistant ("intake-demo"). Run: node ../record.js intake-demo (see SKILL.md)
// A real conversation with the test account's assistant (/chat/studio-or), then settings › אוטומציה
// to show the FAQ it answered from. The replies are live model output, so they differ per run:
// review the frames before publishing. Creates a lead ("נועה", phone 0500000123) in the test account.
// GF_CHAT_ONLY=1 records only the chat part (no login needed; a dry run).
module.exports = async ({ page, go, say, point, tap, scroll, sleep, capTop, on, off, OVERLAY }) => {
  const assistant = page.locator("div.self-start.whitespace-pre-wrap");
  const typing = page.locator('[aria-label="מקליד"]');
  const input = page.locator("#intake-msg");

  // Types like a person, sends, then waits until every bubble of the reply has appeared.
  const ask = async (text) => {
    const before = await assistant.count();
    await point(input);
    await input.click();
    await page.keyboard.type(text, { delay: 55 });
    await sleep(350);
    await page.keyboard.press("Enter");
    await page.waitForFunction((n) => document.querySelectorAll("div.self-start.whitespace-pre-wrap").length > n, before, { timeout: 90000 }).catch(() => console.log("no reply to:", text));
    await typing.waitFor({ state: "detached", timeout: 90000 }).catch(() => {});
    // Multi-bubble replies are revealed one by one; wait for the count to settle.
    let last = -1;
    for (let i = 0; i < 12; i++) {
      const c = await assistant.count();
      if (c === last) break;
      last = c;
      await sleep(1600);
    }
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
  };

  await go("/chat/studio-or?src=demo");
  await capTop(1);
  await say("ככה לקוח חדש מדבר עם העוזר שלכם, מקישור בוואטסאפ או באתר.");
  await sleep(4200);
  await ask("היי, אנחנו מתחתנים ורצינו לבדוק אם אתם פנויים");
  await say("העוזר עונה כמו בן אדם: מגיב למה שנאמר, ושואל שאלה אחת בכל פעם.");
  await sleep(5200);
  await ask("ב-12 באוגוסט 2027, באולם בראשון לציון. בערך 300 אורחים");
  await say("הוא בודק מול היומן שלכם אם התאריך פנוי, ואוסף את פרטי האירוע.");
  await sleep(5200);
  await ask("ובערך כמה זה עולה?");
  await say("על מחיר הוא לא עונה במספרים. את הצעת המחיר שולחים אתם.");
  await sleep(5200);
  await ask("ותוך כמה זמן מקבלים את התמונות?");
  await say("את התשובה הזו הוא לא המציא. היא מגיעה ממה שכתבתם לו.");
  await sleep(5200);
  await ask("אני נועה, 0500000123");
  await say("ברגע שיש טלפון, הפנייה נכנסת אצלכם כליד, עם כל הפרטים.");
  await sleep(5200);
  await capTop(0);
  if (process.env.GF_CHAT_ONLY) return;

  // Behind the scenes: settings › אוטומציה › שאלות נפוצות.
  await go("/settings");
  const sel = page.locator("select").first();
  for (let a = 0; a < 4; a++) {
    await sel.selectOption("automation").catch(() => {});
    await sleep(900);
    if (await page.locator("summary", { hasText: "שאלות נפוצות" }).locator("visible=true").count()) break;
    await sleep(1500);
  }
  await point(sel);
  await say("מאחורי הקלעים: בהגדרות, אוטומציה, מדייקים את העוזר.");
  await sleep(4200);
  const faqSummary = page.locator("summary", { hasText: "שאלות נפוצות" }).locator("visible=true");
  await tap(faqSummary);
  await sleep(900);
  const q = page.locator('input[value="מתי מקבלים את התמונות?"]').locator("visible=true").first();
  await point(q);
  await say("שאלות ותשובות שאתם כותבים. מכאן הגיעה התשובה על התמונות.");
  await sleep(5200);
  await point(page.locator("button", { hasText: "+ שאלה חדשה" }).locator("visible=true"));
  await say("מוסיפים עד 15 שאלות, והעוזר עונה לפי שיטת העבודה שלכם.");
  await sleep(5200);
};
