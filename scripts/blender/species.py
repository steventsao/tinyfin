"""
tinyfin creature models, built from published proportions (fractions of total length, or wingspan for the manta).

Run all:   /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/blender/species.py -- public/models
Run one:   ... -- public/models orca

Station s = 0 at the snout, 1 at the tail end of the lofted body.
"""
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(__file__))
from lib import assemble, fbm, fin, loft, sphere, srgb, table, tube  # noqa: E402

ARGS = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["."]
OUT_DIR = ARGS[0]
ONLY = ARGS[1:] or None


def clamp01(v):
    return max(0.0, min(1.0, v))


def smooth(a, b, x):
    t = clamp01((x - a) / (b - a))
    return t * t * (3 - 2 * t)


def gauss(x, w):
    return math.exp(-(x / w) ** 2)


# ---------------------------------------------------------------- Blue whale
# Slender rorqual. Head ~¼, broad flat U-shaped rostrum with median ridge, splash guard, 55-88 throat pleats
# to the navel (~0.47), flipper ~0.13 at 0.28, tiny dorsal at ~0.76, flukes span ~0.26.
def blue():
    W = [(0, 0.0), (0.008, 0.018), (0.03, 0.036), (0.08, 0.05), (0.15, 0.057), (0.25, 0.06), (0.35, 0.063),
         (0.45, 0.062), (0.55, 0.056), (0.65, 0.046), (0.75, 0.032), (0.85, 0.017), (0.92, 0.01), (0.97, 0.008), (1.0, 0.006)]
    T = [(0, 0.0), (0.008, 0.006), (0.05, 0.013), (0.12, 0.022), (0.2, 0.033), (0.3, 0.044), (0.4, 0.05), (0.5, 0.05),
         (0.6, 0.046), (0.7, 0.04), (0.8, 0.031), (0.9, 0.021), (0.97, 0.012), (1.0, 0.008)]
    B = [(0, 0.0), (0.008, 0.009), (0.05, 0.024), (0.12, 0.038), (0.25, 0.054), (0.35, 0.057), (0.45, 0.051),
         (0.55, 0.044), (0.65, 0.035), (0.75, 0.027), (0.85, 0.019), (0.92, 0.014), (1.0, 0.008)]
    N = [(0, 2.8), (0.2, 2.5), (0.35, 2.1), (0.7, 2.0), (0.85, 2.2), (1.0, 2.4)]

    def mouth(s):
        return -0.004 + 0.01 * min(max(s, 0) / 0.2, 1.0) ** 1.6

    def disp(s, th, x, y):
        sn = math.sin(th)
        if 0.015 < s < 0.17 and sn > 0:
            y += 0.0025 * gauss(x, 0.006) * math.sin(math.pi * (s - 0.015) / 0.155)
        if 0.15 < s < 0.21 and sn > 0:
            y += 0.004 * gauss(x, 0.012) * math.sin(math.pi * (s - 0.15) / 0.06)
        if 0.02 < s < 0.47 and sn < -0.25:
            y += 0.0012 * math.sin(math.pi * (s - 0.02) / 0.45) ** 0.5 * (0.5 + 0.5 * math.cos(th * 70))
        if s < 0.2 and abs(y - mouth(s)) < 0.0025 and abs(math.cos(th)) > 0.3:
            x *= 0.965
        return x, y

    parts = [loft("body", W, T, B, N, rings=130, segs=72, displace=disp)]
    rs = 0.28
    rx, ry, rz = table(W, rs) * 0.92, -table(B, rs) * 0.45, 0.5 - rs
    flip = [(0, 0.016), (0.03, 0.02), (0.07, 0.015), (0.11, 0.006), (0.13, 0.0), (0.1, -0.004), (0.05, -0.01), (0, -0.014)]
    sw, dr = math.radians(35), math.radians(25)
    for sd in (1, -1):
        parts.append(fin("flip", flip, lambda u, v, sd=sd: (sd * (rx + u * math.cos(sw) * math.cos(dr)), ry - u * math.sin(dr), rz - u * math.sin(sw) + v), 0.004))
    ds = 0.76
    parts.append(fin("dorsal", [(0, 0.014), (0.007, 0.004), (0.011, -0.006), (0.009, -0.007), (0, -0.012)],
                     lambda u, v: (0, table(T, ds) - 0.001 + u, 0.5 - ds + v), 0.003))
    half = [(0, 0.035), (0.04, 0.03), (0.09, 0.012), (0.13, -0.022), (0.118, -0.03), (0.07, -0.02), (0.02, -0.012), (0, -0.018)]
    for sd in (1, -1):
        parts.append(fin("fluke", half, lambda u, v, sd=sd: (sd * u, 0, -0.488 + v), 0.005))
    top, belly, mottle, pale, groove, dark = (srgb(h) for h in ("#56718b", "#9fb4c4", "#8ea9bf", "#c4d3dc", "#6b8196", "#1d252c"))

    def paint(x, y, z):
        s = 0.5 - z
        c = top.lerp(belly, clamp01((0.004 - y) / 0.03))
        if fbm(x, y, z, 90) > 0.35:
            c = c.lerp(mottle, 0.55)
        if s < 0.45 and abs(x) > 0.065:
            c = c.lerp(pale, 0.5)
        if 0.02 < s < 0.47 and y < -0.02 and math.cos(math.atan2(y, x) * 70) < -0.4:
            c = c.lerp(groove, 0.6)
        if s < 0.2 and abs(y - mouth(s)) < 0.0012 and abs(x) > 0.01:
            c = dark
        if abs(s - 0.2) < 0.004 and abs(y - (mouth(0.2) + 0.004)) < 0.003 and abs(x) > 0.05:
            c = dark
        return c
    return parts, paint


