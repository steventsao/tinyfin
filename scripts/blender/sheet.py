"""Side + top orthographic renders of every glb in a folder. Usage: Blender -b -P sheet.py -- models_dir out_dir"""
import sys, os, math, bpy
from mathutils import Vector
src, out = sys.argv[sys.argv.index("--") + 1:][:2]
os.makedirs(out, exist_ok=True)
for f in sorted(os.listdir(src)):
    if not f.endswith(".glb"):
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(src, f))
    obs = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    pts = [o.matrix_world @ Vector(c) for o in obs for c in o.bound_box]
    lo = Vector([min(p[i] for p in pts) for i in range(3)]); hi = Vector([max(p[i] for p in pts) for i in range(3)])
    ctr, ext = (lo + hi) / 2, hi - lo
    sc = bpy.context.scene
    sc.render.engine = "BLENDER_WORKBENCH"
    sc.display.shading.color_type = "VERTEX"
    sc.display.shading.show_cavity = True
    sc.world = bpy.data.worlds.new("w"); sc.world.color = (0.8, 0.84, 0.87)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
    cam.data.type = "ORTHO"
    size = max(ext) * 1.08
    cam.data.ortho_scale = size
    sc.render.resolution_x, sc.render.resolution_y = 600, 600
    for name, off, rot in [("side", (size * 3, 0, 0), (math.pi / 2, 0, math.pi / 2)), ("top", (0, 0, size * 3), (0, 0, math.pi / 2))]:
        cam.location = ctr + Vector(off); cam.rotation_euler = rot
        sc.render.filepath = os.path.join(out, f"{f[:-4]}_{name}.png")
        bpy.ops.render.render(write_still=True)
