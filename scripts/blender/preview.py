"""Render side / top / front orthographic previews of a glb. Usage: Blender -b -P preview.py -- in.glb out_prefix"""
import sys, bpy, math
from mathutils import Vector
a = sys.argv[sys.argv.index("--") + 1:]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=a[0])
sc = bpy.context.scene
sc.render.engine = "BLENDER_WORKBENCH"
sc.display.shading.color_type = "VERTEX"
sc.display.shading.light = "STUDIO"
sc.render.resolution_x, sc.render.resolution_y = 1400, 520
sc.world = bpy.data.worlds.new("w"); sc.world.color = (0.85, 0.88, 0.9)
cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); sc.camera = cam
cam.data.type = "ORTHO"; cam.data.ortho_scale = 1.15
for name, loc, rot, res in [("side", (3, 0, 0), (math.pi/2, 0, math.pi/2), (1400, 520)), ("top", (0, 0, 3), (0, 0, math.pi / 2), (1400, 520)), ("front", (0, -3, 0), (math.pi/2, 0, 0), (700, 520))]:
    cam.location = Vector(loc); cam.rotation_euler = rot
    sc.render.resolution_x, sc.render.resolution_y = res
    cam.data.ortho_scale = 1.15 if name != "front" else 0.4
    sc.render.filepath = f"{a[1]}_{name}.png"
    bpy.ops.render.render(write_still=True)
