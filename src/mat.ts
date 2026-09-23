import * as THREE from "three";

/**
 * One toon material for every surface. It writes two targets:
 * location 0 = lit colour (linear), location 1 = view normal.xy, surface id, ink mask.
 * Shared uniforms (G) are referenced, not cloned, so one write updates every program.
 */
export const G = {
  uTime: { value: 0 },
  uSunDir: { value: new THREE.Vector3(0.25, 1, 0.15).normalize() },
  uSunCol: { value: new THREE.Color() },
  uAmbTop: { value: new THREE.Color() },
  uAmbBot: { value: new THREE.Color() },
  uFogShallow: { value: new THREE.Color() },
  uFogDeep: { value: new THREE.Color() },
  uSurf: { value: new THREE.Color() },
  uFogDist: { value: 55 },
  uGlow: { value: 1 },
  uRays: { value: 1 },
};

export const COMMON = /* glsl */ `
uniform float uTime, uFogDist, uGlow, uRays;
uniform vec3 uSunDir, uSunCol, uAmbTop, uAmbBot, uFogShallow, uFogDeep, uSurf;
vec3 waterColor(vec3 dir, float camY){
  float dk = clamp(-camY / 110.0, 0.0, 1.0);
  vec3 shallow = mix(uFogShallow, uFogDeep, dk * 0.65);
  vec3 deep = uFogDeep * mix(0.7, 0.16, dk);
  vec3 c = mix(deep, shallow, smoothstep(-0.7, 0.9, dir.y));
  float s = max(dot(dir, normalize(vec3(uSunDir.x * 0.4, 1.0, uSunDir.z * 0.4))), 0.0);
  c += uSunCol * (pow(s, 6.0) * 0.22 + pow(s, 40.0) * 0.35) * (1.0 - dk);
  return c;
}
float fogF(float d){ return 1.0 - exp(-pow(d / uFogDist, 1.5)); }
`;

