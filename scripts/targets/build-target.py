# Builds the target of resources/targets/target-concept.png as separate
# parts (base, glow plate, four rings, centre) under an empty, saves it as
# resources/targets/target.blend and exports assets/targets/target.glb. A
# first pass for Felipe to rework; after that use export-target.py, which
# only exports. On the laptop:
#   blender -b --python scripts/targets/build-target.py
# The target faces -Y in Blender (+Z in the game), 0.4 m across.
import bpy, bmesh, math, os

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CHAMFER = 0.004

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

def material(name, colour, roughness=0.35):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    rgb = [((colour >> s) & 255) / 255 for s in (16, 8, 0)]
    bsdf.inputs['Base Color'].default_value = [c ** 2.2 for c in rgb] + [1]
    bsdf.inputs['Roughness'].default_value = roughness
    return mat

def lathe(name, profile, closed, mat, parent):
    """An octagonal solid: the profile, (radius, forward) pairs, at each of
    the eight corners. closed: the profile is a loop (a ring); otherwise its
    two ends are capped (a plate)."""
    bm = bmesh.new()
    loops = []
    for radius, forward in profile:
        loops.append([bm.verts.new((radius * math.cos(math.radians(22.5 + 45 * k)), -forward,
                                    radius * math.sin(math.radians(22.5 + 45 * k)))) for k in range(8)])
    n = len(loops)
    for i in range(n if closed else n - 1):
        a, b = loops[i], loops[(i + 1) % n]
        for k in range(8):
            bm.faces.new((a[k], a[(k + 1) % 8], b[(k + 1) % 8], b[k]))
    if not closed:
        bm.faces.new(loops[0])
        bm.faces.new(loops[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    mesh = bpy.data.meshes.new(name)
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    mesh.materials.append(mat)
    obj = bpy.data.objects.new(name, mesh)
    scene.collection.objects.link(obj)
    obj.parent = parent
    bevel = obj.modifiers.new('Bevel', 'BEVEL')
    bevel.width = 0.0025
    bevel.segments = 3
    bevel.limit_method = 'ANGLE'
    bevel.angle_limit = math.radians(25)
    bevel.harden_normals = True
    return obj

def plate(name, radius, back, front, mat, parent, dome=0):
    c = CHAMFER
    return lathe(name, [(radius - c, back), (radius, back + c), (radius, front - c),
                        (radius - c, front), (radius * 0.4, front + dome)], False, mat, parent)

def ring(name, outer, inner, back, front_outer, front_inner, mat, parent):
    c = CHAMFER
    return lathe(name, [(outer, back), (outer, front_outer - c), (outer - c, front_outer),
                        (inner + c, front_inner), (inner, front_inner - c), (inner, back)],
                 True, mat, parent)

root = bpy.data.objects.new('target', None)
root.empty_display_size = 0.05
scene.collection.objects.link(root)

charcoal = material('charcoal', 0x2b2f38, 0.6)
plate('base', 0.2, 0, 0.03, charcoal, root)
plate('glow', 0.188, 0.026, 0.0315, material('glow', 0x14343a, 0.5), root)
ring('ring_white', 0.186, 0.150, 0.025, 0.037, 0.043, material('white', 0xf4f1e8), root)
ring('ring_red', 0.146, 0.110, 0.025, 0.045, 0.052, material('red', 0xd8322b), root)
ring('ring_yellow', 0.106, 0.076, 0.025, 0.054, 0.060, material('yellow', 0xf5b81c), root)
ring('ring_teal', 0.072, 0.044, 0.025, 0.062, 0.066, material('teal', 0x19b3b8), root)
plate('centre', 0.040, 0.025, 0.068, material('centre', 0xf4f1e8), root, dome=0.002)

# The box a hand takes it by
bpy.ops.mesh.primitive_cube_add(size=1)
collision = bpy.context.object
collision.name = 'collision'
collision.scale = (0.4, 0.1, 0.4)
collision.location = (0, -0.03, 0)
collision.display_type = 'WIRE'
collision.hide_render = True
collision.parent = root

# The concept sheet beside it, its front view the size of the model
image = bpy.data.images.load(os.path.join(HERE, 'resources/targets/target-concept.png'))
ref = bpy.data.objects.new('reference', None)
ref.empty_display_type = 'IMAGE'
ref.data = image
ref.empty_display_size = 1.36
ref.rotation_euler = (math.radians(90), 0, 0)
ref.location = (0.47, 0.3, 0)
scene.collection.objects.link(ref)

scene.view_settings.view_transform = 'Standard'
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(HERE, 'resources/targets/target.blend'))

# Export, without the reference
exec(open(os.path.join(HERE, 'scripts/targets/export-target.py')).read())

# A preview
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
sun.data.energy = 3
sun.rotation_euler = (math.radians(50), 0, math.radians(-30))
scene.collection.objects.link(sun)
world = bpy.data.worlds.new('world')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs[0].default_value = (0.6, 0.6, 0.6, 1)
scene.world = world
camera = bpy.data.objects.new('camera', bpy.data.cameras.new('camera'))
camera.location = (0.33, -0.6, 0.12)
scene.collection.objects.link(camera)
track = camera.constraints.new('TRACK_TO')
track.target = root
scene.camera = camera
ref.hide_render = True
scene.render.resolution_x, scene.render.resolution_y = 800, 600
scene.render.filepath = '/tmp/target-preview.png'
try:
    bpy.ops.render.render(write_still=True)
    print('MARK rendered with', scene.render.engine)
except Exception as error:
    print('MARK render failed', error)
