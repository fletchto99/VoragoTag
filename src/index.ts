import * as a1lib from "alt1";

import { EmptyHpDetector } from "./hp";
import { AudioCue } from "./audio";
import { SECTIONS, TOTAL_TIME, snapRemainingSeconds, sectionPercentages } from "./timer";

// Tell webpack to include these files in the output
import "./index.html";
import "./appconfig.json";
import "./icon.png";
import "./styles.css";

// Load detection images
const imgs = a1lib.webpackImages({
  voragoName: require("./vorago_name.data.png"),
  zeroHp: require("./zero_hp.data.png"),
  noHpNumber: require("./no_hp_number.data.png"),
});

const remainingTimeEl = document.getElementById("remaining_time")!;
const barEls = SECTIONS.map((s) => document.getElementById(s.id)! as HTMLElement);
const audioCueCheckbox = document.getElementById("audioCueCheckbox") as HTMLInputElement;
const captureStatusEl = document.getElementById("captureStatus")!;
const audioStatusEl = document.getElementById("audioStatus")!;

function setStatus(element: HTMLElement, message: string) {
  if (element.textContent !== message) element.textContent = message;
  if (element.hidden !== !message) element.hidden = !message;
}

const audioCue = new AudioCue((message) => setStatus(audioStatusEl, message));

// How long the filled bar stays on screen after the countdown completes before
// it clears back to empty.
const RESET_DELAY = 1000;

let rafId: number | null = null;
let resetTimeout: ReturnType<typeof setTimeout> | null = null;
let endTime = 0;
// Cache the last rendered values so we only touch the DOM when they change.
let lastSeconds: number | null = null;
const lastPercentages: number[] = [];

// Persist the audio-cue preference so it survives app restarts in Alt1.
const AUDIO_CUE_STORAGE_KEY = "voragoTag.audioCueEnabled";

function loadAudioCuePref(): boolean {
  try {
    return localStorage.getItem(AUDIO_CUE_STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function saveAudioCuePref(enabled: boolean) {
  try {
    localStorage.setItem(AUDIO_CUE_STORAGE_KEY, String(enabled));
  } catch {
    // Storage unavailable (e.g. privacy mode); preference just won't persist.
  }
}

// Restore the saved preference before wiring up the change handler.
audioCueCheckbox.checked = loadAudioCuePref();

// Persist the choice, and initialise audio on the user gesture of enabling it.
audioCueCheckbox.addEventListener("change", () => {
  saveAudioCuePref(audioCueCheckbox.checked);
  audioCue.setEnabled(audioCueCheckbox.checked);
});

function startVoragoTimer() {
  // A new run cancels any pending post-fill reset so it can't wipe the bars
  // mid-countdown.
  clearPendingReset();
  endTime = performance.now() + TOTAL_TIME * 1000;
  audioCue.start(endTime, audioCueCheckbox.checked);
  stopVoragoTimer();
  updateVoragoTimer();
}

function stopVoragoTimer() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
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
    barEls[i].style.transform = "scaleX(0)";
    lastPercentages[i] = 0;
  }
  lastSeconds = null;
}

function updateVoragoTimer() {
  const remainingMs = endTime - performance.now();
  const remainingSecs = Math.max(0, remainingMs / 1000);
  const secsNum = snapRemainingSeconds(remainingSecs);

  if (secsNum !== lastSeconds) {
    lastSeconds = secsNum;
    remainingTimeEl.textContent = secsNum.toFixed(1) + "s";
    const percentages = sectionPercentages(secsNum);
    for (let i = 0; i < barEls.length; i++) {
      if (percentages[i] !== lastPercentages[i]) {
        barEls[i].style.transform = `scaleX(${percentages[i] / 100})`;
        lastPercentages[i] = percentages[i];
      }
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

function captureHp(area: a1lib.RectLike | null): a1lib.ImgRef | null {
  if (!alt1.permissionPixel) {
    setStatus(captureStatusEl, "Enable Alt1 pixel permission to detect HP.");
    return null;
  }
  if (!alt1.rsLinked || alt1.rsWidth <= 0 || alt1.rsHeight <= 0) {
    setStatus(captureStatusEl, "Waiting for Alt1 to find RuneScape.");
    return null;
  }

  try {
    const fits =
      area &&
      area.x >= 0 &&
      area.y >= 0 &&
      area.x + area.width <= alt1.rsWidth &&
      area.y + area.height <= alt1.rsHeight;
    const image = fits
      ? a1lib.captureHold(area.x, area.y, area.width, area.height)
      : a1lib.captureHoldFullRs();
    setStatus(captureStatusEl, image ? "" : "RuneScape capture failed. Retrying.");
    return image;
  } catch (error) {
    setStatus(captureStatusEl, "RuneScape capture failed. Retrying.");
    throw error;
  }
}

// Check if running inside alt1
if (window.alt1) {
  alt1.identifyAppUrl("./appconfig.json");

  void imgs.promise.then(() => {
    const detector = new EmptyHpDetector(imgs);
    detector.startPolling(
      captureHp,
      () => {
        if (performance.now() >= endTime) startVoragoTimer();
      },
      () => alt1.captureInterval,
    );
  });
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
