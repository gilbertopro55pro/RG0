// Screen clip for the "home" coming-soon teaser (no captions; teaser.js adds the text). See SKILL.md.
module.exports = async ({ page, go, scroll, sleep, on, off }) => {
  await go("/");
  // The quote follow-up prompt ("מעקב אחרי הצעת מחיר") can open over the home screen: skip it off-camera.
  await off();
  await page.locator("button", { hasText: "דלג הפעם" }).click({ timeout: 5000 }).catch(() => {});
  await sleep(800);
  await on();
  await sleep(2600);
  await scroll(320); await sleep(2100);
  await scroll(360); await sleep(2100);
  await scroll(380); await sleep(2000);
  await scroll(-1200); await sleep(2600);
};
