# 小塞 — native Blender asset

Authored against both original photographs: `reference-face.png` establishes the
forehead M, cheek bars, pale eye surrounds, almond eyes, pink nose and intact tall
ears. `reference-body.png` and the user's later “no strips in body” correction
establish a plain orange torso. Tabby bands remain on the face, legs and tail;
the muzzle and chin are warm cream, without a white forehead blaze or socks.

`xiaosai.blend` contains a native 28-bone armature, continuous body surface,
authored normalized skin weights, skinned fur and facial details. Both original
photos and coat textures are packed. The game loads `public/models/xiaosai.glb`
and drives its imported bones using the existing procedural poses and foot IK.
No authored animation clips are included.

Rebuild from the repository root:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/build-xiaosai.py
```

The shared `scripts/rig-cat.py` handles the armature and continuous skin.
Audit native deformation with `--background assets/xiaosai/xiaosai.blend --python
scripts/verify-cat-rig.py`. If this individual asset fails to load, the game uses
its prior procedural 小塞. Generic palette cats are unaffected.

Unseen details are interpretations. This is a game-scale asset with stylized
proportions and short mesh fur; no external generated model or paid service was
used.
