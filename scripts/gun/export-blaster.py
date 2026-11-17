# Exports the Tripo Smart Mesh gun (resources/gun-smart.blend) as the
# blaster gadget, assets/gun/blaster.glb: a root `blaster` with the model at
# real size cut in two at the seam (scripts/gun/measures.json), `rear` and
# `front`, each with its cut closed by a charcoal cap, and a hidden
# `collision` box round it all. Empties mark the middle of each cap
# (socket_rear, socket_front, where the beam goes) and the muzzle. Textures are halved to
# 2K for the Quest. The grip empties (grip_back, grip_front: the right
# controller grip's frame while holding there, see src/grab.js) go along as
# children of the root; the preview hands under them stay out. Run in Blender with gun-smart.blend open, or headless:
#   blender -b resources/gun-smart.blend --python scripts/gun/export-blaster.py
import bpy, bmesh, os, json
from mathutils import Vector, Matrix

LENGTH = 0.408           # metres, back of the power pack to the muzzle (0.34 felt small)
HERE = os.path.dirname(bpy.data.filepath)
OUT = os.path.join(HERE, "..", "assets", "gun", "blaster.glb")
MEASURES = json.load(open(os.path.join(HERE, "..", "scripts", "gun", "measures.json")))

# The seam, as y at each z in raw Tripo coordinates (constant across x)
seam = sorted((z, y) for y, z in MEASURES["seam"])
def seam_y(z):
    if z <= seam[0][0]: return seam[0][1]
    if z >= seam[-1][0]: return seam[-1][1]
    for (z0, y0), (z1, y1) in zip(seam, seam[1:]):
        if z0 <= z <= z1:
            return y0 + (y1 - y0) * (z - z0) / (z1 - z0)
side_of = lambda co: co.y - seam_y(co.z)      # < 0 rear, > 0 front

def split (me):
    """The mesh (raw coordinates) cut along the seam: (rear, front) bmeshes,
    each cut closed with faces of material 1, and the middle of each cap"""
    bm = bmesh.new()
    bm.from_mesh(me)
    for v in bm.verts:                         # off the surface, so every cut is clean
        if abs(side_of(v.co)) < 1e-6:
            v.co.y += 2e-6
    cut = set()
    for e in list(bm.edges):
        a, b = e.verts
        fa = side_of(a.co)
        if fa * side_of(b.co) < 0:
            lo, hi = 0.0, 1.0
            for _ in range(30):
                m = (lo + hi) / 2
                if (side_of(a.co.lerp(b.co, m)) < 0) == (fa < 0): lo = m
                else: hi = m
            cut.add(bmesh.utils.edge_split(e, a, (lo + hi) / 2)[1])
    for face in list(bm.faces):
        vs = [v for v in face.verts if v in cut]
        if len(vs) >= 2:
            bmesh.ops.connect_verts(bm, verts=vs)
    halves = []
    for front in (False, True):
        half = bm.copy()
        gone = [f for f in half.faces if (sum(side_of(v.co) for v in f.verts) > 0) != front]
        bmesh.ops.delete(half, geom=gone, context='FACES')
        bmesh.ops.delete(half, geom=[v for v in half.verts if not v.link_faces], context='VERTS')
        rim = [e for e in half.edges if e.is_boundary and all(abs(side_of(v.co)) < 1e-5 for v in e.verts)]
        centre = sum((v.co for e in rim for v in e.verts), Vector()) / (2 * len(rim))
        filled = bmesh.ops.triangle_fill(half, use_beauty=True, edges=rim, normal=Vector((0, 1, 0)))
        for f in filled["geom"]:
            if isinstance(f, bmesh.types.BMFace):
                f.material_index = 1
                f.smooth = False
        halves.append((half, centre))
    bm.free()
    return halves

src = next(o for o in bpy.data.objects if o.name.startswith("tripo_node"))
dg = bpy.context.evaluated_depsgraph_get()
me = bpy.data.meshes.new_from_object(src.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
me.transform(src.matrix_world)
me.materials.append(bpy.data.materials.get("socket") or bpy.data.materials.new("socket"))
cap = me.materials[1]
bsdf = cap.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.035, 0.037, 0.042, 1)
bsdf.inputs["Roughness"].default_value = 0.75
pts = [v.co for v in me.vertices]
lo = Vector([min(p[i] for p in pts) for i in range(3)])
hi = Vector([max(p[i] for p in pts) for i in range(3)])
s = LENGTH / (hi.y - lo.y)
place = Matrix.Scale(s, 4) @ Matrix.Translation(-(lo + hi) / 2)        # centred on its box
size = (hi - lo) * s
(rear_bm, rear_socket), (front_bm, front_socket) = split(me)
halves = {}
for name, bm in (("rear", rear_bm), ("front", front_bm)):
    hm = bpy.data.meshes.new(name)
    bm.to_mesh(hm)
    bm.free()
    for m in me.materials:
        hm.materials.append(m)
    hm.transform(place)
    halves[name] = hm
m = MEASURES["muzzle"]
muzzle = place @ Vector(((m[0][0] + m[1][0]) / 2, m[1][1], (m[0][2] + m[1][2]) / 2))

made = []
coll = bpy.data.collections.new("export")
bpy.context.scene.collection.children.link(coll)
def link(o):
    coll.objects.link(o)
    made.append(o)
    return o

root = link(bpy.data.objects.new("blaster", None))
for name, hm in halves.items():
    link(bpy.data.objects.new(name, hm)).parent = root
for name, at in (("socket_rear", place @ rear_socket), ("socket_front", place @ front_socket), ("muzzle", muzzle)):
    mark = link(bpy.data.objects.new(name, None))
    mark.location = at
    mark.parent = root
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
print("RESULT", os.path.abspath(OUT), [round(v, 3) for v in size], {n: len(hm.polygons) for n, hm in halves.items()},
      [round(v, 3) for v in place @ rear_socket], [round(v, 3) for v in place @ front_socket])
for hm in list(halves.values()) + [me]:
    bpy.data.meshes.remove(hm)