# ---------------------------------------------------------------- Humpback whale
# Stout rorqual. Flippers up to ⅓ of length with scalloped leading edges; knobbly tubercles on the head;
# 14-35 broad throat pleats; small dorsal on a hump at ~0.64; flukes span ~0.32 with a serrated trailing edge.
def humpback():
    W = [(0, 0), (0.01, 0.02), (0.04, 0.045), (0.1, 0.07), (0.2, 0.095), (0.3, 0.11), (0.4, 0.115), (0.5, 0.11),
         (0.6, 0.095), (0.7, 0.072), (0.8, 0.045), (0.88, 0.025), (0.95, 0.014), (1, 0.01)]
    T = [(0, 0), (0.01, 0.01), (0.06, 0.03), (0.15, 0.055), (0.25, 0.075), (0.35, 0.09), (0.45, 0.1), (0.55, 0.1),
         (0.65, 0.09), (0.75, 0.07), (0.85, 0.045), (0.93, 0.03), (1, 0.02)]
    B = [(0, 0), (0.01, 0.012), (0.06, 0.04), (0.15, 0.07), (0.28, 0.1), (0.38, 0.11), (0.48, 0.1), (0.6, 0.085),
         (0.72, 0.065), (0.85, 0.04), (0.93, 0.028), (1, 0.018)]
    N = [(0, 2.4), (0.25, 2.1), (0.6, 2.0), (0.85, 2.2), (1, 2.4)]

    def knob(s, x):
        a = 0.5 + 0.5 * math.cos(s * 2 * math.pi / 0.022)
        b = 0.5 + 0.5 * math.cos(x * 2 * math.pi / 0.02)
        return (a * b) ** 6

    def disp(s, th, x, y):
        sn = math.sin(th)
        if s < 0.2 and sn > 0.3 and abs(x) < 0.05:
            y += 0.004 * knob(s, x) * (1 - s / 0.2)
        if s < 0.18 and sn < -0.2 and abs(x) > 0.02:
            y -= 0.003 * knob(s + 0.011, x)
        if 0.02 < s < 0.5 and sn < -0.3:
            y += 0.0025 * math.sin(math.pi * (s - 0.02) / 0.48) ** 0.5 * (0.5 + 0.5 * math.cos(th * 36))
        return x, y

    parts = [loft("body", W, T, B, N, rings=120, segs=72, displace=disp)]
    rs = 0.3
    rx, ry, rz = table(W, rs) * 0.85, -table(B, rs) * 0.5, 0.5 - rs
    lead = [(0.3 * i / 10, 0.045 * (1 - i / 10) ** 0.6 + 0.004 * math.cos(i * math.pi) * (i > 0)) for i in range(11)]
    trail = [(0.3 * i / 10, -0.012 * (1 - i / 10) ** 0.8) for i in range(10, -1, -1)]
    flip = lead + trail
    sw, dr = math.radians(40), math.radians(32)
    for sd in (1, -1):
        parts.append(fin("flip", flip, lambda u, v, sd=sd: (sd * (rx + u * math.cos(sw) * math.cos(dr)), ry - u * math.sin(dr), rz - u * math.sin(sw) + v), 0.008))
    ds = 0.64
    parts.append(fin("dorsal", [(0, 0.03), (0.012, 0.012), (0.02, -0.005), (0.016, -0.01), (0, -0.03)],
                     lambda u, v: (0, table(T, ds) - 0.003 + u, 0.5 - ds + v), 0.005))
    half = [(0, 0.05), (0.06, 0.04), (0.12, 0.015), (0.16, -0.03), (0.15, -0.038)]
    for i in range(1, 9):
        u = 0.15 - i * 0.0185
        half.append((u, -0.03 + 0.01 * (i / 9) - (0.006 if i % 2 else 0)))
    half.append((0, -0.022))
    for sd in (1, -1):
        parts.append(fin("fluke", half, lambda u, v, sd=sd: (sd * u, 0, -0.485 + v), 0.008))
    black, white, grey = srgb("#23282e"), srgb("#e8ecee"), srgb("#5b646c")

    def paint(x, y, z):
        s = 0.5 - z
        # Belly white varies by individual population; here mid: white throat and belly, dark flanks.
        c = black.lerp(white, smooth(-0.02, -0.07, y) * clamp01(1 - (s - 0.55) * 4))
        if s < 0.62 and abs(x) > table(W, min(max(s, 0), 1)) * 1.04 + 0.004:
            c = white.lerp(grey, clamp01(fbm(x, y, z, 60)) * 0.5)
        if s > 0.97 and y < 0:
            c = c.lerp(white, smooth(0.1, 0.4, fbm(x, y, z, 50)))
        if 0.02 < s < 0.5 and y < -0.04 and math.cos(math.atan2(y, x) * 36) < -0.5:
            c = c.lerp(grey, 0.5)
        if abs(s - 0.2) < 0.005 and abs(y) < 0.006 and abs(x) > 0.08:
            c = srgb("#0c0e10")
        return c
    return parts, paint


