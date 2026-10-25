"""Compatibility entry point for Latte; shared rig authoring lives in rig-cat.py."""
import runpy
from pathlib import Path
rig_tools=runpy.run_path(str(Path(__file__).with_name('rig-cat.py')))
rig_character=rig_tools['rig_character']
export_and_save=rig_tools['export_and_save']
if __name__=='__main__':
    import bpy
    scene=bpy.context.scene;root=bpy.data.objects['Latte_Blender']
    arm,skin=rig_character(scene,root)
    export_and_save(scene,root,arm,skin)
