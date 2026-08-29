// Straight string manipulation on a native <input type="date">'s own "YYYY-MM-DD" value — no Date
// object (and so no timezone-conversion risk) — just reordering the same three parts to DD/MM/YYYY,
// since the browser's own inline rendering of that input in an RTL page shows YYYY / MM / DD with
// no way to control that via CSS or a locale prop, on both desktop and mobile (mobile shows this
// same inline text before its native picker sheet opens). Used as an overlay on top of the real
// input rather than replacing it — see the two call sites for the pattern.
export function formatDateDMYFromInput(iso: string): string {
  const parts = iso.split("-");
  if (parts.length !== 3) return "";
  const [y, m, d] = parts;
  return `${d}/${m}/${y}`;
}