# ---------------------------------------------------------------- Sperm whale
# Head ≈ ⅓ of length, boxy, blunt; narrow underslung lower jaw; wrinkled skin behind the head;
# low dorsal hump at ~0.64 with knuckles behind it; small paddle flippers; triangular flukes, span ~0.25.
def sperm():
    W = [(0, 0.0), (0.005, 0.045), (0.02, 0.07), (0.08, 0.085), (0.2, 0.09), (0.33, 0.093), (0.45, 0.09), (0.55, 0.082),
         (0.65, 0.068), (0.75, 0.05), (0.85, 0.03), (0.92, 0.018), (1, 0.01)]
    T = [(0, 0.0), (0.005, 0.055), (0.02, 0.082), (0.1, 0.095), (0.25, 0.098), (0.33, 0.092), (0.45, 0.083),
         (0.6, 0.073), (0.7, 0.062), (0.8, 0.045), (0.9, 0.03), (1, 0.02)]
    B = [(0, 0.0), (0.005, 0.045), (0.03, 0.08), (0.15, 0.097), (0.33, 0.1), (0.45, 0.095), (0.6, 0.08),
         (0.72, 0.06), (0.85, 0.04), (0.93, 0.028), (1, 0.018)]
    N = [(0, 3.4), (0.3, 3.0), (0.4, 2.3), (0.8, 2.1), (1, 2.3)]

    def disp(s, th, x, y):
        r = 1.0
        if s > 0.34:
            r += 0.006 * math.sin(s * 430 + math.sin(th * 3 + s * 40) * 3) * smooth(0.34, 0.45, s) * (0.6 + 0.4 * math.sin(th * 5 + s * 70))
        for k in range(5):
            ks = 0.7 + k * 0.035
            if abs(s - ks) < 0.012 and math.sin(th) > 0.7:
                y += 0.006 * (1 - k * 0.15) * math.cos((s - ks) / 0.012 * math.pi / 2) * gauss(x, 0.012)
        return x * r, y * r

    parts = [loft("body", W, T, B, N, rings=120, segs=72, displace=disp)]
    jaw = [(0, -0.058 - i * 0.004, 0.5 - 0.03 - i * 0.03) for i in range(10)]
    for i, p in enumerate(jaw):
        s = 0.5 - p[2]
        jaw[i] = (0, -table(B, s) * 0.95 + 0.004, p[2])
    parts.append(tube("jaw", jaw, [0.008 + 0.006 * i / 9 for i in range(10)], segs=10))
    ds = 0.64
    parts.append(fin("hump", [(0, 0.04), (0.018, 0.01), (0.022, -0.01), (0, -0.04)],
                     lambda u, v: (0, table(T, ds) - 0.006 + u, 0.5 - ds + v), 0.012))
    rs = 0.36
    rx, ry, rz = table(W, rs) * 0.9, -table(B, rs) * 0.55, 0.5 - rs
    flip = [(0, 0.015), (0.04, 0.016), (0.075, 0.006), (0.08, -0.004), (0.05, -0.012), (0, -0.014)]
    sw, dr = math.radians(30), math.radians(30)
    for sd in (1, -1):
        parts.append(fin("flip", flip, lambda u, v, sd=sd: (sd * (rx + u * math.cos(sw) * math.cos(dr)), ry - u * math.sin(dr), rz - u * math.sin(sw) + v), 0.006))
    half = [(0, 0.05), (0.07, 0.03), (0.125, 0.0), (0.12, -0.012), (0.06, -0.014), (0, -0.02)]
    for sd in (1, -1):
        parts.append(fin("fluke", half, lambda u, v, sd=sd: (sd * u, 0, -0.485 + v), 0.008))
    skin, pale, lips = srgb("#4a4648"), srgb("#8a8486"), srgb("#e6e2de")

    def paint(x, y, z):
        s = 0.5 - z
        c = skin.lerp(pale, 0.25 * clamp01(fbm(x, y, z, 40) + 0.3))
        if s < 0.34 and y < -0.06 and abs(x) < 0.03:
            c = lips
        if s < 0.33 and y < -0.075:
            c = c.lerp(lips, 0.35)
        if s < 0.02 and y > 0.06 and x < -0.02:
            c = srgb("#1a1818")
        if abs(s - 0.3) < 0.005 and abs(y + 0.05) < 0.006 and abs(x) > 0.07:
            c = srgb("#0e0d0d")
        return c
    return parts, paint


