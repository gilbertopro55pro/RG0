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

export type CullThresholds = LookThresholds & {
  // A face counts for "eyes closed" when it's at least this share of the main face's area.
  prominentFace: number;
  // Both eyes' blink (the lower of the two) at or above: closed. Between unsure and closed: review.
  blinkClosed: number;
  blinkUnsure: number;
  // Or both eyes' aspect ratio from MediaPipe's landmarks (the higher of the two) at or below.
  // In the first test it separated more clearly than the blink: 0.05 closed against 0.28 open.
  earClosed: number;
  earUnsure: number;
  // Focus on the main face: eyeNorm.lapN at or below: out of focus; up to unsure: review.
  eyeSharpBad: number;
  eyeSharpUnsure: number;
  // Without faces: the sharpest tile's lapN at full resolution.
  sceneSharpBad: number;
  sceneSharpUnsure: number;
};

// Looking away, per prominent face: the head turned (yaw) or tilted (pitch) past these degrees, or
// the irises off-centre past gazeAway. Between unsure and away: review.
type LookThresholds = { yawAway: number; yawUnsure: number; pitchAway: number; gazeAway: number; gazeUnsure: number };

// First guesses from a handful of test images, to be tuned against the owner's labels (round 1's
// whole point).
export const DEFAULT_THRESHOLDS: CullThresholds = {
  prominentFace: 0.35,
  blinkClosed: 0.5,
  blinkUnsure: 0.35,
  earClosed: 0.12,
  earUnsure: 0.18,
  yawAway: 28,
  yawUnsure: 18,
  pitchAway: 25,
  gazeAway: 0.18,
  gazeUnsure: 0.12,
  eyeSharpBad: 0.04,
  eyeSharpUnsure: 0.08,
  sceneSharpBad: 0.03,
  sceneSharpUnsure: 0.06,
};

export type FocusCall = "ok" | "bad" | "unsure";
export type LookCall = "at" | "away" | "unsure" | "none";
export type EyesCall = "open" | "closed" | "unsure" | "none";
export type CullVerdict = "ok" | "blurry" | "eyes_closed" | "both" | "review";

export type CullDecision = {
  focus: FocusCall;
  eyes: EyesCall;
  verdict: CullVerdict;
  // The numbers the decision rests on, for the reason shown on screen.
  focusValue: number | null;
  focusFrom: "eyes" | "scene";
  // The most closed prominent face: its blink (lower eye) and aspect ratio (higher eye).
  blinkValue: number | null;
  earValue: number | null;
  // Looking at the camera (engine 2): the prominent face that looks furthest away, and by how much.
  look: LookCall;
  yawValue: number | null;
  gazeValue: number | null;
};

export function decide(f: CullFeatures, th: CullThresholds = DEFAULT_THRESHOLDS): CullDecision {
  const main = f.main >= 0 ? f.faces[f.main] : null;

  let focus: FocusCall;
  let focusValue: number | null;
  let focusFrom: "eyes" | "scene";
  if (main) {
    focusFrom = "eyes";
    focusValue = main.eyeNorm.lapN;
    focus = focusValue <= th.eyeSharpBad ? "bad" : focusValue <= th.eyeSharpUnsure ? "unsure" : "ok";
  } else {
    focusFrom = "scene";
    focusValue = f.scene.best.lapN;
    focus = focusValue <= th.sceneSharpBad ? "bad" : focusValue <= th.sceneSharpUnsure ? "unsure" : "ok";
  }

  let eyes: EyesCall = "none";
  let blinkValue: number | null = null;
  let earValue: number | null = null;
  if (main) {
    const rank = (c: EyesCall) => ({ none: 0, open: 1, unsure: 2, closed: 3 })[c];
    for (const face of f.faces) {
      if (face.area < th.prominentFace * main.area || !face.mp) continue;
      const blink = Math.min(face.mp.blinkL, face.mp.blinkR);
      const ear = Math.max(face.mp.earL, face.mp.earR);
      const call: EyesCall =
        blink >= th.blinkClosed || ear <= th.earClosed ? "closed" : blink >= th.blinkUnsure || ear <= th.earUnsure ? "unsure" : "open";
      if (rank(call) > rank(eyes) || (rank(call) === rank(eyes) && blinkValue !== null && blink > blinkValue)) {
        eyes = call;
        blinkValue = blink;
        earValue = ear;
      }
    }
  }

  const bad = focus === "bad";
  const closed = eyes === "closed";
  const verdict: CullVerdict =
    bad && closed ? "both" : bad ? "blurry" : closed ? "eyes_closed" : focus === "unsure" || eyes === "unsure" ? "review" : "ok";
  // Looking at the camera. The first rule, to be tuned: any prominent face turned or looking away.
  // Whether the photo was posed (where looking away is a problem at all) is for the labels to show.
  let look: LookCall = "none";
  let yawValue: number | null = null;
  let gazeValue: number | null = null;
  if (main) {
    const rank = (c: LookCall) => ({ none: 0, at: 1, unsure: 2, away: 3 })[c];
    for (const face of f.faces) {
      const m = face.mp;
      if (face.area < th.prominentFace * main.area || !m || m.yaw == null) continue;
      const yaw = Math.abs(m.yaw);
      const pitch = Math.abs(m.pitch ?? 0);
      const gaze = Math.abs(m.gazeH ?? 0);
      const call: LookCall =
        yaw >= th.yawAway || pitch >= th.pitchAway || gaze >= th.gazeAway ? "away" : yaw >= th.yawUnsure || gaze >= th.gazeUnsure ? "unsure" : "at";
      if (rank(call) > rank(look) || (rank(call) === rank(look) && yawValue !== null && yaw > yawValue)) {
        look = call;
        yawValue = yaw;
        gazeValue = gaze;
      }
    }
  }

  return { focus, eyes, verdict, focusValue, focusFrom, blinkValue, earValue, look, yawValue, gazeValue };
}

// --- Measuring the engine against the owner's labels ---

export type CullLabel = "ok" | "blurry" | "eyes_closed" | "both" | "skip";

// label: focus and eyes (as culling_labels.label); notLooking / unflattering: the problems added
// later, only asked about on labels of version 2 (`v`).
export type BenchItem = { photoId: string; label: CullLabel; notLooking: boolean; unflattering: boolean; v: number | null; decision: CullDecision };

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
  // ones you marked, how many it caught. Only labels saved with the new problems on screen (v2).
  lookPrecision: Rate;
  lookRecall: Rate;
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
    if (it.v === 2) {
      if (it.unflattering) r.unflattering++;
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
  if (it.v === 2 && it.notLooking && it.decision.look !== "away") out.push("missedLook");
  if (it.v === 2 && !it.notLooking && it.decision.look === "away") out.push("falseLook");
  if (it.decision.verdict === "review") out.push("review");
  return out;
}
