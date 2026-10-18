import type { RegionStats, TileStats } from "@/lib/culling/features";

// Photo culling (round 1): what the engine measured in one photo (engine.ts), and the decision taken
// from it. The decision is computed from the stored measurements each time, so changing a threshold
// re-scores every measured photo instantly, without measuring again.

export type FaceFeatures = {
  // Box as fractions of the photo (x, y, w, h).
  box: [number, number, number, number];
  score: number;
  // Share of the photo's area.
  area: number;
  // MediaPipe on a crop of the face: blink and squint per eye (0–1, from the blendshapes), and
  // the eye aspect ratio from its landmarks. null when it found no face in the crop (profile,
  // covered face, a false detection).
  // Engine 2 adds the head pose (degrees), where the irises sit between the eye corners (0 is
  // centred) and all 52 blendshapes (BLENDSHAPE_NAMES order).
  mp: {
    blinkL: number;
    blinkR: number;
    squintL: number;
    squintR: number;
    earL: number;
    earR: number;
    yaw?: number | null;
    pitch?: number | null;
    roll?: number | null;
    gazeH?: number | null;
    gazeV?: number | null;
    shapes?: number[];
  } | null;
  // Eye aspect ratio from the face detector's own 68 landmarks (weaker, kept to compare).
  ear68: [number, number];
  // Distance between the eye centres, in full-resolution pixels.
  iod: number;
  // The region around both eyes, as fractions of the photo.
  eyes: [number, number, number, number];
  // That region measured at full resolution, at a fixed scale (eye distance of 100px), and at
  // the detection scale (comparable with the scene tiles).
  eyeNative: RegionStats;
  eyeNorm: RegionStats;
  eyeDet: RegionStats;
  // The whole face at a fixed scale (face width of 200px).
  faceNorm: RegionStats;
};

export type CullFeatures = {
  v: string;
  w: number;
  h: number;
  // "original": the full file; "proxy": a 2000px copy from our server (the original couldn't be
  // fetched), so the full-resolution measures are really at 2000px.
  source: "original" | "proxy";
  faces: FaceFeatures[];
  // Index of the main person (largest, nearest the centre), -1 without faces.
  main: number;
  scene: {
    tiles: TileStats;
    // The sharpest tile, measured again at full resolution.
    best: RegionStats;
    bestBox: [number, number, number, number];
  };
  // The whole photo at the detection scale.
  global: RegionStats;
  ms: { download: number; decode: number; detect: number; eyes: number; sharp: number; total: number };
};

// MediaPipe's 52 face blendshapes, in the order the engine stores them (FaceFeatures.mp.shapes).
export const BLENDSHAPE_NAMES = [
  "_neutral", "browDownLeft", "browDownRight", "browInnerUp", "browOuterUpLeft", "browOuterUpRight", "cheekPuff",
  "cheekSquintLeft", "cheekSquintRight", "eyeBlinkLeft", "eyeBlinkRight", "eyeLookDownLeft", "eyeLookDownRight",
  "eyeLookInLeft", "eyeLookInRight", "eyeLookOutLeft", "eyeLookOutRight", "eyeLookUpLeft", "eyeLookUpRight",
  "eyeSquintLeft", "eyeSquintRight", "eyeWideLeft", "eyeWideRight", "jawForward", "jawLeft", "jawOpen", "jawRight",
  "mouthClose", "mouthDimpleLeft", "mouthDimpleRight", "mouthFrownLeft", "mouthFrownRight", "mouthFunnel", "mouthLeft",
  "mouthLowerDownLeft", "mouthLowerDownRight", "mouthPressLeft", "mouthPressRight", "mouthPucker", "mouthRight",
  "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper", "mouthSmileLeft", "mouthSmileRight",
  "mouthStretchLeft", "mouthStretchRight", "mouthUpperUpLeft", "mouthUpperUpRight", "noseSneerLeft", "noseSneerRight",
] as const;

