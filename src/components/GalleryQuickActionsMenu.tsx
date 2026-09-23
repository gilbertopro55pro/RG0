"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import GalleryShareModal from "@/components/GalleryShareModal";
import type { GalleryListItem } from "@/components/GalleriesListView";

const NO_FOLDER_KEY = "none";
type Step = "menu" | "portfolio" | "share" | "delete";

// Opened by a double-click on a gallery row in GalleriesListView — lets the photographer add a
// whole gallery to the public portfolio, share it, or delete it, without opening the gallery
// itself first. Folders ("tabs") and the unfoldered-photos flag are fetched lazily, only once the
// photographer actually picks "portfolio" or "share", since most double-clicks on this menu are
// probably heading straight for delete or a quick share and don't need that data at all.
export default function GalleryQuickActionsMenu({
  item,
  photographerName,
  photographerEmail,
  onClose,
  onDeleted,
}: {
  item: GalleryListItem;
  photographerName: string;
  photographerEmail: string;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const supabase = createClient();
  const router = useRouter();
  const [step, setStep] = useState<Step>("menu");
  const [error, setError] = useState<string | null>(null);

  const [loadingFolders, setLoadingFolders] = useState(false);
  const [folders, setFolders] = useState<{ id: string; name: string }[]>([]);
  const [hasUnfoldered, setHasUnfoldered] = useState(false);
  const [selectedFolderKeys, setSelectedFolderKeys] = useState<Set<string>>(new Set());

  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  const [portfolioCategory, setPortfolioCategory] = useState(item.title);
  const [savingPortfolio, setSavingPortfolio] = useState(false);
  const [portfolioDone, setPortfolioDone] = useState(false);

  const [deleting, setDeleting] = useState(false);

  const allKeys = [...folders.map((f) => f.id), ...(hasUnfoldered ? [NO_FOLDER_KEY] : [])];

  const loadFolders = async () => {
    setLoadingFolders(true);
    setError(null);
    try {
      const [{ data: foldersData, error: foldersError }, { data: photosData, error: photosError }] = await Promise.all([
        supabase.from("gallery_folders").select("id, name").eq("gallery_id", item.id).order("sort_order", { ascending: true }),
        supabase.from("gallery_photos").select("folder_id").eq("gallery_id", item.id),
      ]);
      if (foldersError || photosError) {
        setError(foldersError?.message ?? photosError?.message ?? "שגיאה בטעינת הלשוניות");
        return;
      }
      const fs = foldersData ?? [];
      const unfoldered = (photosData ?? []).some((p) => !p.folder_id);
      setFolders(fs);
      setHasUnfoldered(unfoldered);
      setSelectedFolderKeys(new Set([...fs.map((f) => f.id), ...(unfoldered ? [NO_FOLDER_KEY] : [])]));
    } finally {
      setLoadingFolders(false);
    }
  };

  const openPortfolio = async () => {
    setStep("portfolio");
    await loadFolders();
    const { data } = await supabase
      .from("gallery_photos")
      .select("portfolio_category")
      .not("portfolio_category", "is", null);
    setCategoryOptions(Array.from(new Set((data ?? []).map((r) => r.portfolio_category as string).filter(Boolean))));
  };

  const openShare = async () => {
    setStep("share");
    await loadFolders();
  };

  const toggleFolderKey = (key: string) => {
    setSelectedFolderKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const confirmAddToPortfolio = async () => {
    if (selectedFolderKeys.size === 0) return;
    setSavingPortfolio(true);
    setError(null);
    try {
      const category = portfolioCategory.trim() || null;
      let query = supabase
        .from("gallery_photos")
        .update({ in_portfolio: true, portfolio_category: category })
        .eq("gallery_id", item.id);

      const allSelected = allKeys.every((k) => selectedFolderKeys.has(k));
      if (!allSelected) {
        const folderIds = [...selectedFolderKeys].filter((k) => k !== NO_FOLDER_KEY);
        const orParts: string[] = [];
        if (folderIds.length > 0) orParts.push(`folder_id.in.(${folderIds.join(",")})`);
        if (selectedFolderKeys.has(NO_FOLDER_KEY)) orParts.push("folder_id.is.null");
        query = query.or(orParts.join(","));
      }

      const { error: updateError } = await query;
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setPortfolioDone(true);
    } finally {
      setSavingPortfolio(false);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    setError(null);
    const now = new Date();
    const graceDays = item.restoredOnce ? 3 : 14;
    const permanentDeleteAt = new Date(now.getTime() + graceDays * 86400000);
    const { error: updateError } = await supabase
      .from("galleries")
      .update({ archived_at: now.toISOString(), archive_reason: "manual", permanent_delete_at: permanentDeleteAt.toISOString() })
      .eq("id", item.id);
    setDeleting(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    onDeleted(item.id);
    onClose();
    router.refresh();
  };

  if (step === "share") {
    if (loadingFolders) return <QuickActionsShell onClose={onClose}>{<LoadingRow />}</QuickActionsShell>;
    return (
      <GalleryShareModal
        accessToken={item.accessToken}
        folders={folders}
        hasUnfoldered={hasUnfoldered}
        clientName={item.clientName}
        photographerName={photographerName}
        photographerEmail={photographerEmail}
        expiryDays={item.expiryDays}
        onClose={onClose}
      />
    );
  }

  return (
    <QuickActionsShell onClose={onClose}>
      {step === "menu" && (
        <>
          <h2 className="text-lg font-bold font-display mb-1">{item.title}</h2>
          <p className="text-xs text-ink-soft mb-4">בחרו פעולה</p>
          <div className="space-y-2.5">
            <button onClick={openPortfolio} className="w-full rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink text-right px-4">
              הוספה לפורטפוליו
            </button>
            <button onClick={openShare} className="w-full rounded-lg py-3 text-sm font-semibold bg-card border border-line text-ink text-right px-4">
              שיתוף הגלריה
            </button>
            <button onClick={() => setStep("delete")} className="w-full rounded-lg py-3 text-sm font-semibold bg-rose-bg text-rose text-right px-4">
              מחיקה
            </button>
          </div>
          <button onClick={onClose} className="w-full text-center mt-4 text-xs text-ink-soft">
            ביטול
          </button>
        </>
      )}

      {step === "portfolio" && (
        <>
          <h2 className="text-lg font-bold font-display mb-4">הוספה לפורטפוליו</h2>
          {loadingFolders ? (
            <LoadingRow />
          ) : portfolioDone ? (
            <>
              <p className="text-sm text-sage mb-5">הגלריה נוספה לפורטפוליו הציבורי</p>
              <button onClick={onClose} className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white">
                סגירה
              </button>
            </>
          ) : (
            <>
              {folders.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs text-ink-soft mb-2.5">אילו לשוניות להוסיף לפורטפוליו?</p>
                  <div className="space-y-1.5">
                    {folders.map((f) => (
                      <label key={f.id} className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm">
                        <input type="checkbox" checked={selectedFolderKeys.has(f.id)} onChange={() => toggleFolderKey(f.id)} />
                        {f.name}
                      </label>
                    ))}
                    {hasUnfoldered && (
                      <label className="flex items-center gap-2.5 rounded-lg px-3 py-2 bg-white border border-line text-sm">
                        <input type="checkbox" checked={selectedFolderKeys.has(NO_FOLDER_KEY)} onChange={() => toggleFolderKey(NO_FOLDER_KEY)} />
                        כללי (ללא לשונית)
                      </label>
                    )}
                  </div>
                </div>
              )}
              <div className="mb-5">
                <p className="text-xs text-ink-soft mb-2">נושא בפורטפוליו (אופציונלי, לסינון לפי לשונית בעמוד הפורטפוליו)</p>
                <input
                  value={portfolioCategory}
                  onChange={(e) => setPortfolioCategory(e.target.value)}
                  list="quick-portfolio-category-suggestions"
                  placeholder="לדוגמה: חתונות"
                  className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white"
                />
                <datalist id="quick-portfolio-category-suggestions">
                  {categoryOptions.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </div>
              {error && <p className="text-xs text-rose mb-3">{error}</p>}
              <div className="flex gap-2">
                <button
                  onClick={confirmAddToPortfolio}
                  disabled={selectedFolderKeys.size === 0 || savingPortfolio}
                  className="flex-1 rounded-lg py-3 text-sm font-semibold bg-ink text-white disabled:opacity-50"
                >
                  {savingPortfolio ? "מוסיף..." : "הוספה לפורטפוליו"}
                </button>
                <button onClick={onClose} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
                  ביטול
                </button>
              </div>
            </>
          )}
        </>
      )}

      {step === "delete" && (
        <>
          <h2 className="text-lg font-bold font-display mb-2">מחיקת הגלריה</h2>
          <p className="text-sm text-ink-soft mb-5 leading-relaxed">
            הלקוח/ה יאבד/תאבד גישה לקישור מיד. הגלריה תישמר בארכיון {item.restoredOnce ? 3 : 14} ימים ואז תימחק לצמיתות, כולל כל
            התמונות. לא ניתן לבטל לאחר המחיקה הסופית.
          </p>
          {error && <p className="text-xs text-rose mb-3">{error}</p>}
          <div className="flex gap-2">
            <button onClick={confirmDelete} disabled={deleting} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-rose text-white disabled:opacity-50">
              {deleting ? "מוחק..." : "כן, מחיקה"}
            </button>
            <button onClick={() => setStep("menu")} className="flex-1 rounded-lg py-3 text-sm font-semibold bg-white border border-line text-ink-soft">
              ביטול
            </button>
          </div>
        </>
      )}
    </QuickActionsShell>
  );
}

function QuickActionsShell({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center" style={{ background: "rgba(46,49,66,0.7)" }} onClick={onClose}>
      <div className="w-full max-w-md rounded-t-3xl p-5 pb-8 bg-paper shadow-sheet max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function LoadingRow() {
  return (
    <div className="flex items-center justify-center py-8">
      <div className="h-6 w-6 rounded-full border-2 border-line border-t-ink animate-spin" />
    </div>
  );
}