# ---------------------------------------------------------------- Orca
# Stout dolphin. Tall dorsal (adult male up to ~0.2 of length) near mid-body; large rounded paddle flippers;
# white eye patch, chin/belly patch with flank lobe behind the dorsal, grey saddle; flukes span ~0.25.
def orca():
    W = [(0, 0), (0.01, 0.03), (0.05, 0.06), (0.12, 0.085), (0.25, 0.105), (0.4, 0.11), (0.5, 0.105), (0.6, 0.09),
         (0.7, 0.07), (0.8, 0.045), (0.88, 0.028), (0.95, 0.016), (1, 0.012)]
    T = [(0, 0), (0.01, 0.02), (0.05, 0.05), (0.12, 0.075), (0.25, 0.095), (0.4, 0.105), (0.55, 0.1), (0.65, 0.085),
         (0.75, 0.065), (0.85, 0.045), (0.93, 0.032), (1, 0.024)]
    B = [(0, 0), (0.01, 0.025), (0.05, 0.055), (0.12, 0.08), (0.25, 0.1), (0.4, 0.105), (0.55, 0.095), (0.7, 0.07),
         (0.82, 0.045), (0.92, 0.03), (1, 0.02)]
    N = [(0, 2.0), (1, 2.0)]
    parts = [loft("body", W, T, B, N, rings=110, segs=64)]
    ds = 0.4
    parts.append(fin("dorsal", [(0, 0.06), (0.1, 0.02), (0.2, -0.005), (0.195, -0.012), (0.09, -0.03), (0, -0.06)],
                     lambda u, v: (0, table(T, ds) - 0.004 + u, 0.5 - ds + v), 0.012))
    rs = 0.22
    rx, ry, rz = table(W, rs) * 0.85, -table(B, rs) * 0.55, 0.5 - rs
    flip = [(0, 0.03), (0.05, 0.04), (0.11, 0.035), (0.15, 0.015), (0.155, -0.01), (0.12, -0.03), (0.06, -0.035), (0, -0.025)]
    sw, dr = math.radians(25), math.radians(30)
    for sd in (1, -1):
        parts.append(fin("flip", flip, lambda u, v, sd=sd: (sd * (rx + u * math.cos(sw) * math.cos(dr)), ry - u * math.sin(dr), rz - u * math.sin(sw) + v), 0.01))
    half = [(0, 0.05), (0.06, 0.035), (0.12, 0.0), (0.125, -0.014), (0.07, -0.012), (0, -0.02)]
    for sd in (1, -1):
        parts.append(fin("fluke", half, lambda u, v, sd=sd: (sd * u, 0, -0.485 + v), 0.008))
    black, white, grey = srgb("#0f1215"), srgb("#f3f5f6"), srgb("#8a929a")

    def paint(x, y, z):
        s = 0.5 - z
        if s > 1.0 or abs(x) > 0.13:
            return black
        ex, ey = (s - 0.15) / 0.04, (y - 0.035) / 0.014
        if abs(x) > 0.045 and ex * ex + ey * ey < 1:
            return white
        belly = -0.035 if s < 0.5 else -0.035 + 0.075 * math.sin(clamp01((s - 0.5) / 0.22) * math.pi)
        if y < belly and s < 0.72 and abs(x) < (0.11 if s > 0.5 else 0.06 + 0.2 * s):
            return white
        if y > 0.07 and 0.45 < s < 0.56 and abs(x) < 0.045 * math.sin(math.pi * (s - 0.45) / 0.11):
            return black.lerp(grey, 0.7)
        if abs(s - 0.13) < 0.004 and abs(y - 0.012) < 0.004 and abs(x) > 0.06:
            return srgb("#050505")
        return black
    return parts, paint


