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
import { biomeName, height } from "./terrain";

const params = new URLSearchParams(location.search);
const AUTO = params.has("autoplay");

const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(devicePixelRatio, innerWidth * devicePixelRatio > 2600 ? 1.25 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = false;
renderer.setClearColor(0x000000, 0);
document.getElementById("app")!.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 1500);

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
const audio = new Audio();

// Build the whole first neighbourhood before the first frame.
world.update(player.pos.x, player.pos.z, 99);
camera.position.copy(player.pos).add(new THREE.Vector3(0, 1.4, -5));
camera.lookAt(player.pos);

const hud = {
  depth: document.getElementById("depth")!,
  zone: document.getElementById("zone")!,
  dist: document.getElementById("dist")!,
  food: document.getElementById("food")!,
  time: document.getElementById("time")!,
};
const intro = document.getElementById("intro")!;
let started = AUTO;
if (AUTO) { intro.remove(); document.body.classList.add("auto"); }

function begin() {
  audio.start();
  if (!started) {
    started = true;
    intro.classList.add("gone");
    setTimeout(() => intro.remove(), 900);
  }
  if (!matchMedia("(pointer: coarse)").matches) renderer.domElement.requestPointerLock?.();
}
intro.addEventListener("click", begin);
renderer.domElement.addEventListener("click", begin);
renderer.domElement.addEventListener("touchstart", () => { audio.start(); if (!started) begin(); }, { passive: true });

input.onKey = (code) => {
  if (!started && (code === "Enter" || code === "Space")) begin();
  if (code === "KeyT") tod.next();
  if (code === "KeyM") audio.toggleMute();
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

function frame(now: number) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 1 / 20);
  last = now;
  t += dt;
  G.uTime.value = t;

  if (started) player.update(dt, t, input, AUTO);
  world.update(player.pos.x, player.pos.z, 1);
  schools.update(dt, t, player.pos, player.fwd, player.speed);
  jellies.update(dt, t, player.pos, player.fwd);
  const ate = motes.update(t, player.mouth, 0.55 * player.scale + 0.35, player.pos, player.fwd);
  if (ate) {
    player.scale = Math.min(2.6, 1 + motes.eaten * 0.012);
    audio.chime(motes.eaten);
    bubbles.emit(player.mouth, 2);
  }
  bubbleT -= dt * (0.6 + player.speed * 0.08);
  if (bubbleT < 0) { bubbles.emit(player.mouth, 2 + Math.floor(Math.random() * 3)); bubbleT = 1 + Math.random() * 2.5; }
  bubbles.update(dt, t);
  tod.update(dt);

  // Chase camera: behind and a little above, lagging on turns; never through the floor or surface.
  const s = player.scale;
  camTarget.copy(player.pos).addScaledVector(player.fwd, -4.2 * s).add(look.set(0, 1.25 * s, 0));
  camera.position.lerp(camTarget, 1 - Math.exp(-dt * 3.2));
  const fl = height(camera.position.x, camera.position.z) + 0.7;
  if (camera.position.y < fl) camera.position.y = fl;
  if (camera.position.y > -0.5) camera.position.y = -0.5;
  look.copy(player.pos).addScaledVector(player.fwd, 2.5 * s);
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
    hud.food.textContent = `${motes.eaten}`;
    hud.time.textContent = tod.name;
  }

  post.render(scene, camera, t);
}

// Compile every program behind the intro so the first swim doesn't stall.
renderer.compile(scene, camera);
requestAnimationFrame((n) => { last = n; frame(n); });
(window as unknown as { __drift: unknown }).__drift = { player, world, renderer };
