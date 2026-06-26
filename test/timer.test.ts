import { test } from "node:test";
import assert from "node:assert/strict";

import {
  SECTIONS,
  TOTAL_TIME,
  TC_CUE_REMAINING,
  activeSection,
  sanitisePercentage,
  snapRemainingSeconds,
  sectionPercentages,
} from "../src/timer";

test("TOTAL_TIME is the sum of all section durations", () => {
  const sum = SECTIONS.reduce((t, s) => t + s.duration, 0);
  assert.equal(TOTAL_TIME, sum);
  assert.equal(TOTAL_TIME, 24.0);
});

test("SECTIONS are in the expected fill order", () => {
  assert.deepEqual(
    SECTIONS.map((s) => s.label),
    ["pre-ult", "ult", "post-ult", "tc"],
  );
});

test("TC_CUE_REMAINING is the start of the tc window", () => {
  // tc is the final section; the cue fires when it starts.
  assert.ok(Math.abs(TC_CUE_REMAINING - SECTIONS[SECTIONS.length - 1].duration) < 1e-9);
  assert.ok(Math.abs(TC_CUE_REMAINING - 0.6) < 1e-9);
});

test("sanitisePercentage clamps to the 0..100 range", () => {
  assert.equal(sanitisePercentage(-10), 0);
  assert.equal(sanitisePercentage(0), 0);
  assert.equal(sanitisePercentage(42.5), 42.5);
  assert.equal(sanitisePercentage(100), 100);
  assert.equal(sanitisePercentage(150), 100);
});

test("activeSection maps remaining time to the right section", () => {
  const label = (remaining: number) => activeSection(remaining).label;
  // Mid-window values.
  assert.equal(label(20), "pre-ult");
  assert.equal(label(9.3), "ult");
  assert.equal(label(5), "post-ult");
  assert.equal(label(0.3), "tc");
  // Window boundaries (each window is inclusive at its top).
  assert.equal(label(0.6), "tc");
  assert.equal(label(0.601), "post-ult");
  assert.equal(label(9.0), "post-ult");
  assert.equal(label(9.6), "ult");
  assert.equal(label(9.7), "pre-ult");
  assert.equal(label(24.0), "pre-ult");
  // Out-of-range falls back to the first section.
  assert.equal(label(30), "pre-ult");
});

test("snapRemainingSeconds floors to 0.6s game ticks outside the fine windows", () => {
  assert.equal(snapRemainingSeconds(15.0), 15.0);
  // 14.5 -> floor to nearest 0.6 multiple (14.4)
  assert.ok(Math.abs(snapRemainingSeconds(14.5) - 14.4) < 1e-9);
  // Mid post-ult, still 0.6s steps.
  assert.ok(Math.abs(snapRemainingSeconds(5.0) - 4.8) < 1e-9);
});

test("snapRemainingSeconds uses fine 0.1s steps within the ult window", () => {
  // Ult window is (9.0, 9.6].
  assert.ok(Math.abs(snapRemainingSeconds(9.55) - 9.5) < 1e-9);
  assert.ok(Math.abs(snapRemainingSeconds(9.6) - 9.6) < 1e-9);
  // Just below the ult window we are back to 0.6s ticks: 8.9 -> 8.4 (14 * 0.6).
  assert.ok(Math.abs(snapRemainingSeconds(8.9) - 8.4) < 1e-9);
});

test("snapRemainingSeconds uses fine 0.1s steps within the tc window", () => {
  // tc window is the final 0.6 seconds: (0, 0.6].
  assert.ok(Math.abs(snapRemainingSeconds(0.6) - 0.6) < 1e-9);
  assert.ok(Math.abs(snapRemainingSeconds(0.55) - 0.5) < 1e-9);
  assert.ok(Math.abs(snapRemainingSeconds(0.15) - 0.1) < 1e-9);
  // Just above the tc window snaps to the 0.6s tick.
  assert.ok(Math.abs(snapRemainingSeconds(0.65) - 0.6) < 1e-9);
});

test("snapRemainingSeconds never returns a negative value", () => {
  assert.equal(snapRemainingSeconds(-5), 0);
  assert.equal(snapRemainingSeconds(0), 0);
});

test("sectionPercentages: nothing elapsed -> all empty", () => {
  assert.deepEqual(sectionPercentages(TOTAL_TIME), [0, 0, 0, 0]);
});

test("sectionPercentages: fully elapsed -> all full", () => {
  assert.deepEqual(sectionPercentages(0), [100, 100, 100, 100]);
});

test("sectionPercentages: mid pre-ult only fills the first bar", () => {
  // Half of pre-ult elapsed: remaining = TOTAL - 7.2
  const pct = sectionPercentages(TOTAL_TIME - SECTIONS[0].duration / 2);
  assert.ok(Math.abs(pct[0] - 50) < 1e-9);
  assert.equal(pct[1], 0);
  assert.equal(pct[2], 0);
  assert.equal(pct[3], 0);
});

test("sectionPercentages: mid post-ult fills pre-ult and ult, partial post-ult, empty tc", () => {
  const tc = SECTIONS[3].duration;
  const postUlt = SECTIONS[2].duration;
  // 3s into post-ult elapsed: remaining = tc + postUlt - 3
  const pct = sectionPercentages(tc + postUlt - 3);
  assert.equal(pct[0], 100);
  assert.equal(pct[1], 100);
  assert.ok(Math.abs(pct[2] - (3 / postUlt) * 100) < 1e-9);
  assert.equal(pct[3], 0);
});

test("sectionPercentages: mid tc fills everything before it and partial tc", () => {
  const tc = SECTIONS[3].duration;
  // Halfway through the tc window: remaining = tc / 2
  const pct = sectionPercentages(tc / 2);
  assert.equal(pct[0], 100);
  assert.equal(pct[1], 100);
  assert.equal(pct[2], 100);
  assert.ok(Math.abs(pct[3] - 50) < 1e-9);
});
