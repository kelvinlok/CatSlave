# Choco — Blender source asset

Choco is the first cat in CatSlave. This asset was authored in Blender 5.2 from
the supplied `reference.png`: chocolate coat, broad cheeks, amber eyes, pink
nose, tapered white blaze, white muzzle/bib, chocolate chin, white toes,
full white left foreleg and an uneven/clipped left ear.

Files:

- `choco.blend`: editable model, named animation parts, packed coat textures,
  studio camera and lighting. The original default scene remains separate.
- `coat.png` and `fur-normal.png`: shared painted atlas and fine fur normal map.
- `../../public/models/choco.glb`: shipped asset, including texture images.
- `../../scripts/build-choco.py`: deterministic Blender authoring script.

Rebuild from the repository root with Blender 5.2:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/build-choco.py
```

The authoring helpers use game coordinates (+Y up, +Z forward), convert to
Blender coordinates, then export standard glTF Y-up. Runtime preserves the
existing foot IK, head/ear pivots, blink controls and five-bone tail, replacing
their visual surfaces. Closed-eye parent nodes must remain visible during
export; hiding a parent can flatten the exported hierarchy.

The game preloads this asset once. Download/parse failure falls back to the
previous procedural Choco so gameplay can still start. Other cats are unchanged.
Fine fur uses ordinary tapered mesh ribbons and normal mapping. This is a
real-time game asset, with articulated surface sections rather than a film fur
groom or a fully deforming production character rig.

Only the visible side is established by the reference photograph; unseen body
and rear markings are interpretations. No external models or paid generation
services were used.
