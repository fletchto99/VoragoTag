// Pure Vorago timer math, kept free of DOM/Alt1 dependencies so it can be
// unit tested in isolation.

// Timer sections in fill order (left to right), with durations in seconds:
//   pre-ult 15.0s -> ult 0.6s -> post-ult 8.4s -> tc 0.6s
export const PRE_ULT_TIME = 15.0;
export const ULT_TIME = 0.6;
export const POST_ULT_TIME = 8.4;
export const TC_TIME = 0.6;
export const TOTAL_TIME = PRE_ULT_TIME + ULT_TIME + POST_ULT_TIME + TC_TIME;

export const SECTION_DURATIONS = [PRE_ULT_TIME, ULT_TIME, POST_ULT_TIME, TC_TIME];

export function sanitisePercentage(i: number): number {
	return Math.min(100, Math.max(0, i));
}

// Snap the raw remaining seconds to the appropriate step. The ult and tc
// windows count down in fine 0.1s steps; everywhere else snaps to RuneScape
// game ticks (0.6s).
export function snapRemainingSeconds(rawSecs: number): number {
	const secs = Math.max(0, rawSecs);
	// tc is the final TC_TIME seconds: remaining in (0, TC_TIME].
	const inTcWindow = secs > 0 && secs <= TC_TIME;
	// ult sits above post-ult: remaining in (TC_TIME + POST_ULT_TIME, +ULT_TIME].
	const ultLower = TC_TIME + POST_ULT_TIME;
	const inUltWindow = secs > ultLower && secs <= ultLower + ULT_TIME;
	const step = inTcWindow || inUltWindow ? 0.1 : 0.6;
	return Math.floor(secs / step + 1e-9) * step;
}

// Given the snapped remaining seconds, return the fill percentage for each
// section (pre-ult, ult, post-ult, tc) in left-to-right order.
export function sectionPercentages(secsNum: number): number[] {
	const elapsed = TOTAL_TIME - secsNum;
	let sectionStart = 0;
	return SECTION_DURATIONS.map((duration) => {
		const pct = sanitisePercentage(((elapsed - sectionStart) / duration) * 100);
		sectionStart += duration;
		return pct;
	});
}
