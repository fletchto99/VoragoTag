# Contributing

Use Node.js 22 or newer (`.nvmrc` specifies the development version).

```sh
npm ci
npm run dev      # Development build in dist/
npm run watch    # Rebuild when files change
npm run build    # Production build
npm test
npm run lint
npm run format
```

Open `dist/index.html` to try the browser demo. Pushes to `main` deploy to GitHub Pages.

CI installs the latest npm 11 release before installing dependencies and running
`npm audit signatures`. Node 22's bundled npm 10 can incorrectly reject keyless
attestations with `EMISSINGSIGNATUREKEY`; npm 11 includes the
[upstream fix](https://github.com/npm/pacote/pull/454). Signature and provenance
verification remain required. To use the same verifier locally, run
`npx --yes npm@11 audit signatures` after `npm ci`.

Dependabot updates project dependencies and GitHub Actions weekly. The CI npm
version follows 11.x automatically rather than relying on Dependabot.
TypeScript stays on 6.0.x until typescript-eslint supports 6.1 or newer.
The `minimatch@10` override uses patched 11.x releases to address
[GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
Remove it once the lint dependencies accept patched minimatch versions themselves.

## Update the README screenshot

Install the screenshot browser once:

```sh
npx playwright install chromium
```

Then regenerate the image after UI changes:

```sh
npm run screenshot:readme
```

This builds the app and saves `docs/readme-screenshot.png`. It uses the app's
default Alt1 dimensions, hides the browser-only buttons, and pauses the demo
halfway through the ult window. No running RuneScape or Alt1 instance is needed.
Commit the updated image with the UI change.

## HP detection fixtures

The image tests use these reference screenshots:

- [Populated HP bar](https://cloud.fletchto99.com/s/ioACESzZnyFPFn4/preview)
- [Empty HP bar](https://cloud.fletchto99.com/s/M4gBH5bmRcdLrRC/preview)

The HP tests independently resize whole captures with Sharp's nearest-neighbour
and cubic filters. They cover supported scales, fractional alignment, cropped
tracking, scale changes, and rejection of visible HP fill or numbers.
These simulated captures do not replace testing real Alt1 captures from
different Windows DPI and RuneScape interface settings.

Scaled searches transfer overlapping tiles of at most 1 MiB. Polling processes one
tile per turn, yielding for 16 ms between tiles without replacing Alt1's bound
snapshot. A match is committed only when the search completes. On a tracking miss,
polling first captures the cached region expanded by 64 pixels on each side.
A bounded read searches around the last known name position, comparing the cached
scale first while still considering other scales. Full-window capture is needed
only when that search misses, the new scale's HP regions do not fit, or the expanded
region exceeds the game window. If the capture adapter already supplied a full
window for an out-of-bounds request, that snapshot is reused rather than recaptured.

Empty events carry the timestamp from just before their snapshot capture, including
replacement regional and full-window captures. Both the timer and audio deadline use that
timestamp rather than search completion. Stale events from an active or already
expired countdown cannot restart it. Pixel-read failures are reported through the
polling status callback and remain visible until a complete successful read;
failed fallback captures do not clear them.

After an unsuccessful full-window search, retries back off by 1, 2, then 4 seconds.
The last known bar position is still checked every 100 ms; finding it resets the
backoff and restores 25 ms tracking. Alt1's capture interval remains a lower bound
on the normal polling delay. Each tracking comparison reads its whole pixel-offset
neighborhood once, then checks candidates in memory.

Native-like tests cover 4K transfer limits, tile seams, snapshot lifetime across
search slices, capture timestamps, visible error recovery, backoff, nearby
reacquisition, and two-to-three-read cached tracking.

Polling tests use `pollingClock(t)` so `setTimeout`, `Date`, and `performance.now()`
advance together. Mocking timeouts alone leaves backoff deadlines dependent on
wall-clock execution delays and can make search-count assertions flaky.
