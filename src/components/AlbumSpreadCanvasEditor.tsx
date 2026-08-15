"use client";

import { useRef, useState } from "react";
import type { AlbumElement, GalleryAlbumSpreadRow } from "@/lib/types";

type PhotoWithUrl = { id: string; url: string };

// A free-form drag/resize canvas — used two ways:
// - "overlay" mode: the spread's existing preset photo layout (split/feature/stack) renders as a
//   static, non-interactive backdrop, and only text elements are draggable on top of it. Text
//   works on every spread this way, not just custom-layout ones.
// - "custom" mode: nothing is fixed — both photo and text elements live in the same array and are
//   all draggable/resizable, giving a genuinely free-form page instead of the three presets.
export default function AlbumSpreadCanvasEditor({
  spread,
  photos,
  photo1,
  photo2,
  mode,
  onSave,
  onClose,
}: {
  spread: GalleryAlbumSpreadRow;
  photos: PhotoWithUrl[];
  photo1: PhotoWithUrl | undefined;
  photo2: PhotoWithUrl | undefined | null;
  mode: "overlay" | "custom";
  onSave: (elements: AlbumElement[]) => void;
  onClose: () => void;
}) {
  const [elements, setElements] = useState<AlbumElement[]>(spread.elements);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false);
  const [textDraftOpen, setTextDraftOpen] = useState(false);
  const [textDraft, setTextDraft] = useState("");
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    id: string;
    kind: "move" | "resize";
    startClientX: number;
    startClientY: number;
    startXPct: number;
    startYPct: number;
    startWidthPct: number;
    startHeightPct: number;
  } | null>(null);

  const selected = elements.find((e) => e.id === selectedId) ?? null;

  const updateElement = (id: string, patch: Partial<AlbumElement>) => {
    setElements((prev) => prev.map((e) => (e.id === id ? ({ ...e, ...patch } as AlbumElement) : e)));
  };

  const removeElement = (id: string) => {
    setElements((prev) => prev.filter((e) => e.id !== id));
    setSelectedId(null);
  };

  const addPhoto = (photoId: string) => {
    const id = `el-${Date.now()}`;
    setElements((prev) => [
      ...prev,
      { id, type: "photo", photoId, xPct: 20, yPct: 20, widthPct: 40, heightPct: 40, focalX: 50, focalY: 50 },
    ]);
    setPhotoPickerOpen(false);
    setSelectedId(id);
  };

  const addText = () => {
    if (!textDraft.trim()) return;
    const id = `el-${Date.now()}`;
    setElements((prev) => [
      ...prev,
      { id, type: "text", text: textDraft.trim(), xPct: 10, yPct: 40, widthPct: 80, fontSize: 6, color: "white", align: "center" },
    ]);
    setTextDraft("");
    setTextDraftOpen(false);
    setSelectedId(id);
  };

  const startDrag = (e: React.PointerEvent, el: AlbumElement, kind: "move" | "resize") => {
    e.stopPropagation();
    (e.target as Element).setPointerCapture(e.pointerId);
    setSelectedId(el.id);
    dragRef.current = {
      id: el.id,
      kind,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startXPct: el.xPct,
      startYPct: el.yPct,
      startWidthPct: el.widthPct,
      startHeightPct: el.type === "photo" ? el.heightPct : 0,
    };
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    const canvas = canvasRef.current;
    if (!drag || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const dxPct = ((e.clientX - drag.startClientX) / rect.width) * 100;
    const dyPct = ((e.clientY - drag.startClientY) / rect.height) * 100;
    if (drag.kind === "move") {
      updateElement(drag.id, {
        xPct: Math.max(0, Math.min(95, drag.startXPct + dxPct)),
        yPct: Math.max(0, Math.min(95, drag.startYPct + dyPct)),
      });
    } else {
      const widthPct = Math.max(8, Math.min(100 - drag.startXPct, drag.startWidthPct + dxPct));
      const patch: Partial<AlbumElement> =
        elements.find((el) => el.id === drag.id)?.type === "photo"
          ? { widthPct, heightPct: Math.max(8, Math.min(100 - drag.startYPct, drag.startHeightPct + dyPct)) }
          : { widthPct };
      updateElement(drag.id, patch);
    }
  };

  const endDrag = () => {
    dragRef.current = null;
  };

  const photoById = new Map(photos.map((p) => [p.id, p]));

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{ background: "rgba(46,49,66,0.55)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)" }}
    >
      <div className="w-full max-w-sm rounded-3xl p-4 bg-paper shadow-sheet">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold font-display">{mode === "custom" ? "עיצוב חופשי" : "הוספת טקסט לעמוד"}</h2>
          <button onClick={onClose} className="h-8 w-8 rounded-full flex items-center justify-center bg-white border border-line">
            ✕
          </button>
        </div>

        <div
          ref={canvasRef}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onClick={(e) => {
            // Deselect only when the canvas background itself was clicked — a click on an
            // element bubbles up here too (pointerdown selecting it happens first, but a plain
            // stopPropagation on that pointerdown doesn't stop the separate click event that
            // follows on pointerup), so without this check every selection immediately
            // undid itself before the resize handle even had a chance to render.
            if (e.target === e.currentTarget) setSelectedId(null);
          }}
          className="relative w-full aspect-[16/10] rounded-xl overflow-hidden bg-line select-none"
          style={{ containerType: "inline-size" }}
        >
          {mode === "overlay" && (
            <div className={`absolute inset-0 flex ${spread.layout === "stack" ? "flex-col" : "flex-row"} gap-0.5 pointer-events-none`}>
              {photo1 && (
                <div className="relative overflow-hidden" style={{ flex: photo2 && spread.layout === "feature" ? 1 : 1 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo1.url} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: `${spread.focal_x_1}% ${spread.focal_y_1}%` }} />
                </div>
              )}
              {photo2 && (
                <div className="relative overflow-hidden" style={{ flex: spread.layout === "feature" ? 1.6 : 1 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo2.url} alt="" className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: `${spread.focal_x_2}% ${spread.focal_y_2}%` }} />
                </div>
              )}
            </div>
          )}

          {elements
            .filter((el) => mode === "custom" || el.type === "text")
            .map((el) => {
              const isSelected = el.id === selectedId;
              if (el.type === "photo") {
                const photo = photoById.get(el.photoId);
                return (
                  <div
                    key={el.id}
                    onPointerDown={(e) => startDrag(e, el, "move")}
                    className="absolute overflow-hidden cursor-move"
                    style={{
                      left: `${el.xPct}%`,
                      top: `${el.yPct}%`,
                      width: `${el.widthPct}%`,
                      height: `${el.heightPct}%`,
                      boxShadow: isSelected ? "0 0 0 2px var(--color-amber-deep)" : "0 0 0 1px rgba(255,255,255,0.5)",
                    }}
                  >
                    {photo && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={photo.url}
                        alt=""
                        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                        style={{ objectPosition: `${el.focalX}% ${el.focalY}%` }}
                      />
                    )}
                    {isSelected && (
                      // Kept fully inside the box (no corner-straddling negative offset) —
                      // the parent needs overflow-hidden to crop the photo, which would clip
                      // (and make unclickable) any part of the handle bleeding past the edge.
                      <span
                        onPointerDown={(e) => startDrag(e, el, "resize")}
                        className="absolute bottom-0.5 left-0.5 h-4 w-4 bg-amber-deep cursor-nwse-resize rounded-sm"
                      />
                    )}
                  </div>
                );
              }
              return (
                <div
                  key={el.id}
                  onPointerDown={(e) => startDrag(e, el, "move")}
                  className="absolute cursor-move px-1"
                  style={{
                    left: `${el.xPct}%`,
                    top: `${el.yPct}%`,
                    width: `${el.widthPct}%`,
                    textAlign: el.align,
                    color: el.color === "white" ? "#fff" : "#000",
                    fontSize: `${el.fontSize}cqw`,
                    fontWeight: 700,
                    textShadow: el.color === "white" ? "0 1px 4px rgba(0,0,0,0.7)" : "0 1px 4px rgba(255,255,255,0.7)",
                    outline: isSelected ? "2px dashed var(--color-amber-deep)" : "none",
                  }}
                >
                  {el.text}
                  {isSelected && (
                    <span
                      onPointerDown={(e) => startDrag(e, el, "resize")}
                      className="absolute bottom-0 left-0 h-4 w-4 bg-amber-deep cursor-ew-resize"
                      style={{ transform: "translate(-50%, 50%)" }}
                    />
                  )}
                </div>
              );
            })}
        </div>

        {selected && (
          <div className="flex items-center gap-2 mt-2.5">
            {selected.type === "text" && (
              <div className="flex gap-1.5 flex-1">
                {(["white", "black"] as const).map((c) => (
                  <button
                    key={c}
                    onClick={() => updateElement(selected.id, { color: c })}
                    className="h-7 w-7 rounded-full border border-line"
                    style={{ background: c === "white" ? "#fff" : "#000" }}
                  />
                ))}
                {(["right", "center", "left"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => updateElement(selected.id, { align: a })}
                    className="flex-1 rounded-full py-1.5 text-[10px] font-semibold"
                    style={{
                      background: selected.align === a ? "var(--color-amber-deep)" : "var(--color-chip)",
                      color: selected.align === a ? "#fff" : "var(--color-ink-soft)",
                    }}
                  >
                    {a === "right" ? "ימין" : a === "center" ? "מרכז" : "שמאל"}
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => removeElement(selected.id)} className="shrink-0 h-8 px-3 rounded-full bg-chip text-rose text-xs font-semibold">
              מחיקה
            </button>
          </div>
        )}

        <div className="flex gap-2 mt-3">
          {mode === "custom" && (
            <button onClick={() => setPhotoPickerOpen(true)} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
              + תמונה
            </button>
          )}
          <button onClick={() => setTextDraftOpen(true)} className="flex-1 rounded-lg py-2.5 text-sm font-semibold bg-white border border-line text-ink">
            + טקסט
          </button>
        </div>

        <button onClick={() => onSave(elements)} className="w-full rounded-lg py-3 text-sm font-semibold bg-ink text-white mt-2.5">
          שמירה
        </button>
      </div>

      {photoPickerOpen && (
        <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" style={{ background: "rgba(46,49,66,0.6)" }} onClick={() => setPhotoPickerOpen(false)}>
          <div className="w-full max-w-sm rounded-3xl p-4 bg-paper max-h-[70vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="grid grid-cols-4 gap-2">
              {photos.map((p) => (
                <button key={p.id} onClick={() => addPhoto(p.id)} className="aspect-square rounded-lg overflow-hidden" style={{ boxShadow: "0 0 0 1px var(--color-line)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {textDraftOpen && (
        <div className="fixed inset-0 z-[85] flex items-end justify-center" style={{ background: "rgba(46,49,66,0.6)" }} onClick={() => setTextDraftOpen(false)}>
          <div className="w-full max-w-sm rounded-t-3xl p-5 bg-paper" onClick={(e) => e.stopPropagation()}>
            <p className="text-sm font-semibold mb-2.5">טקסט חדש (עברית או אנגלית)</p>
            <input
              value={textDraft}
              onChange={(e) => setTextDraft(e.target.value)}
              autoFocus
              className="w-full rounded-lg px-3 py-2.5 text-sm border border-line bg-white mb-3"
            />
            <button onClick={addText} disabled={!textDraft.trim()} className="w-full rounded-lg py-3 text-sm font-semibold bg-amber-deep text-white disabled:opacity-60">
              הוספה
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
