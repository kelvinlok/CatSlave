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

## Play

- **Tutorial** starts five untimed lessons. **Play** starts the survival run immediately.
- The entire room is visible from one fixed human-height perspective. Cats share the whole floor, including the foreground beside the hideout, bed, and extended rug; there are no directional views, turn buttons, or camera swipes.
- Read the picture in a cat’s thought bubble, select a tool, then interact with the outlined floor target. Hungry and bored cats also accept input on their thought bubbles; the wand can play directly with the cat. Sweep poop, rub vomit, brush fur, tap to pour food, and drag the wand near a bored cat. Movement-based actions require movement, not holding still.
- Cats walk on four articulated legs, turn toward destinations, pause to sniff, blink, and swish their tails. They roam across the shared room; hungry and bored cats wait near their care target.
- Between care needs, cats choose unoccupied furniture: hop up the three-tier cat tree, crawl into a cardboard box through its circular opening, watch from the windowsill, perch on the cabinet, nap on the bench, bed or sunny floor, groom on the rug, and scratch the post. Approaches and departures use staged movement with jump arcs and object-specific poses. Cats return to the open floor before a new need starts its patience timer.
- Poop, vomit, and fur spawn at the cat’s current floor position and remain there when it walks away. Wet, irregular vomit contains food pieces and foam; shed fur is a dry tangle of fine strands matching the coat.
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
- `src/world.ts`: one shared room, locomotion animation, a fixed perspective camera, foreground attack sequence, and 3D picking.
- `src/cat-model.ts`: cached four-legged cat geometry with articulated hips, shoulders, head, eyes, and tail.
- `src/furniture.ts`, `src/furniture-model.ts`: shared interaction locations and procedural tree, cardboard hideout, and access stools.
- `src/cat-behavior.ts`, `src/cat-animation.ts`: furniture reservations, approach/use/exit routes, floor detours, and interaction poses.
- `src/messes.ts`: cached geometry for distinct liquid, hair, waste, bowl, and toy targets.
- `src/need-icons.ts`: wordless care pictograms that match the floor objects.
- `src/hud.ts`: canvas-textured Three.js UI, screen layout, and raycastable controls.
- `src/main.ts`: rendering loop, input dispatch, resizing, and interruption recovery.
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

Unit tests cover simulation rules and gesture ownership. Browser tests exercise actual canvas input at mobile viewport sizes, including the tutorial, all stages, adoption, upgrades, both outcomes, shared-room targets, resizing, and interruption recovery. Screenshots and failure traces are written to `test-results/`.

Browser campaign tests use a manually advanced simulation clock and shorten idle periods at stage endings; care, adoption, and upgrade actions still go through pointer/touch input. The test-only fixture is available only when Vite runs with `--mode test`; production builds remove it.

## Prototype boundaries

- Modern WebGL 2 browsers only; no native app packaging, backend, or account system.
- Cats currently differ by color, with identical behavior profiles.
- No permanent upgrades, economy, audio, or authored cat models.
- Text and controls are drawn in WebGL, so they do not have the screen-reader semantics of HTML controls. The canvas has an accessible description and keyboard shortcuts, but this is not a fully accessible UI.
- Mobile browser emulation is not physical-device validation. Actual iOS Safari, Android Chrome, GPU performance, and safe-area behavior still need testing on real phones.

### Validation limitations

The scene uses shared/cached geometry, no dynamic shadows, and a capped pixel ratio. Browser tests log current five-cat draw calls, triangles, and frame rates. Local software rendering falls below the 30 FPS minimum target; these are not phone benchmarks, and the 60 FPS goal remains unverified on physical hardware.

Playwright 1.64's Windows WebKit has a [confirmed upstream issue](https://github.com/microsoft/playwright/issues/42885) that paints WebGL canvases blank after their drawing buffer resizes. Static WebKit layout screenshots reload at the requested size to avoid that tooling issue. The resize/input/context-recovery tests run without that workaround, but successful input assertions do not establish correct post-rotation visual output in that affected browser build. Chromium resize screenshots are inspected normally. Actual mobile Safari rotation remains a required device check.
