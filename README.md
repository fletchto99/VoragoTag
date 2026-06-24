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
  automatically when Vorago hits 0 HP at the end of a phase.
- On the hosted page (outside Alt1) you can click **Start demo timer** to preview
  the countdown.

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

## Credits

Inspired by the original Vorago Tag app by DaStewie:
<https://runeapps.org/forums/viewtopic.php?id=1277>.
