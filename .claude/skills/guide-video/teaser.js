// Coming-soon teaser (1080x1920, 13s, no audio) built around a clean screen recording.
// Usage: node teaser.js <key>     (<key> from teasers.json)
// Needs $GF_OUT/<clip>.mp4 first: record the caption-less scenario scenarios/<clip>.js with
// record.js + convert.py as usual. Writes $GF_OUT/coming-soon-<key>.mp4 and coming-soon-<key>-strip.png.
// Every frame is rendered from teaser.html at a fixed time t and screenshotted, so the result is
// the same on every run and never drops frames. ffmpeg: $GF_FFMPEG or imageio_ffmpeg (see SKILL.md).
const { chromium } = require("playwright-core");
const { execFileSync, spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const key = process.argv[2];
const cfgAll = JSON.parse(fs.readFileSync(path.join(__dirname, "teasers.json"), "utf8"));
const c = cfgAll[key];
if (!c) throw new Error(`unknown teaser "${key}" (teasers.json has: ${Object.keys(cfgAll).join(", ")})`);
const OUT = process.env.GF_OUT || path.join(os.tmpdir(), "guide-video");
const FF = process.env.GF_FFMPEG || execFileSync("python3", ["-c", "import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())"]).toString().trim();
const REPO = path.resolve(__dirname, "../../..");
const FPS = 30;

(async () => {
  // 1. The screen clip as frames, sized for the phone screen (564x902), from `skip` on.
  const clip = path.join(OUT, `${c.clip}.mp4`);
  if (!fs.existsSync(clip)) throw new Error(`missing ${clip}: record scenarios/${c.clip}.js first`);
  const framesDir = path.join(OUT, `teaser-${key}-frames`);
  fs.rmSync(framesDir, { recursive: true, force: true });
  fs.mkdirSync(framesDir, { recursive: true });
  execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-ss", String(c.skip), "-i", clip, "-vf", `fps=${FPS},scale=564:902:flags=lanczos`, "-q:v", "2", path.join(framesDir, "%05d.jpg")]);
  // record.js always ends on its own logo card (about 2.2s + fade): drop it, the teaser has its own.
  const all = fs.readdirSync(framesDir).sort();
  for (const f of all.slice(Math.max(1, all.length - 80))) fs.rmSync(path.join(framesDir, f));
  const frames = fs.readdirSync(framesDir).length;

  // 2. The page, with local fonts and logo.
  const fonts = path.join(REPO, "src/assets/fonts");
  const html = fs
    .readFileSync(path.join(__dirname, "teaser.html"), "utf8")
    .replace("RUBIK_REGULAR", "file://" + path.join(fonts, "Rubik-Regular.ttf"))
    .replace("RUBIK_BOLD", "file://" + path.join(fonts, "Rubik-Bold.ttf"));
  const page_ = path.join(OUT, "teaser.html");
  fs.writeFileSync(page_, html);

  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "/opt/pw-browsers/chromium-1194/chrome-linux/chrome", args: ["--allow-file-access-from-files"] });
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => console.log("pageerror", e.message));
  await page.goto("file://" + page_);
  await page.evaluate((cfg) => window.setup(cfg), {
    ...c,
    frames,
    framesDir: "file://" + framesDir,
    logo: "file://" + path.join(REPO, "public/icons/icon-512.png"),
  });
  const [duration, phoneStart] = await page.evaluate(() => [window.DURATION, window.PHONE_START]);

  // 3. Render every frame and pipe it into ffmpeg.
  const out = path.join(OUT, `coming-soon-${key}.mp4`);
  const ff = spawn(FF, ["-hide_banner", "-loglevel", "error", "-y", "-f", "image2pipe", "-c:v", "mjpeg", "-framerate", String(FPS), "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", out], { stdio: ["pipe", "inherit", "inherit"] });
  const total = Math.round(duration * FPS);
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => window.renderAt(t), i / FPS);
    const buf = await page.screenshot({ type: "jpeg", quality: 92 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  await browser.close();
  execFileSync(FF, ["-hide_banner", "-loglevel", "error", "-y", "-i", out, "-vf", "fps=1,scale=180:-1,tile=9x2", "-frames:v", "1", path.join(OUT, `coming-soon-${key}-strip.png`)]);
  console.log(out, `${total} frames, clip frames used up to`, Math.min(frames, Math.floor((duration - phoneStart) * FPS * c.speed)), "of", frames);
})().catch((e) => {
  console.error("FATAL", e.message);
  process.exit(1);
});
