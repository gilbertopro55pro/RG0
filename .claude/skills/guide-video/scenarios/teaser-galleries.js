// Screen clip for the "galleries" coming-soon teaser (no captions). See SKILL.md.
// The gallery is opened with go() (not a tap): it waits out the app's loading screen, which is cut.
module.exports = async ({ page, go, point, scroll, sleep, GID }) => {
  await go("/galleries");
  await sleep(1500);
  await point(page.locator(`a[href*="${GID}"]`).locator("visible=true").first());
  await sleep(1200);
  await go(`/galleries/${GID}`);
  await sleep(1800);
  await scroll(380); await sleep(1900);
  await scroll(420); await sleep(1900);
  await scroll(420); await sleep(1800);
  await scroll(-1400); await sleep(1800);
};
