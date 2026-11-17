# Exports the radio (~/Files/art/radio/radio12.blend on the laptop) as the
# radio gadget, assets/radio/radio.glb: a root `radio` at the middle of the
# body, the model at real size (SIZE of the file's), its front along +z in
# the game. The parts that move are objects of their own, each with its
# origin where it turns or slides:
#   knob        the tuning dial, turning about z, its white dot upwards
#   needle      slides along x over `strip`, the numbers of the dial
#   wheel       the volume wheel on the side, turning about z
#   power, seek the red and the black button on top, pressed down along y
#   antenna     turns about z at its hinge (the thick tube); antenna_medium
#               and its child antenna_thin (with the head) slide out along
#               x. Not named antenna_2: three's loader gives that name to
#               the second material's part of `antenna`
# The rest is one mesh, `body`. `collision` is the hidden box a hand takes
# the radio by (src/util.js getObjectAt); those of the knob and the
# antenna's tip are made in src/radio/radio.js, to stay out of the menu's copy.
# `speaker` is an empty where the sound comes from. Measures the game needs
# go along as custom properties of the root (userData in three). Run headless:
#   blender -b ~/Files/art/radio/radio12.blend --python scripts/radio/export-radio.py
# The scene is not changed (and not saved).
import bpy, bmesh, os, math
from mathutils import Vector, Matrix

SIZE = 0.35              # the body comes out 26 cm wide
OUT = "/home/felipe/Files/projects/playground/assets/radio/radio.glb"

BODY = ["Cube", "Cube.007", "Cube.008", "Cone", "Cylinder", "Sphere", "Cylinder.015",
        "Cylinder.011", "Cylinder.012", "Cylinder.008", "Cylinder.009",
        "Sphere.001", "Sphere.002", "Sphere.003", "Sphere.004", "Sphere.005"]
KNOB = ["Cylinder.002", "Cylinder.014", "Cube.009"]
ANTENNA = [["Cylinder.007", "thick"], ["medium"], ["thin", "head"]]
# How far each of the two inner tubes can come out of the one round it,
# leaving this much of it inside
OVERLAP = 0.03
# Ticks of stations.png the needle runs between, and those with a number
# (88 90 96 102 108, 500 600 900), as fractions of its width
TICKS = [34 / 1024, 987 / 1024]
NUMBERS = [x / 1024 for x in (134, 233, 332, 432, 531, 729, 828, 928)]

D = bpy.data.objects
dg = bpy.context.evaluated_depsgraph_get()
made = []

def bounds (names):
    pts = []
    for n in names:
        e = D[n].evaluated_get(dg)
        pts += [e.matrix_world @ v.co for v in e.data.vertices]
    return (Vector([min(p[i] for p in pts) for i in range(3)]),
            Vector([max(p[i] for p in pts) for i in range(3)]))

body_lo, body_hi = bounds(["Cube.008"])
CENTRE = (body_lo + body_hi) / 2

def link (o, parent, origin):
    """Puts an object at a point of the file's world, under a parent made the same way"""
    bpy.context.scene.collection.objects.link(o)
    o["origin"] = origin
    o.parent = parent
    o.location = (Vector(origin) - Vector(parent["origin"] if parent else CENTRE)) * SIZE
    made.append(o)
    return o

def empty (name, parent, origin):
    return link(bpy.data.objects.new(name, None), parent, origin)

def part (name, sources, parent, origin, turn=None):
    """One mesh out of several objects, as they are in the file, about an origin"""
    bm = bmesh.new()
    me = bpy.data.meshes.new(name)
    place = Matrix.Scale(SIZE, 4) @ (turn or Matrix()) @ Matrix.Translation(-Vector(origin))
    for n in sources:
        src = D[n]
        tmp = bpy.data.meshes.new_from_object(src.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        tmp.transform(place @ src.matrix_world)
        slots = []
        for m in (tmp.materials[:] or [None]):
            m = m or bpy.data.materials["metal"]       # the handle's bar has none
            if m.name not in me.materials:
                me.materials.append(m)
            slots.append(me.materials.find(m.name))
        before = len(bm.faces)
        bm.from_mesh(tmp)
        bm.faces.ensure_lookup_table()
        for f in bm.faces[before:]:
            f.material_index = slots[min(f.material_index, len(slots) - 1)]
        bpy.data.meshes.remove(tmp)
    bm.to_mesh(me)
    bm.free()
    return link(bpy.data.objects.new(name, me), parent, origin)

def box (name, parent, lo, hi):
    """A collision box between two corners of the file's world"""
    origin = Vector(parent["origin"])
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1)
    for v in bm.verts:
        for i in range(3):
            v.co[i] = ((lo[i] if v.co[i] < 0 else hi[i]) - origin[i]) * SIZE
    bm.to_mesh(me)
    bm.free()
    o = link(bpy.data.objects.new(name, me), parent, origin)
    o.location = (0, 0, 0)
    return o

