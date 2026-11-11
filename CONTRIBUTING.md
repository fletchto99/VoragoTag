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

Scaled searches transfer overlapping tiles of at most 1 MiB instead of a whole
game window, and polling runs that fallback at most once per second. Native-size
searches and cached tracking retain their faster cadence. Native-like test images
enforce the transfer limit on 4K frames, including tile seams and window edges.
