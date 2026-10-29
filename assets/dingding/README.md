# 丁丁 — native Blender model

Authored from the four supplied photographs, preserved beside the source and packed into `dingding.blend`:

- `reference-front.png`: round yellow-green eyes, warm nasal bridge, fine forehead M, white chin and small bib, tabby forelegs.
- `reference-side.png`: dense narrow mackerel striping, pale muzzle, white toe tips and close short fur.
- `reference-tail.png`: short upright ringed tail with a dark bent tip, dark spine, striped back.
- `reference-walking.png`: grey-brown side striping, white toes, charcoal leg bands and compact tail shape.

The source retains the game's stylized anatomy. Details not shown clearly in the photographs are interpreted. The warm nasal bridge has no white blaze; the body stays predominantly tabby, unlike 震震子. The tail is shorter than the other short-haired cats and bends near its tip.

A native 28-bone Blender armature deforms continuous manifold skin and short coat fibres. Coat and normal atlases are packed. The game animates the native skeleton using its existing motion system; no baked clips are needed. 丁丁 is the ninth custom cat, eligible for adoption and retained in saved free play, practice and the cat dex. Existing featured adoption pairs are preserved.

Rebuild and validate from the repository root:

```powershell
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background --factory-startup --python scripts/build-dingding.py
& 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe' --background assets/dingding/dingding.blend --python scripts/verify-cat-rig.py
node scripts/render-cat-portraits.mjs
```

The builder saves `public/models/dingding.glb` and renders `artifacts/dingding-blender/dingding-three-quarter.png`. Verification and actual game captures are recorded under `artifacts/dingding-rig/`.
