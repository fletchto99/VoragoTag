import { test } from "node:test";
import assert from "node:assert/strict";

import {
	PRE_ULT_TIME,
	ULT_TIME,
	POST_ULT_TIME,
	TC_TIME,
	TOTAL_TIME,
	sanitisePercentage,
	snapRemainingSeconds,
	sectionPercentages,
} from "../src/timer";

test("TOTAL_TIME is the sum of the four sections", () => {
	assert.equal(TOTAL_TIME, PRE_ULT_TIME + ULT_TIME + POST_ULT_TIME + TC_TIME);
	assert.equal(TOTAL_TIME, 24.6);
});

test("sanitisePercentage clamps to the 0..100 range", () => {
	assert.equal(sanitisePercentage(-10), 0);
	assert.equal(sanitisePercentage(0), 0);
	assert.equal(sanitisePercentage(42.5), 42.5);
	assert.equal(sanitisePercentage(100), 100);
	assert.equal(sanitisePercentage(150), 100);
});

test("snapRemainingSeconds floors to 0.6s game ticks outside the fine windows", () => {
	assert.equal(snapRemainingSeconds(15.0), 15.0);
	// 14.5 -> floor to nearest 0.6 multiple (14.4)
	assert.ok(Math.abs(snapRemainingSeconds(14.5) - 14.4) < 1e-9);
	// Mid post-ult, still 0.6s steps.
	assert.ok(Math.abs(snapRemainingSeconds(5.0) - 4.8) < 1e-9);
});

test("snapRemainingSeconds uses fine 0.1s steps within the ult window", () => {
	// Ult window is (9.0, 9.6] = (TC_TIME + POST_ULT_TIME, +ULT_TIME].
	assert.ok(Math.abs(snapRemainingSeconds(9.55) - 9.5) < 1e-9);
	assert.ok(Math.abs(snapRemainingSeconds(9.6) - 9.6) < 1e-9);
	// Just below the ult window we are back to 0.6s ticks: 8.9 -> 8.4 (14 * 0.6).
	assert.ok(Math.abs(snapRemainingSeconds(8.9) - 8.4) < 1e-9);
});

test("snapRemainingSeconds uses fine 0.1s steps within the tc window", () => {
	// tc window is the final TC_TIME seconds: (0, 0.6].
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
	const pct = sectionPercentages(TOTAL_TIME);
	assert.deepEqual(pct, [0, 0, 0, 0]);
});

test("sectionPercentages: fully elapsed -> all full", () => {
	const pct = sectionPercentages(0);
	assert.deepEqual(pct, [100, 100, 100, 100]);
});

test("sectionPercentages: mid pre-ult only fills the first bar", () => {
	// Half of pre-ult elapsed: remaining = TOTAL - 7.5
	const pct = sectionPercentages(TOTAL_TIME - PRE_ULT_TIME / 2);
	assert.ok(Math.abs(pct[0] - 50) < 1e-9);
	assert.equal(pct[1], 0);
	assert.equal(pct[2], 0);
	assert.equal(pct[3], 0);
});

test("sectionPercentages: mid post-ult fills pre-ult and ult, partial post-ult, empty tc", () => {
	// 3s into post-ult elapsed: remaining = TC_TIME + POST_ULT_TIME - 3 = 6.0
	const pct = sectionPercentages(TC_TIME + POST_ULT_TIME - 3);
	assert.equal(pct[0], 100);
	assert.equal(pct[1], 100);
	assert.ok(Math.abs(pct[2] - (3 / POST_ULT_TIME) * 100) < 1e-9);
	assert.equal(pct[3], 0);
});

test("sectionPercentages: mid tc fills everything before it and partial tc", () => {
	// Halfway through the tc window: remaining = TC_TIME / 2 = 0.3
	const pct = sectionPercentages(TC_TIME / 2);
	assert.equal(pct[0], 100);
	assert.equal(pct[1], 100);
	assert.equal(pct[2], 100);
	assert.ok(Math.abs(pct[3] - 50) < 1e-9);
});
