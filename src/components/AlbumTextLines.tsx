import { ALBUM_TEXT_LINE_HEIGHT, albumLineDir, albumTextLines } from "@/lib/albumTextSizing";
import type { AlbumTextElement } from "@/lib/types";

// An album text's words as every export draws them (albumTextSizing.ts): a new line only where the
// photographer broke it, never by the box's width, and each line in its own reading direction.
// Goes inside the text's box, a flex row centered vertically with albumTextBoxAlign.
export default function AlbumTextLines({ text }: { text: string }) {
  return (
    <span style={{ whiteSpace: "pre", lineHeight: ALBUM_TEXT_LINE_HEIGHT }}>
      {albumTextLines(text).map((line, i) => (
        <span key={i} dir={albumLineDir(line)} style={{ display: "block" }}>
          {line || " "}
        </span>
      ))}
    </span>
  );
}

// Where the lines sit across the box, on its physical right or left in any page direction, as in
// the exports. The box is left to right on purpose: on a right-to-left page a flex row's flex-end
// is the LEFT side, so a right-aligned text sat on the left in the Hebrew editor and on the client's
// page (each line keeps its own direction, see above). The box has no padding: the exports put a
// right- or left-aligned line on the box's own edge.
export function albumTextBoxAlign(align: AlbumTextElement["align"]): React.CSSProperties {
  return {
    direction: "ltr",
    justifyContent: align === "right" ? "flex-end" : align === "left" ? "flex-start" : "center",
    textAlign: align,
  };
}
