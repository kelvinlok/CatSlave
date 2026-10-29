# CatSlave

A touch-first, five-stage cat-care survival game. One devoted human, up to five tiny overlords, and a living room that refuses to stay clean.

The room, cats, menus, text, meters, and controls are all rendered in **Three.js**. The page contains a single game canvas; canvas-generated textures provide the typography and illustrated tool icons. There are no HTML gameplay controls or external art assets.

## Run locally

Requires Node.js 22.12+ (developed with Node 24).

```sh
npm install
npm run dev
```

Open `http://localhost:5173`. To try it on a phone, connect to the same network and open the Network URL printed by Vite. Keep the development server running. Production files can be served by any static host:

```sh
npm run build
npm run preview
```

## GitHub Pages

The game is published at https://kelvinlok.github.io/CatSlave/.
Repository **Settings → Pages → Source** must be **GitHub Actions**.
The workflow in `.github/workflows/deploy.yml` installs dependencies, runs unit tests,
builds with Vite, and deploys only `dist` on every push to `main`. It can also be
run manually from the Actions tab. The relative Vite base keeps asset links valid
under `/CatSlave/`. Do not publish the source root with Jekyll: its `index.html`
references TypeScript that must first be compiled and bundled.

## Play

- **Learn to care** starts five untimed lessons. **Start your shift** starts the survival run immediately.
- Mobile play is portrait-only. Turning a phone sideways pauses the run and shows a rotate-back screen; returning upright requires Resume. Desktop uses a centered portrait canvas. Cats share the whole floor, including the foreground beside the hideout, bed, and extended rug.
- The camera sits at a low, fixed eye position near the front of the room, initially looking down about **10 degrees** toward the cats at **1.65× zoom**. Swipe right/left on empty room space to look right/left, or up/down to raise/lower your gaze; the camera turns without sliding through the room. **− / +** adjust zoom from 1× to 2.5×; **Reset** restores the starting gaze and 1.65× zoom. Care gestures keep ownership of their targets and never turn the view. Tap an off-screen need marker to look toward its real target, including needs behind your current gaze.
- **Gyro off** enables phone-as-viewpoint tracking and uses your current phone pose as forward. Turn, look up/down, or roll the phone to rotate the view by the same angle, including a full turn around the room. Holding still holds the view; returning to the starting pose returns the view. Touching the screen and pausing freeze the view; releasing/resuming catches up to the phone's direction. Swiping adjusts the reference direction. **Reset** restores the default camera and makes your current phone pose the new forward direction; **Gyro on** turns tracking off. Zoom and viewport resizing preserve orientation. Sensor access requires a secure context (use the HTTPS deployment on a phone; a plain HTTP LAN development URL cannot enable it), and browsers may ask for motion permission after the tap. Denied permission or missing sensor data leaves swipe controls available. The permission flow follows the [Device Orientation specification](https://www.w3.org/TR/orientation-event/).
- The status strip, view controls, and named bottom tool tray sit outside the room viewport. The canvas tracks Safari's visible viewport and safe areas as browser chrome changes; no fullscreen or Home Screen installation is required.
- Read the picture in a cat’s thought bubble and select a tool. Sweep poop, rub vomit and brush fur at the outlined floor target. Hold over the bowl to pour food; hungry cats also accept a hold on their thought bubble. For play, hold inside the hollow arch above and beside the cat’s head, then wave to finish faster: continuous movement adds up to twice the base hold rate (up to 3× total). Leaving and re-entering the arch earns no movement bonus. A stationary wand still completes care in three seconds at level one.
- Cats use a four-beat walk with jointed legs and planted, level paws, including when backing out of the hideout. They breathe, twitch their ears, blink gradually and swish smoothly skinned tails. Sleeping, grooming, eating, playing and furniture poses blend over 0.2 seconds; the simulation clock freezes the entire pose on pause. They roam across the shared room; hungry and bored cats wait near their care target.
- Your first cat is Choco, modeled from the reference photo: a stocky chocolate-and-white cat with golden eyes, a pink nose, a narrow white blaze, white muzzle and chest, a chocolate chin patch, white toes, and one fully white foreleg.
- Latte is offered at the first adoption. Her Blender model was checked against all three original photos: white coat, charcoal left-eye mask and right-hip spot, tan face and leg markings, separate brown back patches, two small shoulder marks, green eyes and a dark banded tail. She uses the same animated rig with taller intact ears. The editable source and original references are in [assets/latte](assets/latte/README.md).
- 的的 is offered by the second adoption if he has not already joined. He has a stocky gray body, broad round cheeks, amber eyes, a charcoal nose and a small pink tongue sticking out. The tongue is specific to his appearance and follows his animated head.
- 小塞 is offered by the third adoption if still available. This orange tabby has a slimmer face, tall pink-lined ears, tapered forehead M markings, paired cheek stripes, cream eye outlines, almond-shaped eyes, a pink nose and pale muzzle. The torso is solid orange with a pale underside; stripes are limited to the face, legs and tail.
- Yelo is featured at the fourth adoption if still available. Her two-photo Blender model has an orange tabby saddle, white muzzle/blaze/chest and legs, a large white hindquarter, amber-olive eyes, a pink nose, and uneven blunt ear tips. Her native rig and original references are in [assets/yelo](assets/yelo/README.md), and she can remain in the free-play roster.
- Miller joins the adoption pool and is offered alongside Yelo at the fourth adoption if available. Both supplied photos informed the brown classic-tabby swirls, forehead M, green-gold eyes, white chest/toe socks and spotted belly. The native Blender rig and original references are in [assets/miller](assets/miller/README.md); adopted Miller is retained in saved free play.
- Momo can be adopted alongside 小塞 at the third adoption. The three-photo Blender model has a broad cream ruff, shaggy cheeks and legs, a taupe saddle, dark face/ear/leg points, blue eyes, white toe tips and a thick plume tail. Source and references are in [assets/momo](assets/momo/README.md).
- 震震子 joins the random adoption pool while the existing featured adoption pairs stay the same. The reference-based Blender model has a short white coat across the chest, belly and legs, a grey-brown tabby saddle and cap, a ringed tail, golden eyes and a pink nose. Adopting 震震子 unlocks the cat-dex profile and preserves the cat in a winning free-play roster. Source and references are in [assets/zhenzhenzi](assets/zhenzhenzi/README.md).
- 丁丁 completes the nine-cat collection and joins random adoption without changing the featured pairs. The four-photo Blender model has a dense grey-brown mackerel coat, a small white chin and bib, white toe tips, yellow-green eyes and a short bent tail. Source and references are in [assets/dingding](assets/dingding/README.md).
- Cat-dex cards use head portraits rendered from the actual Blender models, showing each cat's markings, eyes and fur. Only unlocked portraits load when opening the grid; all nine total about 220 KB and need no additional live 3D scenes. After changing a model, run `node scripts/render-cat-portraits.mjs` to regenerate `public/portraits/`; the asset test checks that every portrait matches its source GLB. Individual profiles retain the interactive 3D model.
- Between care needs, cats choose unoccupied furniture: hop up the three-tier cat tree, crawl into a cardboard box through its circular opening, watch from the windowsill, perch on the cabinet, nap on the bench, bed or sunny floor, groom on the rug, and scratch the post. Approaches and departures use staged movement with jump arcs and object-specific poses. Cats return to the open floor before a new need starts its patience timer.
- Cats occasionally stretch during quiet floor pauses: reach their front paws forward, lower their chest, raise their hips, briefly hold with closed eyes, then return to standing over 4.2 seconds. Attempts are staggered, with a 28–44 second cooldown, and defer around walls, other cats, furniture visits and active needs. New needs interrupt the stretch; pausing freezes it.
- Poop, vomit, and fur spawn beside the cat’s paws and remain there when it walks away. Wet, irregular vomit contains food pieces and foam; shed fur is a dry tangle of fine strands matching the coat. Sweeping removes the three poop layers from top to bottom, mopping wipes an irregular edge across the puddle, and brushing gathers the strands into a ball before sweeping it away.
- Hold the food tool over the bowl to pour a visible stream of kibble and progressively fill it. Moving away or releasing stops the pour; returning resumes it. The wand is a standalone rod, string and feathers held in the head-level play arch, with no floor toy. Cats track its tip and repeatedly crouch, lean and reach to fetch it while held. Leaving the arch or releasing stops play; progress is retained. Completed care produces floating hearts; a full bowl stays briefly while the cat eats.
- During a run, picture-only thought bubbles show needs, a ring shows remaining patience, and floor meters show care progress. Every tool has its name under its icon; tool levels use dots. Written instructions remain in the tutorial.
- Progress stays when you change tools. Selecting the wrong tool wastes time but does not directly damage you.
- An overdue task makes its cat angry. After a one-second warning, it deals 10 damage, then attacks every four seconds until cared for. A cat can attack from anywhere in the room: its full-screen lunge and two sweeping sets of claw marks play in a foreground Three.js layer without turning your view. Complete the task during the warning to cancel the hit.
- Survive the timer to advance. Between stages, recover 20 HP (up to 100), choose one of two new cats, and select one free tool upgrade. A perfect stage—no HP lost during that stage, even if care requests remain at timeout—opens a bonus round before adoption. Winning the bonus adds one extra upgrade; losing keeps the normal single upgrade. Gold arrow tokens show remaining picks; the next stage starts after all picks are spent. Picks may improve the same tool twice, up to level three. Upgrades increase work efficiency to 1.5× and then 2×.
- Max out Sweeper, Mop and Brush to automatically unlock the Vacuum at no extra cost. The upgrade screen shows how many cleaners have reached level 3, and a brief tool-merging animation celebrates the unlock. It replaces all three in the tray and upgrade list. One click or tap on a mess clears that poop, vomit or fur completely, with a short vacuum sound on each cleanup; Food and Wand remain separate. The unlock lasts for the current run and resets on restart. With three perfect stages and three bonus wins, it can be unlocked for stage four.
- Survive stage five to win. Zero HP ends the run. Restarting resets all progression.
- The pause button freezes the simulation. Browser interruptions also pause; resume explicitly when ready.
- Sound starts after your first tap or keypress. Tools have distinct contact effects; cats meow for new needs, give a soft 0.65-second purr when wand play clears the last outstanding need or after a bonus pat (at most once every 10 seconds across all cats; cleaning, feeding, and sleeping stay free of purrs), and make quiet eating, scratching, box-rustling, pawstep, and landing sounds. **Sound: on / soft / off** in the title and pause menus cycles the saved volume. Pause, backgrounding, and restart stop active sounds. Five bundled CC0 recordings from Freesound are mixed with original synthesized Foley; [credits, source links, and processing details](public/audio/CREDITS.md) document the roughly 216 KiB recording payload. Playback uses local files and falls back to synthesized effects if a recording fails to load.
- The HUD shows a health bar, stage progress, and a count of waiting needs on each tool. Practice and help show animated tool/target gestures. Hearts, target rings, tool highlights and reward tokens convey feedback without taglines or instructional sentences. Menus retain concise action labels. Zoom buttons disable at their limits.
- Pause includes a five-tool handbook, restart, and main-menu routes. Restart and leaving an active shift ask before discarding progress; restarting a tutorial repeats the tutorial. Escape closes help or confirmation first, then resumes from pause.
- Menus and upgrade choices remain vertical on short portrait screens. Buttons show hover, press, and keyboard focus; dragging off or cancelling a press never activates it.
- Victory brings every adopted cat forward into a semicircle around the player. Staggered walks settle into happy squints, raised tails, gentle head tilts, and floating hearts. The scene replaces the results panel, keeps replay and main-menu controls clear, and restores the regular camera when leaving.

