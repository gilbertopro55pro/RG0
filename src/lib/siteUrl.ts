// The public site, for a link that leaves the app (an email, a message, PayPlus). Not a request's
// origin: a cron or a server-to-server call can arrive on the deployment's own *.vercel.app
// address, which is behind Vercel login (billing cron, 2026-10-19).
export const SITE_URL = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://myframeflow.com";
