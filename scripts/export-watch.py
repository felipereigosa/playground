# Exports the watch from watch.blend to assets/watch/watch.glb, in the left
# grip's space. Run inside Blender with the watch scene open (the hand_ref
# hand import there is what places it). Bakes each part, band modifiers
# included, and rebuilds the face_mount / face / touch empties src/watch.js
# needs, without changing the scene.
import bpy, os
from mathutils import Matrix, Vector, Quaternion
OUT = "/home/felipe/Files/projects/playground/assets/watch/watch.glb"
dg = bpy.context.evaluated_depsgraph_get()
arm = bpy.data.objects["Armature"]
# glb's own Armature rotation, converted to blender axes, to check it was not moved
q3 = (-0.663803219795227, 0.2725289762020111, -0.6826034188270569, 0.13836878538131714)
qb = Quaternion((q3[3], q3[0], -q3[2], q3[1]))
check = qb.rotation_difference(arm.matrix_basis.to_quaternion()).angle
# blender world -> game grip space (still in blender axes; the exporter turns them to three's)
S = Matrix.Diagonal((-0.11, 0.11, 0.11, 1))
R = S @ arm.matrix_basis @ arm.matrix_world.inverted()

BODY = ["Cube.001", "case", "knob_elbow", "knob_hand", "light"]
FACE = ["button", "star"]
NAMES = {"Cube.001": "band"}
made = []
def link(o):
    bpy.context.scene.collection.objects.link(o); made.append(o); return o
def baked(src, M):
    me = bpy.data.meshes.new_from_object(src.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    me.transform(M)
    if M.determinant() < 0:
        me.flip_normals()
    return link(bpy.data.objects.new(NAMES.get(src.name, src.name), me))

root = link(bpy.data.objects.new("watch", None))
for n in BODY:
    baked(bpy.data.objects[n], R @ bpy.data.objects[n].matrix_world).parent = root

btn = bpy.data.objects["button"]
origin = R @ btn.matrix_world.translation
normal = ((R @ btn.matrix_world).to_3x3() @ Vector((0, -1, 0))).normalized()
rot = normal.to_track_quat('Z', 'Y').to_matrix().to_4x4()
mount = link(bpy.data.objects.new("face_mount", None)); mount.parent = root
mount.matrix_world = Matrix.Translation(origin) @ rot
face = link(bpy.data.objects.new("face", None)); face.parent = mount
inv = mount.matrix_world.inverted()
top = 0
for n in FACE:
    o = baked(bpy.data.objects[n], inv @ R @ bpy.data.objects[n].matrix_world)
    o.parent = face
    top = max(top, max(v.co.z for v in o.data.vertices))
touch = link(bpy.data.objects.new("touch", None)); touch.parent = face
touch.location = (0, 0, top)

prev = [o for o in bpy.context.selected_objects]
for o in bpy.context.selected_objects: o.select_set(False)
for o in made: o.select_set(True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, use_selection=True, export_apply=True, export_animations=False,
                          export_cameras=False, export_lights=False, export_extras=False)
info = {o.name: [round(v, 4) for v in o.matrix_world.translation] for o in made if o.type == 'EMPTY'}

for o in made:
    me = o.data if o.type == 'MESH' else None
    bpy.data.objects.remove(o, do_unlink=True)
    if me: bpy.data.meshes.remove(me)
for o in prev: o.select_set(True)
result = {"armature_rot_diff": round(check, 5), "empties": info, "normal": [round(v, 3) for v in normal], "size": os.path.getsize(OUT)}