// Round 1 (2026-10-18): each problem is one score per photo, fitted on the owner's first 1,483
// labels (labeled_v 2). The thresholds are where the score sits on those labels; a lower or higher
// one trades photos caught against photos flagged by mistake.
export type CullThresholds = {
  // Eyes closed, on each face of at least eyesFace of the main face's area: both eyes' blink
  // (average) plus 0.45 × both eyes looking down (a lowered gaze reads as half-closed, to MediaPipe
  // and in the labels). The most closed face decides. At or above eyesClosed: closed; from
  // eyesUnsure: review. On the labels: 0.6 is 57% right and catches 55%; 0.45–0.6 is half and half.
  eyesFace: number;
  eyesClosed: number;
  eyesUnsure: number;
  // Focus on the main face (focusScore): at or below focusBad: out of focus; up to focusUnsure:
  // review. Weak on the labels: about a third of the photos it flags are really blurry.
  focusBad: number;
  focusUnsure: number;
  // Without faces: the sharpest tile's lapN at full resolution (untested: 34 labelled photos).
  sceneSharpBad: number;
  sceneSharpUnsure: number;
  // Looking away, only in posed photos (owner, 2026-10-18: "רק בתמונות המבוימות ולא בספונטניות").
  // Each face of at least lookFace of the main face's area gets lookScore: head turn over 25° plus
  // the irises off-centre over 0.2. Below lookAt it looks at the camera. The photo counts as posed
  // with two faces or more and at least half of them looking; then the face furthest from the
  // camera decides: from lookAway away, from lookUnsure review. One face or none: not judged (a
  // portrait looking aside is often on purpose, and a lone face doesn't show whether it was posed).
  lookFace: number;
  lookAt: number;
  lookAway: number;
  lookUnsure: number;
};

export const DEFAULT_THRESHOLDS: CullThresholds = {
  eyesFace: 0.5,
  eyesClosed: 0.6,
  eyesUnsure: 0.45,
  focusBad: -2.9,
  focusUnsure: -1.6,
  sceneSharpBad: 0.03,
  sceneSharpUnsure: 0.06,
  lookFace: 0.35,
  lookAt: 0.6,
  lookAway: 1.5,
  lookUnsure: 1.0,
};

const EYE_LOOK_DOWN_L = BLENDSHAPE_NAMES.indexOf("eyeLookDownLeft");
const EYE_LOOK_DOWN_R = BLENDSHAPE_NAMES.indexOf("eyeLookDownRight");

// How closed one face's eyes look (null when MediaPipe found no face in its crop). Engine 1 kept no
// blendshapes, so there the lowered gaze counts as 0.
export function eyesScore(face: FaceFeatures): { score: number; blink: number; down: number } | null {
  const m = face.mp;
  if (!m) return null;
  const blink = (m.blinkL + m.blinkR) / 2;
  const down = m.shapes ? ((m.shapes[EYE_LOOK_DOWN_L] ?? 0) + (m.shapes[EYE_LOOK_DOWN_R] ?? 0)) / 2 : 0;
  return { score: blink + 0.45 * down, blink, down };
}

// Focus of a face: its sharpness at a fixed face width and around the eyes (log), plus 0.7 × the log
// of its eye distance in pixels. The size term is from the labels (it lifted the agreement from 0.81
// to 0.89 AUC): a soft small face is a missed shot more often than a soft large one is.
export function focusScore(face: FaceFeatures): number {
  return Math.log(Math.max(face.faceNorm.lapN, 1e-4)) + 0.7 * Math.log(Math.max(face.iod, 1)) + 0.5 * Math.log(Math.max(face.eyeNorm.lapN, 1e-4));
}

// How far one face looks from the camera (null without a head pose).
export function lookScore(face: FaceFeatures): { score: number; yaw: number; gaze: number } | null {
  const m = face.mp;
  if (!m || m.yaw == null) return null;
  const yaw = Math.abs(m.yaw);
  // Past 0.5 the iris landmarks missed (45 of 3,778 faces in the labelled photos, up to 3.5).
  const gaze = Math.min(Math.abs(m.gazeH ?? 0), 0.5);
  return { score: yaw / 25 + gaze / 0.2, yaw, gaze };
}

export type FocusCall = "ok" | "bad" | "unsure";
export type LookCall = "at" | "away" | "unsure" | "none";
// Why the look was or wasn't judged: posed (judged), candid (most faces look elsewhere), single
// (one face), none (no face with a head pose).
export type LookScene = "posed" | "candid" | "single" | "none";
export type EyesCall = "open" | "closed" | "unsure" | "none";
export type CullVerdict = "ok" | "blurry" | "eyes_closed" | "both" | "review";

export type CullDecision = {
  focus: FocusCall;
  eyes: EyesCall;
  verdict: CullVerdict;
  // The numbers the decision rests on, for the reason shown on screen.
  focusValue: number | null;
  focusFrom: "face" | "scene";
  // The most closed face counted (index in features.faces, -1 none): its score, blink and look down.
  eyesFace: number;
  eyesValue: number | null;
  blinkValue: number | null;
  downValue: number | null;
  // Looking at the camera (engine 2), posed photos only: the face furthest from the camera (index,
  // -1 none), its score, head turn and iris offset, and how many of the faces counted look.
  look: LookCall;
  lookScene: LookScene;
  lookFace: number;
  lookValue: number | null;
  yawValue: number | null;
  gazeValue: number | null;
  lookingFaces: number;
  lookFaces: number;
  // The faces the eyes and look calls counted.
  counted: number[];
};