Mouse input works on desktop. Tab / Shift+Tab cycle menu controls, arrow keys move an existing focus, and Enter / Space activate it. Number keys select tools from left to right: 1–5 normally, or 1 Vacuum / 2 Food / 3 Wand after unlocking. Escape pauses, goes back, or resumes. Care gestures still require a pointer. Sound preferences are saved locally; the game stores no personal data or permanent progression.

### Bonus-round design

- **Pawdicure:** Choose one adopted cat, then trim all 18 claws across its four paws in 45 seconds. The first claw and each following claw are selected automatically. A timing ring follows the enlarged active toe, with a dot sweeping back and forth automatically. Each claw has a seeded random green arc covering 24–36% of the track. Tap anywhere on the paw (or press Space) while the dot is in green; the press decides immediately and holding never repeats. Clippers close at the claw, a tip pops away with sparkles, and the ring glides to the next toe. Missed claws keep the same zone and stay selected for another try. Wait while the paw moves. Misses cause a brief recovery; completed claws stay completed. Winning awards the existing extra upgrade. Pawdicure is available only through the perfect-stage bonus pool, with no main-menu or standalone player entry. The dedicated test build retains `/?minigame=pawdicure` as a browser-test fixture.
- **Design brief:** Reward a perfect stage with a short cat-care challenge. The seeded random pool contains **Butt Pats** (ten seconds with every adopted cat) and **Pawdicure** (45 seconds with one selected cat); additional mini-games can be registered in `src/bonus.ts`. Inter-stage bonuses occur after stages one through four; stage five ends in victory.
- **Core loop:** Tap each cat’s rump before its individual three-second patience ring empties. Each press counts one pat, lifts the rump and then lets it settle over 1.4 seconds. Holding does not repeat. Surviving ten seconds earns one extra upgrade. Neglecting any cat triggers its scratch animation and forfeits only the bonus reward, without changing run HP. Both outcomes continue to adoption after the result screen.
- **Encounter plan:** A short instruction screen and Ready button precede a 3–2–1 countdown. All existing cats stand side by side, face away and look back at the player. The fixed camera fits the whole lineup; each rump has a separate touch target and patience ring. A large timer turns red and pulses in the final three seconds. Pause, blur and rotation freeze the countdown, patience and scratch recovery. Number keys 1–5 can also pat the corresponding cat.

