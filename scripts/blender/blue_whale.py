"""
Blue whale (Balaenoptera musculus), built in Blender from measured proportions and exported as glTF.

Run:  /Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/blender/blue_whale.py -- public/models/blue_whale.glb

Units: body length = 1 (the game scales each instance to 21-30 m). Output axes are the game's:
+z = snout at z = +0.5, +y = up, x = left/right. Proportions (fractions of length, from the snout):
  head ~0.25, broad flat U-shaped rostrum with a median ridge; splash guard ~0.18;
  eye at the mouth corner ~0.2; flipper root ~0.28, flipper length ~0.13;
  throat pleats from the chin to ~0.47 (the navel); dorsal fin tiny at ~0.76;
  max depth ~0.11, max width ~0.125; tall, thin tail stock; flukes span ~0.26.
"""
import math
import sys

import bmesh
import bpy
from mathutils import Vector, noise

OUT = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "blue_whale.glb"


def lerp_table(tab, s):
    for (s0, v0), (s1, v1) in zip(tab, tab[1:]):
        if s0 <= s <= s1:
            t = (s - s0) / (s1 - s0) if s1 > s0 else 0.0
            t = t * t * (3 - 2 * t)
            return v0 + (v1 - v0) * t
    return tab[-1][1]


# Station s: 0 = snout tip, 1 = fluke notch.
HALF_WIDTH = [(0, 0.0), (0.008, 0.018), (0.03, 0.036), (0.08, 0.05), (0.15, 0.057), (0.25, 0.06), (0.35, 0.063),
              (0.45, 0.062), (0.55, 0.056), (0.65, 0.046), (0.75, 0.032), (0.85, 0.017), (0.92, 0.01), (0.97, 0.008), (1.0, 0.006)]
TOP = [(0, 0.0), (0.008, 0.006), (0.05, 0.013), (0.12, 0.022), (0.2, 0.033), (0.3, 0.044), (0.4, 0.05), (0.5, 0.05),
       (0.6, 0.046), (0.7, 0.04), (0.8, 0.031), (0.9, 0.021), (0.97, 0.012), (1.0, 0.008)]
BOTTOM = [(0, 0.0), (0.008, 0.009), (0.05, 0.024), (0.12, 0.038), (0.25, 0.054), (0.35, 0.057), (0.45, 0.051),
          (0.55, 0.044), (0.65, 0.035), (0.75, 0.027), (0.85, 0.019), (0.92, 0.014), (1.0, 0.008)]
# Superellipse exponent: boxier, flatter head; round body; laterally compressed tail stock.
EXPO = [(0, 2.8), (0.2, 2.5), (0.35, 2.1), (0.7, 2.0), (0.85, 2.2), (1.0, 2.4)]


def mouth_y(s):
    """Mouth line: from just under the snout tip, curving up and back to the eye."""
    return -0.004 + 0.01 * math.pow(min(max(s, 0.0) / 0.2, 1.0), 1.6)


def gl(x, y, z):
    """Game coords (y up, +z snout) → Blender coords, so the glTF exporter's Y-up conversion lands them back."""
    return Vector((x, -z, y))


def body_mesh():
    rings, segs = 180, 112
    bm = bmesh.new()
    grid = []
    for i in range(rings + 1):
        s = (i / rings) ** 1.15 * 0.995 + 0.0025
        z = 0.5 - s
        w, ht, hb, n = (lerp_table(HALF_WIDTH, s), lerp_table(TOP, s), lerp_table(BOTTOM, s), lerp_table(EXPO, s))
        row = []
        for j in range(segs):
            th = j / segs * 2 * math.pi
            c, sn = math.cos(th), math.sin(th)
            x = w * math.copysign(abs(c) ** (2 / n), c)
            y = (ht if sn > 0 else hb) * math.copysign(abs(sn) ** (2 / n), sn)
            # Median ridge down the rostrum.
            if 0.015 < s < 0.17 and sn > 0:
                y += 0.0025 * math.exp(-(x / 0.006) ** 2) * math.sin(math.pi * (s - 0.015) / 0.155)
            # Splash guard: a raised ridge ahead of the blowholes.
            if 0.15 < s < 0.21 and sn > 0:
                y += 0.004 * math.exp(-(x / 0.012) ** 2) * math.sin(math.pi * (s - 0.15) / 0.06)
            # Throat pleats: shallow grooves over the underside, chin to navel.
            if 0.02 < s < 0.47 and sn < -0.25:
                fade = math.sin(math.pi * (s - 0.02) / 0.45) ** 0.5
                y += 0.0012 * fade * (0.5 + 0.5 * math.cos(th * 70))
            # Mouth line: a slight crease so the ink pass draws it.
            if s < 0.2 and abs(y - mouth_y(s)) < 0.0025 and abs(c) > 0.3:
                x *= 0.965
            row.append(bm.verts.new(gl(x, y, z)))
        grid.append(row)
    for i in range(rings):
        for j in range(segs):
            a, b = grid[i][j], grid[i][(j + 1) % segs]
            c, d = grid[i + 1][(j + 1) % segs], grid[i + 1][j]
            bm.faces.new((a, d, c, b))
    # Cap the snout and the tail end.
    tip = bm.verts.new(gl(0, -0.0015, 0.5025))
    for j in range(segs):
        bm.faces.new((tip, grid[0][(j + 1) % segs], grid[0][j]))
    end = bm.verts.new(gl(0, 0, 0.5 - 1.0))
    for j in range(segs):
        bm.faces.new((end, grid[-1][j], grid[-1][(j + 1) % segs]))
    me = bpy.data.meshes.new("body")
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return bpy.data.objects.new("body", me)


