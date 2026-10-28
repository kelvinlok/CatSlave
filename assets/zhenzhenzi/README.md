# 震震子 — native Blender model

Authored from the three supplied photographs, kept alongside the model and packed
inside `zhenzhenzi.blend`:

- `reference-window.png`: golden eyes, narrow uneven white blaze, dark crown and
  diagonal cheek stripes, pink nose, tall pink-lined ears, white bib.
- `reference-seated.png`: charcoal-grey tabby saddle, white forelegs and paws,
  ringed tail with a rounded dark tip. The visible tongue is a momentary pose.
- `reference-perch.png`: white chest and long white forelegs, darker back, cheek
  markings and short, close fur. Unseen markings are interpreted conservatively.

The model follows the game's stylized proportions. It has a continuous manifold
skin, a 28-bone Blender armature, authored deformation weights, short skinned fur,
painted coat/normal textures, golden radial irises, pink nose and white whiskers.
The tail uses distance-painted anatomical ownership to avoid pinning part of the
tail to the torso. Other cat assets are unchanged.

The game loads `public/models/zhenzhenzi.glb` and animates the native bones with the
existing movement and foot IK. The GLB contains no baked animation clips. The cat
joins the adoption pool, saved free play, practice roster and cat dex without
changing existing featured adoption pairs. A white/tabby fallback covers asset
loading failures.

Rebuild from the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python scripts/build-zhenzhenzi.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background assets/zhenzhenzi/zhenzhenzi.blend --python scripts/verify-cat-rig.py
```

The builder saves the editable source and exported game model, packs all textures
and references, and renders `artifacts/zhenzhenzi-blender/zhenzhenzi-three-quarter.png`.
The saved source defaults to CPU Cycles; the batch preview uses OptiX if available.
Visual and rig checks are recorded under `artifacts/zhenzhenzi-rig/`.
