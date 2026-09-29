// Screen clip for the "quotes" coming-soon teaser: the quote builder (home › הצעות מחיר), no
// captions. See SKILL.md.
module.exports = async ({ page, go, tap, sleep, on, off }) => {
  await go("/");
  await off();
  await page.locator("button", { hasText: "דלג הפעם" }).click({ timeout: 5000 }).catch(() => {});
  await sleep(800);
  await on();
  await sleep(1500);
  await tap(page.locator("button", { hasText: "הצעות מחיר" }).locator("visible=true").first());
  await sleep(2600);
  for (const dy of [320, 340, 360, 380]) {
    await page.mouse.move(240, 450);
    await page.mouse.wheel(0, dy);
    await sleep(2000);
  }
  await sleep(1200);
};