# ---------------------------------------------------------------- Great white shark
# Conical snout, torpedo body (max depth ~0.2), lateral keels on the tail stock, five gill slits, first
# dorsal ~0.1 tall at ~0.38, long pectorals ~0.2, nearly symmetric lunate caudal ~0.3 tall.
def whiteshark():
    Z1 = -0.3
    W = [(0, 0), (0.01, 0.01), (0.05, 0.026), (0.12, 0.045), (0.25, 0.066), (0.4, 0.075), (0.55, 0.068),
         (0.7, 0.045), (0.85, 0.024), (0.95, 0.018), (1, 0.015)]
    T = [(0, 0), (0.01, 0.009), (0.05, 0.026), (0.12, 0.048), (0.25, 0.075), (0.4, 0.088), (0.55, 0.08), (0.7, 0.052),
         (0.85, 0.03), (1, 0.018)]
    B = [(0, 0), (0.01, 0.01), (0.05, 0.028), (0.12, 0.05), (0.25, 0.072), (0.4, 0.078), (0.55, 0.068), (0.7, 0.043),
         (0.85, 0.026), (1, 0.018)]
    N = [(0, 2.3), (0.3, 2.0), (1, 2.0)]

    def zs(sl):  # loft station → total-length station
        return sl * (0.5 - Z1)

    def disp(s, th, x, y):
        st = zs(s)
        if s > 0.82 and abs(math.sin(th)) < 0.25:
            x += math.copysign(0.008 * smooth(0.82, 0.92, s), x)
        for k in range(5):
            if abs(st - (0.2 + k * 0.018)) < 0.0022 and abs(math.cos(th)) > 0.55 and abs(y) < 0.045:
                x *= 0.975
        return x, y

    parts = [loft("body", W, T, B, N, z0=0.5, z1=Z1, rings=110, segs=64, displace=disp)]

    def at(st):
        return st / (0.5 - Z1)
    d1 = 0.38
    parts.append(fin("d1", [(0, 0.055), (0.07, 0.02), (0.11, -0.02), (0.1, -0.03), (0.05, -0.02), (0, -0.045)],
                     lambda u, v: (0, table(T, at(d1)) - 0.004 + u, 0.5 - d1 + v), 0.008))
    parts.append(fin("d2", [(0, 0.008), (0.012, -0.004), (0.01, -0.008), (0, -0.008)],
                     lambda u, v: (0, table(T, at(0.72)) - 0.002 + u, 0.5 - 0.72 + v), 0.004))
    parts.append(fin("anal", [(0, 0.008), (0.012, -0.004), (0.01, -0.008), (0, -0.008)],
                     lambda u, v: (0, -table(B, at(0.74)) + 0.002 - u, 0.5 - 0.74 + v), 0.004))
    rs = 0.27
    rx, ry, rz = table(W, at(rs)) * 0.8, -table(B, at(rs)) * 0.55, 0.5 - rs
    pec = [(0, 0.04), (0.08, 0.02), (0.17, -0.03), (0.2, -0.06), (0.17, -0.055), (0.07, -0.03), (0, -0.03)]
    sw, dr = math.radians(20), math.radians(22)
    for sd in (1, -1):
        parts.append(fin("pec", pec, lambda u, v, sd=sd: (sd * (rx + u * math.cos(sw) * math.cos(dr)), ry - u * math.sin(dr), rz - u * math.sin(sw) + v), 0.007))
        parts.append(fin("pelvic", [(0, 0.012), (0.03, -0.01), (0.02, -0.018), (0, -0.012)],
                         lambda u, v, sd=sd: (sd * (0.03 + u * 0.7), -table(B, at(0.58)) * 0.8 - u * 0.7, 0.5 - 0.58 + v), 0.004))
    caud = [(0.0, 0.0), (0.16, -0.1), (0.175, -0.13), (0.14, -0.12), (0.03, -0.05), (-0.03, -0.05), (-0.13, -0.115),
            (-0.15, -0.125), (-0.14, -0.1), (0.0, 0.0)]
    parts.append(fin("caudal", caud[:-1], lambda u, v: (0, u, Z1 + 0.035 + v * 1.4), 0.008, root=0.0))
    top, belly = srgb("#6a7682"), srgb("#f1f2f0")

    def paint(x, y, z):
        st = 0.5 - z
        line = -0.012 + 0.01 * math.sin(st * 34) + 0.006 * math.sin(st * 91)
        c = belly if y < line else top
        if 0.19 < st < 0.28 and abs(x) > 0.05 and abs(y) < 0.045:
            for k in range(5):
                if abs(st - (0.2 + k * 0.018)) < 0.0025:
                    c = srgb("#2a3038")
        if st < 0.12 and y < -0.02 and abs(x) < 0.05 and st > 0.05:
            c = srgb("#3a2a2c")
        if abs(st - 0.085) < 0.004 and abs(y - 0.012) < 0.004 and abs(x) > 0.03:
            c = srgb("#050505")
        if abs(x) > 0.16 and y < -0.07:
            c = srgb("#20262c")
        return c
    return parts, paint


