import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { eyeAspectRatio, regionStats, tileStats, toGray, type RegionStats } from "@/lib/culling/features";
import type { CullFeatures, FaceFeatures } from "@/lib/culling/verdict";

// Photo culling (round 1): measures one photo in the browser. Nothing leaves the device; only the
// numbers are saved (culling_results).
//
// 1. The original is decoded at full resolution (EXIF orientation applied).
// 2. Faces are found on a 1280px copy with the same detector the album designer uses (SSD
//    MobileNet, verified on event photos: groups, side angles, the dance floor).
// 3. Each face is cropped from the full-resolution image and given to MediaPipe's face landmarker,
//    which says per eye how closed it is (blendshapes). On a close crop the face is large, which is
//    what its detector is built for; on the whole event photo it would miss most faces.
// 4. The region around the eyes is measured for sharpness at full resolution and at a fixed scale,
//    and the photo itself in a grid of tiles (for photos without people).

// 2 (2026-10-16): head pose, iris gaze and all 52 expression blendshapes per face, for "מבט לא
// למצלמה" and, later, "לא מחמיא"; a larger crop for MediaPipe (448px), so the iris is resolved.
// 3 (2026-10-18): every face the detector finds (up to 20), not the 6 largest: a fifth of the
// labelled photos had 6 or more, and closed eyes past the sixth face weren't looked at.
export const ENGINE_VERSION = "3";

const DETECT_EDGE = 1280;
const MAX_FACES = 20;
// A face under 1.5% of the photo's shorter side is a distant guest, never the subject.
const MIN_FACE_SIDE = 0.015;
// Served from our own domain: the WASM is copied from node_modules at build time
// (scripts/copyMediapipeWasm.mjs), the model is committed (float16, 3.7MB).
const MP_FILESET = {
  wasmLoaderPath: "/models/mediapipe/vision_wasm_internal.js",
  wasmBinaryPath: "/models/mediapipe/vision_wasm_internal.wasm",
};
const MP_MODEL = "/models/mediapipe/face_landmarker.task";
const MP_CROP = 448;

// Engine 2 differs only in keeping at most 6 faces, so its measurement of a photo with fewer is what
// engine 3 measures: only the photos that reached that cap need measuring again.
export function isCurrentResult(version: string | undefined, features: CullFeatures | null | undefined): boolean {
  if (!features) return false;
  return version === ENGINE_VERSION || (version === "2" && features.faces.length < 6);
}

type FaceApi = typeof import("@vladmandic/face-api");
let modelsPromise: Promise<{ faceapi: FaceApi; landmarker: FaceLandmarker }> | null = null;

export function loadCullingModels() {
  if (!modelsPromise) {
    modelsPromise = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
      await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
      const { FaceLandmarker } = await import("@mediapipe/tasks-vision");
      const landmarker = await FaceLandmarker.createFromOptions(MP_FILESET, {
        // CPU: the crops are small, and the GPU is already busy with the face detector's WebGL.
        baseOptions: { modelAssetPath: MP_MODEL, delegate: "CPU" },
        runningMode: "IMAGE",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
        minFaceDetectionConfidence: 0.3,
        minFacePresenceConfidence: 0.3,
      });
      return { faceapi, landmarker };
    })();
    modelsPromise.catch(() => {
      modelsPromise = null;
    });
  }
  return modelsPromise;
}

function makeCanvas(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  return { canvas, ctx };
}

// A rectangle of `src` (clamped to its bounds), drawn at `scale` and measured.
function measure(src: CanvasImageSource, srcW: number, srcH: number, x: number, y: number, w: number, h: number, scale: number): RegionStats {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(srcW, Math.ceil(x + w));
  const y1 = Math.min(srcH, Math.ceil(y + h));
  const sw = Math.max(1, x1 - x0);
  const sh = Math.max(1, y1 - y0);
  // Keeps a huge region (a close-up at full resolution) to ~4MP.
  const s = Math.min(scale, Math.sqrt(4_000_000 / (sw * sh)));
  const dw = Math.max(16, Math.round(sw * s));
  const dh = Math.max(16, Math.round(sh * s));
  const { ctx } = makeCanvas(dw, dh);
  ctx.drawImage(src, x0, y0, sw, sh, 0, 0, dw, dh);
  return regionStats(toGray(ctx.getImageData(0, 0, dw, dh).data, dw, dh), dw, dh);
}

const r4 = (v: number) => Number(v.toFixed(4));

// MediaPipe landmark indices: the six points of each eye for the aspect ratio (corner, upper lid
// ×2, corner, lower lid ×2), the subject's left then right.
const MP_EYE_L = [33, 160, 158, 133, 153, 144];
const MP_EYE_R = [362, 385, 387, 263, 373, 380];
// The iris centres (the refined landmarks 468–477 of the face landmarker model).
const MP_IRIS = [468, 473];

