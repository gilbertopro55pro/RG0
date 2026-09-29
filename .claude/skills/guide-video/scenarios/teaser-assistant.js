// Screen clip for the "assistant" coming-soon teaser: a short live chat on /chat/studio-or (no
// captions, no phone number, so no lead is created). Live model replies: review the frames.
module.exports = async ({ page, go, point, sleep }) => {
  const input = page.locator("#intake-msg");
  const ask = async (text) => {
    const before = await page.locator("div.self-start.whitespace-pre-wrap").count();
    await point(input);
    await input.click();
    await page.keyboard.type(text, { delay: 45 });
    await sleep(300);
    await page.keyboard.press("Enter");
    await page.waitForFunction((n) => document.querySelectorAll("div.self-start.whitespace-pre-wrap").length > n, before, { timeout: 90000 }).catch(() => console.log("no reply to:", text));
    await page.locator('[aria-label="מקליד"]').waitFor({ state: "detached", timeout: 90000 }).catch(() => {});
    await sleep(1800);
    await page.evaluate(() => window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }));
  };
  await go("/chat/studio-or?src=demo");
  await sleep(1200);
  await ask("היי, אנחנו מתחתנים ורצינו לבדוק אם אתם פנויים");
  await sleep(1500);
  await ask("ב-12 באוגוסט 2027, באולם בראשון לציון");
  await sleep(2500);
};
