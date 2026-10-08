// While the receipt page loads: a plain screen in the page's own colours, not the app's dashboard
// skeleton (app/loading.tsx), which a client opening the link from WhatsApp shouldn't see.
export default function Loading() {
  return <div className="min-h-screen" style={{ background: "#eef1f6" }} />;
}
