# Builds the bowling set as a first pass for Felipe to rework: saves
# resources/bowling/bowling.blend and exports assets/bowling/bowling.glb
# (through export-bowling.py, which is the one to use once the .blend has
# been touched by hand: this script overwrites it). On the laptop:
#   blender -b --python scripts/bowling/build-bowling.py
#
# In the file:
#   ball     a purple ball of real size (radius 0.108 m) with two finger holes
#            and a thumb hole around its +Z. Children: collision_ball (the
#            volume a hand takes it by) and grip_hold, the frame of the right
#            controller's grip while the ball is held (src/grab.js), with the
#            game's hand in its grab pose under it, to see how it sits. Move
#            grip_hold to change the hold; the hand is not exported.
#   pin      a tenpin of real size (0.381 m), its origin under its base, with
#            collision_pin, the volume a hand takes it by (its shape in the
#            physics is made in src/bowling/bowling.js, HULL).
#   bowling  the icon: a copy of each (the same meshes) and collision_icon.
# The grip is found by fitting the ball against the hand: the palm on the
# surface, the three curled fingers sunk in, the thumb lying on it.
import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HAND = os.path.expanduser('~/Files/art/hand/hand_4states.blend')
HAND_SCALE = 0.11         # of hand.glb in the controller's space (src/hand.js)
R = 0.108                 # the ball
FINGER, THUMB = 0.0125, 0.0145   # radius of the holes
DEPTH = 0.055
APART = 0.016             # each finger hole from the middle of the two
SPAN = 60                 # degrees between the fingers and the thumb, at most
ICON_BALL = 0.7           # the ball's size in the icon
SUNK = 0.022              # how deep the curled fingers sit

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def material(name, colour, roughness, coat=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    rgb = [((colour >> s) & 255) / 255 for s in (16, 8, 0)]
    bsdf.inputs['Base Color'].default_value = [c ** 2.2 for c in rgb] + [1]
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Coat Weight'].default_value = coat
    bsdf.inputs['Coat Roughness'].default_value = 0.03
    return mat

def add(name, data, parent=None, location=(0, 0, 0)):
    obj = bpy.data.objects.new(name, data)
    scene.collection.objects.link(obj)
    obj.parent = parent
    obj.location = location
    return obj

def lathe(bm, rows, segments, index=lambda z: 0, axis=Matrix()):
    """Rings of `segments` corners around z, one per (z, radius) row, closed
    at both ends; index(z) gives the material of a band from its middle"""
    rings = [[bm.verts.new(axis @ Vector((r * math.cos(2 * math.pi * k / segments),
                                          r * math.sin(2 * math.pi * k / segments), z)))
              for k in range(segments)] for z, r in rows]
    made = []
    for (a, b), ((z0, _), (z1, _)) in zip(zip(rings, rings[1:]), zip(rows, rows[1:])):
        for k in range(segments):
            face = bm.faces.new((a[k], a[(k + 1) % segments], b[(k + 1) % segments], b[k]))
            face.material_index = index((z0 + z1) / 2)
            made.append(face)
    for ring, z in ((rings[0][::-1], rows[0][0]), (rings[-1], rows[-1][0])):
        face = bm.faces.new(ring)
        face.material_index = index(z)
        made.append(face)
    return made

def finish(bm, name, materials, sharp=35):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for mat in materials:
        mesh.materials.append(mat)
    smooth(mesh, sharp)
    return mesh

def smooth(mesh, sharp):
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.set_sharp_from_angle(angle=math.radians(sharp))

purple = material('purple', 0x5a16b8, 0.12, coat=1)
hole = material('hole', 0x0c0714, 0.8)
white = material('white', 0xf6f4ee, 0.22)
red = material('red', 0xc8102e, 0.25)

# ---------------------------------------------------------------- the ball
# The holes about +Z: the fingers' pair leaning one way along Y, the thumb
# the other; the lean comes from the fit below
def cutters(lean):
    bm = bmesh.new()
    for radius, across, tilt in ((FINGER, -APART, lean), (FINGER, APART, lean), (THUMB, 0, -lean)):
        turn = Matrix.Rotation(-tilt, 4, 'X') @ Matrix.Rotation(across / R, 4, 'Y')
        mouth = radius + 0.004
        # Material 1 down the hole, 0 on the flare of its mouth
        lathe(bm, [(R - DEPTH, radius), (R - 0.0035, radius), (R + 0.0015, mouth), (R + 0.03, mouth)],
              24, lambda z: 0 if z > R - 0.0035 else 1, turn)
    return finish(bm, 'cutters', [purple, hole])

def ball_mesh(lean):
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=5, radius=R)
    solid = add('solid', finish(bm, 'solid', [purple, hole], 180))
    cutter = add('cutter', cutters(lean))
    boolean = solid.modifiers.new('holes', 'BOOLEAN')
    boolean.operation = 'DIFFERENCE'
    boolean.solver = 'EXACT'
    boolean.object = cutter
    dg = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(solid.evaluated_get(dg), depsgraph=dg)
    mesh.name = 'ball_mesh'
    for obj in (solid, cutter):
        data = obj.data
        bpy.data.objects.remove(obj)
        bpy.data.meshes.remove(data)
    smooth(mesh, 30)
    return mesh

