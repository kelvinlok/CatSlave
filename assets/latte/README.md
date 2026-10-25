# Latte — Blender source asset

Latte was authored in Blender from all three original photographs supplied in
the “Name the first cat Choco” conversation. The originals are saved beside
the source and packed into the `.blend` for future reference.

- `reference-standing.png`: predominantly white coat, round charcoal hip island,
  tan and charcoal foreleg markings, white toes, and brown tail.
- `reference-face-legs.png`: charcoal left-eye mask (viewer right), green irises,
  offset tan nasal stripe, small opposite forehead mark, rose-brown nose,
  white muzzle and chin, tall intact pink ears, asymmetric leg patches.
- `reference-back.png`: two separate larger brown dorsal islands and two small
  shoulder marks, with white gaps between them. These are not a continuous saddle.
- `reference-ear-closeup.png`: pale fur around the pink left ear, including its
  base. The charcoal eye mask stops on the head rather than coloring the ear shell.

`latte.blend` contains the editable sculpt, a native deformation armature, packed coat
textures, original photographs, and studio lighting/camera. `coat.png` and
`fur-normal.png` are the two 2048-pixel texture atlases. The game loads
`../../public/models/latte.glb`; `../../scripts/build-latte.py` reproduces it:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/build-latte.py
```

`rig-latte.py`, called by the builder, unions the body, head, ears, limbs, paws
and tail into one closed continuous skin. It preserves the painted coat atlas
and authors normalized skin weights in Blender. Fur and facial details also
follow the native skeleton. Two intermediate neck joints distribute head turns.

Three.js imports the complete armature, skin weights and inverse bind matrices.
The game's existing IK, attention and pose logic drive these imported bones;
it does not replace or re-skin Latte's body parts at runtime. Blinks retain
separate open-eye/closed-eye visuals. Native animation clips are not required
for these procedural game behaviors. The `.blend` can be posed in Pose Mode.

Each cat has its own bones and one shared skeleton palette for all its skinned
meshes. Geometry and materials are shared between instances. Fur uses tapered
mesh ribbons plus a normal map. If downloading the asset fails, the previous
procedural model remains available.

The photographs establish the visible markings, but do not show every angle.
Hidden surfaces and the exact tail band arrangement are conservative
interpretations. This is a real-time skinned game asset, not a film fur groom.
