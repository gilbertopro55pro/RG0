// Runs entirely in the browser (dynamic imports below, never touched server-side) — the
// photographer's face-detection button, and the resulting face crops/embeddings, never leave
// their own device except to be cached back into Supabase for next time.

let modelsLoadPromise: Promise<void> | null = null;

async function loadFaceModels(): Promise<void> {
  if (!modelsLoadPromise) {
    modelsLoadPromise = (async () => {
      const faceapi = await import("@vladmandic/face-api");
      await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
      await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
      await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
    })();
  }
  return modelsLoadPromise;
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
    const detections = await faceapi
      .detectAllFaces(img, new faceapi.TinyFaceDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptors();
    return detections.map((d) => ({
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

// Empirically the standard cutoff for this model's descriptor space (trained so that same-person
// pairs land under ~0.6 euclidean distance and different-person pairs land well above it).
export const FACE_MATCH_THRESHOLD = 0.6;

// Greedy single-link clustering: each face joins whichever existing cluster it's closest to (by
// its nearest member, not the cluster's average) as long as that distance clears the threshold,
// otherwise it starts a new cluster. Order-dependent but more than good enough for a few hundred
// event photos with a few dozen distinct people.
export function clusterFaces<T extends { descriptor: number[] }>(
  faces: T[],
  threshold: number = FACE_MATCH_THRESHOLD
): { clusterId: string; members: T[] }[] {
  const clusters: { clusterId: string; members: T[] }[] = [];
  for (const face of faces) {
    let best: { cluster: (typeof clusters)[number]; dist: number } | null = null;
    for (const cluster of clusters) {
      let minDist = Infinity;
      for (const member of cluster.members) {
        const dist = euclideanDistance(face.descriptor, member.descriptor);
        if (dist < minDist) minDist = dist;
      }
      if (minDist < threshold && (!best || minDist < best.dist)) best = { cluster, dist: minDist };
    }
    if (best) best.cluster.members.push(face);
    else clusters.push({ clusterId: crypto.randomUUID(), members: [face] });
  }
  return clusters;
}