# ---------------------------------------------------------------- Whale shark
# Broad flat head with a wide terminal mouth, three ridges along each flank, first dorsal at ~0.5,
# heterocercal tail (upper lobe larger). Checkerboard of pale spots and stripes; white belly.
def whaleshark():
    Z1 = -0.28
    W = [(0, 0.0), (0.004, 0.05), (0.03, 0.078), (0.1, 0.09), (0.25, 0.1), (0.4, 0.1), (0.55, 0.085), (0.7, 0.06),
         (0.85, 0.035), (1, 0.022)]
    T = [(0, 0), (0.004, 0.02), (0.03, 0.035), (0.1, 0.055), (0.25, 0.08), (0.4, 0.09), (0.55, 0.08), (0.7, 0.06),
         (0.85, 0.04), (1, 0.03)]
    B = [(0, 0), (0.004, 0.02), (0.03, 0.035), (0.1, 0.05), (0.25, 0.07), (0.4, 0.075), (0.55, 0.065), (0.7, 0.05),
         (0.85, 0.035), (1, 0.025)]
    N = [(0, 3.0), (0.2, 2.5), (0.5, 2.2), (1, 2.2)]

    def disp(s, th, x, y):
        if 0.12 < s < 0.92:
            for a in (0.45, 0.95, 1.4):
                for sgn in (1, -1):
                    ang = math.pi / 2 - a if sgn > 0 else math.pi / 2 + a
                    d = (th - ang + math.pi) % (2 * math.pi) - math.pi
                    if abs(d) < 0.08:
                        k = 1 + 0.05 * math.cos(d / 0.08 * math.pi / 2) * math.sin(math.pi * (s - 0.12) / 0.8)
                        x, y = x * k, y * k
        return x, y

    parts = [loft("body", W, T, B, N, z0=0.5, z1=Z1, rings=110, segs=80, displace=disp)]

    def at(st):
        return st / (0.5 - Z1)
    parts.append(fin("d1", [(0, 0.05), (0.08, 0.0), (0.085, -0.02), (0.0, -0.05)],
                     lambda u, v: (0, table(T, at(0.5)) - 0.004 + u, 0.5 - 0.5 + v), 0.009))
    parts.append(fin("d2", [(0, 0.015), (0.025, -0.005), (0.02, -0.012), (0, -0.015)],
                     lambda u, v: (0, table(T, at(0.68)) - 0.003 + u, 0.5 - 0.68 + v), 0.005))
    rs = 0.26
    rx, ry, rz = table(W, at(rs)) * 0.85, -table(B, at(rs)) * 0.5, 0.5 - rs
    pec = [(0, 0.05), (0.1, 0.01), (0.17, -0.03), (0.15, -0.05), (0.06, -0.04), (0, -0.03)]
    sw, dr = math.radians(25), math.radians(15)
    for sd in (1, -1):
        parts.append(fin("pec", pec, lambda u, v, sd=sd: (sd * (rx + u * math.cos(sw) * math.cos(dr)), ry - u * math.sin(dr), rz - u * math.sin(sw) + v), 0.009))
    caud = [(0.02, 0.0), (0.2, -0.12), (0.22, -0.16), (0.17, -0.12), (0.03, -0.06), (-0.03, -0.06), (-0.1, -0.1),
            (-0.12, -0.11), (-0.1, -0.08), (-0.02, 0.0)]
    parts.append(fin("caudal", caud, lambda u, v: (0, u, Z1 + 0.035 + v * 1.4), 0.01, root=0.0))
    top, belly, spot = srgb("#3b5068"), srgb("#e9ecee"), srgb("#e2ebf1")

    def paint(x, y, z):
        st = 0.5 - z
        c = belly if y < -0.03 + 0.01 * math.sin(st * 20) else top
        if c is top:
            u, v = st * 26, math.atan2(y, abs(x) + 1e-6) * 4.5
            fu, fv = u - math.floor(u) - 0.5, v - math.floor(v) - 0.5
            if st > 0.12 and (fu * fu + fv * fv) < 0.045:
                c = spot
            elif st < 0.12 and ((st * 70) % 1 - 0.5) ** 2 + ((x * 70) % 1 - 0.5) ** 2 < 0.04:
                c = spot
            elif 0.15 < st < 0.7 and (st * 13) % 1 < 0.035:
                c = spot.lerp(top, 0.3)
        if st < 0.008 and abs(y + 0.004) < 0.006:
            c = srgb("#12181f")
        if abs(st - 0.05) < 0.003 and abs(y - 0.01) < 0.004 and abs(x) > 0.07:
            c = srgb("#0a0a0a")
        return c
    return parts, paint