# The hand as the game holds it (the grab pose, frame 3), in the controller's
# space: its points, and which bone each follows most
with bpy.data.libraries.load(HAND, link=False) as (src, dst):
    dst.objects = ['Armature', 'Cube']
arm, skin = dst.objects
for obj in dst.objects:
    scene.collection.objects.link(obj)
hand_world = arm.matrix_world.copy()
scene.frame_set(3)
dg = bpy.context.evaluated_depsgraph_get()
shaped = skin.evaluated_get(dg)
points = np.array([HAND_SCALE * (shaped.matrix_world @ v.co) for v in shaped.to_mesh().vertices])
shaped.to_mesh_clear()
names = [g.name for g in skin.vertex_groups]
bone = [names[max(v.groups, key=lambda g: g.weight).group] if v.groups else '' for v in skin.data.vertices]
of = lambda *bones: np.array([b in bones for b in bone])
fingers, thumb, tips = of('Bone.007', 'Bone.008'), of('Bone.002'), of('Bone.008')

# Where the ball's centre goes: nothing but the curled fingers inside it,
# the rest touching, the fingertips SUNK deep, the thumb just on it
def cost(c):
    d = np.linalg.norm(points - c, axis=1) - R
    rest = d[~fingers]
    return (1e3 * np.sum(np.minimum(rest, 0) ** 2) + np.min(rest) ** 2 +
            (np.mean(d[tips]) + SUNK) ** 2 + 0.3 * (np.mean(d[thumb]) - 0.004) ** 2)

rng = np.random.default_rng(1)
centre = points[~fingers].mean(axis=0) + np.array([-R, 0, 0])   # the palm faces -x
best, step = cost(centre), 0.05
for i in range(6000):
    trial = centre + rng.normal(0, step, 3)
    value = cost(trial)
    if value < best:
        centre, best = trial, value
    if i % 500 == 499:
        step *= 0.6
d = np.linalg.norm(points - centre, axis=1) - R
c = Vector(centre)

# The ball's turn in the hand: its +Z between the fingers and the thumb
f = (Vector(points[tips].mean(axis=0)) - c).normalized()
t = (Vector(points[thumb].mean(axis=0)) - c).normalized()
lean = min(f.angle(t), math.radians(SPAN)) / 2
z = (f + t).normalized()
y = (f - t).normalized()
y = (y - z * y.dot(z)).normalized()
x = y.cross(z)
turn = Matrix((x, y, z)).transposed().to_4x4()
in_hand = Matrix.Translation(c) @ turn          # the ball in the controller's space

ball = add('ball', ball_mesh(lean), location=(0, 0, 0.3))
bm = bmesh.new()
bmesh.ops.create_icosphere(bm, subdivisions=2, radius=0.15)
add('collision_ball', finish(bm, 'collision_ball_mesh', []), ball)
grip = add('grip_hold', None, ball)
grip.empty_display_size = 0.03
grip.matrix_local = in_hand.inverted()
arm.parent = grip
arm.matrix_parent_inverse = Matrix()
arm.matrix_basis = Matrix.Scale(HAND_SCALE, 4) @ hand_world

# ----------------------------------------------------------------- the pin
# Half the width of a tenpin at each height (the regulation measures)
SPEC = [(0.003, 0.0262), (0.019, 0.0359), (0.057, 0.0496), (0.0857, 0.0573), (0.1143, 0.0605),
        (0.149, 0.0580), (0.184, 0.0470), (0.219, 0.0314), (0.238, 0.0250), (0.254, 0.0228),
        (0.276, 0.0237), (0.298, 0.0266), (0.3207, 0.0306), (0.343, 0.0323)]
COLLARS = [(0.2365, 0.2475), (0.2615, 0.2725)]
HEAD = 0.381 - 0.343

