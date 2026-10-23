import { collageCrop, type CollageCell, type CollageFace } from "@/lib/collage/layout";

// Draws one collage cell on a canvas (browser only): the photo cut to the cell's shape around its
// faces (collageCrop). The preview and the exported file both draw through here, at their own size,
// so they show the same picture. Cell edges are rounded to whole pixels from the page's edges, so
// neighbouring photos meet the gap exactly, with no seam or overlap.
export function cellPixels(cell: CollageCell, width: number, height: number) {
  const x0 = Math.round(cell.x * width);
  const y0 = Math.round(cell.y * height);
  const x1 = Math.round((cell.x + cell.w) * width);
  const y1 = Math.round((cell.y + cell.h) * height);
  return { x: x0, y: y0, w: Math.max(1, x1 - x0), h: Math.max(1, y1 - y0) };
}

export function drawCollageCell(
  ctx: CanvasRenderingContext2D,
  cell: CollageCell,
  width: number,
  height: number,
  image: CanvasImageSource,
  imageWidth: number,
  imageHeight: number,
  faces?: CollageFace[]
) {
  const px = cellPixels(cell, width, height);
  const crop = collageCrop(imageWidth / imageHeight, px.w / px.h, faces);
  ctx.drawImage(image, crop.sx * imageWidth, crop.sy * imageHeight, crop.sw * imageWidth, crop.sh * imageHeight, px.x, px.y, px.w, px.h);
}
