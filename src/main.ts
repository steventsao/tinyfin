import * as THREE from "three";
import { G } from "./mat";
import { World } from "./world";
import { Fx } from "./fx";
import { Post } from "./post";
import { Player } from "./player";
import { Input } from "./input";
import { Schools, Jellies, Motes, Bubbles } from "./life";
import { TimeOfDay } from "./tod";
import { Audio } from "./audio";
import { biome, biomeName, height } from "./terrain";
import { Megafauna } from "./megafauna";
import { SeaMap } from "./map";
import { setWorldSeed, WORLD } from "./noise";

const params = new URLSearchParams(location.search);
const AUTO = params.has("autoplay");
// A fresh ocean every visit unless ?seed= pins one.
setWorldSeed(params.has("seed") ? Number(params.get("seed")) : 1 + Math.floor(Math.random() * 999999));

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth * devicePixelRatio > 2600 ? 1.25 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;
renderer.setClearColor(0x000000, 0);
document.getElementById("app")!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 1500);

const msaa = params.has("msaa") ? Number(params.get("msaa")) : matchMedia("(pointer: coarse)").matches ? 0 : 4;
const post = new Post(renderer, innerWidth, innerHeight, { kuwahara: params.get("kuwahara") !== "0", msaa });
const tod = new TimeOfDay(params.get("time"));
const fx = new Fx(scene);
const world = new World(scene);
const player = new Player(scene);
const schools = new Schools(scene, player.pos);
const jellies = new Jellies(scene, player.pos);
const motes = new Motes(scene, player.pos);
const bubbles = new Bubbles(scene);
const input = new Input(renderer.domElement);
const giants = new Megafauna(scene, params.get("encounter"));
giants.loadModels(import.meta.env.BASE_URL);
const seaMap = new SeaMap(document.body);
document.getElementById("mapbtn")!.addEventListener("click", (e) => { e.stopPropagation(); seaMap.toggle(); });
const audio = new Audio();

// Build the whole first neighbourhood before the first frame.
world.update(player.pos.x, player.pos.z, 99);
camera.position.copy(player.pos).add(new THREE.Vector3(0, 1.4, -5));
camera.lookAt(player.pos);

const hud = {
  depth: document.getElementById("depth")!,
  zone: document.getElementById("zone")!,
  dist: document.getElementById("dist")!,
  time: document.getElementById("time")!,
  seen: document.getElementById("seen")!,
  toast: document.getElementById("toast")!,
};
// Sighting titles queue, so several early sightings don't overwrite each other.
let toastT = 0;
const toasts: { name: string; blurb: string; isNew: boolean }[] = [];
function showToast() {
  const n = toasts.shift();
  if (!n) return;
  hud.toast.innerHTML = `<div class="k">${n.isNew ? "New sighting" : "Sighting"}</div><div class="n">${n.name}</div><div class="b">${n.blurb}</div>`;
  hud.toast.classList.add("on");
  toastT = toasts.length ? 3.8 : 6;
  if (n.isNew) audio.chime(4);
}
function sighting(name: string, blurb: string, isNew: boolean) {
  toasts.push({ name, blurb, isNew });
  if (toastT <= 0) showToast();
}
giants.onSight = ({ sp, isNew }) => sighting(sp.name, sp.blurb, isNew);

// Common life counts too, loosely by type. Each is noted the first time you come close.
const COMMON: { key: string; name: string; blurb: string; seen: () => boolean }[] = [
  { key: "clownfish", name: "Clownfish", blurb: "Lives among the stinging tentacles of anemones. That's you.", seen: () => true },
  { key: "plankton", name: "Plankton", blurb: "Drifters too small to swim against the current. The base of the ocean's food web.", seen: () => motes.nearest(player.pos) < 5 },
  { key: "jellyfish", name: "Jellyfish", blurb: "No brain, no heart, no bones. About 95 percent water.", seen: () => jellies.nearest(player.pos) < 12 },
  { key: "schoolfish", name: "Schooling fish", blurb: "Hundreds move as one, to confuse anything that hunts them.", seen: () => schools.nearest(player.pos) < 14 },
  { key: "coral", name: "Coral", blurb: "Animals, not plants: colonies of tiny polyps building stone.", seen: () => biome(player.pos.x, player.pos.z).reef > 0.45 },
];
let commonT = 3.5;

