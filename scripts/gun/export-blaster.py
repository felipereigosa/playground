# Exports the Tripo Smart Mesh gun (resources/gun-smart.blend) as a plain
# grabbable gadget, assets/gun/blaster.glb: a root `blaster` with the model
# at real size and a hidden `collision` box round it. Textures are halved to
# 2K for the Quest. The grip empties (grip_back, grip_front: the right
# controller grip's frame while holding there, see src/grab.js) go along as
# children of the root; the preview hands under them stay out. Run in Blender with gun-smart.blend open, or headless:
#   blender -b resources/gun-smart.blend --python scripts/gun/export-blaster.py
import bpy, os
from mathutils import Vector, Matrix

LENGTH = 0.408           # metres, back of the power pack to the muzzle (0.34 felt small)
HERE = os.path.dirname(bpy.data.filepath)
OUT = os.path.join(HERE, "..", "assets", "gun", "blaster.glb")

src = next(o for o in bpy.data.objects if o.name.startswith("tripo_node"))
dg = bpy.context.evaluated_depsgraph_get()
me = bpy.data.meshes.new_from_object(src.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
me.transform(src.matrix_world)
pts = [v.co for v in me.vertices]
lo = Vector([min(p[i] for p in pts) for i in range(3)])
hi = Vector([max(p[i] for p in pts) for i in range(3)])
s = LENGTH / (hi.y - lo.y)
place = Matrix.Scale(s, 4) @ Matrix.Translation(-(lo + hi) / 2)        # centred on its box
me.transform(place)
size = (hi - lo) * s

made = []
coll = bpy.data.collections.new("export")
bpy.context.scene.collection.children.link(coll)
def link(o):
    coll.objects.link(o)
    made.append(o)
    return o

root = link(bpy.data.objects.new("blaster", None))
body = link(bpy.data.objects.new("body", me))
body.parent = root
cm = bpy.data.meshes.new("collision")
x, y, z = size / 2 * 1.05
corners = [(sx * x, sy * y, sz * z) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
cm.from_pydata(corners, [], [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)])
col = link(bpy.data.objects.new("collision", cm))
col.parent = root
renamed = []                              # the scene's grips, out of the way of their copies
for o in [o for o in bpy.data.objects if o.name.startswith("grip_") and o.type == 'EMPTY']:
    name = o.name
    o.name = "source_" + name
    renamed.append((o, name))
    grip = link(bpy.data.objects.new(name, None))
    loc, rot, _ = (place @ o.matrix_world).decompose()
    grip.matrix_world = Matrix.LocRotScale(loc, rot, None)
    grip.parent = root

for img in bpy.data.images:
    if img.size[0] > 2048:
        img.scale(2048, 2048)

bpy.context.view_layer.active_layer_collection = bpy.context.view_layer.layer_collection.children[coll.name]
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, use_active_collection=True, export_format='GLB', export_image_format='JPEG',
                          export_jpeg_quality=90, export_apply=True)
for o in made:
    bpy.data.objects.remove(o, do_unlink=True)
bpy.data.collections.remove(coll)
for o, name in renamed:
    o.name = name
print("RESULT", os.path.abspath(OUT), [round(v, 3) for v in size], len(me.polygons))
