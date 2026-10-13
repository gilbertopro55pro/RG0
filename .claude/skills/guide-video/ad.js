// Renders a short ad (SKILL.md "Short ads"): ad1/ad2/ad3.html frame by frame (deterministic, no
// dropped frames), builds its soundtrack from the template's window.AUDIO with ad-audio.mjs, and muxes.
// Usage: PWC=<playwright-core dir> FF=<ffmpeg> TEMPLATE=ad1.html NAME=gilberto-ad-6s \
//          node ad.js <run folder> [preview]   (preview: stills at TIMES=…, no video)
// The run folder holds fonts.css, the footage folders (f-chat, f-quote2, f-gallery, f-home, f-fix,
// f-intake2, as for the promo videos), ph/<pexels id>.jpg (the stock wedding photos) and, for the
// album ad, alb/ (spreads from the real auto-designer, see SKILL.md "Short ads, round 2").
const { chromium } = require(process.env.PWC);
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const dir = path.resolve(process.argv[2]);
const preview = process.argv[3] === "preview";
const FF = process.env.FF, FPS = 30;
// Bitrate cap (Mb/s). 8M keeps up to ~16 s under WhatsApp's 16MB; a longer ad needs less (25 s: 5.5M).
const MAXRATE = process.env.MAXRATE || "8M";
const TEMPLATE = process.env.TEMPLATE || "ad1.html";
const NAME = process.env.NAME || TEMPLATE.replace(".html", "");
const count = (d) => (fs.existsSync(path.join(dir, d)) ? fs.readdirSync(path.join(dir, d)).filter((f) => f.endsWith(".jpg")).length : 0);
(async () => {
  for (const f of [TEMPLATE, "ad-lib.js", "ad.css"]) fs.copyFileSync(path.join(__dirname, f), path.join(dir, f));
  fs.copyFileSync(path.join(__dirname, "../../../public/icons/icon-512.png"), path.join(dir, "logo.png"));
  const foot = {};
  for (const d of fs.readdirSync(dir).filter((d) => d.startsWith("f-"))) foot[d.slice(2)] = { dir: "file://" + path.join(dir, d), n: count(d) };
  const photos = {};
  if (fs.existsSync(path.join(dir, "ph"))) for (const f of fs.readdirSync(path.join(dir, "ph"))) photos[f.replace(/\.jpg$/, "")] = "file://" + path.join(dir, "ph", f);
  // Album spreads designed by the real auto-designer (alb/spNN.jpg) and their layout (alb/plan.json).
  const alb = {};
  let albPlan = null;
  if (fs.existsSync(path.join(dir, "alb"))) {
    for (const f of fs.readdirSync(path.join(dir, "alb")).filter((f) => f.endsWith(".jpg"))) alb[f.replace(/\.jpg$/, "")] = "file://" + path.join(dir, "alb", f);
    if (fs.existsSync(path.join(dir, "alb", "plan.json"))) albPlan = JSON.parse(fs.readFileSync(path.join(dir, "alb", "plan.json"), "utf8"));
  }
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--allow-file-access-from-files"] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on("pageerror", (e) => console.log("pageerror", e.message));
  await p.goto("file://" + path.join(dir, TEMPLATE));
  await p.evaluate((c) => window.setup(c), { foot, photos, alb, albPlan, founder: "file://" + path.join(dir, "founder.jpg") });
  const duration = await p.evaluate(() => window.DURATION);
  fs.mkdirSync(path.join(dir, "prev"), { recursive: true });
  if (preview) {
    const times = (process.env.TIMES || "0,0.5,1.2,2.2,3.2,4.2,5.0,5.9").split(",").map(Number).filter((x) => x <= duration);
    for (const s of times) {
      await p.evaluate((t) => window.renderAt(t), s);
      await p.screenshot({ path: path.join(dir, "prev", `${NAME}-t${s.toFixed(2)}.jpg`), type: "jpeg", quality: 80 });
    }
    await b.close();
    console.log("preview done", duration);
    return;
  }
  const silent = path.join(dir, `${NAME}-silent.mp4`);
  const ff = spawn(FF, ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "19", "-maxrate", MAXRATE, "-bufsize", String(parseFloat(MAXRATE) * 2) + "M", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", silent], { stdio: ["pipe", "inherit", "inherit"] });
  const total = Math.round(duration * FPS);
  for (let i = 0; i < total; i++) {
    await p.evaluate((t) => window.renderAt(t), i / FPS);
    const buf = await p.screenshot({ type: "jpeg", quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  const plan = await p.evaluate(() => window.AUDIO);
  await b.close();
  const planFile = path.join(dir, `${NAME}-plan.json`), wavFile = path.join(dir, `${NAME}.wav`);
  fs.writeFileSync(planFile, JSON.stringify(plan));
  execFileSync(process.execPath, [path.join(__dirname, "ad-audio.mjs"), planFile, wavFile], { stdio: "inherit" });
  const out = path.join(dir, `${NAME}.mp4`);
  execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-i", silent, "-i", wavFile, "-t", duration.toFixed(3),
    "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
  execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-i", out, "-vf", `fps=${(12 / duration).toFixed(4)},scale=180:-1,tile=12x1`, "-frames:v", "1", path.join(dir, `${NAME}-strip.png`)]);
  console.log(out, total, "frames");
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
