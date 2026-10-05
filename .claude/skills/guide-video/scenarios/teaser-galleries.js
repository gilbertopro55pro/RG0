// Screen clip for the "galleries" coming-soon teaser (no captions): the client's premium gallery.
// The published clip (2026-10-05) was recorded locally with touch on (see SKILL.md); for a live
// re-shoot set GF_GALLERY_TOKEN=<the test gallery's access token>.
module.exports = async ({ page, go, tap, scroll, sleep }) => {
  await go(`/gallery/${process.env.GF_GALLERY_TOKEN}`);
  await page.evaluate(() => { const i = document.querySelector(".gt-cover-img"); if (i) { i.style.animation = "none"; void i.offsetWidth; i.style.animation = ""; } });
  await sleep(1500);
  await scroll(760); await sleep(150);
  await scroll(600);
  await page.evaluate(() => { const h = [...document.querySelectorAll("h2,h3")].find((x) => x.textContent.trim() === "טקס"); if (h) window.scrollTo({ top: h.getBoundingClientRect().top + scrollY - 120, behavior: "smooth" }); }); await sleep(700);
  await tap(page.locator('button[aria-label="הוספה למועדפים"]').nth(10)); await sleep(250);
  await page.evaluate(() => { const els = [...document.querySelectorAll("button img")]; const e = els.find((x) => { const r = x.getBoundingClientRect(); return r.top > 150 && r.bottom < innerHeight - 100 && r.width > 200; }); if (e) e.setAttribute("data-pick", "1"); });
  await tap(page.locator('[data-pick="1"]')); await sleep(1500);
  await tap(page.getByRole("button", { name: "התמונה הבאה" })); await sleep(1500);
};
