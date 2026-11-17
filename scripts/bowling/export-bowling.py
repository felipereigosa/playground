# Exports the bowling set from resources/bowling/bowling.blend to
# assets/bowling/bowling.glb: the ball, the pin and the icon (`bowling`) with
# their children, modifiers applied. The hand under grip_hold stays out. Run
# in Blender with that file open, or on the laptop:
#   blender -b resources/bowling/bowling.blend --python scripts/bowling/export-bowling.py
# Names: no mesh may be named like an object (three's loader would rename one
# of them), which is why the meshes end in _mesh.
import bpy, os

def export():
    here = os.path.dirname(os.path.dirname(os.path.dirname(bpy.data.filepath)))
    roots = [bpy.data.objects[name] for name in ('ball', 'pin', 'bowling')]
    for obj in bpy.data.objects:
        obj.select_set(obj in roots or (obj.parent in roots and obj.type in ('MESH', 'EMPTY')))
    out = os.path.join(here, 'assets/bowling/bowling.glb')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_apply=True,
                              export_yup=True, export_animations=False)
    print('MARK exported', out, os.path.getsize(out))

export()