## Project structure

- `src/simulation.ts`: deterministic locomotion, fixed mess positions, care scheduling, patience, damage, tutorial, progression, and run state. Movement uses a separate seeded random stream. No rendering dependencies.
- `src/gestures.ts`: input routing and normalized gesture recognition. A gesture keeps the target type it started on.
- `src/world.ts`: one shared room, locomotion animation, a low first-person camera with bounded yaw/pitch and zoom, foreground attack sequence, and 3D picking.
- `src/gyro.ts`: opt-in sensor permission, reference-pose calibration, and direct quaternion orientation tracking with screen-rotation compensation.
- `src/cat-model.ts`: cached sculpted cats with smooth procedural coat maps, jointed paws, animated ears and independently cloned tail skeletons. Instance bone textures are released when cats are removed; shared geometry and materials remain cached.
- `src/furniture.ts`, `src/furniture-model.ts`: shared interaction locations and procedural tree, cardboard hideout, and access stools.
- `src/cat-behavior.ts`, `src/cat-animation.ts`: furniture reservations, approach/use/exit routes, floor detours, and interaction poses.
- `src/messes.ts`: cached geometry for distinct liquid, hair, waste, bowl, and toy targets.
- `src/need-icons.ts`: wordless care pictograms that match the floor objects.
- `src/hud.ts`: canvas-textured Three.js UI, screen layout, and raycastable controls.
- `src/main.ts`: rendering loop, input dispatch, resizing, and interruption recovery.
- `src/layout.ts`: shared safe-area layout for the room viewport, HUD, and touch targets. Viewport handling follows WebKit's [Visual Viewport API](https://webkit.org/blog/9674/new-webkit-features-in-safari-13/) support.
- `src/config.ts`: stage timings, tool work requirements, upgrade efficiencies, coat colors, and attack constants.
- `src/types.ts`: internal data contracts. Cat appearance is separate from the neutral behavior profile so model replacements and traits can be added later.

