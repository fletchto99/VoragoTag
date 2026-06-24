import * as a1lib from "alt1";

import {
	TOTAL_TIME,
	snapRemainingSeconds,
	sectionPercentages,
} from "./timer";

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
const tcBarEl = document.getElementById("tcBar")! as HTMLElement;

// Image-match interval (ms) while waiting for the beam to appear.
const DETECT_INTERVAL = 50;
// On-screen bar refresh interval (ms).
const UPDATE_INTERVAL = 10;

const sections = [preUltBarEl, UltBarEl, postUltBarEl, tcBarEl];

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

	const secsNum = snapRemainingSeconds(rawSecs);
	remainingTimeEl.textContent = secsNum.toFixed(1) + "s";

	// Fill each section left to right based on elapsed time. A section that
	// hasn't started clamps to 0%, and a finished one clamps to 100%.
	const percentages = sectionPercentages(secsNum);
	sections.forEach((el, i) => {
		el.style.width = percentages[i] + "%";
	});

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
	// Not running inside Alt1: emulate the Alt1 overlay window in the browser.
	document.body.classList.add("browser");

	const addappurl = `alt1://addapp/${new URL("./appconfig.json", document.location.href).href}`;
	const addAppBtn = document.getElementById("addAppBtn") as HTMLButtonElement;
	addAppBtn.style.display = "block";
	addAppBtn.addEventListener("click", function () {
		window.location.href = addappurl;
	});

	// Outside Alt1 (e.g. browsing the hosted page) offer a button to preview the
	// timer without the game running.
	const demoBtn = document.getElementById("demoBtn") as HTMLButtonElement;
	demoBtn.style.display = "block";
	demoBtn.addEventListener("click", startVoragoTimer);
}