export function decide(f: CullFeatures, th: CullThresholds = DEFAULT_THRESHOLDS): CullDecision {
  const main = f.main >= 0 ? f.faces[f.main] : null;

  let focus: FocusCall;
  let focusValue: number | null;
  let focusFrom: "face" | "scene";
  if (main) {
    focusFrom = "face";
    focusValue = focusScore(main);
    focus = focusValue <= th.focusBad ? "bad" : focusValue <= th.focusUnsure ? "unsure" : "ok";
  } else {
    focusFrom = "scene";
    focusValue = f.scene.best.lapN;
    focus = focusValue <= th.sceneSharpBad ? "bad" : focusValue <= th.sceneSharpUnsure ? "unsure" : "ok";
  }

  let eyes: EyesCall = "none";
  let eyesFace = -1;
  let eyesValue: number | null = null;
  let blinkValue: number | null = null;
  let downValue: number | null = null;
  const counted = new Set<number>();
  if (main) {
    for (let i = 0; i < f.faces.length; i++) {
      const face = f.faces[i];
      const e = face.area >= th.eyesFace * main.area ? eyesScore(face) : null;
      if (!e) continue;
      counted.add(i);
      if (eyesValue === null || e.score > eyesValue) {
        eyesFace = i;
        eyesValue = e.score;
        blinkValue = e.blink;
        downValue = e.down;
      }
    }
    if (eyesValue !== null) eyes = eyesValue >= th.eyesClosed ? "closed" : eyesValue >= th.eyesUnsure ? "unsure" : "open";
  }

  const bad = focus === "bad";
  const closed = eyes === "closed";
  const verdict: CullVerdict =
    bad && closed ? "both" : bad ? "blurry" : closed ? "eyes_closed" : focus === "unsure" || eyes === "unsure" ? "review" : "ok";

  // Looking at the camera, in posed photos only: a family photo where one guest looks aside is the
  // miss; a dance floor where nobody looks is just a candid photo.
  let look: LookCall = "none";
  let lookScene: LookScene = "none";
  let lookFace = -1;
  let lookValue: number | null = null;
  let yawValue: number | null = null;
  let gazeValue: number | null = null;
  let lookingFaces = 0;
  let lookFaces = 0;
  if (main) {
    for (let i = 0; i < f.faces.length; i++) {
      const face = f.faces[i];
      const s = face.area >= th.lookFace * main.area ? lookScore(face) : null;
      if (!s) continue;
      counted.add(i);
      lookFaces++;
      if (s.score < th.lookAt) lookingFaces++;
      if (lookValue === null || s.score > lookValue) {
        lookFace = i;
        lookValue = s.score;
        yawValue = s.yaw;
        gazeValue = s.gaze;
      }
    }
    lookScene = lookFaces === 0 ? "none" : lookFaces === 1 ? "single" : lookingFaces * 2 >= lookFaces ? "posed" : "candid";
    if (lookScene === "posed" && lookValue !== null) look = lookValue >= th.lookAway ? "away" : lookValue >= th.lookUnsure ? "unsure" : "at";
  }

  return {
    focus,
    eyes,
    verdict,
    focusValue,
    focusFrom,
    eyesFace,
    eyesValue,
    blinkValue,
    downValue,
    look,
    lookScene,
    lookFace,
    lookValue,
    yawValue,
    gazeValue,
    lookingFaces,
    lookFaces,
    counted: [...counted].sort((a, b) => a - b),
  };
}

// --- Measuring the engine against the owner's labels ---

export type CullLabel = "ok" | "blurry" | "eyes_closed" | "both" | "skip";

// label: focus and eyes (as culling_labels.label); notLooking / unflattering: the problems added
// later, only asked about on labels of version 2 (`v`). lookChecked: the look mark was decided with
// "posed photos only" in mind (culling_labels.look_checked_at, migration 0184).
export type BenchItem = {
  photoId: string;
  label: CullLabel;
  notLooking: boolean;
  lookChecked: boolean;
  unflattering: boolean;
  v: number | null;
  decision: CullDecision;
};

// Whether the look mark can be measured against. The first 756 marks (2026-10-16–18) were made in
// candid photos too, so a mark counts only once it was checked against the posed-only definition;
// no mark is taken as it is (the owner marked liberally, so a missing one rarely hides a miss).
export const lookLabelTrusted = (it: BenchItem) => it.v === 2 && (!it.notLooking || it.lookChecked);

