# Sound recording credits

These five recordings are from [Freesound](https://freesound.org/), one of the libraries recommended in the [Reddit discussion supplied for this feature](https://www.reddit.com/r/aigamedev/comments/1wqv9bp/does_anyone_know_a_really_good_ai_for_generating/). Each individual sound page identified its recording as **Creative Commons 0** when checked on 2026-10-25.

All five use [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/), allowing copying, modification, distribution, and commercial use without attribution or permission. Credits are retained here to acknowledge the recordists and make the sources easy to audit. The authors do not endorse this game.

| Local file | Recording and author | Duration | Bundled bytes |
| --- | --- | ---: | ---: |
| `cat-meow.wav` | [cat meow — tuberatanka](https://freesound.org/people/tuberatanka/sounds/110011/) | 1.544 s | 68,156 |
| `cat-purr.wav` | [Cat Purr — msalvado](https://freesound.org/people/msalvado/sounds/509524/) | 2.000 s | 88,244 |
| `water-pour.wav` | [Water pouring into glass bowl 01 — Rudmer_Rotteveel](https://freesound.org/people/Rudmer_Rotteveel/sounds/700352/) | 0.350 s | 15,478 |
| `vacuum.wav` | [Vacuum Cleaner.wav — Angellu16](https://freesound.org/people/Angellu16/sounds/533833/) | 0.800 s | 35,324 |
| `scratch.wav` | [Cardboard Surface Soft Scratching 1_1 — Joao_Janz](https://freesound.org/people/Joao_Janz/sounds/477674/) | 0.320 s | 14,156 |

Total recording payload: **221,358 bytes** (about 216 KiB). Files are bundled locally; the game does not contact Freesound during play.

## Download and processing details

The source files were Freesound's public high-quality MP3 preview encodings. They were decoded with Chromium's Web Audio API, trimmed, mixed to mono, resampled to 22,050 Hz, faded, and normalized before export as 16-bit PCM WAV. The game can apply additional gain, envelopes, and playback-rate variation at runtime. Normalization was applied after the fades, and the first and last samples are zero.

| File | Source interval | Fade at each end | Normalized peak |
| --- | --- | --- | --- |
| `cat-meow.wav` | 0–1.5445 s (full meow) | 15 ms | 0.70 |
| `cat-purr.wav` | 4.2–6.2 s | 60 ms | 0.85 |
| `water-pour.wav` | 0.8–1.15 s | 25 ms | 0.70 |
| `vacuum.wav` | 1.0–1.8 s | 60 ms | 0.70 |
| `scratch.wav` | 0.2–0.52 s | 20 ms | 0.70 |

Original download URLs:

- `cat-meow.mp3`: https://cdn.freesound.org/previews/110/110011_1537422-hq.mp3
- `cat-purr.mp3`: https://cdn.freesound.org/previews/509/509524_11100992-hq.mp3
- `water-pour.mp3`: https://cdn.freesound.org/previews/700/700352_4921277-hq.mp3
- `vacuum.mp3`: https://cdn.freesound.org/previews/533/533833_11852214-hq.mp3
- `scratch.mp3`: https://cdn.freesound.org/previews/477/477674_9961300-hq.mp3

The purr recording's low original level was raised during normalization. The cardboard recording is foley for scratching and brushing, not a recording of an actual cat scratching. The wet excerpt is suitable for short mop contacts; the original source is water being poured into a bowl.
