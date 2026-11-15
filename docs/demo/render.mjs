// Renders docs/demo/agent-flow (HyperFrames) to docs/agent-flow.gif.
// Usage: npm run demo:render   (needs Node, FFmpeg on PATH, network for npx)
// The committed GIF is only replaced once a new one has been made and fits
// the size limit, so a failed run leaves it as it was.
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, statSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const compDir = join(here, "agent-flow");
const gifPath = resolve(here, "..", "agent-flow.gif");
// Relative to compDir and git-ignored. A fixed relative path keeps the shell
// command below free of any interpolated, user-dependent text.
const MP4_REL = "renders/agent-flow.mp4";
const mp4 = join(compDir, MP4_REL);
const MB = 1024 * 1024;

const probe = spawnSync("ffmpeg", ["-version"], { stdio: "ignore" });
if (probe.error || probe.status !== 0) {
  console.error("FFmpeg is required: https://ffmpeg.org/download.html");
  process.exit(1);
}

const tmp = mkdtempSync(join(tmpdir(), "keepkeys-demo-"));
const tmpGif = join(tmp, "agent-flow.gif");

try {
  rmSync(mp4, { force: true });
  // shell: true because npx is a .cmd on Windows, which Node won't spawn without one.
  const render = spawnSync(`npx --yes hyperframes@0.9.53 render --fps 30 -o ${MP4_REL}`, {
    cwd: compDir,
    stdio: "inherit",
    shell: true,
    env: { ...process.env, DO_NOT_TRACK: "1", HYPERFRAMES_SKIP_SKILLS: "1" },
  });
  if (render.status !== 0 || !existsSync(mp4)) {
    throw new Error("HyperFrames render failed.");
  }

  const toGif = (fps, width) => {
    const vf =
      `fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];` +
      `[a]palettegen=stats_mode=diff[p];` +
      `[b][p]paletteuse=dither=sierra2_4a:diff_mode=rectangle`;
    const r = spawnSync("ffmpeg", ["-y", "-v", "error", "-i", mp4, "-vf", vf, "-loop", "0", tmpGif], {
      stdio: "inherit",
    });
    if (r.status !== 0) {
      throw new Error("FFmpeg GIF conversion failed.");
    }
    return statSync(tmpGif).size;
  };

  let fps = 20;
  let width = 1200;
  let size = toGif(fps, width);
  if (size > 4 * MB) {
    fps = 15;
    width = 1000;
    size = toGif(fps, width);
  }
  if (size > 10 * MB) {
    throw new Error(`GIF is ${(size / MB).toFixed(2)} MB, over the 10 MB limit; docs/agent-flow.gif was left unchanged.`);
  }
  copyFileSync(tmpGif, gifPath);
  console.log(`docs/agent-flow.gif: ${(size / MB).toFixed(2)} MB (${fps} fps, ${width}px wide, loop forever)`);
} catch (err) {
  console.error(err.message);
  process.exitCode = 1;
} finally {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(mp4, { force: true });
}
