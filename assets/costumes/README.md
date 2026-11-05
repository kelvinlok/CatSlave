# Costume fabric kit

`costumes.blend` contains an editable wool cape and scarf, sewn edges, cloth
thickness modifiers, a linked native Choco fitting reference, studio lighting,
and packed woven-fabric normal and roughness maps. The source cat is unchanged.

Rebuild with Blender 5.2 from the repository root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/build-costume-fabric.py
```

The script writes the game meshes to `src/generated/costume-geometry.json` and
the two reusable 512 px maps to `public/textures/costumes`. Mesh positions use
game coordinates (+Y up, +Z forward). UVs are measured in game units; use a
texture repeat of `(8, 8)`, repeat wrapping, and non-color interpretation for
both maps. Normal maps are tangent-space OpenGL (+Y) normals. Garment roles
separate tintable fabric from contrasting trim; the exported geometry itself
has no baked color or lighting.

The cape has shoulder tension folds, a loose rear hem, and sewn side binding.
Its scooped neckline clears the back of the skull. The scarf has a fitted,
tilted neck band, flat draped tails, woven stripes, and short fringe. The band
follows the diagonal neck anatomy; a horizontal ring would intersect the chest.
The entire band follows Choco's actual native skin beneath the cheeks, with
5–19 mm of clearance including cloth thickness and piping. This bounds both
penetration and excessive gaps, preventing a floating ring. The scarf tails
and rear cape hem remain loose.
`rest-fit.json` records minimum, maximum, and 95th-percentile clearances, with a
separate neck-band measurement and no vertices inside Choco's rest skin. These rest-pose checks do
not replace animation checks or fit adjustments for other cats.

The cape has 4,384 triangles and scarf 5,088. Cloth thickness and fold geometry
are baked for the real-time export;
the game handles pose following. This is a lightweight authored cloth asset,
not a runtime cloth simulation.