# ---------------------------------------------------------------- Ocean sunfish
# Tall, flat, truncated disc: body depth ≈ 0.75 of length, fin-tip span ≈ 1.25; the tail is replaced by a
# scalloped clavus; tall dorsal and anal fins set far back; tiny round mouth; small pectorals.
def mola():
    Z1 = -0.38
    W = [(0, 0.02), (0.03, 0.05), (0.15, 0.085), (0.4, 0.105), (0.65, 0.095), (0.85, 0.07), (1, 0.05)]
    T = [(0, 0.03), (0.03, 0.08), (0.15, 0.24), (0.35, 0.35), (0.55, 0.37), (0.75, 0.34), (0.92, 0.29), (1, 0.27)]
    B = [(0, 0.03), (0.03, 0.07), (0.15, 0.21), (0.35, 0.33), (0.55, 0.36), (0.75, 0.33), (0.92, 0.28), (1, 0.26)]
    N = [(0, 2.0), (1, 2.0)]
    parts = [loft("body", W, T, B, N, z0=0.5, z1=Z1, rings=90, segs=72)]
    dz = 0.5 - 0.62
    parts.append(fin("dorsal", [(0, 0.1), (0.14, 0.0), (0.27, -0.07), (0.29, -0.1), (0.2, -0.1), (0, -0.07)],
                     lambda u, v: (0, 0.33 + u, dz + v), 0.02))
    parts.append(fin("anal", [(0, 0.1), (0.14, 0.0), (0.27, -0.07), (0.29, -0.1), (0.2, -0.1), (0, -0.07)],
                     lambda u, v: (0, -0.32 - u, dz + v), 0.02))
    clav = [(0.28, 0.0)]
    for i in range(13):
        yy = 0.28 - i * (0.56 / 12)
        clav.append((yy, -0.1 - (0.025 if i % 2 else 0.0)))
    clav.append((-0.28, 0.0))
    parts.append(fin("clavus", clav, lambda u, v: (0, u, Z1 + 0.02 + v), 0.02))
    for sd in (1, -1):
        parts.append(fin("pec", [(0, 0.03), (0.05, 0.02), (0.07, 0.0), (0.05, -0.02), (0, -0.025)],
                         lambda u, v, sd=sd: (sd * (0.07 + u * 0.3), 0.04 + v * 0.8, 0.5 - 0.3 - u * 0.9), 0.008))
    parts.append(sphere("mouth", 0, 0.01, 0.505, 0.018, sz=0.6))
    for sd in (1, -1):
        parts.append(sphere("eye", sd * 0.05, 0.08, 0.5 - 0.12, 0.02, sx=0.5))
    base, pale, finc = srgb("#98a5ae"), srgb("#dfe4e5"), srgb("#6c7983")

    def paint(x, y, z):
        c = base.lerp(pale, smooth(0.05, -0.25, y))
        if fbm(x, y, z, 25) > 0.4:
            c = c.lerp(pale, 0.4)
        if abs(y) > 0.36 or z < Z1 + 0.03:
            c = finc
        if z > 0.49 and abs(y - 0.01) < 0.02 and abs(x) < 0.02:
            c = srgb("#2e3438")
        if abs(z - 0.38) < 0.02 and abs(y - 0.08) < 0.02 and abs(x) > 0.04:
            c = srgb("#15181b")
        return c
    return parts, paint


