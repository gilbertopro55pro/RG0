// Screen clip for the "leads" coming-soon teaser (no captions). See SKILL.md.
module.exports = async ({ page, go, point, scroll, sleep }) => {
  await go("/leads");
  await sleep(2400);
  await point(page.locator("select").locator("visible=true").first()); await sleep(1500);
  await point(page.locator("button", { hasText: "הצעת מחיר" }).locator("visible=true").first()); await sleep(1500);
  await scroll(360); await sleep(1900);
  await scroll(380); await sleep(1900);
  await scroll(-900); await sleep(1500);
  await point(page.locator("button", { hasText: "המרה לאירוע" }).locator("visible=true").first()); await sleep(2200);
};
