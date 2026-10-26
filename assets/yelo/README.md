# Yelo — native Blender asset

Yelo is an orange-and-white female cat, modeled from the two supplied photos:

- `reference-portrait.png`: broad white muzzle/chest, narrow forehead blaze,
  amber-olive eyes, pink nose, large white hindquarter, and uneven blunt ears.
- `reference-sitting.png`: orange tabby saddle and shoulder markings, white
  forelegs and paws, white lower hindlegs, and a ringed orange tail.

The lower outward right ear (viewer left) and taller, more upright left ear
have rounded/blunted tips with a slight curl. Unseen markings are interpretations
of the available views; proportions and fine fur follow the game's style.

`yelo.blend` contains one continuous body surface, a native 28-bone armature,
normalized authored skin weights, skinned coat fibres and facial details.
Both original photographs and the coat textures are packed. The exported game
asset is `public/models/yelo.glb`. Existing gameplay poses and foot IK drive the
imported bones; no animation clips are included.

Rebuild from the repository root with Blender 5.2:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python scripts/build-yelo.py
```

The builder shares `scripts/rig-cat.py` with the other custom cats. Check the
saved source with `--background assets/yelo/yelo.blend --python
scripts/verify-cat-rig.py`.

Yelo is featured at the fourth adoption opportunity, after 小塞, and is retained
in the free-play roster. Her palette entry is appended so existing generic
indices remain unchanged. A separate orange-and-white procedural fallback keeps
her recognizable if her GLB fails to load. No external generated model or paid
service was used.
