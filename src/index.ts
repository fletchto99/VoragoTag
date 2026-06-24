import * as a1lib from "alt1";

// Tell webpack to include these files in the output
import "./index.html";
import "./appconfig.json";
import "./icon.png";

// Load detection images
const imgs = a1lib.webpackImages({
	zeroHp: require("./zero_hp.data.png"),
	zeroScopHp: require("./zero_scop_hp.data.png")
});

const remainingTimeEl = document.getElementById("remaining_time")!;
const preUltBarEl = document.getElementById("preUltBar")! as HTMLElement;
const UltBarEl = document.getElementById("UltBar")! as HTMLElement;
const postUltBarEl = document.getElementById("postUltBar")! as HTMLElement;

// Image-match interval (ms) while waiting for the beam to appear.
const DETECT_INTERVAL = 50;
// On-screen bar refresh interval (ms).
const UPDATE_INTERVAL = 10;

// Timer sections in fill order (left to right), with durations in seconds:
//   pre-ult 15.0s -> ult 0.6s -> post-ult 9.0s
const PRE_ULT_TIME = 15.0;
const ULT_TIME = 0.6;
const POST_ULT_TIME = 9.0;
const TOTAL_TIME = PRE_ULT_TIME + ULT_TIME + POST_ULT_TIME;

const sections = [
	{ el: preUltBarEl, duration: PRE_ULT_TIME },
	{ el: UltBarEl, duration: ULT_TIME },
	{ el: postUltBarEl, duration: POST_ULT_TIME },
];

function sanitisePercentage(i: number): number {
	return Math.min(100, Math.max(0, i));
}

let running = false;
let tickId: ReturnType<typeof setInterval> | null = null;
let endTime = 0;

function startVoragoTimer() {
	endTime = Date.now() + TOTAL_TIME * 1000;
	if (tickId === null) {
		tickId = setInterval(updateVoragoTimer, UPDATE_INTERVAL);
	}
	updateVoragoTimer();
}

function stopVoragoTimer() {
	if (tickId !== null) {
		clearInterval(tickId);
		tickId = null;
	}
	running = false;
}

function updateVoragoTimer() {
	const remainingMs = endTime - Date.now();
	const rawSecs = Math.max(0, remainingMs / 1000);

	// The ult window counts down in fine 0.1s steps; everywhere else snaps to
	// RuneScape game ticks (0.6s).
	const inUltWindow = rawSecs > POST_ULT_TIME && rawSecs <= POST_ULT_TIME + ULT_TIME;
	const step = inUltWindow ? 0.1 : 0.6;
	const secsNum = Math.floor(rawSecs / step + 1e-9) * step;
	remainingTimeEl.textContent = secsNum.toFixed(1) + "s";

	// Fill each section left to right based on elapsed time. A section that
	// hasn't started clamps to 0%, and a finished one clamps to 100%.
	const elapsed = TOTAL_TIME - secsNum;
	let sectionStart = 0;
	for (const section of sections) {
		const pct = sanitisePercentage(((elapsed - sectionStart) / section.duration) * 100);
		section.el.style.width = pct + "%";
		sectionStart += section.duration;
	}

	if (remainingMs <= 0) {
		stopVoragoTimer();
	}
}

function find(): boolean {
	const img = a1lib.captureHoldFullRs();
	if (!img) return false;

	return img.findSubimage(imgs.zeroHp).length > 0
		|| img.findSubimage(imgs.zeroScopHp).length > 0;
}

// Check if running inside alt1
if (window.alt1) {
	alt1.identifyAppUrl("./appconfig.json");

	setInterval(function () {
		if (!running && find()) {
			running = true;
			startVoragoTimer();
		}
	}, DETECT_INTERVAL);
} else {
	const addappurl = `alt1://addapp/${new URL("./appconfig.json", document.location.href).href}`;
	remainingTimeEl.innerHTML = `<a href='${addappurl}'>Click here to add this app to Alt1</a>`;
}