root = empty("radio", None, CENTRE)
part("body", BODY, root, CENTRE)

# The knob, turned about its axis so that the dot is at the top
knob_at = D["Cylinder.002"].matrix_world.translation.copy()
dot = D["Cylinder.014"].matrix_world.translation - knob_at
knob = part("knob", KNOB, root, knob_at, Matrix.Rotation(-math.atan2(dot.x, dot.z), 4, 'Y'))

needle_at = D["Cube.003"].matrix_world.translation.copy()
part("needle", ["Cube.003"], root, needle_at)
strip_lo, strip_hi = bounds(["stations"])
part("strip", ["stations"], root, (strip_lo + strip_hi) / 2)
strip = lambda u: (strip_lo.x + u * (strip_hi.x - strip_lo.x) - CENTRE.x) * SIZE

wheel_at = D["Cylinder.013"].matrix_world.translation.copy()
part("wheel", ["Cylinder.013"], root, wheel_at)
wlo, whi = bounds(["Cylinder.013"])

buttons = {}
for name, src in (("power", "Cube.006"), ("seek", "Cube.005")):
    at = D[src].matrix_world.translation.copy()
    part(name, [src], root, at)
    lo, hi = bounds([src])
    # in the root's space, game axes: the middle of its top, and its half sizes
    buttons[name] = [(at.x - CENTRE.x) * SIZE, (hi.z - CENTRE.z) * SIZE, -(at.y - CENTRE.y) * SIZE,
                     (hi.x - lo.x) / 2 * SIZE, (hi.y - lo.y) / 2 * SIZE]

hinge = D["Cylinder.007"].matrix_world.translation.copy()
tubes = [bounds(names[-1:] if i == 0 else names[:1]) for i, names in enumerate(ANTENNA)]
a1 = part("antenna", ANTENNA[0], root, hinge)
a2 = part("antenna_medium", ANTENNA[1], a1, hinge)
a3 = part("antenna_thin", ANTENNA[2], a2, hinge)
slides = [(tubes[i][1].x - OVERLAP) - tubes[i + 1][0].x for i in range(2)]
tip_lo, tip_hi = bounds(["head"])
tip = (tip_lo + tip_hi) / 2

# Level with the feet underneath: what it rests on is measured with this box
all_lo, all_hi = bounds(BODY)
pad = Vector((0.015, 0.015, 0.015)) / SIZE
box("collision", root, Vector((body_lo.x - pad.x, body_lo.y - pad.y, all_lo.z)), body_hi + pad)
empty("speaker", root, D["Cone"].matrix_world.translation.copy())

root["needle"] = [strip(u) for u in TICKS]                   # its x at each end
root["needleFrom"] = (needle_at.x - CENTRE.x) * SIZE         # and as exported
root["stations"] = [(u - TICKS[0]) / (TICKS[1] - TICKS[0]) for u in NUMBERS]
root["slides"] = [s * SIZE for s in slides]
root["tipReach"] = (tip.x - hinge.x) * SIZE
root["knobFront"] = -(bounds(["Cylinder.002"])[0].y - knob_at.y) * SIZE
root["wheelRadius"] = (whi.x - wlo.x) / 2 * SIZE
root["wheelAt"] = [(wheel_at.x - CENTRE.x) * SIZE, (wheel_at.z - CENTRE.z) * SIZE, -(wheel_at.y - CENTRE.y) * SIZE]
root["wheelWidth"] = (whi.y - wlo.y) * SIZE
root["power"] = buttons["power"]
root["seek"] = buttons["seek"]
for o in made:
    del o["origin"]

for o in bpy.context.selected_objects:
    o.select_set(False)
for o in made:
    o.select_set(True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, use_selection=True, export_apply=True, export_animations=False,
                          export_cameras=False, export_lights=False, export_extras=True)
print("EXPORTED", os.path.getsize(OUT), {k: root[k][:] if hasattr(root[k], "__len__") else root[k] for k in root.keys()})