The first run lasts 5 minutes 15 seconds of survival time, plus adoption and upgrade breaks. Initial balance intentionally ramps from one cat with 22 seconds of patience to five cats with 9 seconds. These numbers are starting points for playtesting, not validated retention targets.

## Verify

```sh
npm test
npm run build
npx playwright install chromium webkit
npm run test:browser
```

Unit tests cover simulation rules, camera framing/picking, look limits, and gesture ownership. Browser tests exercise actual canvas input at mobile viewport sizes, including zoom/reset, off-screen target focus, the tutorial, all stages, adoption, upgrades, both outcomes, resizing, and interruption recovery. Gyro tests simulate granted/denied permission and sensor events, including touch/pause suspension and absent-data fallback; real-device sensor behavior still needs verification. Screenshots and failure traces are written to `test-results/`.

Browser campaign tests use a manually advanced simulation clock and shorten idle periods at stage endings; care, adoption, and upgrade actions still go through pointer/touch input. The test-only fixture is available only when Vite runs with `--mode test`; production builds remove it.

### Startup and model loading

The room and controls start with procedural cats. Choco's Blender model loads in the background first; other models are requested for current residents, visible adoption candidates, and the next two adoption candidates during the current stage. The pair is selected once at stage start and retained through any bonus round. Restoring a saved roster does not download its cats until the player enters free play. Downloads and decoding run one at a time, with a 15-second request timeout and a cached result per cat for the session. A failure leaves the procedural cat playable without retrying every frame.

