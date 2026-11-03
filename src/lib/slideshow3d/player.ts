// The 3D slideshow on the screen: a canvas redrawn every animation frame with drawShowFrame, the
// same drawing the video uses. Each photo is on for 3 seconds from the start of its transition in,
// as in the video. Only the photo on screen, the one before it and the next two are kept loaded.

import { drawShowFrame, type FxFrame } from "./render";
import type { FxImage } from "./effects";
import { loadFxImage } from "./images";
import { SHOW_LIFE_SECONDS, SHOW_SLIDE_SECONDS, SHOW_TRANSITION_SECONDS, type ShowPlan, type Transition } from "./plan";

type Slot = { promise: Promise<FxImage | null>; img: FxImage | null; done: boolean };

type Move = {
  // The photo going off (-1: none, the opening).
  from: number;
  fromAge: number;
  start: number;
  transition: Transition | null;
  reverse: boolean;
};

export class ShowPlayer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private urls: string[];
  private plan: ShowPlan;
  private onIndex: (index: number) => void;
  private playing = true;
  private slots = new Map<number, Slot>();
  private cur = 0;
  // When the current photo started coming on (its drift runs from there), and when the next one is
  // due (pausing pushes that on, the drift keeps its own time).
  private curStart = 0;
  private advanceAt = 0;
  private move: Move | null = null;
  // A move asked for before its photo arrived: it starts when the photo is in.
  private pending: { target: number; reverse: boolean } | null = null;
  private started = false;
  private raf = 0;
  private dirty = true;
  private destroyed = false;
  private resizeObserver: ResizeObserver | null = null;
  private W = 0;
  private H = 0;

  constructor(opts: { canvas: HTMLCanvasElement; urls: string[]; plan: ShowPlan; onIndex: (index: number) => void; playing?: boolean }) {
    this.canvas = opts.canvas;
    this.ctx = opts.canvas.getContext("2d");
    this.urls = opts.urls;
    this.plan = opts.plan;
    this.onIndex = opts.onIndex;
    this.playing = opts.playing ?? true;
    this.resize();
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.canvas);
    } else {
      window.addEventListener("resize", this.onWindowResize);
    }
    this.loadAround(0);
    this.raf = requestAnimationFrame(this.tick);
  }

  private get count() {
    return this.urls.length;
  }

  private now() {
    return performance.now() / 1000;
  }

  private onWindowResize = () => this.resize();

  // The canvas at the screen's pixel density, at most 2× (a 3× phone would draw over twice as many
  // pixels for no visible gain).
  private resize() {
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    const rect = this.canvas.getBoundingClientRect();
    const W = Math.max(1, Math.round(rect.width * dpr));
    const H = Math.max(1, Math.round(rect.height * dpr));
    if (W !== this.W || H !== this.H) {
      this.W = W;
      this.H = H;
      this.canvas.width = W;
      this.canvas.height = H;
      this.dirty = true;
    }
  }

  private wrap(i: number) {
    const n = this.count;
    return ((i % n) + n) % n;
  }

  private load(i: number) {
    if (this.count === 0) return;
    const k = this.wrap(i);
    if (this.slots.has(k)) return;
    // Sized for the larger of the screen's two orientations, so turning the phone doesn't reload.
    const side = Math.max(this.W, this.H);
    const slot: Slot = { promise: Promise.resolve(null), img: null, done: false };
    slot.promise = loadFxImage(this.urls[k], { W: side, H: side }).then((img) => {
      slot.img = img;
      slot.done = true;
      this.dirty = true;
      return img;
    });
    this.slots.set(k, slot);
  }

  // Keeps the photo before, this one and the next two (and the one still going off).
  private loadAround(i: number) {
    for (let d = -1; d <= 2; d++) this.load(i + d);
    const keep = new Set<number>();
    for (let d = -1; d <= 2; d++) keep.add(this.wrap(i + d));
    if (this.move && this.move.from >= 0) keep.add(this.move.from);
    for (const k of [...this.slots.keys()]) if (!keep.has(k)) this.slots.delete(k);
  }

  private ready(i: number) {
    return !!this.slots.get(this.wrap(i))?.done;
  }

  private image(i: number) {
    return this.slots.get(this.wrap(i))?.img ?? null;
  }

  setPlaying(playing: boolean) {
    // Resuming leaves the photo on screen a moment more before the next one.
    if (playing && !this.playing) this.advanceAt = Math.max(this.advanceAt, this.now() + SHOW_SLIDE_SECONDS - SHOW_TRANSITION_SECONDS);
    this.playing = playing;
  }

  next() {
    this.go(1);
  }

  prev() {
    this.go(-1);
  }

  private go(delta: 1 | -1) {
    if (this.count <= 1 || !this.started) return;
    const base = this.pending ? this.pending.target : this.cur;
    const target = this.wrap(base + delta);
    this.pending = { target, reverse: delta < 0 };
    this.loadAround(target);
    this.startPending();
  }

  private startPending() {
    const p = this.pending;
    if (!p || !this.ready(p.target)) return;
    this.pending = null;
    if (p.target === this.cur) return;
    const t = this.now();
    // Forward: the transition that brings the new photo on. Back: the one that brought the
    // current photo on, played backward.
    const transition = p.reverse ? this.plan.transitions[this.cur] : this.plan.transitions[p.target];
    this.move = { from: this.cur, fromAge: t - this.curStart, start: t, transition: transition ?? null, reverse: p.reverse };
    this.cur = p.target;
    this.curStart = t;
    this.advanceAt = t + SHOW_SLIDE_SECONDS;
    this.loadAround(this.cur);
    this.onIndex(this.cur);
  }

  private tick = () => {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.tick);
    if (this.count === 0 || !this.ctx) return;
    const t = this.now();
    if (!this.started) {
      // The opening waits for the first photo.
      if (!this.ready(0)) {
        if (this.dirty) this.drawBlack();
        return;
      }
      this.started = true;
      this.cur = 0;
      this.curStart = t;
      this.advanceAt = t + SHOW_SLIDE_SECONDS;
      this.move = { from: -1, fromAge: 0, start: t, transition: null, reverse: false };
    }
    if (this.pending) this.startPending();
    if (this.move && t - this.move.start >= SHOW_TRANSITION_SECONDS) {
      this.move = null;
      this.loadAround(this.cur);
    }
    if (this.playing && this.count > 1 && !this.move && !this.pending && t >= this.advanceAt) {
      const next = this.wrap(this.cur + 1);
      if (this.ready(next)) {
        this.pending = { target: next, reverse: false };
        this.startPending();
      } else this.load(next);
    }
    // Nothing moves once a photo's drift is over and no transition runs: no need to redraw.
    const moving = !!this.move || t - this.curStart <= SHOW_LIFE_SECONDS + 0.1;
    if (!moving && !this.dirty) return;
    this.dirty = false;
    this.draw(t);
  };

  private drawBlack() {
    if (!this.ctx) return;
    this.dirty = false;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.fillStyle = "#000";
    this.ctx.fillRect(0, 0, this.W, this.H);
  }

  private draw(t: number) {
    if (!this.ctx) return;
    const m = this.move;
    const frame: FxFrame = {
      incoming: { img: this.image(this.cur), age: t - this.curStart, drift: this.plan.drifts[this.cur] },
      outgoing: m && m.from >= 0 ? { img: this.image(m.from), age: m.fromAge + (t - m.start), drift: this.plan.drifts[m.from] } : null,
      transition: m ? m.transition : null,
      progress: m ? Math.min(1, (t - m.start) / SHOW_TRANSITION_SECONDS) : 1,
      reverse: m?.reverse ?? false,
    };
    drawShowFrame(this.ctx, this.W, this.H, frame, "screen");
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.resizeObserver?.disconnect();
    window.removeEventListener("resize", this.onWindowResize);
    this.slots.clear();
  }
}
