# Vorago Tag

An [Alt1 Toolkit](https://runeapps.org/alt1) overlay that helps you time your
Ultimate and target cycle (TC) for Vorago's **Grandmaster rotation in P3 and P5**.
Use it alongside the
[PVME Vorago combat achievements rotation](https://pvme.io/pvme-guides/combat-achievements/vorago-ca/).

<img src="docs/readme-screenshot.png" alt="Vorago Tag overlay during the ult window, with a countdown, four progress sections, and an optional audio cue." width="300">

## What it does

When Vorago's HP bar becomes empty at the end of a phase, the countdown starts
automatically. Follow the sections from left to right:

| Section    | What to do                            |
| ---------- | ------------------------------------- |
| `pre-ult`  | Get ready for your Ultimate.          |
| `ult`      | Use your Ultimate during this window. |
| `post-ult` | Continue your rotation after ulting.  |
| `tc`       | Target cycle back to Vorago.          |

The bars and countdown advance in 0.6-second game ticks, with finer 0.1-second
steps in the `ult` and `tc` windows to help you time your inputs. They round up
the remaining time so they don't announce a window or completion early.
If detection finishes between ticks, the first displayed step waits for the
next tick boundary relative to the captured frame; the action windows don't shift.
Tick **Play audio cue on tc** if you'd like a beep when the TC
window starts. Your choice is remembered next time you open the app.

## Install

1. Install [Alt1 Toolkit](https://runeapps.org/alt1).
2. Open [Vorago Tag](https://fletchto99.github.io/VoragoTag/) and click **Add to Alt1**.
3. Open **Vorago Tag** from your Alt1 app list while playing RuneScape.

You can also try **Start demo timer** on the website before installing.

## Good to know

- Keep Vorago's HP bar visible and allow Alt1 to read the game screen.
- The timer starts once per empty bar; you don't need to reset it manually.
- The HP bar can move. The app automatically recognises common captured bar scales:
  75%, 80%, 90%, 100%, 110%, 120%, 125%, 150%, 175%, 200%, 225%, 250%, 275%, and 300%.
  It remembers the matched scale while tracking; no scale setting is needed.
- If the app can't read the game or play audio, it shows a message explaining what's wrong.
- **The Scopulus phase is not supported.** The timer relies on Vorago's HP bar becoming empty.

### Scaling and capture troubleshooting

The captured bar's scale may differ from your Windows display-scaling setting.
Custom scales or differently rendered game interfaces may still need additional
reference images. If detection fails, keep an original-resolution Alt1 capture
of the populated and empty HP bar, along with your Windows and RuneScape scaling settings.

When the bar is missing, full-window searches pause for up to four seconds between
scans to reduce capture load. The last known position is still checked frequently;
nearby movement is checked with an expanded regional capture before capturing
and searching the whole window. Reacquiring a
distant moved bar can take a few seconds. Normal fast tracking resumes once found.
The timer and audio cue use the captured frame's timestamp, so processing that
frame does not shift the action windows later.

Automatic detection cannot fix a blank or incorrectly scaled capture from Alt1 itself.
Check the preview in Alt1's Capture settings and follow
[Alt1's capture troubleshooting guide](https://runeapps.org/help_alt1_capture).

## Contributing

See [the contributor guide](CONTRIBUTING.md) for development and screenshot updates.

## Credits

Inspired by [DaStewie's original Vorago Tag app](https://runeapps.org/forums/viewtopic.php?id=1277).
