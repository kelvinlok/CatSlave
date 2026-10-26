# Miller — native Blender asset

Modeled from the three user-supplied photographs, preserved here and packed in miller.blend:

- reference-portrait.png: brown/grey classic tabby saddle with bold curved side markings,
  forehead M, cheek bars, green-gold eyes with dark rims, brick-pink nose,
  white muzzle/chest and toes, tall pointed ears with pink interiors, dark tail tip.
- reference-belly.png: cream underside with separate dark spots, striped limbs,
  white toe socks and dark paw pads. Social overlays are reference-image content only.

- reference-stretch.png: darker brown/charcoal saddle and strong dark stripes;
  this later reference takes precedence for coat brightness. White areas stay unchanged.

Miller follows the existing game's stylized proportions. Markings obscured by the
pose, plants or hand are interpreted from the visible coat; no breed or sex is inferred.

The source contains a native 28-bone Blender armature, continuous skin, authored
weights, skinned fur and facial details. Textures and reference photos are packed.
The GLB uses the existing Three.js skeleton animation and foot IK; no authored clips.

Rebuild from the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python scripts/build-miller.py
```

Audit with --background assets/miller/miller.blend --python scripts/verify-cat-rig.py.
The final export is public/models/miller.glb.

Miller is eligible in the adoption pool and is offered alongside Yelo at the fourth
adoption if still available. The five-stage campaign remains intact. Adoption retains
Miller in the saved free-play roster; the all-custom practice roster also includes Miller.
A dedicated procedural fallback preserves identity if the GLB cannot load.