// Head rotation in degrees from MediaPipe's facial transformation matrix (4×4). The layout is told
// apart by where the translation sits: its depth (tens of cm from the camera) is the largest term.
function headPose(m: { data: number[] } | undefined): { yaw: number; pitch: number; roll: number } | null {
  const d = m?.data;
  if (!d || d.length < 16) return null;
  const colMajor = Math.abs(d[14]) >= Math.abs(d[11]);
  const r = (i: number, j: number) => (colMajor ? d[j * 4 + i] : d[i * 4 + j]);
  const deg = (v: number) => Number(((v * 180) / Math.PI).toFixed(1));
  return {
    yaw: deg(Math.atan2(-r(2, 0), Math.hypot(r(2, 1), r(2, 2)))),
    pitch: deg(Math.atan2(r(2, 1), r(2, 2))),
    roll: deg(Math.atan2(r(1, 0), r(0, 0))),
  };
}

// Where each iris sits between its eye's corners: 0 centred, about ±0.5 at the corners
// (horizontal), and up/down against the eye's width. Both eyes averaged.
function irisGaze(pt: (i: number) => [number, number]): { gazeH: number; gazeV: number } | null {
  const eyes = [
    [pt(33), pt(133)],
    [pt(362), pt(263)],
  ];
  const irises = MP_IRIS.map(pt);
  let h = 0;
  let v = 0;
  for (const iris of irises) {
    // Each iris to the eye whose centre is nearer (no reliance on the index order).
    const eye = eyes.reduce((best, e) =>
      Math.hypot(iris[0] - (e[0][0] + e[1][0]) / 2, iris[1] - (e[0][1] + e[1][1]) / 2) <
      Math.hypot(iris[0] - (best[0][0] + best[1][0]) / 2, iris[1] - (best[0][1] + best[1][1]) / 2)
        ? e
        : best
    );
    const x0 = Math.min(eye[0][0], eye[1][0]);
    const width = Math.abs(eye[1][0] - eye[0][0]);
    if (width <= 0) return null;
    h += (iris[0] - x0) / width - 0.5;
    v += (iris[1] - (eye[0][1] + eye[1][1]) / 2) / width;
  }
  return { gazeH: Number((h / 2).toFixed(3)), gazeV: Number((v / 2).toFixed(3)) };
}