def fin_obj(name, outline, place, thickness):
    """A fin from a planform outline (u = span, v = chord), given thickness and rounded by subdivision."""
    bm = bmesh.new()
    vs = [bm.verts.new(place(u, v)) for u, v in outline]
    bm.faces.new(vs)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    sol = ob.modifiers.new("thick", "SOLIDIFY")
    sol.thickness = thickness
    sol.offset = 0
    sub = ob.modifiers.new("smooth", "SUBSURF")
    sub.levels = 2
    sub.render_levels = 2
    return ob


def build():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    col = bpy.context.scene.collection
    parts = [body_mesh()]

    # Flippers: long, narrow, pointed; root at s ≈ 0.28 low on the flank, swept back ~35° and down ~25°.
    root_s = 0.28
    rz = 0.5 - root_s
    rx = lerp_table(HALF_WIDTH, root_s) * 0.92
    ry = -lerp_table(BOTTOM, root_s) * 0.45
    flip = [(0, 0.016), (0.03, 0.02), (0.07, 0.015), (0.11, 0.006), (0.13, 0.0), (0.1, -0.004), (0.05, -0.01), (0, -0.014)]
    for side in (1, -1):
        sweep, droop = math.radians(35), math.radians(25)

        def place(u, v, side=side, sweep=sweep, droop=droop):
            x = rx + u * math.cos(sweep) * math.cos(droop)
            z = rz - u * math.sin(sweep) + v
            y = ry - u * math.sin(droop)
            return gl(side * x, y, z)

        parts.append(fin_obj("flipper", flip, place, 0.004))

    # Dorsal fin: tiny and falcate, far back (s ≈ 0.76).
    ds = 0.76
    dz, dy = 0.5 - ds, lerp_table(TOP, ds) - 0.001
    dors = [(0, 0.014), (0.007, 0.004), (0.011, -0.006), (0.009, -0.007), (0, -0.012)]
    parts.append(fin_obj("dorsal", dors, lambda u, v: gl(0, dy + u, dz + v), 0.003))

    # Flukes: span ≈ 0.26, swept tips, median notch.
    fz = -0.5 + 0.012
    half = [(0, 0.035), (0.04, 0.03), (0.09, 0.012), (0.13, -0.022), (0.118, -0.03), (0.07, -0.02), (0.02, -0.012), (0, -0.018)]
    for side in (1, -1):
        parts.append(fin_obj("fluke", half, lambda u, v, side=side: gl(side * u, 0, fz + v), 0.005))

    for p in parts:
        col.objects.link(p)
    # Apply modifiers and join into one mesh.
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
        bpy.context.view_layer.objects.active = p
        for m in list(p.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
    bpy.context.view_layer.objects.active = parts[0]
    for p in parts:
        p.select_set(True)
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = "blue_whale"
    bpy.ops.object.shade_smooth()
    paint(ob.data)
    return ob


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hexcol(h):
    return Vector([srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (1, 3, 5)])


def paint(me):
    top, belly, mottle, pale, groove, mouth = (hexcol(h) for h in ("#56718b", "#9fb4c4", "#8ea9bf", "#c4d3dc", "#6b8196", "#1d252c"))
    attr = me.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
    for v in me.vertices:
        bx, by, bz = v.co
        x, y, z = bx, bz, -by  # back to game coords
        s = 0.5 - z
        c = top.lerp(belly, max(0.0, min(1.0, (0.004 - y) / 0.03)))
        # Mottling: blue whales are blotched with pale grey all over.
        m = noise.noise(Vector((x * 90, y * 90, z * 90)))
        m2 = noise.noise(Vector((x * 260 + 7, y * 260, z * 260)))
        if m + 0.4 * m2 > 0.32:
            c = c.lerp(mottle, 0.55)
        # Fins: pale undersides and tips on the flippers.
        if s < 0.45 and abs(x) > 0.065:
            c = c.lerp(pale, 0.5)
        # Pleat grooves read darker.
        if 0.02 < s < 0.47 and y < -0.02:
            th = math.atan2(y, x)
            if math.cos(th * 70) < -0.4:
                c = c.lerp(groove, 0.6)
        # Mouth line and eye.
        if s < 0.2 and abs(y - mouth_y(s)) < 0.0012 and abs(x) > 0.01:
            c = mouth
        if abs(s - 0.2) < 0.004 and abs(y - (mouth_y(0.2) + 0.004)) < 0.003 and abs(x) > 0.05:
            c = mouth
        attr.data[v.index].color = (c.x, c.y, c.z, 1.0)
    me.color_attributes.active_color = attr


ob = build()
bpy.ops.object.select_all(action="DESELECT")
ob.select_set(True)
kw = dict(filepath=OUT, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
          export_normals=True, export_materials="NONE", export_texcoords=False)
try:
    bpy.ops.export_scene.gltf(**kw, export_vertex_color="ACTIVE")
except TypeError:
    bpy.ops.export_scene.gltf(**kw, export_colors=True)
print("wrote", OUT, len(ob.data.vertices), "verts")
