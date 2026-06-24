import * as a1lib from "alt1";

import { SECTIONS, TOTAL_TIME, snapRemainingSeconds, sectionPercentages } from "./timer";

// Tell webpack to include these files in the output
import "./index.html";
import "./appconfig.json";
import "./icon.png";
import "./styles.css";

// Load detection images
const imgs = a1lib.webpackImages({
  zeroHp: require("./zero_hp.data.png"),
});

const remainingTimeEl = document.getElementById("remaining_time")!;
const barEls = SECTIONS.map((s) => document.getElementById(s.id)! as HTMLElement);

// Image-match interval (ms) while waiting for the beam to appear.
const DETECT_INTERVAL = 50;

// How long the filled bar stays on screen after the countdown completes before
// it clears back to empty.
const RESET_DELAY = 1000;

let running = false;
let rafId: number | null = null;
let resetTimeout: ReturnType<typeof setTimeout> | null = null;
let endTime = 0;
// Cache the last rendered values so we only touch the DOM when they change.
let lastText = "";
const lastWidths: number[] = [];

function startVoragoTimer() {
  // A new run cancels any pending post-fill reset so it can't wipe the bars
  // mid-countdown.
  clearPendingReset();
  endTime = performance.now() + TOTAL_TIME * 1000;
  // If a countdown is already animating, just extending endTime is enough;
  // otherwise kick off the render loop.
  if (rafId === null) {
    updateVoragoTimer();
  }
}

function stopVoragoTimer() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  running = false;
}

function clearPendingReset() {
  if (resetTimeout !== null) {
    clearTimeout(resetTimeout);
    resetTimeout = null;
  }
}

// Clear every bar back to empty, returning the overlay to its idle state.
function resetBars() {
  resetTimeout = null;
  for (let i = 0; i < barEls.length; i++) {
    barEls[i].style.width = "0%";
    lastWidths[i] = 0;
  }
}

function updateVoragoTimer() {
  const remainingMs = endTime - performance.now();
  const secsNum = snapRemainingSeconds(Math.max(0, remainingMs / 1000));

  const text = secsNum.toFixed(1) + "s";
  if (text !== lastText) {
    remainingTimeEl.textContent = text;
    lastText = text;
  }

  // Fill each section left to right based on elapsed time. A section that
  // hasn't started clamps to 0%, and a finished one clamps to 100%.
  const percentages = sectionPercentages(secsNum);
  for (let i = 0; i < barEls.length; i++) {
    if (percentages[i] !== lastWidths[i]) {
      barEls[i].style.width = percentages[i] + "%";
      lastWidths[i] = percentages[i];
    }
  }

  if (remainingMs > 0) {
    rafId = requestAnimationFrame(updateVoragoTimer);
  } else {
    // Countdown finished: the bars are full. Leave them up briefly, then clear.
    stopVoragoTimer();
    clearPendingReset();
    resetTimeout = setTimeout(resetBars, RESET_DELAY);
  }
}

function find(): boolean {
  const img = a1lib.captureHoldFullRs();
  if (!img) return false;

  return img.findSubimage(imgs.zeroHp).length > 0;
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