export async function analyzePhoto(blob: Blob, source: CullFeatures["source"], downloadMs: number): Promise<CullFeatures> {
  const { faceapi, landmarker } = await loadCullingModels();
  const t0 = performance.now();
  const bmp = await createImageBitmap(blob, { imageOrientation: "from-image" });
  try {
    const W = bmp.width;
    const H = bmp.height;
    const t1 = performance.now();

    const scale = Math.min(1, DETECT_EDGE / Math.max(W, H));
    const dw = Math.round(W * scale);
    const dh = Math.round(H * scale);
    const det = makeCanvas(dw, dh);
    det.ctx.drawImage(bmp, 0, 0, dw, dh);
    const detections = await faceapi
      .detectAllFaces(det.canvas, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5, maxResults: 20 }))
      .withFaceLandmarks();
    const t2 = performance.now();

    const shorter = Math.min(dw, dh);
    const picked = detections
      .filter((d) => Math.min(d.detection.box.width, d.detection.box.height) / shorter >= MIN_FACE_SIDE)
      .sort((a, b) => b.detection.box.area - a.detection.box.area)
      .slice(0, MAX_FACES);

    let eyesMs = 0;
    const faces: FaceFeatures[] = [];
    for (const d of picked) {
      const b = d.detection.box;
      // Full-resolution box.
      const fx = b.x / scale;
      const fy = b.y / scale;
      const fw = b.width / scale;
      const fh = b.height / scale;

      const pts68 = d.landmarks.positions.map((p) => [p.x / scale, p.y / scale] as [number, number]);
      const ear68: [number, number] = [eyeAspectRatio(pts68.slice(36, 42)), eyeAspectRatio(pts68.slice(42, 48))];

      // MediaPipe on a square crop around the face.
      const te = performance.now();
      const side = Math.max(fw, fh) * 1.8;
      const cx = fx + fw / 2;
      const cy = fy + fh / 2;
      const sx = cx - side / 2;
      const sy = cy - side / 2;
      const crop = makeCanvas(MP_CROP, MP_CROP);
      crop.ctx.drawImage(bmp, sx, sy, side, side, 0, 0, MP_CROP, MP_CROP);
      let mp: FaceFeatures["mp"] = null;
      let eyePts: [number, number][] | null = null;
      try {
        const res = landmarker.detect(crop.canvas);
        const lm = res.faceLandmarks[0];
        const shapes = res.faceBlendshapes[0]?.categories ?? [];
        if (lm) {
          const at = (i: number): [number, number] => [sx + lm[i].x * side, sy + lm[i].y * side];
          const score = (name: string) => r4(shapes.find((c) => c.categoryName === name)?.score ?? 0);
          // MediaPipe names the blendshapes from the subject's side.
          const pose = headPose(res.facialTransformationMatrixes?.[0]);
          const gaze = lm.length > 473 ? irisGaze(at) : null;
          mp = {
            blinkL: score("eyeBlinkLeft"),
            blinkR: score("eyeBlinkRight"),
            squintL: score("eyeSquintLeft"),
            squintR: score("eyeSquintRight"),
            earL: eyeAspectRatio(MP_EYE_L.map(at)),
            earR: eyeAspectRatio(MP_EYE_R.map(at)),
            yaw: pose?.yaw ?? null,
            pitch: pose?.pitch ?? null,
            roll: pose?.roll ?? null,
            gazeH: gaze?.gazeH ?? null,
            gazeV: gaze?.gazeV ?? null,
            // All 52 blendshapes in the model's own order (BLENDSHAPE_NAMES), for the expressions
            // behind "לא מחמיא" to be learned from the labels later.
            shapes: [...shapes].sort((a, b) => a.index - b.index).map((c) => Number(c.score.toFixed(3))),
          };
          eyePts = [...MP_EYE_L, ...MP_EYE_R].map(at);
        }
      } catch {
        mp = null;
      }
      eyesMs += performance.now() - te;

      // The eye region: from MediaPipe's landmarks when it found the face, else the detector's 68.
      const pts = eyePts ?? pts68.slice(36, 48);
      const left = pts.slice(0, 6);
      const right = pts.slice(6, 12);
      const centre = (p: [number, number][]) => [p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length];
      const [lx, ly] = centre(left);
      const [rx, ry] = centre(right);
      const iod = Math.max(4, Math.hypot(lx - rx, ly - ry));
      const xs = pts.map((p) => p[0]);
      const ex = Math.min(...xs) - 0.2 * iod;
      const ew = Math.max(...xs) + 0.2 * iod - ex;
      const ey = (ly + ry) / 2 - 0.28 * iod;
      const eh = 0.56 * iod;

      faces.push({
        box: [r4(fx / W), r4(fy / H), r4(fw / W), r4(fh / H)],
        score: r4(d.detection.score),
        area: r4((fw * fh) / (W * H)),
        mp,
        ear68,
        iod: Math.round(iod),
        eyes: [r4(ex / W), r4(ey / H), r4(ew / W), r4(eh / H)],
        eyeNative: measure(bmp, W, H, ex, ey, ew, eh, 1),
        eyeNorm: measure(bmp, W, H, ex, ey, ew, eh, Math.min(1, 100 / iod)),
        eyeDet: measure(det.canvas, dw, dh, ex * scale, ey * scale, ew * scale, eh * scale, 1),
        faceNorm: measure(bmp, W, H, fx, fy, fw, fh, Math.min(1, 200 / fw)),
      });
    }
    const t3 = performance.now();

    // The main person: the largest face, discounted by distance from the centre.
    let main = -1;
    let bestScore = 0;
    faces.forEach((f, i) => {
      const dx = f.box[0] + f.box[2] / 2 - 0.5;
      const dy = f.box[1] + f.box[3] / 2 - 0.5;
      const s = f.area * (1 - 0.6 * Math.min(1, Math.hypot(dx, dy) / 0.7));
      if (s > bestScore) {
        bestScore = s;
        main = i;
      }
    });

    const detGray = toGray(det.ctx.getImageData(0, 0, dw, dh).data, dw, dh);
    const tiles = tileStats(detGray, dw, dh);
    let bestTile = 0;
    tiles.ten.forEach((v, i) => {
      if (v > tiles.ten[bestTile]) bestTile = i;
    });
    const tw = W / tiles.cols;
    const th = H / tiles.rows;
    const bx = (bestTile % tiles.cols) * tw;
    const by = Math.floor(bestTile / tiles.cols) * th;
    const best = measure(bmp, W, H, bx, by, tw, th, 1);
    const global = regionStats(detGray, dw, dh);
    const t4 = performance.now();

    return {
      v: ENGINE_VERSION,
      w: W,
      h: H,
      source,
      faces,
      main,
      scene: { tiles, best, bestBox: [r4(bx / W), r4(by / H), r4(tw / W), r4(th / H)] },
      global,
      ms: {
        download: Math.round(downloadMs),
        decode: Math.round(t1 - t0),
        detect: Math.round(t2 - t1),
        eyes: Math.round(eyesMs),
        sharp: Math.round(t4 - t3 + (t3 - t2 - eyesMs)),
        total: Math.round(t4 - t0),
      },
    };
  } finally {
    bmp.close();
  }
}