// Guide: a soft arrow at the screen edge toward the nearest unseen giant, with its distance.
const hintEl = document.getElementById("hint")!;
const hv = new THREE.Vector3();
function guide() {
  const h = giants.hint;
  if (!h.active || AUTO) { hintEl.classList.remove("on"); return; }
  hv.copy(h.pos).project(camera);
  const behind = hv.z > 1;
  let x = behind ? -hv.x : hv.x, y = behind ? -hv.y : hv.y;
  const onScreen = !behind && Math.abs(x) < 0.85 && Math.abs(y) < 0.8;
  if (onScreen && h.dist < 45) { hintEl.classList.remove("on"); return; }
  if (behind && Math.abs(x) < 0.05) x = 0.05;
  // Push the point out to an inset ellipse at the screen edge.
  const k = 1 / Math.max(Math.hypot(x / 0.86, y / 0.78), 1e-3);
  if (!onScreen) { x *= k; y *= k; }
  const px = (x * 0.5 + 0.5) * innerWidth, py = (-y * 0.5 + 0.5) * innerHeight;
  const ang = Math.atan2(-y, x);
  hintEl.style.transform = `translate(${px}px, ${py}px)`;
  (hintEl.firstElementChild as HTMLElement).style.transform = `rotate(${onScreen ? Math.PI / 2 : ang}rad)`;
  hintEl.lastElementChild!.textContent = `${Math.round(h.dist / 5) * 5} m`;
  hintEl.classList.add("on");
}
giants.onSong = (pitch, gain) => audio.song(pitch, gain);
giants.onClicks = (gain) => audio.clicks(gain);
const intro = document.getElementById("intro")!;
// No start gate: the fish swims from the first frame. The title fades by itself or on first input.
let introUp = !AUTO;
if (AUTO) { intro.remove(); document.body.classList.add("auto"); }
function dismissIntro() {
  if (!introUp) return;
  introUp = false;
  intro.classList.add("gone");
  setTimeout(() => intro.remove(), 1200);
}
setTimeout(dismissIntro, 4000);
// Audio may only start inside a user gesture: the first key, click or touch anywhere.
input.onAny = () => { audio.start(); dismissIntro(); };
addEventListener("touchstart", () => input.onAny(), { passive: true });

input.onKey = (code) => {
  if (code === "KeyT") tod.next();
  if (code === "KeyM") seaMap.toggle();
  if (code === "KeyX") audio.toggleMute();
  if (code === "KeyB") { bubbles.emit(player.mouth, 8); audio.bloop(1.2); }
};

addEventListener("resize", () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  post.setSize(innerWidth, innerHeight);
  fx.pxScale.value = innerHeight * renderer.getPixelRatio() * 0.6;
});
fx.pxScale.value = innerHeight * renderer.getPixelRatio() * 0.6;

const camTarget = new THREE.Vector3(), look = new THREE.Vector3(), lookS = new THREE.Vector3().copy(player.pos);
let t = 0, last = performance.now(), bubbleT = 1, hudT = 0;

