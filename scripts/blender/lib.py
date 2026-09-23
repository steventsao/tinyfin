"""
Shared Blender helpers for the tinyfin creature models.

Game axes throughout: +z = forward (snout), +y = up, x = side. `gl()` maps them to Blender axes so the
glTF exporter's Y-up conversion lands them back. Every model is normalised to a length (or span) of 1;
the game scales each instance to its real size.
"""
import math

import bmesh
import bpy
from mathutils import Vector, noise


def gl(x, y, z):
    return Vector((x, -z, y))


def ungl(v):
    return v.x, v.z, -v.y


def table(tab, s):
    """Smooth piecewise interpolation of a [(s, value), ...] table."""
    if s <= tab[0][0]:
        return tab[0][1]
    for (s0, v0), (s1, v1) in zip(tab, tab[1:]):
        if s0 <= s <= s1:
            t = (s - s0) / (s1 - s0) if s1 > s0 else 0.0
            t = t * t * (3 - 2 * t)
            return v0 + (v1 - v0) * t
    return tab[-1][1]


def srgb(h):
    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    return Vector([lin(int(h[i:i + 2], 16) / 255) for i in (1, 3, 5)])


def fbm(x, y, z, f=1.0):
    return noise.noise(Vector((x * f, y * f, z * f))) + 0.5 * noise.noise(Vector((x * f * 2.1 + 5, y * f * 2.1, z * f * 2.1)))


def mesh_obj(name, bm):
    me = bpy.data.meshes.new(name)
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    return bpy.data.objects.new(name, me)


def loft(name, W, T, B, N, z0=0.5, z1=-0.5, rings=110, segs=64, Y=None, displace=None, cap=True):
    """
    Body of revolution with a superellipse cross-section that changes along the length.
    Station s runs 0 (front, z0) → 1 (back, z1). W = half-width, T = height above the centreline,
    B = depth below it, N = superellipse exponent (2 = ellipse, higher = boxier), Y = centreline offset.
    displace(s, th, x, y) → (x, y) adds ridges, grooves and bumps.
    """
    bm = bmesh.new()
    grid = []
    for i in range(rings + 1):
        s = min(0.999, (i / rings) ** 1.1 * 0.998 + 0.001)
        z = z0 + (z1 - z0) * s
        w, ht, hb, n = table(W, s), table(T, s), table(B, s), table(N, s)
        yc = table(Y, s) if Y else 0.0
        row = []
        for j in range(segs):
            th = j / segs * 2 * math.pi
            c, sn = math.cos(th), math.sin(th)
            x = w * math.copysign(abs(c) ** (2 / n), c)
            y = (ht if sn > 0 else hb) * math.copysign(abs(sn) ** (2 / n), sn)
            if displace:
                x, y = displace(s, th, x, y)
            row.append(bm.verts.new(gl(x, y + yc, z)))
        grid.append(row)
    for i in range(rings):
        for j in range(segs):
            bm.faces.new((grid[i][j], grid[i + 1][j], grid[i + 1][(j + 1) % segs], grid[i][(j + 1) % segs]))
    if cap:
        yc0 = table(Y, 0) if Y else 0.0
        yc1 = table(Y, 1) if Y else 0.0
        a = bm.verts.new(gl(0, yc0, z0 + (z0 - z1) * 0.002))
        b = bm.verts.new(gl(0, yc1, z1 - (z0 - z1) * 0.001))
        for j in range(segs):
            bm.faces.new((a, grid[0][(j + 1) % segs], grid[0][j]))
            bm.faces.new((b, grid[-1][j], grid[-1][(j + 1) % segs]))
    return mesh_obj(name, bm)


def catmull(pts, per=8):
    """Closed Catmull-Rom through the outline points: smooth, and unlike subdivision it doesn't shrink."""
    out = []
    n = len(pts)
    for i in range(n):
        p0, p1, p2, p3 = (Vector(pts[(i + k) % n]) for k in (-1, 0, 1, 2))
        for k in range(per):
            t = k / per
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    return out


def fin(name, outline, place, thickness, subdiv=2, root=0.012):
    """
    A fin from a planform outline [(u, v)] (u = 0 is the root, along the body), mapped by place(u, v) → game xyz.
    The root is pushed `root` into the body so no gap shows; the outline is smoothed by a spline, then solidified.
    """
    pts = [(u - root if u <= 1e-6 else u, v) for u, v in outline]
    pts = catmull(pts, 6 if subdiv else 1)
    bm = bmesh.new()
    vs = [bm.verts.new(gl(*place(p.x, p.y))) for p in pts]
    bm.faces.new(vs)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    ob = mesh_obj(name, bm)
    m = ob.modifiers.new("thick", "SOLIDIFY")
    m.thickness = thickness
    m.offset = 0
    return ob


def sphere(name, x, y, z, r, sx=1, sy=1, sz=1, seg=16):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=max(6, seg // 2), radius=r)
    for v in bm.verts:
        v.co = gl(v.co.x * sx + x, v.co.z * sy + y, v.co.y * sz + z)
    return mesh_obj(name, bm)


def tube(name, pts, radii, segs=6):
    """A tube along a polyline of game-space points with per-point radius (arms, tentacles)."""
    bm = bmesh.new()
    rings = []
    for i, p in enumerate(pts):
        p = Vector(p)
        d = (Vector(pts[min(i + 1, len(pts) - 1)]) - Vector(pts[max(i - 1, 0)])).normalized()
        a = Vector((0, 1, 0)) if abs(d.y) < 0.9 else Vector((1, 0, 0))
        u = d.cross(a).normalized()
        w = d.cross(u).normalized()
        ring = []
        for j in range(segs):
            t = j / segs * 2 * math.pi
            q = p + (u * math.cos(t) + w * math.sin(t)) * radii[i]
            ring.append(bm.verts.new(gl(q.x, q.y, q.z)))
        rings.append(ring)
    for i in range(len(rings) - 1):
        for j in range(segs):
            bm.faces.new((rings[i][j], rings[i][(j + 1) % segs], rings[i + 1][(j + 1) % segs], rings[i + 1][j]))
    end = bm.verts.new(gl(*pts[-1]))
    for j in range(segs):
        bm.faces.new((rings[-1][j], rings[-1][(j + 1) % segs], end))
    return mesh_obj(name, bm)


def assemble(name, parts, paint, out):
    """Apply modifiers, join, paint per-vertex colour with paint(x, y, z) → linear Vector, export Draco glb."""
    bpy.ops.object.select_all(action="DESELECT")
    col = bpy.context.scene.collection
    for p in parts:
        col.objects.link(p)
    for p in parts:
        bpy.context.view_layer.objects.active = p
        p.select_set(True)
        for m in list(p.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
        p.select_set(False)
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    bpy.ops.object.shade_smooth()
    me = ob.data
    attr = me.color_attributes.new("Color", "FLOAT_COLOR", "POINT")
    for v in me.vertices:
        c = paint(*ungl(v.co))
        attr.data[v.index].color = (c.x, c.y, c.z, 1.0)
    me.color_attributes.active_color = attr
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    kw = dict(filepath=out, export_format="GLB", use_selection=True, export_apply=True, export_yup=True,
              export_normals=True, export_materials="NONE", export_texcoords=False,
              export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=7,
              export_draco_position_quantization=14, export_draco_normal_quantization=10, export_draco_color_quantization=8)
    try:
        bpy.ops.export_scene.gltf(**kw, export_vertex_color="ACTIVE")
    except TypeError:
        bpy.ops.export_scene.gltf(**kw, export_colors=True)
    print("wrote", out, len(me.vertices), "verts")
    return ob
