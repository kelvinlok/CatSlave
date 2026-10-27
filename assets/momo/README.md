# Momo — fine soft-fur groom

The [soft-fur guide](https://yelzkizi.org/7-powerful-blender-soft-fur-fluffy-hair-cycles/)
informed this replacement for the rejected alpha tufts. All three user photographs
remain packed into `momo.blend` and preserved beside it.

The Blender source contains 180,000 independent Catmull-Rom hair curves with zero
clumping, varied lengths, gentle curvature, slight endpoint variation, and fine
tapered tips. Cream, taupe, and seal regions use Principled Hair BSDF with roughness
0.40 and random roughness 0.10. Large area lights reveal the soft silhouette.
Use Cycles: Material Preview/Eevee does not reproduce this hair shader. A portable
CPU default is saved; batch authoring uses the detected OptiX device for previews.

The original 28-bone armature drives continuous weighted skin. All three hair
regions follow it through unique `GroomUV` attachments on explicitly triangulated
skin and Deform Curves on Surface. The attachment UVs remain in Blender only;
the game export retains the coat UVs without splitting every skin triangle.
The hidden `Momo_SkinnedFur` mesh is the game proxy; leave it hidden for Cycles renders.

The tail has a rounded, tapered core and a fine seal plume. Its weights are painted
by distance to the authored tail and torso surfaces, so the front of the plume
cannot stay pinned to the body during tail motion. This option is enabled only for
Momo. `scripts/verify-cat-rig.py` checks the entire upper tail's weights and motion.

The game uses 30,000 narrow bent fibres from the same groom and root weights. It is
less soft than the Cycles render. The open-eye model draws 28 calls and about 249,000
triangles, up from 159,158 triangles in the rejected pass. This is a deliberate
quality cost; physical-phone FPS is unmeasured. Meshopt reduces the download to
6,490,260 bytes, down from 11,181,576 bytes. No hairs are simplified away. Positions,
normals, UVs and colours use 16-bit quantization; skin weights remain Float32.
Three's bundled Meshopt decoder loads only for Momo.

Install the isolated authoring tools once, then rebuild from the repository root:

```powershell
npm install --prefix artifacts/momo-soft-groom/tooling --save-exact --no-audit --no-fund @gltf-transform/core@4.5.1 @gltf-transform/functions@4.5.1 @gltf-transform/extensions@4.5.1 meshoptimizer@1.2.0
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python scripts/build-momo.py
```

`build-momo.py` authors the anatomy, then calls `groom-momo.py` to replace the
intermediate coat, save the native groom, export a raw proxy, optimize it through
`optimize-momo.mjs`, and render the preview. To regroom existing anatomy, run
`groom-momo.py` with `assets/momo/momo.blend` loaded. Other cat assets are untouched.

Momo remains available alongside Xiaosai at the third adoption, in the random pool,
saved free play, and the seven-custom-cat practice roster. The fallback remains.
The anatomy is still stylized; unseen reference areas are interpreted.
