// Pure Vorago timer math, kept free of DOM/Alt1 dependencies so it can be
// unit tested in isolation.

export interface Section {
  // id of the matching bar element in index.html
  id: string;
  label: string;
  // length of this section in seconds
  duration: number;
  // display granularity (in seconds) while this section is counting down
  step: number;
}

// The timer schedule is the single source of truth: it drives the total
// duration, the per-section fill, and the countdown snapping below, and the
// DOM is wired up from it in index.ts. Sections are listed in fill order
// (left to right). The ult and tc windows tick down in fine 0.1s steps; the
// longer pre-ult / post-ult phases snap to RuneScape game ticks (0.6s).
export const SECTIONS: Section[] = [
  { id: "preUltBar", label: "pre-ult", duration: 15.0, step: 0.6 },
  { id: "UltBar", label: "ult", duration: 0.6, step: 0.1 },
  { id: "postUltBar", label: "post-ult", duration: 8.4, step: 0.6 },
  { id: "tcBar", label: "tc", duration: 0.6, step: 0.1 },
];

export const TOTAL_TIME = SECTIONS.reduce((total, s) => total + s.duration, 0);

export function sanitisePercentage(i: number): number {
  return Math.min(100, Math.max(0, i));
}

// Find the section a given remaining time falls in, measured from the end of
// the timer. Each window is inclusive at its top, so with the default schedule
// tc owns (0, 0.6], post-ult (0.6, 9.0], ult (9.0, 9.6] and pre-ult the rest.
export function activeSection(remaining: number): Section {
  let acc = 0;
  for (let i = SECTIONS.length - 1; i >= 0; i--) {
    acc += SECTIONS[i].duration;
    if (remaining <= acc) return SECTIONS[i];
  }
  return SECTIONS[0];
}

// Snap the raw remaining seconds to the step of whichever section is active.
export function snapRemainingSeconds(rawSecs: number): number {
  const secs = Math.max(0, rawSecs);
  const step = secs <= 0 ? SECTIONS[0].step : activeSection(secs).step;
  return Math.floor(secs / step + 1e-9) * step;
}

// Given the snapped remaining seconds, return the fill percentage for each
// section in left-to-right order.
export function sectionPercentages(secsNum: number): number[] {
  const elapsed = TOTAL_TIME - secsNum;
  let sectionStart = 0;
  return SECTIONS.map((section) => {
    const pct = sanitisePercentage(((elapsed - sectionStart) / section.duration) * 100);
    sectionStart += section.duration;
    return pct;
  });
}
