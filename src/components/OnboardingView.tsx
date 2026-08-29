"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { GOOGLE_EVENT_COLORS } from "@/lib/googleColors";
import type { Photographer } from "@/lib/types";

export default function OnboardingView({
  photographer,
  googleConnectedNotice,
  googleErrorNotice,
}: {
  photographer: Photographer;
  googleConnectedNotice: boolean;
  googleErrorNotice: boolean;
}) {
  const router = useRouter();
  const supabase = createClient();

  const [connected, setConnected] = useState(photographer.google_calendar_connected);
  const [colorId, setColorId] = useState(photographer.google_calendar_color_id);
  const [savingColor, setSavingColor] = useState<string | null>(null);

  const [businessId, setBusinessId] = useState(photographer.business_id ?? "");
  const [savingBusinessId, setSavingBusinessId] = useState(false);
  const [businessIdSaved, setBusinessIdSaved] = useState(false);

  const [logoPath, setLogoPath] = useState(photographer.logo_storage_path);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const [finishing, setFinishing] = useState(false);

  const chooseColor = async (id: string) => {
    setSavingColor(id);
    await supabase.from("photographers").update({ google_calendar_color_id: id }).eq("id", photographer.id);
    setColorId(id);
    setSavingColor(null);
  };

  const saveBusinessId = async () => {
    setSavingBusinessId(true);
    await supabase.from("photographers").update({ business_id: businessId.trim() || null }).eq("id", photographer.id);
    setSavingBusinessId(false);
    setBusinessIdSaved(true);
    setTimeout(() => setBusinessIdSaved(false), 2000);
  };

  const uploadLogo = async (file: File) => {
    setUploadingLogo(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `${photographer.id}/logo.${ext}`;
    try {
      const urlRes = await fetch("/api/storage/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket: "logos", path, contentType: file.type || "image/png" }),
      });
      const urlData = await urlRes.json();
      if (!urlRes.ok || !urlData.url) throw new Error(urlData.error ?? "העלאת הלוגו נכשלה");
      const putRes = await fetch(urlData.url, { method: "PUT", headers: { "Content-Type": file.type || "image/png" }, body: file });
      if (!putRes.ok) throw new Error("העלאת הלוגו נכשלה");
      await supabase.from("photographers").update({ logo_storage_path: path }).eq("id", photographer.id);
      setLogoPath(path);
      setLogoPreviewUrl(URL.createObjectURL(file));
    } catch {
      // Silent — the button simply stops spinning and the previous logo (if any) stays in place,
      // matching the same non-blocking pattern used for this exact upload in Settings.
    } finally {
      setUploadingLogo(false);
    }
  };

  const finish = async () => {
    setFinishing(true);
    await supabase.from("photographers").update({ onboarding_completed: true }).eq("id", photographer.id);
    router.push("/");
    router.refresh();
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl p-5 bg-card border border-line shadow-card">
        <h1 className="text-xl font-bold mb-1 font-display">ברוך הבא! 🎉</h1>
        <p className="text-sm text-ink-soft mb-5">כמה דברים קצרים שכדאי להגדיר עכשיו — אפשר גם לדלג ולהגדיר מאוחר יותר בהגדרות.</p>

        {googleConnectedNotice && (
          <div className="rounded-xl px-3.5 py-2.5 mb-4 text-xs bg-sage-bg text-sage">יומן Google חובר בהצלחה ✓</div>
        )}
        {googleErrorNotice && (
          <div className="rounded-xl px-3.5 py-2.5 mb-4 text-xs bg-white border border-rose text-rose">
            החיבור ליומן Google נכשל, נסה/י שוב
          </div>
        )}

        <div className="rounded-2xl p-4 mb-4 bg-white border border-line">
          <div className="text-sm font-semibold tracking-wide mb-3">יומן Google</div>
          {connected ? (
            <div className="space-y-3">
              <div className="rounded-xl px-3.5 py-2.5 text-sm bg-sage-bg text-sage font-medium">היומן מחובר ✓</div>
              <div>
                <div className="text-xs mb-2 text-ink-soft">
                  {colorId ? "צבע האירועים ביומן" : "באיזה צבע לשמור את האירועים ביומן?"}
                </div>
                <div className="flex flex-wrap gap-2">
                  {GOOGLE_EVENT_COLORS.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => chooseColor(c.id)}
                      disabled={savingColor !== null}
                      title={c.name}
                      className="h-9 w-9 rounded-full flex items-center justify-center disabled:opacity-60"
                      style={{
                        background: c.hex,
                        boxShadow: colorId === c.id ? "0 0 0 2px #fff, 0 0 0 4px var(--color-ink)" : "none",
                      }}
                    >
                      {colorId === c.id && <span style={{ color: "#1d1d1d" }}>✓</span>}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <a
              href="/api/google/connect?redirect=/onboarding"
              className="w-full flex items-center justify-center rounded-lg py-2.5 text-sm font-semibold bg-amber-deep text-white"
            >
              התחברות ליומן Google
            </a>
          )}
        </div>

        <div className="rounded-2xl p-4 mb-4 bg-white border border-line">
          <div className="text-sm font-semibold tracking-wide mb-3">מספר ח.פ / עוסק</div>
          <div className="flex gap-2">
            <input
              value={businessId}
              onChange={(e) => setBusinessId(e.target.value)}
              placeholder="לדוגמה: 039119243"
              dir="ltr"
              className="flex-1 rounded-lg px-2.5 py-1.5 text-sm border border-line bg-white font-data text-left"
            />
            <button
              onClick={saveBusinessId}
              disabled={savingBusinessId}
              className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-ink text-white disabled:opacity-60"
            >
              {savingBusinessId ? "שומר..." : businessIdSaved ? "נשמר ✓" : "שמירה"}
            </button>
          </div>
          <p className="text-[11px] text-ink-soft mt-1.5">יוצג בהצעות מחיר ליד שם העסק.</p>
        </div>

        <div className="rounded-2xl p-4 mb-5 bg-white border border-line">
          <div className="text-sm font-semibold tracking-wide mb-3">לוגו העסק</div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-lg bg-chip border border-line shrink-0 flex items-center justify-center overflow-hidden">
              {logoPreviewUrl || logoPath ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logoPreviewUrl ?? undefined} alt="לוגו" className="w-full h-full object-contain" />
              ) : (
                <span className="text-[10px] text-ink-soft">אין לוגו</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] text-ink-soft mb-1.5">יופיע בהצעות מחיר ובמסמכים שיוצאים ללקוחות.</p>
              <button
                onClick={() => logoInputRef.current?.click()}
                disabled={uploadingLogo}
                className="rounded-lg px-3 py-1.5 text-xs font-semibold bg-ink text-white disabled:opacity-60"
              >
                {uploadingLogo ? "מעלה..." : logoPath ? "החלפת לוגו" : "העלאת לוגו"}
              </button>
              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadLogo(file);
                  e.target.value = "";
                }}
              />
            </div>
          </div>
        </div>

        <button
          onClick={finish}
          disabled={finishing}
          className="w-full rounded-xl py-3 text-sm font-semibold bg-ink text-white disabled:opacity-60"
        >
          {finishing ? "שומר..." : "סיום, המשך למערכת"}
        </button>
      </div>
    </div>
  );
}