def width(z):
    """A smooth curve through SPEC"""
    i = max(k for k in range(len(SPEC) - 1) if SPEC[k][0] <= z)
    (z0, r0), (z1, r1) = SPEC[i], SPEC[i + 1]
    slope = lambda k: ((SPEC[min(k + 1, len(SPEC) - 1)][1] - SPEC[max(k - 1, 0)][1]) /
                       (SPEC[min(k + 1, len(SPEC) - 1)][0] - SPEC[max(k - 1, 0)][0]))
    m0, m1 = slope(i), 0 if i + 1 == len(SPEC) - 1 else slope(i + 1)
    h = z1 - z0
    s = (z - z0) / h
    return ((2 * s ** 3 - 3 * s ** 2 + 1) * r0 + (s ** 3 - 2 * s ** 2 + s) * h * m0 +
            (-2 * s ** 3 + 3 * s ** 2) * r1 + (s ** 3 - s ** 2) * h * m1)

heights = sorted(set([0.003 + 0.005 * k for k in range(68)] + [z for band in COLLARS for z in band] + [0.343]))
rows = [(0, 0.0228)] + [(z, width(z)) for z in heights]
rows += [(0.343 + HEAD * math.sin(a), 0.0323 * math.cos(a))
         for a in (math.radians(88 * k / 9) for k in range(1, 10))]
bm = bmesh.new()
lathe(bm, rows, 32, lambda z: 1 if any(lo < z < hi for lo, hi in COLLARS) else 0)
pin = add('pin', finish(bm, 'pin_mesh', [white, red]), location=(0.45, 0, 0))
bm = bmesh.new()
lathe(bm, [(0, 0.028), (0.1143, 0.064), (0.343, 0.035), (0.381, 0.016)], 8)
add('collision_pin', finish(bm, 'collision_pin_mesh', []), pin)

# ---------------------------------------------------------------- the icon
icon = add('bowling', None, location=(0.9, 0, 0.2))
# The ball at ICON_BALL of its size, for the pin to count beside it
copy = add('icon_ball', ball.data, icon, (-0.06, 0, R * ICON_BALL - 0.19))
copy.scale = (ICON_BALL,) * 3
copy.rotation_euler = (math.radians(55), 0, math.radians(-20))
add('icon_pin', pin.data, icon, (0.075, 0, -0.19))
bm = bmesh.new()
bmesh.ops.create_cube(bm, size=1, matrix=Matrix.Diagonal((0.28, 0.16, 0.39, 1)))
add('collision_icon', finish(bm, 'collision_icon_mesh', []), icon)

for obj in scene.objects:
    if obj.name.startswith('collision'):
        obj.display_type = 'WIRE'
        obj.hide_render = True

# -------------------------------------------------------- save, export, look
out = os.path.join(HERE, 'resources/bowling/bowling.blend')
os.makedirs(os.path.dirname(out), exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=out)
exec(open(os.path.join(HERE, 'scripts/bowling/export-bowling.py')).read())
print('MARK fit: centre', [round(v, 3) for v in c], 'cost %.2g' % best,
      'fingers %.3f thumb %.3f nearest other %.3f' % (d[tips].mean(), d[thumb].mean(), d[~fingers].min()),
      'inside besides the fingers', int((d[~fingers] < -0.002).sum()), 'of', len(d),
      'lean', round(math.degrees(lean), 1), 'apart', round(math.degrees(f.angle(t)), 1))
print('MARK ball', len(ball.data.polygons), 'faces, pin', len(pin.data.polygons))

if os.environ.get('PREVIEW'):
    scene.view_settings.view_transform = 'Standard'
    scene.render.resolution_x, scene.render.resolution_y = 640, 560
    world = bpy.data.worlds.new('world')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.7, 0.72, 0.78, 1)
    scene.world = world
    sun = add('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 3
    sun.rotation_euler = (math.radians(40), 0, math.radians(30))
    camera = add('camera', bpy.data.cameras.new('camera'))
    scene.camera = camera
    camera.data.lens = 85
    held = ball.matrix_world @ grip.matrix_local       # the controller's space
    centre = ball.matrix_world.translation
    off = lambda *v: tuple(centre + 1.3 * (held.to_3x3() @ Vector(v)).normalized())
    views = {'hand': (off(0, 1, 0), centre), 'side': (off(0.3, -0.3, -1), centre),
             'under': (off(1, 0.4, 0.3), centre), 'set': ((0.7, -2.2, 0.5), (0.7, 0, 0.19))}
    for name, (eye, at) in views.items():
        camera.location = eye
        camera.rotation_euler = (Vector(at) - Vector(eye)).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = '/tmp/bowling-%s.png' % name
        bpy.ops.render.render(write_still=True)
    print('MARK rendered')