Models that arrive later replace the visible anatomy at the next world update. The cat's root, picking ID, animation transition state, and gameplay state stay intact, including adoption previews, attacks, and the victory entrance. Shared geometry/materials remain cached; replaced instance skeletons are disposed.

A fresh production title screen requests 5,141,670 bytes of compressed model data (Choco), down from 13,123,260 bytes. All nine models total 43,771,214 bytes in the production build versus 103,120,340 bytes in the source assets (57.6% smaller). No GLB completion is required to enter the game. These are file sizes, not measured mobile transfer totals; aborted requests can transfer only part of a model. See [startup loading evaluation](docs/startup-loading.md) for the earlier progressive-loading measurements.

Production builds automatically gzip the original GLBs at maximum compression and verify each round trip byte-for-byte. Only `models/*.glb.gz` files are shipped; the source GLBs stay unchanged for development and Blender workflows. The client uses the browser's native `DecompressionStream` API before passing the exact original bytes to GLTFLoader. It also accepts a response already decoded by the host. This works on a plain static host, including GitHub Pages, without configuring `Content-Encoding`. Geometry, textures, rigs, materials, and rendering settings are unchanged; no lossy quantization or simplification is added.

Run `npm run build` and `node scripts/verify-model-downloads.mjs` to check the compressed production transport on desktop Chromium and mobile WebKit. The verifier builds an isolated test fixture, loads all nine native rigs through a subdirectory URL, checks touch input and browser-decoded SHA-256 hashes, and opens the actual production bundle without test hooks. Reports and captures are saved under `artifacts/download-optimization/`. The normal unit suite also checks all model round trips. Native gzip decompression is required in production; an unsupported browser follows the existing procedural-model fallback.

## Prototype boundaries

- Modern WebGL 2 browsers only; no native app packaging, backend, or account system.
- The nine custom cats—Choco, Latte, 的的, 小塞, Yelo, Miller, Momo, 震震子 and 丁丁—use imported Blender armatures with continuous weighted skin, painted coats and skinned fur. Game animation and foot IK drive their native bones. Editable sources, original photo references and rebuild instructions are in `assets/choco/`, `assets/latte/`, `assets/didi/`, `assets/xiaosai/`, `assets/yelo/`, `assets/miller/`, `assets/momo/`, `assets/zhenzhenzi/` and `assets/dingding/`; game assets are under `public/models/`. Yelo is featured at the fourth adoption opportunity and can join free play. All cats have identical behavior profiles.
- No permanent upgrades or economy. Every custom cat retains its procedural appearance while loading or if its asset cannot load.
- Text and controls are drawn in WebGL, so they do not have the screen-reader semantics of HTML controls. The canvas has an accessible description and keyboard shortcuts, but this is not a fully accessible UI.
- Mobile browser emulation is not physical-device validation. Actual iOS Safari, Android Chrome, GPU performance, and safe-area behavior still need testing on real phones.

### Validation limitations

The scene uses shared/cached geometry, no dynamic shadows, and a capped pixel ratio. Browser tests log current five-cat draw calls, triangles, and frame rates. Local software rendering falls below the 30 FPS minimum target; these are not phone benchmarks, and the 60 FPS goal remains unverified on physical hardware.

Playwright 1.64's Windows WebKit has a [confirmed upstream issue](https://github.com/microsoft/playwright/issues/42885) that paints WebGL canvases blank after their drawing buffer resizes. Static WebKit layout screenshots reload at the requested size to avoid that tooling issue. The resize/input/context-recovery tests run without that workaround, but successful input assertions do not establish correct post-rotation visual output in that affected browser build. Chromium resize screenshots are inspected normally. Actual mobile Safari rotation remains a required device check.
