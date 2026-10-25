# Choco — Blender source asset

Choco is the first cat in CatSlave. This asset was authored in Blender 5.2 from
the supplied `reference.png`: chocolate coat, broad cheeks, amber eyes, pink
nose, tapered white blaze, white muzzle/bib, chocolate chin, white toes,
full white left foreleg and an uneven/clipped left ear.

Files:

- `choco.blend`: continuous skin, native 28-bone armature, authored skin weights,
  packed coat textures/reference, studio camera and lighting. The original
  default scene remains separate.
- `coat.png` and `fur-normal.png`: shared painted atlas and fine fur normal map.
- `../../public/models/choco.glb`: shipped asset, including texture images.
- `../../scripts/build-choco.py`: deterministic Blender authoring script.
- `../../scripts/rig-cat.py`: shared native skeleton, surface union, UV transfer
  and skin-weight authoring used by Choco and Latte.

Rebuild from the repository root with Blender 5.2:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/build-choco.py
```

The authoring helpers use game coordinates (+Y up, +Z forward), convert to
Blender coordinates, then export standard glTF Y-up. Three.js imports the
complete armature, skin weights and inverse binds. Existing foot IK, attention
and animation logic drive the imported bones, including two neck joints and
the tail chain. Skin and fur bend continuously at the limb/neck junctions.
The asset can be posed directly in Blender Pose Mode. No animation clips are
required for the game's procedural behaviors.

The game preloads this asset once. Download/parse failure falls back to the
previous procedural Choco so gameplay can still start. Latte has a separate
Blender asset and cache; the remaining cats retain their procedural models.
Fine fur uses skinned tapered mesh ribbons and normal mapping. Each cat has
independent bones and one skeleton palette shared by its meshes. This is a
real-time skinned game asset, with stylized proportions and simplified fur.

Only the visible side is established by the reference photograph; unseen body
and rear markings are interpretations. No external models or paid generation
services were used.
