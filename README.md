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

- **Tutorial** starts five untimed lessons. **Play** starts the survival run immediately.
- Mobile play is portrait-only. Turning a phone sideways pauses the run and shows a rotate-back screen; returning upright requires Resume. Desktop uses a centered portrait canvas. Cats share the whole floor, including the foreground beside the hideout, bed, and extended rug.
- The camera sits at a low, fixed eye position near the front of the room, initially looking down about **10 degrees** toward the cats at **1.65× zoom**. Swipe right/left on empty room space to look right/left, or up/down to raise/lower your gaze; the camera turns without sliding through the room. **− / +** adjust zoom from 1× to 2.5×; **Reset** restores the starting gaze and 1.65× zoom. Care gestures keep ownership of their targets and never turn the view. Tap an off-screen need marker to look toward its real target, including needs behind your current gaze.
- **Gyro off** enables optional tilt-to-look and calibrates to how you are holding the phone. Tilt beyond a small dead zone to turn your gaze; hold steady to stop. Touching the screen, pausing, and rotating suspend movement. Reset recalibrates; **Gyro on** turns it off. Sensor access requires a secure context (use the HTTPS deployment on a phone; a plain HTTP LAN development URL cannot enable it), and browsers may ask for motion permission after the tap. Denied permission or missing sensor data leaves swipe controls available. The permission flow follows the [Device Orientation specification](https://www.w3.org/TR/orientation-event/).
- The status strip, view controls, and named bottom tool tray sit outside the room viewport. The canvas tracks Safari's visible viewport and safe areas as browser chrome changes; no fullscreen or Home Screen installation is required.
- Read the picture in a cat’s thought bubble and select a tool. Sweep poop, rub vomit and brush fur at the outlined floor target. Hold over the bowl to pour food; hungry cats also accept a hold on their thought bubble. For play, press and hold inside the hollow arch above and beside the cat’s head. Cleaning requires strokes; feeding and wand play accept a stationary hold.
- Cats use a four-beat walk with jointed legs and planted, level paws, including when backing out of the hideout. They breathe, twitch their ears, blink gradually and swish smoothly skinned tails. Sleeping, grooming, eating, playing and furniture poses blend over 0.2 seconds; the simulation clock freezes the entire pose on pause. They roam across the shared room; hungry and bored cats wait near their care target.
- Your first cat is Choco, modeled from the reference photo: a stocky chocolate-and-white cat with golden eyes, a pink nose, a narrow white blaze, white muzzle and chest, a chocolate chin patch, white toes, and one fully white foreleg.
- Between care needs, cats choose unoccupied furniture: hop up the three-tier cat tree, crawl into a cardboard box through its circular opening, watch from the windowsill, perch on the cabinet, nap on the bench, bed or sunny floor, groom on the rug, and scratch the post. Approaches and departures use staged movement with jump arcs and object-specific poses. Cats return to the open floor before a new need starts its patience timer.
- Poop, vomit, and fur spawn beside the cat’s paws and remain there when it walks away. Wet, irregular vomit contains food pieces and foam; shed fur is a dry tangle of fine strands matching the coat. Sweeping removes the three poop layers from top to bottom, mopping wipes an irregular edge across the puddle, and brushing gathers the strands into a ball before sweeping it away.
- Hold the food tool over the bowl to pour a visible stream of kibble and progressively fill it. Moving away or releasing stops the pour; returning resumes it. The wand is a standalone rod, string and feathers held in the head-level play arch, with no floor toy. Cats track its tip and repeatedly crouch, lean and reach to fetch it while held. Leaving the arch or releasing stops play; progress is retained. Completed care produces floating hearts; a full bowl stays briefly while the cat eats.
- During a run, picture-only thought bubbles show needs, a ring shows remaining patience, and floor meters show care progress. Every tool has its name under its icon; tool levels use dots. Written instructions remain in the tutorial.
- Progress stays when you change tools. Selecting the wrong tool wastes time but does not directly damage you.
- An overdue task makes its cat angry. After a one-second warning, it deals 10 damage, then attacks every four seconds until cared for. A cat can attack from anywhere in the room: its full-screen lunge and two sweeping sets of claw marks play in a foreground Three.js layer without turning your view. Complete the task during the warning to cancel the hit.
- Survive the timer to advance. Between stages, recover 20 HP (up to 100), choose one of two new cats, and select one free tool upgrade. Upgrades increase work efficiency to 1.5× and then 2×.
- Survive stage five to win. Zero HP ends the run. Restarting resets all progression.
- The pause button freezes the simulation. Browser interruptions also pause; resume explicitly when ready.

Mouse input works on desktop. Number keys 1–5 select tools, and Escape pauses or resumes. The prototype is silent and stores no personal data or permanent progression.

## Project structure

- `src/simulation.ts`: deterministic locomotion, fixed mess positions, care scheduling, patience, damage, tutorial, progression, and run state. Movement uses a separate seeded random stream. No rendering dependencies.
- `src/gestures.ts`: input routing and normalized gesture recognition. A gesture keeps the target type it started on.
- `src/world.ts`: one shared room, locomotion animation, a low first-person camera with bounded yaw/pitch and zoom, foreground attack sequence, and 3D picking.
- `src/gyro.ts`: opt-in sensor permission, neutral-pose calibration, dead zone, smoothing, and tilt-to-look.
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

## Prototype boundaries

- Modern WebGL 2 browsers only; no native app packaging, backend, or account system.
- All cats share a sculpted procedural rig with coat variations; Choco retains the reference photo's proportions and asymmetric markings. All cats have identical behavior profiles.
- No permanent upgrades, economy, audio, or imported cat models.
- Text and controls are drawn in WebGL, so they do not have the screen-reader semantics of HTML controls. The canvas has an accessible description and keyboard shortcuts, but this is not a fully accessible UI.
- Mobile browser emulation is not physical-device validation. Actual iOS Safari, Android Chrome, GPU performance, and safe-area behavior still need testing on real phones.

### Validation limitations

The scene uses shared/cached geometry, no dynamic shadows, and a capped pixel ratio. Browser tests log current five-cat draw calls, triangles, and frame rates. Local software rendering falls below the 30 FPS minimum target; these are not phone benchmarks, and the 60 FPS goal remains unverified on physical hardware.

Playwright 1.64's Windows WebKit has a [confirmed upstream issue](https://github.com/microsoft/playwright/issues/42885) that paints WebGL canvases blank after their drawing buffer resizes. Static WebKit layout screenshots reload at the requested size to avoid that tooling issue. The resize/input/context-recovery tests run without that workaround, but successful input assertions do not establish correct post-rotation visual output in that affected browser build. Chromium resize screenshots are inspected normally. Actual mobile Safari rotation remains a required device check.
