# Vorago Tag

An [Alt1 Toolkit](https://runeapps.org/alt1) overlay for RuneScape that helps you
time your **target cycle (TC)** ult during the Vorago **Grandmaster (GM)
rotation**.

## What it does

Vorago Tag is a TC timer. It lines up your **Ultimate** with the exact tick you
need to ult so your rotation fits in before the target cycles back on to Vorago
for **P3** and **P5**.

It is designed to complement the
[PVME Vorago combat achievements rotation](https://pvme.io/pvme-guides/combat-achievements/vorago-ca/).

When a phase ends the overlay counts down through four segments, filling left to
right:

| Segment    | Meaning                                                        |
| ---------- | -------------------------------------------------------------- |
| `pre-ult`  | Lead-in before the ult window (before dropdown prebuild).      |
| `ult`      | The precise tick window to use your Ultimate (counts in 0.1s). |
| `post-ult` | The time after ulting (post dropdown build).                   |
| `tc`       | The final target-cycle window (counts in 0.1s).                |

The longer phases tick down in RuneScape game ticks (0.6s); the `ult` and `tc`
windows tick in fine 0.1s steps so you can hit the exact moment.

## Installation

1. Install the [Alt1 Toolkit](https://runeapps.org/alt1).
2. Open the app page: **https://fletchto99.github.io/VoragoTag/**
   - Inside Alt1's built-in browser it will be detected automatically, or
   - Click **Add to Alt1** on the page (in any browser).
3. "Vorago Tag" now appears in your Alt1 app list.

## Usage

- Inside Alt1 the overlay watches the screen and starts the countdown
  automatically when Vorago's new HP bar is completely empty at the end of a
  phase. It locates the **VORAGO** name, then checks the empty left edge and the
  absence of an HP number, not a literal `0`.
- A continuously visible empty bar triggers only once. Detection rearms when
  the bar is no longer empty or disappears. The bar can move around the screen,
  but must use the same UI scale as the reference screenshots below.
- On the hosted page (outside Alt1) you can click **Start demo timer** to preview
  the countdown.
- Tick **Play audio cue on tc** to have the overlay beep when the final `tc`
  window starts. It is off by default and your choice is remembered across app
  restarts; enabling it also primes audio playback. The cue is scheduled on the
  audio clock, independently of display updates. Turning it off cancels a
  pending cue; turning it back on does not replay a cue that already started.
- Capture pauses while RuneScape is disconnected or pixel permission is
  unavailable, with a status message in the overlay. Losing focus does not
  pause detection. Audio failures are also shown without stopping the timer.

**Note:** The end of the scop phase is currently not supported. The overlay will only start the countdown when Vorago hits 0 HP at the end of a phase. We could in theory detect the end of the scop phase, but it would require you to deal the final blow to the scop.

## Development

Requires Node.js **>= 22** (an `.nvmrc` is provided, so `nvm use` picks the
right version).

```bash
npm install
npm run dev      # development build to dist/ (unminified, with source maps)
npm run build    # production build to dist/ (minified)
npm run watch    # rebuild on change
npm test         # run unit tests
npm run lint     # eslint + stylelint + prettier --check
npm run format   # auto-format with prettier
```

The app is built with TypeScript + webpack and the [`alt1`](https://npmjs.com/package/alt1)
library. The pure timer math lives in [`src/timer.ts`](src/timer.ts) and is
covered by tests in [`test/`](test/). Pushes to `main` are deployed to GitHub
Pages via [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml).

HP detection lives in [`src/hp.ts`](src/hp.ts). It searches for
[`vorago_name.data.png`](src/vorago_name.data.png) and caches its position.
While tracking, capture is restricted to the 276 x 44 pixel rectangle enclosing
the name, left-edge
([`zero_hp.data.png`](src/zero_hp.data.png)), and blank-number
([`no_hp_number.data.png`](src/no_hp_number.data.png)) regions. Only these three
small regions are transferred for comparison. Coordinates are translated
between the cropped image and the game window. If the name no longer matches,
a full-window capture and search run immediately; a resize that invalidates
the cached capture bounds also falls back to the full window. A failed
fallback capture does not rearm a continuously empty bar.

Polling waits 25 ms between checks while the bar is located, or 100 ms while
the name or capture is unavailable. A valid Alt1 `captureInterval` hint raises
either delay when the capture backend advises a longer minimum. Each wait
starts after the previous check finishes so slow scans cannot queue up.
If the bar reappears already empty while searching, detection can incur up to
the search interval of polling delay, plus capture, processing, and scheduling
time. Native Alt1 capture costs still need in-game measurement; requesting a
smaller capture area does not imply a proportional CPU saving.

The countdown uses a monotonic deadline rather than render callbacks to decide
whether a new timer may start. [`src/audio.ts`](src/audio.ts) schedules the cue
against the Web Audio clock and cancels stale schedules when a timer restarts
or audio is disabled. Display calculations run only when the snapped time
changes. Bar fills use transforms without transition smoothing, so the precise
ult and TC steps are not delayed by a width animation.

Transparent pixels in the left-edge template exclude the surrounding scenery.
The image regression tests use these reference screenshots:

- [Populated HP bar](https://cloud.fletchto99.com/s/ioACESzZnyFPFn4/preview)
- [Empty HP bar](https://cloud.fletchto99.com/s/M4gBH5bmRcdLrRC/preview)

## Credits

Inspired by the original Vorago Tag app by DaStewie:
<https://runeapps.org/forums/viewtopic.php?id=1277>.
