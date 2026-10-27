// Attached to the document before click — a detached anchor's click() is a silent no-op on some
// engines (WebKit especially), which reads as "nothing happens, no save dialog".
export function triggerZipAnchorDownload(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

export { fitAutoElements } from "@/lib/albumSafeArea";
