# Exports the blaster Felipe modelled (resources/gun-smartN.blend, his latest save) as the
# blaster gadget, assets/gun/blaster.glb, in the layout export-blaster.py
# gave the Tripo one: a root `blaster` at real size with `rear` (everything
# in the collection `back`, joined) and `front` (the collection `front`),
# the empties socket_rear, socket_front (where the beam goes, on the barrel's
# axis at the back end of the front half) and muzzle, a hidden `collision`
# box, and the grip empties (grip_back, grip_front) without their preview
# hands. The trigger (the object named `trigger`, or Cube.005) stays a
# separate node `trigger` under `rear`, for the game to slide. The model points along -Y in the file and is turned to +Y, the
# game's forward. Modifiers are applied; the file is not changed. Headless:
#   blender -b resources/gun-smart13.blend --python scripts/gun/export-blaster-parts.py
import bpy, bmesh, os
from mathutils import Vector, Matrix
from math import pi

LENGTH = 0.408           # metres, back of the power pack to the muzzle
HERE = os.path.dirname(bpy.data.filepath)
OUT = os.path.join(HERE, "..", "assets", "gun", "blaster.glb")
AXIS = "Cylinder.002"    # the front barrel: its origin is on the barrel's axis
TRIGGER = "trigger" if "trigger" in bpy.data.objects else "Cube.005"

dg = bpy.context.evaluated_depsgraph_get()
coll = bpy.data.collections.new("export")
bpy.context.scene.collection.children.link(coll)

def world_mesh (o):
    me = bpy.data.meshes.new_from_object(o.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    me.transform(o.matrix_world)
    # Faces of more than four sides are cut into triangles here: left whole,
    # one that bends round a barrel has a single normal, which creases the
    # smooth shading around it
    bm = bmesh.new()
    bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=[f for f in bm.faces if len(f.verts) > 4], quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(me)
    bm.free()
    return me

# The barrel's back end. A part in `front` that lies wholly behind it belongs
# to the rear half (a new object lands in whichever collection is active)
barrel = world_mesh(bpy.data.objects[AXIS])
seam_y = max(v.co.y for v in barrel.vertices)
bpy.data.meshes.remove(barrel)
halves = {"rear": [], "front": []}
moved = []
for name, source in (("rear", "back"), ("front", "front")):
    for o in bpy.data.collections[source].objects:
        if o.type != 'MESH':
            continue
        me = world_mesh(o)
        if o.name == TRIGGER:
            trigger = bpy.data.objects.new("trigger", me)
            coll.objects.link(trigger)
            continue
        to = name
        if name == "front" and min(v.co.y for v in me.vertices) > seam_y:
            to = "rear"
            moved.append(o.name)
        part = bpy.data.objects.new(to, me)
        coll.objects.link(part)
        halves[to].append(part)

def joined (name):
    parts = halves[name]
    with bpy.context.temp_override(active_object=parts[0], selected_editable_objects=parts, selected_objects=parts):
        bpy.ops.object.join()
    parts[0].name = parts[0].data.name = name
    return parts[0]

rear = joined("rear")
front = joined("front")
def box (o):
    pts = [v.co for v in o.data.vertices]
    return (Vector([min(p[i] for p in pts) for i in range(3)]), Vector([max(p[i] for p in pts) for i in range(3)]))
(rlo, rhi), (flo, fhi) = box(rear), box(front)
lo = Vector([min(rlo[i], flo[i]) for i in range(3)])
hi = Vector([max(rhi[i], fhi[i]) for i in range(3)])
s = LENGTH / (hi.y - lo.y)
place = Matrix.Rotation(pi, 4, 'Z') @ Matrix.Scale(s, 4) @ Matrix.Translation(-(lo + hi) / 2)
size = (hi - lo) * s
axis = bpy.data.objects[AXIS].matrix_world.translation
socket = Vector((axis.x, seam_y, axis.z))         # the back end of the front barrel
muzzle = Vector((axis.x, flo.y, axis.z))

root = bpy.data.objects.new("blaster", None)
coll.objects.link(root)
for half in (rear, front):
    half.data.transform(place)
    half.parent = root
trigger.data.name = "trigger"
trigger.data.transform(place)
trigger.parent = rear
for name, at in (("socket_rear", socket), ("socket_front", socket), ("muzzle", muzzle)):
    mark = bpy.data.objects.new(name, None)
    coll.objects.link(mark)
    mark.location = place @ at
    mark.parent = root
cm = bpy.data.meshes.new("collision")
x, y, z = size / 2 * 1.05
corners = [(sx * x, sy * y, sz * z) for sx in (-1, 1) for sy in (-1, 1) for sz in (-1, 1)]
cm.from_pydata(corners, [], [(0, 1, 3, 2), (4, 6, 7, 5), (0, 4, 5, 1), (2, 3, 7, 6), (0, 2, 6, 4), (1, 5, 7, 3)])
col = bpy.data.objects.new("collision", cm)
coll.objects.link(col)
col.parent = root
for o in [o for o in bpy.data.objects if o.name.startswith("grip_") and o.type == 'EMPTY']:
    name = o.name
    o.name = "source_" + name
    grip = bpy.data.objects.new(name, None)
    coll.objects.link(grip)
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
print("RESULT", os.path.abspath(OUT), [round(v, 3) for v in size],
      {o.name: len(o.data.polygons) for o in (rear, front)},
      "socket", [round(v, 3) for v in place @ socket], "muzzle", [round(v, 3) for v in place @ muzzle],
      "taken from front into rear:", moved)