# ---------------------------------------------------------------- Manta ray (normalised by wingspan)
# Disc length ≈ 0.45 of span, swept pointed wings, cephalic lobes either side of a wide terminal mouth,
# short whip tail; black back with pale shoulder chevrons, white belly with dark spots near the gills.
def manta():
    W = [(0, 0.07), (0.04, 0.1), (0.15, 0.26), (0.3, 0.42), (0.42, 0.5), (0.5, 0.44), (0.6, 0.26), (0.72, 0.12),
         (0.85, 0.06), (1, 0.02)]
    T = [(0, 0.012), (0.1, 0.03), (0.3, 0.045), (0.5, 0.045), (0.7, 0.035), (0.9, 0.02), (1, 0.01)]
    B = [(0, 0.01), (0.1, 0.02), (0.3, 0.03), (0.5, 0.03), (0.7, 0.025), (0.9, 0.015), (1, 0.008)]
    N = [(0, 2.0), (1, 2.0)]
    parts = [loft("disc", W, T, B, N, z0=0.2, z1=-0.25, rings=70, segs=120)]
    for sd in (1, -1):
        parts.append(fin("ceph", [(0, 0.02), (0.02, 0.03), (0.03, 0.0), (0.02, -0.03), (0, -0.02)],
                         lambda u, v, sd=sd: (sd * (0.06 + u * 0.5), -0.005 - u * 0.4, 0.2 + 0.035 + v * 0.1 + u * 1.5), 0.006, subdiv=1))
    parts.append(tube("tail", [(0, 0.0, -0.24 - i * 0.03) for i in range(10)], [0.006 * (1 - i / 10) + 0.001 for i in range(10)], segs=6))
    for sd in (1, -1):
        parts.append(sphere("eye", sd * 0.075, 0.005, 0.2, 0.008))
    black, white, pale = srgb("#1c2126"), srgb("#eef1f2"), srgb("#b4bfc5")

    def paint(x, y, z):
        if y >= 0:
            s = (0.2 - z) / 0.45
            ax = abs(x)
            if 0.08 < s < 0.3 and 0.05 < ax < 0.2 and abs((s - 0.08) - (ax - 0.05) * 0.9) < 0.05:
                return pale
            return black
        c = white
        if -0.05 < z < 0.1 and abs(x) < 0.1 and fbm(x, y, z, 60) > 0.5:
            c = srgb("#2c3238")
        if abs(x) > 0.46:
            c = c.lerp(black, 0.6)
        return c
    return parts, paint


# ---------------------------------------------------------------- Giant squid (normalised by total length)
# Mantle ≈ 0.2 of total, rhombic fins at its tip, eyes ~0.02 across, 8 arms ≈ 0.2, two feeding tentacles
# reaching the full length with clubs at their ends.
def squid():
    W = [(0, 0.001), (0.05, 0.012), (0.3, 0.03), (0.6, 0.036), (0.8, 0.03), (0.86, 0.022), (0.93, 0.034), (1, 0.026)]
    N = [(0, 2.0), (1, 2.0)]
    parts = [loft("mantle", W, W, W, N, z0=0.5, z1=0.22, rings=80, segs=36)]
    for sd in (1, -1):
        parts.append(fin("fin", [(0, 0.08), (0.04, 0.035), (0.0, 0.0)], lambda u, v, sd=sd: (sd * (0.005 + u), 0.0, 0.42 + v), 0.003, subdiv=1))
        parts.append(sphere("eye", sd * 0.03, 0.006, 0.255, 0.011, sx=0.6))
        parts.append(sphere("pupil", sd * 0.037, 0.006, 0.255, 0.006, sx=0.5))
    for k in range(8):
        a = k / 8 * 2 * math.pi
        bx, by = math.cos(a) * 0.017, math.sin(a) * 0.017
        n = 14
        pts = [(bx * (1 + i * 0.12) + math.sin(i * 0.5 + k) * 0.004 * i / n, by * (1 + i * 0.12) + math.cos(i * 0.4 + k) * 0.004 * i / n,
                0.22 - 0.2 * i / (n - 1)) for i in range(n)]
        parts.append(tube("arm", pts, [0.0065 * (1 - i / n) + 0.0006 for i in range(n)], segs=6))
    for sd in (1, -1):
        n = 30
        pts = [(sd * 0.008 + sd * 0.004 * math.sin(i * 0.3), -0.006 + 0.004 * math.cos(i * 0.25), 0.22 - 0.72 * i / (n - 1)) for i in range(n)]
        radii = [0.0035 if i < n - 6 else 0.0035 + 0.004 * math.sin((i - (n - 6)) / 6 * math.pi) for i in range(n)]
        parts.append(tube("tentacle", pts, radii, segs=6))
    red, pale = srgb("#8e2d24"), srgb("#d98b72")

    def paint(x, y, z):
        c = red.lerp(pale, smooth(0.0, -0.03, y) * 0.5)
        if z < 0.22:
            c = c.lerp(pale, 0.3)
        if fbm(x, y, z, 160) > 0.55:
            c = c * 0.75
        if abs(z - 0.255) < 0.012 and abs(abs(x) - 0.037) < 0.004:
            c = srgb("#0a0a0a")
        elif abs(z - 0.255) < 0.013 and abs(abs(x) - 0.03) < 0.01 and abs(y - 0.006) < 0.013:
            c = srgb("#e3dcbc")
        return c
    return parts, paint


SPECIES = {"blue": blue, "humpback": humpback, "sperm": sperm, "orca": orca, "whiteshark": whiteshark,
           "whaleshark": whaleshark, "mola": mola, "manta": manta, "squid": squid}

os.makedirs(OUT_DIR, exist_ok=True)
for key, fn in SPECIES.items():
    if ONLY and key not in ONLY:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    parts, paint = fn()
    assemble(key, parts, paint, os.path.join(OUT_DIR, f"{key}.glb"))
