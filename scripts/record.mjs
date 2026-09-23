// Record a shareable clip: exploration, then a giant's sighting. Frames are rendered one fixed step at a
// time (the page clock is replaced), so the video is smooth whatever the machine load.
//
//   node scripts/record.mjs species=humpback seed=42 s=12 w=1920 h=1080 out=media/tinyfin-humpback.mp4
import puppeteer from "puppeteer-core";
import { mkdirSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

const arg = Object.fromEntries(process.argv.slice(2).map((a) => a.split("=")));
const BASE = arg.url ?? "https://steventsao.github.io/tinyfin/";
const SPECIES = arg.species ?? "humpback";
const SEED = arg.seed ?? "42";
const W = +(arg.w ?? 1920), H = +(arg.h ?? 1080), FPS = 30, SECONDS = +(arg.s ?? 12);
const AHEAD = +(arg.ahead ?? 45); // where the giant starts: metres ahead, in the haze
const SIDE = +(arg.side ?? 24);   // and metres to the side
const CROSS = +(arg.cross ?? 0.25); // 0 = straight across the view, higher = more toward the fish
const LIFT = +(arg.lift ?? 0.8);    // height above the fish, so it reads against open water
const TIME = arg.time ? `&time=${arg.time}` : "";
const CLEAN = arg.clean !== "0"; // hide the key hints and guide arrow for share clips // seconds of free exploration before heading for the giant
const OUT = arg.out ?? `media/tinyfin-${SPECIES}.mp4`;
const FRAMES = join(tmpdir(), `tinyfin-frames-${Date.now()}`);
mkdirSync(FRAMES, { recursive: true });
mkdirSync("media", { recursive: true });

const browser = await puppeteer.launch({
  executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  userDataDir: join(tmpdir(), `tinyfin-rec-profile-${Date.now()}`),
  args: ["--use-angle=metal", "--enable-gpu", "--ignore-gpu-blocklist", `--window-size=${W},${H}`, "--hide-scrollbars"],
  defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
});
const page = await browser.newPage();

// Deterministic clock: time only moves when we step it.
await page.evaluateOnNewDocument(() => {
  let now = 0;
  let q = [];
  performance.now = () => now;
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  window.__step = (ms) => { now += ms; const cur = q; q = []; for (const cb of cur) cb(now); };
  // Common life counts as already seen, so the only title in the clip is the giant's.
  try { localStorage.setItem("tinyfin.seen", JSON.stringify(["clownfish", "plankton", "jellyfish", "schoolfish", "coral"])); } catch {}
});
const url = `${BASE}?autopilot=1&fixedres=1&seed=${SEED}&encounter=${SPECIES}${TIME}`;
await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
// Real-time CSS fades would pop at capture speed: the sighting title is faded by frame count below.
await page.addStyleTag({ content: "#toast{transition:none!important}" + (CLEAN ? "#keys,#hint{display:none!important}" : "") });

const gpu = await page.evaluate(() => {
  const gl = document.createElement("canvas").getContext("webgl2");
  const ext = gl.getExtension("WEBGL_debug_renderer_info");
  return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
});
console.log("GPU:", gpu);

// Wait for the Blender models, stepping a few frames so everything compiles.
for (let i = 0; i < 200; i++) {
  const ready = await page.evaluate(() => {
    window.__step(33);
    const g = window.__tinyfin?.giants;
    return !!g && g.species.filter((s) => ["blue", "humpback", "sperm", "orca", "whiteshark", "whaleshark", "mola", "manta", "squid"].includes(s.key))
      .every((s) => s.mesh.geometry.getAttribute("color")?.itemSize === 4);
  });
  if (ready) break;
  await new Promise((r) => setTimeout(r, 100));
}

const total = SECONDS * FPS;
let sightedAt = -1;
for (let f = 0; f < total; f++) {
  const t = f / FPS;
  const info = await page.evaluate((t, ahead, side, cross, lift, key) => {
    const d = window.__tinyfin;
    const sp = d.giants.species.find((s) => s.key === key);
    // A steady, gently wandering course: no sudden turns.
    window.__yaw0 ??= d.player.yaw;
    d.player.yaw = window.__yaw0 + 0.12 * Math.sin(t * 0.45);
    d.player.speed = Math.min(d.player.speed, 2.2);
    if (!window.__staged) {
      // Set the giant's path before the first frame: it starts far ahead in the haze and swims across
      // and toward the fish, so it emerges gradually instead of appearing.
      window.__staged = true;
      for (const enc of d.giants.active.values()) {
        if (!enc.creatures.length || enc.creatures[0].sp.key !== key) continue;
        window.__enc = enc;
        const f = d.player.fwd, fl = Math.hypot(f.x, f.z), fx = f.x / fl, fz = f.z / fl;
        const rx = fz, rz = -fx; // right of the heading
        const p0x = d.player.pos.x + fx * ahead + rx * side, p0z = d.player.pos.z + fz * ahead + rz * side;
        // Travel direction: across (to the left), angled toward the fish by `cross`.
        let dx = -rx - fx * cross, dz = -rz - fz * cross;
        const dl = Math.hypot(dx, dz); dx /= dl; dz /= dl;
        const R = 220;
        const speed = Math.abs(enc.creatures[0].w * enc.creatures[0].R);
        // On the loop, tangent(θ) = (−sin θ, cos θ) for w > 0: pick θ so the tangent is our direction.
        const th = Math.atan2(-dx, dz);
        const band = enc.creatures[0].sp.band;
        const want = d.player.pos.y + lift;
        for (const cr of enc.creatures) {
          cr.w = speed / R;
          cr.R = R;
          const rr = R * (1 + 0.22 * Math.sin(th * 2 + cr.wob));
          cr.c.set(p0x - Math.cos(th) * rr, p0z - Math.sin(th) * rr);
          cr.th0 = th + (cr.lag || 0);
          cr.baseT = enc.creatures[0].sp.floorRel ? 0.3 : Math.min(1, Math.max(0, (band[0] - want) / (band[0] - band[1])));
          cr.ready = false;
        }
        enc.noticed = false;
      }
    }
    window.__step(1000 / 30);
    let dbg = null;
    const cr0 = window.__enc?.creatures[0];
    if (cr0) {
      const n = cr0.pos.clone().project(d.camera);
      dbg = { dist: +cr0.pos.distanceTo(d.camera.position).toFixed(1), ndc: [+n.x.toFixed(2), +n.y.toFixed(2), +n.z.toFixed(3)], y: +cr0.pos.y.toFixed(1), fishY: +d.player.pos.y.toFixed(1) };
    }
    return { seen: d.giants.seen.has(key), dbg };
  }, t, AHEAD, SIDE, CROSS, LIFT, SPECIES);
  if (info.seen && sightedAt < 0) { sightedAt = f; console.log(`sighting at ${t.toFixed(2)} s`); }
  if (sightedAt >= 0) {
    const a = Math.min(1, (f - sightedAt) / (0.6 * FPS));
    await page.evaluate((a) => { const el = document.getElementById("toast"); el.style.opacity = String(a); el.style.transform = `translate(-50%, ${8 * (1 - a)}px)`; }, a);
  }
  await page.screenshot({ path: join(FRAMES, `${String(f).padStart(5, "0")}.jpg`), type: "jpeg", quality: 92 });
  if (f % 30 === 0) console.log(`frame ${f}/${total}`, JSON.stringify(info.dbg));
}
await browser.close();

execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-framerate", String(FPS), "-i", join(FRAMES, "%05d.jpg"),
  "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart", OUT], { stdio: "inherit" });
rmSync(FRAMES, { recursive: true, force: true });
console.log("wrote", OUT, sightedAt >= 0 ? `(sighting at ${(sightedAt / FPS).toFixed(2)} s)` : "(no sighting fired)");
