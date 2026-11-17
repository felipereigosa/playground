# Exports the target (the empty `target` and its children) from
# resources/targets/target.blend to assets/targets/target.glb, modifiers
# applied. Run in Blender with that file open, or on the laptop:
#   blender -b resources/targets/target.blend --python scripts/targets/export-target.py
import bpy, os

def export():
    here = os.path.dirname(os.path.dirname(os.path.dirname(bpy.data.filepath)))
    root = bpy.data.objects['target']
    for obj in bpy.data.objects:
        obj.select_set(obj == root or obj.parent == root)
    out = os.path.join(here, 'assets/targets/target.glb')
    bpy.ops.export_scene.gltf(filepath=out, use_selection=True, export_apply=True,
                              export_yup=True)
    print('MARK exported', out, os.path.getsize(out))

export()
