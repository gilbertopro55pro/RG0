// The PDF of an issued receipt, fetched server-side from the invoicing provider's document link
// (owner, 2026-10-08: send the receipt as a PDF by email / WhatsApp / the phone's share sheet).
// Finbot's link is a page on its own site; when it isn't the PDF itself, the page is searched for
// a PDF link. Returns null when no PDF can be found (callers then send the link instead).
const PDF_MAGIC = "%PDF";

async function fetchWithTimeout(url: string, ms = 15000): Promise<Response | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal, redirect: "follow", headers: { Accept: "application/pdf,text/html;q=0.9,*/*;q=0.5" } });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isPdf(bytes: Uint8Array, contentType: string | null): boolean {
  if (contentType?.toLowerCase().includes("pdf")) return true;
  return bytes.length > 4 && String.fromCharCode(...bytes.slice(0, 4)) === PDF_MAGIC;
}

function allowedHost(url: string, documentUrl: string): boolean {
  try {
    const host = new URL(url).hostname;
    return host === new URL(documentUrl).hostname || /(^|\.)finbot\.co\.il$/i.test(host) || /(^|\.)finbotai\.co\.il$/i.test(host) || /(^|\.)greeninvoice\.co\.il$/i.test(host);
  } catch {
    return false;
  }
}

export async function fetchReceiptPdf(documentUrl: string): Promise<Uint8Array | null> {
  if (!/^https:\/\//i.test(documentUrl)) return null;
  const res = await fetchWithTimeout(documentUrl);
  if (!res || !res.ok) return null;
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (isPdf(bytes, res.headers.get("content-type"))) return bytes;
  // An HTML page: look for a link to the PDF on it (href / src / data, or a quoted URL with "pdf").
  const html = new TextDecoder().decode(bytes);
  const candidates = new Set<string>();
  for (const m of html.matchAll(/(?:href|src|data|content)\s*=\s*["']([^"']+)["']/gi)) if (/pdf/i.test(m[1])) candidates.add(m[1]);
  for (const m of html.matchAll(/["'](https?:\/\/[^"'\s]+?pdf[^"'\s]*)["']/gi)) candidates.add(m[1]);
  for (const raw of [...candidates].slice(0, 5)) {
    let url: string;
    try {
      url = new URL(raw.replace(/&amp;/g, "&"), res.url || documentUrl).toString();
    } catch {
      continue;
    }
    // Only from the provider itself (the document's own host, Finbot or Green Invoice).
    if (!/^https:\/\//i.test(url) || !allowedHost(url, documentUrl)) continue;
    const r = await fetchWithTimeout(url);
    if (!r || !r.ok) continue;
    const b = new Uint8Array(await r.arrayBuffer());
    if (isPdf(b, r.headers.get("content-type"))) return b;
  }
  return null;
}
