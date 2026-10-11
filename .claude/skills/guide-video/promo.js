// Gilberto promo video (SKILL.md "Promo video"): renders promo.html frame by frame (deterministic,
// no dropped frames) and encodes it with the music. The run folder must hold fonts.css (+ its font
// files), founder.jpg and the f-intake / f-quote / f-gallery frame folders (see SKILL.md).
// Usage: PWC=<playwright-core dir> FF=<ffmpeg> MUSIC=<repo>/public/reels/music/<track>.m4a \
//          [TEMPLATE=promo2.html NAME=gilberto-promo-2 TIMES=1,2.5,…] node promo.js <run folder> [preview]
const { chromium } = require(process.env.PWC);
const { spawn, execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const dir = process.argv[2];
const preview = process.argv[3] === "preview";
const FF = process.env.FF, FPS = 30;
const count = (d) => (fs.existsSync(path.join(dir, d)) ? fs.readdirSync(path.join(dir, d)).filter((f) => f.endsWith(".jpg")).length : 0);
// TEMPLATE picks the video (promo.html, promo2.html, promo3.html); NAME the output file.
const TEMPLATE = process.env.TEMPLATE || "promo.html";
const NAME = process.env.NAME || "gilberto-promo";
(async () => {
  const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--allow-file-access-from-files"] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  p.on("pageerror", (e) => console.log("pageerror", e.message));
  fs.copyFileSync(path.join(__dirname, TEMPLATE), path.join(dir, TEMPLATE));
  // The system logo (the app icon) is the brand mark in every video.
  fs.copyFileSync(path.join(__dirname, "../../../public/icons/icon-512.png"), path.join(dir, "logo.png"));
  fs.mkdirSync(path.join(dir, "prev"), { recursive: true });
  await p.goto("file://" + path.join(dir, TEMPLATE));
  await p.evaluate((c) => window.setup(c), {
    intake: "file://" + path.join(dir, "f-intake"), intakeN: count("f-intake"),
    quote: "file://" + path.join(dir, "f-quote"), quoteN: count("f-quote"),
    gallery: "file://" + path.join(dir, "f-gallery"), galleryN: count("f-gallery"),
    founder: "file://" + path.join(dir, "founder.jpg"),
    intake2: "file://" + path.join(dir, "f-intake2"), intake2N: count("f-intake2"),
    quote2: "file://" + path.join(dir, "f-quote2"), quote2N: count("f-quote2"),
    home: "file://" + path.join(dir, "f-home"), homeN: count("f-home"),
    chat: "file://" + path.join(dir, "f-chat"), chatN: count("f-chat"),
    fix: "file://" + path.join(dir, "f-fix"), fixN: count("f-fix"),
  });
  const duration = await p.evaluate(() => window.DURATION);
  // Where in the track the video starts, when its timeline is synced to a later bar (promo3).
  const musicStart = await p.evaluate(() => window.MUSIC_START || 0);
  if (preview) {
    // Stills at chosen times for review.
    const times = (process.env.TIMES || "0.6,2.6,6.9,9.4,12.5,14.6,16.6,19.5,23.9,27.8,30.6,33.8,37.0,40.4").split(",").map(Number).filter((x) => x < duration);
    for (const s of times) {
      await p.evaluate((t) => window.renderAt(t), s);
      await p.screenshot({ path: path.join(dir, "prev", `${NAME}-t${s.toFixed(1)}.jpg`), type: "jpeg", quality: 80 });
    }
    await b.close();
    console.log("preview done", duration);
    return;
  }
  const silent = path.join(dir, `${NAME}-silent.mp4`);
  const ff = spawn(FF, ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", silent], { stdio: ["pipe", "inherit", "inherit"] });
  const total = Math.round(duration * FPS);
  for (let i = 0; i < total; i++) {
    await p.evaluate((t) => window.renderAt(t), i / FPS);
    const buf = await p.screenshot({ type: "jpeg", quality: 93 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  await b.close();
  const out = path.join(dir, `${NAME}.mp4`);
  const fadeAt = (duration - 2.6).toFixed(2);
  execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-i", silent, "-ss", musicStart.toFixed(3), "-i", process.env.MUSIC, "-t", duration.toFixed(3),
    "-af", `afade=t=in:st=0:d=0.15,afade=t=out:st=${fadeAt}:d=2.6`, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out]);
  execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-i", out, "-vf", "fps=0.5,scale=150:-1,tile=11x2", "-frames:v", "1", path.join(dir, `${NAME}-strip.png`)]);
  console.log(out, total, "frames");
})().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
