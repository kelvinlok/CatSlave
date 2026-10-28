# Progressive cat model loading

Evaluation on 2026-10-28 against `main` at
`8cd9921a450256b56cf0fffcee378fece8c84b38`. Model files were not changed.

## Payload and behavior

| Fresh title screen | Before | After |
| --- | ---: | ---: |
| Requested GLBs | 7 | 1 (Choco) |
| Total requested GLB file sizes | 80,388,724 B | 13,123,260 B |
| Model prerequisite for first game frame | All attempts must settle | None (0 GLB bytes) |
| Concurrent model downloads/decodes | Up to 7 | 1 |
| Timeout | 15 s per active request | 15 s per active request |

Requested model payload falls by **83.7% (67,265,464 bytes)**. This is not
the number of bytes actually transferred on a slow connection: aborted
requests may transfer only part of a model. Initial HTML/CSS/JavaScript is
still required, approximately 0.21 MB with gzip for either production build.

The title, controls, and game start with procedural cats. Choco is requested
first. Current residents and adoption previews request their own models. During
each non-final campaign stage, the next two adoption candidates are selected
once and queued behind residents, so their downloads can finish before adoption.
The same pair is retained through bonus rounds; the final stage, tutorial, title
screen, and free play do not prefetch future candidates. Generic cats request none. A restored free-play roster is downloaded only
after entering free play. Requested models are queued in order, with one
download/decode in flight. A queued model's timeout starts when its request
starts, not when it joins the queue. Failed requests stay failed for the
session, avoiding repeated requests on every frame; a page reload can retry.

A model already requested for an adoption preview may finish after the
player makes a choice or restarts. Completion only caches its source. The next
world update upgrades current instances, so it cannot resurrect removed cats
or modify adoption choices. Root identity, picking IDs, animation state, and
victory timing survive replacement; obsolete instance skeletons are released.

Cat textures use DOM image sources instead of ImageBitmap sources. On returning
from the background, a back-forward cache restore, or WebGL context restoration,
cached cat textures are marked for GPU re-upload without downloading models again.
The browser regression samples uploaded texture pixels and checks that game state
survives a forced context loss. Physical iPhone app-switch recovery still needs
device validation.

## Throttled production-build observations

Cold browser contexts, Pixel 7 viewport, Chromium 153.0.8010.0 on Linux with
SwiftShader, 4× CPU throttling, 150 ms simulated network latency, 0.75 Mbps
upload. A local server served gzip-compressed HTML/CSS/JS and uncompressed
GLBs under separate URL subpaths. One run per cell; these are **desktop
emulation observations, not physical-phone benchmarks**.

| Download limit | Before: first game frame | After: first game frame | Model requests observed |
| --- | ---: | ---: | --- |
| 1.6 Mbps | 18.74 s | 3.65 s | Before: 7 timed out. After: Choco timed out later; the procedural title was already usable. |
| 10 Mbps | 17.76 s | 2.69 s | Before: 7 timed out. After: only Choco was requested and its download completed. |

No uncaught page errors occurred in these four runs. The metric is the first
animation frame after WebGL begins drawing the game, not navigation's blank
background paint. It does not time completion of the later model decode/GPU
upload. Separate browser regression tests exercise controls while downloads
are held and verify the eventual authored model.

Reproduce with production builds of the baseline and updated source:

```sh
npm ci
npm run build
npx playwright install chromium
node scripts/measure-startup.mjs dist /path/to/baseline/dist
```

The probe writes `artifacts/startup-measurements.json`. It accepts
`CHROMIUM_EXECUTABLE_PATH` for an installed Chromium. The recorded run used a
packaged Chromium binary because the Playwright Chromium download failed in
the execution environment. No application dependencies were changed.

## Regression coverage and remaining limits

Unit tests cover serial loading, deduplication, successful/failed caching,
HTTP/network/parse/invalid-rig failures, stalled headers/body timeouts, Momo's
Meshopt decoder, animation/attention/blink continuity, independent skeletons,
disposal, paused cats, adoption previews, stale completion, attacks, and victory.
Browser tests hold real GLB responses to check immediate input, adoption before
completion, saved-roster loading, and fallback alongside a successful Momo
model. Existing all-cat native rig and adoption tests remain covered.

Validation: `npm test` passed 182 tests; `npm run build` passed. The three new
progressive-loading browser tests and 18 existing model/rig/adoption tests
passed in mobile Chromium. The same three new tests could not launch WebKit
because required GTK/GStreamer and other system libraries were missing; this
is not a WebKit pass. Physical iOS Safari and Android Chrome were not tested.

Choco is still 13.1 MB: transferring its uncompressed bytes alone requires
about 65.6 s at 1.6 Mbps, or 10.5 s at 10 Mbps, before latency/decode costs.
Slow connections will therefore still hit the existing 15-second timeout and
use the procedural model. The change removes that wait from startup; it does
not reduce model size, steady-state rendering cost, or all CPU work during
decoding and GPU upload. Real Android/iOS testing, long-frame measurements
during model replacement, and GLB size reduction remain useful follow-ups.