const VS = /* glsl */ `
${COMMON}
uniform vec3 uColor;
uniform float uSwayAmp, uSwimPhase, uSwimAmp, uSwimRate;
out vec3 vWorld; out vec3 vN; out vec3 vCol;
void main(){
  vec3 p = position;
  vec3 col = uColor;
  #ifdef USE_COLOR
    col *= color;
  #endif
  #ifdef USE_INSTANCING_COLOR
    col *= instanceColor;
  #endif
  mat4 m = modelMatrix;
  float seed = modelMatrix[3].x * 0.37 + modelMatrix[3].z * 0.23;
  #ifdef USE_INSTANCING
    m = modelMatrix * instanceMatrix;
    seed = float(gl_InstanceID) * 1.618;
  #endif
  #ifdef SWIM
    #ifdef USE_INSTANCING
      float ph = uTime * uSwimRate + seed;
    #else
      float ph = uSwimPhase;
    #endif
    float tail = smoothstep(0.25, -0.6, p.z);
    p.x += sin(p.z * 7.0 - ph) * uSwimAmp * (0.2 + tail);
  #endif
  #ifdef SWIMV
    // Whales: the body undulates up and down, flukes beat hardest.
    float phv = uTime * uSwimRate + seed;
    float tl = smoothstep(0.15, -0.62, p.z);
    p.y += sin(p.z * 3.5 - phv) * uSwimAmp * (0.12 + tl * tl * 1.8);
  #endif
  #ifdef FLAP
    // Manta: wings beat in a wave from the body out to the tips.
    float phf = uTime * uSwimRate + seed;
    float ax = abs(p.x);
    p.y += sin(phf - ax * 2.5) * uSwimAmp * ax * ax * 5.0;
    p.y += sin(phf * 0.5 - p.z * 6.0) * 0.02 * smoothstep(-0.15, -0.4, p.z);
  #endif
  #ifdef TENT
    // Squid: the mantle breathes, arms and tentacles trail and curl.
    float pht = uTime * uSwimRate + seed;
    // Arms start at z 0.22 (mantle and head are the front 0.28 of the length); tentacles trail to −0.5.
    float kt = max(0.0, 0.22 - p.z);
    p.x += sin(pht * 0.7 + p.z * 7.0 + p.y * 40.0) * kt * 0.12;
    p.y += cos(pht * 0.6 + p.z * 6.0 + p.x * 40.0) * kt * 0.1;
    if (p.z > 0.24) p.xy *= 1.0 + 0.05 * sin(pht * 0.8);
  #endif
  #ifdef SCULL
    // Ocean sunfish: tall dorsal and anal fins beat together side to side; the body barely moves.
    float phs = uTime * uSwimRate + seed;
    p.x += sin(phs) * uSwimAmp * pow(max(abs(p.y) - 0.33, 0.0), 1.1) * 3.0;
  #endif
  #ifdef JELLY
    float pulse = sin(uTime * 2.2 + seed);
    if (p.y > 0.0) { p.xz *= 1.0 - 0.16 * pulse * (1.05 - p.y); p.y *= 1.0 + 0.08 * pulse; }
    else {
      // Each strand gets its own phase from where it hangs, and the curtain flares out as it trails.
      float strand = p.x * 9.0 + p.z * 7.0;
      p.xz *= 1.0 + (-p.y) * 0.035;
      p.x += sin(uTime * 1.3 + p.y * 1.6 + seed + strand) * 0.22 * uSwimAmp * (-p.y);
      p.z += cos(uTime * 1.1 + p.y * 1.3 + seed + strand * 1.3) * 0.18 * uSwimAmp * (-p.y);
    }
  #endif
  vec4 w = m * vec4(p, 1.0);
  #ifdef SWAY
    float k = p.y * p.y;
    w.x += sin(uTime * 0.9 + seed + p.y * 2.6) * k * uSwayAmp;
    w.z += cos(uTime * 0.7 + seed * 1.3 + p.y * 2.1) * k * uSwayAmp * 0.7;
  #endif
  vWorld = w.xyz;
  vN = normalize(mat3(m) * normal);
  vCol = col;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

const FS = /* glsl */ `
precision highp float;
${COMMON}
uniform float uId, uMask, uEmissive, uCaustic, uRim;
in vec3 vWorld; in vec3 vN; in vec3 vCol;
layout(location = 0) out vec4 gColor;
layout(location = 1) out vec4 gNormal;
float net(vec2 p, float t){
  vec2 q = p + vec2(sin(p.y * 0.8 + t * 0.6), cos(p.x * 0.7 - t * 0.5)) * 1.1;
  float a = sin(q.x * 1.2 + t * 0.9) * sin(q.y * 1.05 - t * 0.7);
  vec2 r = p * 1.6 + vec2(3.1, 1.7) + vec2(cos(p.y * 0.6 - t * 0.4), sin(p.x * 0.5 + t * 0.5));
  float b = sin(r.x * 1.1 - t * 0.8) * sin(r.y * 1.3 + t * 0.6);
  // Band-limited: line width grows with the pattern's screen derivative, so it never shimmers.
  float wa = fwidth(a) * 1.5, wb = fwidth(b) * 1.5;
  return (1.0 - smoothstep(0.0, 0.09 + wa, abs(a))) * (1.0 - smoothstep(0.3, 0.8, wa))
       + 0.6 * (1.0 - smoothstep(0.0, 0.09 + wb, abs(b))) * (1.0 - smoothstep(0.3, 0.8, wb));
}
void main(){
  // Guards: a zero normal or a zero distance must never produce NaN (it would spread through bloom).
  float nl = length(vN);
  vec3 N = nl > 1e-6 ? vN / nl : vec3(0.0, 1.0, 0.0);
  if (!gl_FrontFacing) N = -N;
  vec3 toCam = cameraPosition - vWorld;
  float dist = max(length(toCam), 1e-4);
  vec3 V = toCam / dist;
  float ndl = dot(N, uSunDir);
  // Three cel bands, each a narrow smoothstep so the terminator is drawn, not aliased.
  float band = smoothstep(-0.1, 0.0, ndl) * 0.55 + smoothstep(0.42, 0.5, ndl) * 0.45;
  // Sunlight loses red first on its way down (per-channel Beer-Lambert, after clearwater).
  vec3 att = exp(min(vWorld.y, 0.0) * vec3(0.05, 0.022, 0.013));
  vec3 base = vCol;
  vec3 amb = mix(uAmbBot, uAmbTop, N.y * 0.5 + 0.5);
  vec3 c = base * (amb + uSunCol * band * att);
  // Chromatic caustics: each channel refracts slightly differently, so the lines fringe.
  vec3 cz = vec3(0.0);
  if (uCaustic > 0.0 && N.y > 0.1 && dist < 55.0) {
    vec2 cp = vWorld.xz * 1.1; float ct = uTime * 1.1;
    cz = vec3(net(cp * 0.985, ct), net(cp, ct), net(cp * 1.015, ct));
  }
  cz *= smoothstep(0.1, 0.7, N.y) * att * uCaustic * (1.0 - smoothstep(22.0, 55.0, dist));
  c += base * uSunCol * cz * 0.45;
  float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0) * uRim;
  vec3 wc = waterColor(-V, cameraPosition.y);
  c += rim * wc * 0.7;
  // Light from the surface to the eye is absorbed per channel too: far things go teal before they fog.
  c *= exp(-dist * vec3(0.035, 0.012, 0.008));
  c = mix(c, base * (1.1 + 1.6 * uGlow), uEmissive);
  float f = fogF(dist) * (1.0 - uEmissive * 0.4);
  c = mix(c, wc, f);
  // Any NaN/Inf left (driver differences) becomes the water colour: comparisons with NaN are false.
  if (!(c.r >= 0.0 && c.r < 1e4 && c.g >= 0.0 && c.g < 1e4 && c.b >= 0.0 && c.b < 1e4)) c = max(wc, vec3(0.0));
  gColor = vec4(c, 1.0);
  vec3 vn = normalize((viewMatrix * vec4(N, 0.0)).xyz);
  gNormal = vec4(vn.xy * 0.5 + 0.5, uId / 32.0, uMask < 0.0 ? -1.0 : uMask * (1.0 - f));
}`;

export interface ToonOpts {
  color?: THREE.ColorRepresentation;
  vertexColors?: boolean;
  id?: number;
  mask?: number;
  emissive?: number;
  caustic?: number;
  rim?: number;
  sway?: number;
  swim?: boolean;
  swimAmp?: number;
  swimRate?: number;
  jelly?: boolean;
  swimv?: boolean;
  flap?: boolean;
  tent?: boolean;
  scull?: boolean;
  side?: THREE.Side;
}

export function toon(o: ToonOpts = {}): THREE.ShaderMaterial & { uniforms: Record<string, THREE.IUniform> } {
  const defines: Record<string, string> = {};
  if (o.sway) defines.SWAY = "";
  if (o.swim) defines.SWIM = "";
  if (o.jelly) defines.JELLY = "";
  if (o.swimv) defines.SWIMV = "";
  if (o.flap) defines.FLAP = "";
  if (o.tent) defines.TENT = "";
  if (o.scull) defines.SCULL = "";
  return new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    defines,
    vertexColors: !!o.vertexColors,
    side: o.side ?? THREE.FrontSide,
    uniforms: {
      ...G,
      uColor: { value: new THREE.Color(o.color ?? 0xffffff) },
      uId: { value: o.id ?? 1 },
      uMask: { value: o.mask ?? 1 },
      uEmissive: { value: o.emissive ?? 0 },
      uCaustic: { value: o.caustic ?? 1 },
      uRim: { value: o.rim ?? 0.6 },
      uSwayAmp: { value: o.sway ?? 0 },
      uSwimPhase: { value: 0 },
      uSwimAmp: { value: o.swimAmp ?? 0.07 },
      uSwimRate: { value: o.swimRate ?? 9 },
    },
    vertexShader: VS,
    fragmentShader: FS,
  }) as THREE.ShaderMaterial & { uniforms: Record<string, THREE.IUniform> };
}

/** For additive effects (rays, snow, bubbles' glints): colour adds, the normal target is untouched. */
export const FX_OUT = /* glsl */ `
layout(location = 0) out vec4 gColor;
layout(location = 1) out vec4 gNormal;
`;
