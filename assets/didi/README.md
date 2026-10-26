# 的的 — native Blender asset

Built from the original `reference.png`: solid blue-grey plush coat, broad
cheeks and chest, copper-amber eyes, dark nose, intact ears, and his small pink
tongue. No white bib, socks or tabby stripes are added. Unseen rear details are
interpretations of the available photograph.

`didi.blend` contains the native 28-bone armature, one continuous body surface,
authored normalized skin weights, skinned coat fibres and facial details. The
tongue is a real exported mesh weighted to the head. Textures and the reference
photo are packed. The game loads `public/models/didi.glb`; procedural game poses
and foot IK drive the imported bones. No animation clips are needed or included.

Rebuild from the repository root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/build-didi.py
```

The builder uses `scripts/rig-cat.py` for the common skin and armature pipeline.
Audit saved native deformation with `--background assets/didi/didi.blend --python
scripts/verify-cat-rig.py`. The game keeps its procedural Didi fallback if this
individual asset fails to load. Generic palette cats are unaffected.

This is a game-scale asset with stylized proportions and mesh-based short fur.
No external generated model or paid service was used.