export type Rate = { hit: number; of: number };

export type BenchReport = {
  n: number;
  // Eyes closed: of the photos the engine calls closed, how many really are (target ≥ 90%), and
  // of the really closed, how many it caught.
  eyesPrecision: Rate;
  eyesRecall: Rate;
  // Out of focus: of the really blurry, how many it caught (target ≥ 85%), and of the ones it
  // calls blurry, how many really are (target ≥ 80%).
  blurRecall: Rate;
  blurPrecision: Rate;
  review: number;
  // Not looking at the camera: of the photos the engine calls away, how many you marked, and of the
  // ones you marked, how many it caught. Only trusted labels (lookLabelTrusted); lookUnchecked marks
  // still wait for the check.
  lookPrecision: Rate;
  lookRecall: Rate;
  lookUnchecked: number;
  // "לא מחמיא" isn't measured yet: how many there are to learn from.
  unflattering: number;
  // Label (rows) × verdict (columns).
  matrix: Record<Exclude<CullLabel, "skip">, Record<CullVerdict, number>>;
};

const isBlurry = (l: CullLabel) => l === "blurry" || l === "both";
const isClosed = (l: CullLabel) => l === "eyes_closed" || l === "both";

export function benchReport(items: BenchItem[]): BenchReport {
  const rows = ["ok", "blurry", "eyes_closed", "both"] as const;
  const cols = ["ok", "blurry", "eyes_closed", "both", "review"] as const;
  const matrix = Object.fromEntries(rows.map((r) => [r, Object.fromEntries(cols.map((c) => [c, 0]))])) as BenchReport["matrix"];
  const r: BenchReport = {
    n: 0,
    eyesPrecision: { hit: 0, of: 0 },
    eyesRecall: { hit: 0, of: 0 },
    blurRecall: { hit: 0, of: 0 },
    blurPrecision: { hit: 0, of: 0 },
    review: 0,
    lookPrecision: { hit: 0, of: 0 },
    lookRecall: { hit: 0, of: 0 },
    lookUnchecked: 0,
    unflattering: 0,
    matrix,
  };
  for (const it of items) {
    if (it.label === "skip") continue;
    r.n++;
    matrix[it.label][it.decision.verdict]++;
    if (it.decision.verdict === "review") r.review++;
    const saysClosed = it.decision.eyes === "closed";
    const saysBlurry = it.decision.focus === "bad";
    if (saysClosed) {
      r.eyesPrecision.of++;
      if (isClosed(it.label)) r.eyesPrecision.hit++;
    }
    if (isClosed(it.label)) {
      r.eyesRecall.of++;
      if (saysClosed) r.eyesRecall.hit++;
    }
    if (saysBlurry) {
      r.blurPrecision.of++;
      if (isBlurry(it.label)) r.blurPrecision.hit++;
    }
    if (isBlurry(it.label)) {
      r.blurRecall.of++;
      if (saysBlurry) r.blurRecall.hit++;
    }
    if (it.v === 2 && it.unflattering) r.unflattering++;
    if (it.v === 2 && !lookLabelTrusted(it)) r.lookUnchecked++;
    if (lookLabelTrusted(it)) {
      const saysAway = it.decision.look === "away";
      if (saysAway) {
        r.lookPrecision.of++;
        if (it.notLooking) r.lookPrecision.hit++;
      }
      if (it.notLooking) {
        r.lookRecall.of++;
        if (saysAway) r.lookRecall.hit++;
      }
    }
  }
  return r;
}

export type MistakeKind = "missedBlur" | "falseBlur" | "missedEyes" | "falseEyes" | "missedLook" | "falseLook" | "review";

export function mistakeKinds(it: BenchItem): MistakeKind[] {
  const out: MistakeKind[] = [];
  if (it.label === "skip") return out;
  const saysClosed = it.decision.eyes === "closed";
  const saysBlurry = it.decision.focus === "bad";
  if (isBlurry(it.label) && !saysBlurry) out.push("missedBlur");
  if (!isBlurry(it.label) && saysBlurry) out.push("falseBlur");
  if (isClosed(it.label) && !saysClosed) out.push("missedEyes");
  if (!isClosed(it.label) && saysClosed) out.push("falseEyes");
  if (lookLabelTrusted(it) && it.notLooking && it.decision.look !== "away") out.push("missedLook");
  if (lookLabelTrusted(it) && !it.notLooking && it.decision.look === "away") out.push("falseLook");
  if (it.decision.verdict === "review") out.push("review");
  return out;
}
