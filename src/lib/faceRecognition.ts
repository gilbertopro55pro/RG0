// Runs entirely in the browser (dynamic imports below, never touched server-side) — the
// photographer's face-detection button, and the resulting face crops/embeddings, never leave
// their own device except to be cached back into Supabase for next time.

let modelsLoadPromise: Promise<void> | null = null;

async function loadFaceModels(): Promise<void> {
  if (!modelsLoadPromise) {
    modelsLoadPromise = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      // SsdMobilenetv1, not TinyFaceDetector — verified empirically against real event-gallery
      // photos (group shots, side angles, dance-floor motion blur, kids) that Tiny missed a
      // meaningful share of real faces the SSD-based detector caught. It's slower per image, but
      // detection already runs as an async progress-tracked batch with a cancel button, so the
      // extra time is an acceptable trade for materially fewer missed faces.
      await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
      await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
      await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
    })();
  }
  return modelsLoadPromise;
}

// Just the detector, for callers that only need where the faces are (the album's photo swap): no
// landmark or recognition net (5.6MB to load instead of 12.4MB), and no per-face descriptor pass on
// every photo. Warming it up also runs one detection on a blank canvas, which compiles the GPU
// shaders, so the first real photo doesn't pay for that either.
let boxDetectorPromise: Promise<void> | null = null;

export function warmFaceBoxDetector(): Promise<void> {
  if (!boxDetectorPromise) {
    boxDetectorPromise = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      if (!faceapi.nets.ssdMobilenetv1.isLoaded) await faceapi.nets.ssdMobilenetv1.loadFromUri("/models");
      const blank = document.createElement("canvas");
      blank.width = 64;
      blank.height = 64;
      await faceapi.detectAllFaces(blank, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }));
    })().catch((err) => {
      boxDetectorPromise = null;
      throw err;
    });
  }
  return boxDetectorPromise;
}

// The faces' boxes in the image at `imageUrl` (same-origin), as fractions of the image — the same
// confidence and minimum size as detectFacesInImageUrl, without the descriptors. Throws when the
// image can't be read, so a caller caching the result doesn't cache a failure as "no faces".
export async function detectFaceBoxes(imageUrl: string): Promise<FaceBox[]> {
  await warmFaceBoxDetector();
  const faceapi = await import("@vladmandic/face-api");
  const res = await fetch(imageUrl);
  if (!res.ok) throw new Error(`image ${res.status}`);
  const objectUrl = URL.createObjectURL(await res.blob());
  try {
    const img = await loadImageElement(objectUrl);
    const detections = await faceapi.detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }));
    const shorterSide = Math.min(img.naturalWidth, img.naturalHeight);
    return detections
      .filter((d) => Math.min(d.box.width, d.box.height) / shorterSide >= 0.03)
      .map((d) => ({ x: d.box.x / img.naturalWidth, y: d.box.y / img.naturalHeight, width: d.box.width / img.naturalWidth, height: d.box.height / img.naturalHeight }));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image load failed"));
    img.src = src;
  });
}

export type FaceBox = { x: number; y: number; width: number; height: number };
export type DetectedFace = { box: FaceBox; descriptor: number[] };

// Detects every face in the image at `imageUrl` (must be same-origin or otherwise CORS-clean —
// see the /api/galleries/[id]/photos/[photoId]/image proxy this is paired with) and returns each
// face's bounding box as fractions of the image's natural size (so it stays meaningful regardless
// of how the image is later displayed) plus its 128-d recognition descriptor.
export async function detectFacesInImageUrl(imageUrl: string): Promise<DetectedFace[]> {
  await loadFaceModels();
  const faceapi = await import("@vladmandic/face-api");
  const res = await fetch(imageUrl);
  if (!res.ok) return [];
  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await loadImageElement(objectUrl);
    // minConfidence above the library default (0.5) — event photos have plenty of blurry
    // background clutter (hands, fabric, out-of-focus heads) that a looser threshold detects as
    // low-confidence "faces," each contributing a garbage descriptor that then pollutes clustering
    // (a false detection can't match anyone real, so it either seeds a bogus singleton cluster or,
    // worse, sits close enough to a real cluster to drag a wrong photo into it).
    const detections = await faceapi
      .detectAllFaces(img, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.6 }))
      .withFaceLandmarks()
      .withFaceDescriptors();
    // A face box under ~3% of the image's shorter side is almost always a distant background
    // person, not someone the photographer would ever want to filter the gallery by — and small
    // faces are exactly where this model's descriptors are least reliable, so keeping them tends to
    // hurt clustering accuracy more than the occasional missed small face costs.
    const minBoxFraction = 0.03;
    return detections
      .filter((d) => {
        const shorterSide = Math.min(img.naturalWidth, img.naturalHeight);
        return Math.min(d.detection.box.width, d.detection.box.height) / shorterSide >= minBoxFraction;
      })
      .map((d) => ({
        box: {
          x: d.detection.box.x / img.naturalWidth,
          y: d.detection.box.y / img.naturalHeight,
          width: d.detection.box.width / img.naturalWidth,
          height: d.detection.box.height / img.naturalHeight,
        },
        descriptor: Array.from(d.descriptor),
      }));
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function euclideanDistance(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

// Slightly tighter than the library's usual ~0.6 "same person" cutoff. There's no merge/split UI
// anywhere downstream of this (a face-circle filter chip is the entire product surface — see
// GalleryManageView), so a wrongly-split person just costs an extra, slightly annoying filter chip,
// while a wrongly-merged one silently shows a stranger's photos under someone's face — the two
// failure modes are not equally bad, so the threshold (and the centroid clustering below) both
// lean toward under-merging rather than over-merging.
export const FACE_MATCH_THRESHOLD = 0.55;

function meanDescriptor(descriptors: number[][]): number[] {
  const dims = descriptors[0].length;
  const mean = new Array(dims).fill(0);
  for (const d of descriptors) {
    for (let i = 0; i < dims; i++) mean[i] += d[i];
  }
  for (let i = 0; i < dims; i++) mean[i] /= descriptors.length;
  return mean;
}

// Centroid clustering: each face joins whichever existing cluster its centroid (the running mean
// of every member's descriptor, not just one nearest member) is closest to, as long as that
// distance clears the threshold. Single-link (comparing against only the nearest member) is prone
// to "chaining" — one ambiguous, borderline face bridges two different people into one cluster,
// and every face added after that inherits the mistake. Comparing against the centroid instead
// means one borderline face can still slip in, but it takes a lot more of them, consistently
// close together, to drag two different people's clusters into merging — a meaningfully harder bar
// to accidentally clear across a few hundred photos with real lighting/angle variation.
export function clusterFaces<T extends { descriptor: number[] }>(
  faces: T[],
  threshold: number = FACE_MATCH_THRESHOLD
): { clusterId: string; members: T[] }[] {
  const clusters: { clusterId: string; members: T[]; centroid: number[] }[] = [];
  for (const face of faces) {
    let best: { cluster: (typeof clusters)[number]; dist: number } | null = null;
    for (const cluster of clusters) {
      const dist = euclideanDistance(face.descriptor, cluster.centroid);
      if (dist < threshold && (!best || dist < best.dist)) best = { cluster, dist };
    }
    if (best) {
      best.cluster.members.push(face);
      best.cluster.centroid = meanDescriptor(best.cluster.members.map((m) => m.descriptor));
    } else {
      clusters.push({ clusterId: crypto.randomUUID(), members: [face], centroid: face.descriptor });
    }
  }
  return clusters.map(({ clusterId, members }) => ({ clusterId, members }));
}