// Adaptive resolution (after clearwater): scale the render down when frames run long, back up when they don't.
const basePR = renderer.getPixelRatio();
let ftSum = 0, ftN = 0, cooldown = 3;
function adapt(dt: number) {
  ftSum += dt; ftN++;
  cooldown -= dt;
  if (ftN < 60 || cooldown > 0) return;
  const ms = (ftSum / ftN) * 1000;
  ftSum = ftN = 0;
  const pr = renderer.getPixelRatio();
  let next = pr;
  if (ms > 22 && pr > basePR * 0.45) next = Math.max(basePR * 0.45, pr * 0.85);
  else if (ms < 17.5 && pr < basePR) next = Math.min(basePR, pr * 1.08);
  if (next !== pr) {
    renderer.setPixelRatio(next);
    renderer.setSize(innerWidth, innerHeight);
    post.setSize(innerWidth, innerHeight);
    fx.pxScale.value = innerHeight * next * 0.6;
    cooldown = 2.5;
  }
}

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  t += dt;
  G.uTime.value = t;

  player.update(dt, t, input, AUTO);
  world.update(player.pos.x, player.pos.z, 1);
  schools.update(dt, t, player.pos, player.fwd, player.speed);
  jellies.update(dt, t, player.pos, player.fwd);
  const ate = motes.update(t, player.mouth, 0.55 * player.scale + 0.35, player.pos, player.fwd);
  if (ate) {
    player.scale = Player.BASE * Math.min(2.2, 1 + motes.eaten * 0.01);
    audio.chime(motes.eaten);
    bubbles.emit(player.mouth, 2);
  }
  bubbleT -= dt * (0.6 + player.speed * 0.08);
  if (bubbleT < 0) { bubbles.emit(player.mouth, 2 + Math.floor(Math.random() * 3)); bubbleT = 1 + Math.random() * 2.5; }
  bubbles.update(dt, t);
  tod.update(dt);
  camera.updateMatrixWorld();
  giants.update(dt, t, player.pos, tod.name === "Night", camera);
  guide();
  commonT -= dt;
  if (commonT < 0) {
    commonT = 0.5;
    for (const c of COMMON) if (!giants.seen.has(c.key) && c.seen() && giants.note(c.key)) sighting(c.name, c.blurb, true);
  }
  if (toastT > 0 && (toastT -= dt) <= 0) {
    if (toasts.length) showToast();
    else hud.toast.classList.remove("on");
  }

  // Chase camera: behind and a little above, lagging on turns; never through the floor or surface.
  // Third person at the fish's true size: a short chase distance keeps the fish readable on screen.
  const s = player.scale;
  camTarget.copy(player.pos).addScaledVector(player.fwd, -3.4 * s).add(look.set(0, 0.95 * s, 0));
  // Tight follow: at a 35 cm fish, a slow lerp leaves the camera metres behind and the fish a speck.
  camera.position.lerp(camTarget, 1 - Math.exp(-dt * 7));
  const fl = height(camera.position.x, camera.position.z) + 0.25;
  if (camera.position.y < fl) camera.position.y = fl;
  if (camera.position.y > -0.3) camera.position.y = -0.3;
  giants.pushOut(camera.position, 0.4);
  look.copy(player.pos).addScaledVector(player.fwd, 1.8 * s).add(camTarget.set(0, 0.25 * s, 0));
  lookS.lerp(look, 1 - Math.exp(-dt * 8));
  camera.lookAt(lookS);
  fx.update(camera);

  audio.update(dt, player.speed, -player.pos.y);

  hudT -= dt;
  if (hudT < 0) {
    hudT = 0.2;
    hud.depth.textContent = `${Math.max(0, -player.pos.y).toFixed(1)} m`;
    hud.zone.textContent = biomeName(player.pos.x, player.pos.z);
    hud.dist.textContent = player.distance < 1000 ? `${player.distance.toFixed(0)} m swum` : `${(player.distance / 1000).toFixed(2)} km swum`;
    hud.time.textContent = `${tod.name} · seed ${WORLD.seed}`;
    hud.seen.textContent = `${giants.seen.size}`;
  }

  post.render(scene, camera, t);
  seaMap.draw(player.pos.x, player.pos.z, player.yaw, giants, t);
  if (!params.has("fixedres")) adapt(dt);
}

// Compile every program behind the intro so the first swim doesn't stall.
renderer.compile(scene, camera);
requestAnimationFrame((n) => { last = n; frame(n); });
(window as unknown as { __drift: unknown }).__drift = { player, world, renderer, giants, camera };
