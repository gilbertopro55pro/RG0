"""Turn a raw guide recording into the final mp4. Usage: python3 convert.py <key>

Reads $GF_OUT/<key>.json (written by record.js), keeps only the frames where the recorder's
magenta marker strip is visible at the bottom edge (i.e. the page was ready and "recording"),
drops loading screens between them, crops the marker off, and writes $GF_OUT/<key>.mp4
(H.264, 480x768, faststart, no audio) plus $GF_OUT/<key>-strip.png (one frame every 4s) for review.

ffmpeg: $GF_FFMPEG, else imageio_ffmpeg's bundled binary (pip install imageio-ffmpeg --target <dir>,
then PYTHONPATH=<dir>), else `ffmpeg` on PATH. It must include libx264.
"""
import json
import os
import re
import subprocess
import sys
import tempfile


def ffmpeg_bin():
    if os.environ.get("GF_FFMPEG"):
        return os.environ["GF_FFMPEG"]
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        return "ffmpeg"


F = ffmpeg_bin()
key = sys.argv[1]
out_dir = os.environ.get("GF_OUT") or os.path.join(tempfile.gettempdir(), "guide-video")
meta = json.load(open(os.path.join(out_dir, f"{key}.json")))
src = meta["src"]

# 1 px average of a strip inside the marker, per frame at 30fps.
raw = subprocess.run(
    [F, "-hide_banner", "-loglevel", "error", "-i", src, "-vf",
     "fps=30,crop=200:3:140:776,scale=1:1:flags=area,format=rgb24", "-f", "rawvideo", "-"],
    capture_output=True, check=True,
).stdout
keep = [raw[i] > 200 and raw[i + 2] > 200 and raw[i + 1] < 80 for i in range(0, len(raw), 3)]

segs, st = [], None
for i, v in enumerate(keep + [False]):
    if v and st is None:
        st = i
    if not v and st is not None:
        if i - st > 3:
            segs.append((st / 30, i / 30))
        st = None
if not segs:
    sys.exit("no marked frames found: did the scenario call go()/on()?")
print(key, "segments", [(round(a, 1), round(b, 1)) for a, b in segs])

parts, labels = [], ""
for i, (a, b) in enumerate(segs):
    parts.append(
        f"[0:v]fps=30,trim=start={a + 0.04:.3f}:end={b - 0.04:.3f},setpts=PTS-STARTPTS,"
        f"crop=480:768:0:0,format=yuv420p[v{i}]"
    )
    labels += f"[v{i}]"
fc = ";".join(parts) + f";{labels}concat=n={len(segs)}:v=1:a=0[out]"
out = os.path.join(out_dir, f"{key}.mp4")
subprocess.run(
    [F, "-hide_banner", "-loglevel", "error", "-y", "-i", src, "-filter_complex", fc, "-map", "[out]",
     "-c:v", "libx264", "-preset", "slow", "-crf", "26", "-movflags", "+faststart", "-an", out],
    check=True,
)
subprocess.run(
    [F, "-hide_banner", "-loglevel", "error", "-y", "-i", out, "-vf",
     "fps=1/4,scale=150:-1,tile=8x3", "-frames:v", "1", os.path.join(out_dir, f"{key}-strip.png")],
    check=True,
)
info = subprocess.run([F, "-i", out], capture_output=True, text=True).stderr
print(out, re.search(r"Duration: ([\d:.]+)", info).group(1))
