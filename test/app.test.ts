import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createContext, Script } from "node:vm";
import { ImageData, ImgRefData, type ImgRef, type RectLike } from "alt1";
import ts from "typescript";
import * as timer from "../src/timer";

const scripts = Object.fromEntries(
  ["index", "audio"].map((name) => {
    const source = readFileSync(new URL(`../src/${name}.ts`, import.meta.url), "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    });
    return [name, new Script(`(function(require, exports) { ${outputText}\n})`)];
  }),
);

class Element {
  style: { transform?: string; display?: string } = {};
  checked = false;
  hidden = false;
  textWrites = 0;
  private text = "";
  private listeners = new Map<string, () => void>();

  get textContent() {
    return this.text;
  }
  set textContent(value: string) {
    this.text = value;
    this.textWrites++;
  }
  addEventListener(event: string, callback: () => void) {
    this.listeners.set(event, callback);
  }
  fire(event: string) {
    this.listeners.get(event)?.();
  }
}

class Gain {
  disconnected = false;
  envelope: { value: number; when: number }[] = [];
  gain = {
    setValueAtTime: (value: number, when: number) => this.envelope.push({ value, when }),
    exponentialRampToValueAtTime: (value: number, when: number) =>
      this.envelope.push({ value, when }),
  };
  connect(destination: object) {
    return destination;
  }
  disconnect() {
    this.disconnected = true;
  }
}

class Oscillator {
  frequency = { value: 0 };
  type = "";
  starts: number[] = [];
  stops: (number | undefined)[] = [];
  disconnected = false;
  onended: (() => void) | null = null;
  connect(gain: Gain) {
    return gain;
  }
  start(when: number) {
    this.starts.push(when);
  }
  stop(when?: number) {
    this.stops.push(when);
  }
  disconnect() {
    this.disconnected = true;
  }
}

async function makeApp({ audioEnabled = false, suspended = false, browser = false } = {}) {
  const initialCapture: (area: RectLike | null) => ImgRef | null = () =>
    assert.fail("Detector not initialized");
  const state = {
    now: 0,
    audioNow: 10,
    percentageCalls: 0,
    onEmpty: () => assert.fail("Detector not initialized"),
    capture: initialCapture,
    minimumInterval: () => 0,
    resume: (): Promise<void> => Promise.resolve(),
    captureError: null as Error | null,
    captureUnavailable: false,
  };
  const oscillators: Oscillator[] = [];
  const gains: Gain[] = [];
  const errors: unknown[][] = [];
  const captures: (RectLike | null)[] = [];
  const elements = new Map<string, Element>();
  const raf = new Map<number, () => void>();
  const timeouts = new Map<number, () => void>();
  let nextId = 0;
  const get = (id: string) => {
    if (!elements.has(id)) elements.set(id, new Element());
    return elements.get(id)!;
  };
  class FakeAudioContext {
    state: AudioContextState = suspended ? "suspended" : "running";
    onstatechange: (() => void) | null = null;
    destination = {};
    constructor() {
      audioContexts.push(this);
    }
    get currentTime() {
      return state.audioNow;
    }
    async resume() {
      await state.resume();
      this.changeState("running");
    }
    changeState(value: AudioContextState) {
      this.state = value;
      this.onstatechange?.();
    }
    createOscillator() {
      const oscillator = new Oscillator();
      oscillators.push(oscillator);
      return oscillator;
    }
    createGain() {
      const gain = new Gain();
      gains.push(gain);
      return gain;
    }
  }
  const audioContexts: FakeAudioContext[] = [];
  class Detector {
    startPolling(
      capture: typeof state.capture,
      onEmpty: typeof state.onEmpty,
      minimumInterval: typeof state.minimumInterval,
    ) {
      Object.assign(state, { capture, onEmpty, minimumInterval });
    }
  }
  const alt1 = {
    permissionPixel: true,
    rsLinked: true,
    rsActive: false,
    rsWidth: 900,
    rsHeight: 300,
    captureInterval: 40,
    identifyAppUrl() {},
  };
  const capture = (area: RectLike | null) => {
    captures.push(area);
    if (state.captureError) throw state.captureError;
    if (state.captureUnavailable) return null;
    return new ImgRefData(
      new ImageData(area?.width ?? alt1.rsWidth, area?.height ?? alt1.rsHeight),
      area?.x ?? 0,
      area?.y ?? 0,
    );
  };
  const context = createContext({
    alt1,
    URL,
    console: { error: (...args: unknown[]) => errors.push(args) },
    window: { alt1: browser ? undefined : alt1, AudioContext: FakeAudioContext, location: {} },
    document: {
      getElementById: get,
      body: { classList: { add() {} } },
      location: { href: "https://example.test/index.html" },
    },
    localStorage: { getItem: () => String(audioEnabled), setItem() {} },
    performance: { now: () => state.now },
    requestAnimationFrame: (callback: () => void) => {
      raf.set(++nextId, callback);
      return nextId;
    },
    cancelAnimationFrame: (id: number) => raf.delete(id),
    setTimeout: (callback: () => void) => {
      timeouts.set(++nextId, callback);
      return nextId;
    },
    clearTimeout: (id: number) => timeouts.delete(id),
  });
  const audioExports = {};
  const requireModule = (path: string) => {
    if (path === "./audio") return audioExports;
    if (path === "./hp") return { EmptyHpDetector: Detector };
    if (path === "./timer") {
      return {
        ...timer,
        sectionPercentages(seconds: number) {
          state.percentageCalls++;
          return timer.sectionPercentages(seconds);
        },
      };
    }
    if (path === "alt1") {
      return {
        webpackImages: () => ({ promise: Promise.resolve() }),
        captureHoldFullRs: () => capture(null),
        captureHold: (x: number, y: number, width: number, height: number) =>
          capture({ x, y, width, height }),
      };
    }
    return {};
  };
  scripts.audio.runInContext(context)(requireModule, audioExports);
  scripts.index.runInContext(context)(requireModule, {});
  await Promise.resolve();
  return {
    state,
    alt1,
    get,
    oscillators,
    gains,
    errors,
    captures,
    audioContexts,
    raf,
    timeouts,
    render() {
      const callbacks = [...raf.values()];
      raf.clear();
      callbacks.forEach((callback) => callback());
    },
    toggle(enabled: boolean) {
      get("audioCueCheckbox").checked = enabled;
      get("audioCueCheckbox").fire("change");
    },
  };
}

const flushAudio = () => new Promise<void>((resolve) => setImmediate(resolve));

test("a new empty edge after the deadline starts a timer even if rendering has not finished", async () => {
  const app = await makeApp();
  app.state.onEmpty();
  app.state.now = 24001;
  app.state.onEmpty();
  assert.equal(app.get("remaining_time").textContent, "24.0s");
  assert.equal(app.raf.size, 1);
  app.state.now = 24602;
  app.render();
  assert.equal(app.get("remaining_time").textContent, "22.8s");
});

test("empty events before the deadline do not restart an active countdown", async () => {
  const app = await makeApp();
  app.state.onEmpty();
  app.state.now = 1000;
  app.state.onEmpty();
  app.render();
  assert.equal(app.get("remaining_time").textContent, "22.8s");
  assert.equal(app.raf.size, 1);
});

test("unchanged snapped time skips display calculations and bars use transforms", async () => {
  const app = await makeApp();
  app.state.onEmpty();
  app.state.now = 1;
  app.render();
  const calls = app.state.percentageCalls;
  const writes = app.get("remaining_time").textWrites;
  app.state.now = 2;
  app.render();
  assert.equal(app.state.percentageCalls, calls);
  assert.equal(app.get("remaining_time").textWrites, writes);
  assert.match(app.get("preUltBar").style.transform!, /^scaleX\(/);
  app.state.now = 601;
  app.render();
  assert.equal(app.state.percentageCalls, calls + 1);
});

test("completed bars reset and restarting cancels the previous reset", async () => {
  const app = await makeApp();
  app.state.onEmpty();
  app.state.now = 24000;
  app.render();
  assert.equal(app.raf.size, 0);
  assert.equal(app.timeouts.size, 1);
  for (const section of timer.SECTIONS) {
    assert.equal(app.get(section.id).style.transform, "scaleX(1)");
  }
  app.state.onEmpty();
  assert.equal(app.timeouts.size, 0);
  assert.equal(app.raf.size, 1);
  app.state.now = 48000;
  app.render();
  [...app.timeouts.values()][0]();
  for (const section of timer.SECTIONS) {
    assert.equal(app.get(section.id).style.transform, "scaleX(0)");
  }
});

test("audio is scheduled on the audio clock before any animation frame reaches TC", async () => {
  const app = await makeApp({ audioEnabled: true });
  app.state.onEmpty();
  assert.equal(app.oscillators.length, 1);
  assert.deepEqual(app.oscillators[0].starts, [33.4]);
  assert.deepEqual(app.oscillators[0].stops, [33.76]);
  assert.equal(app.gains[0].envelope[0].when, 33.4);
  app.state.now = 23600;
  app.render();
  assert.equal(app.oscillators.length, 1);
  app.oscillators[0].onended!();
  assert.equal(app.oscillators[0].disconnected, true);
  assert.equal(app.gains[0].disconnected, true);
});

test("restarting the browser demo cancels the old cue and schedules the new deadline", async () => {
  const app = await makeApp({ audioEnabled: true, browser: true });
  assert.equal(app.get("demoBtn").style.display, "block");
  app.get("demoBtn").fire("click");
  app.state.now = 1000;
  app.state.audioNow = 11;
  app.get("demoBtn").fire("click");
  assert.equal(app.oscillators[0].stops.at(-1), undefined);
  assert.equal(app.oscillators[0].disconnected, true);
  assert.equal(app.gains[0].disconnected, true);
  assert.deepEqual(app.oscillators[1].starts, [34.4]);
  assert.equal(app.raf.size, 1);
});

test("toggling audio cancels or reschedules a future cue without replaying one already started", async () => {
  const app = await makeApp();
  app.state.onEmpty();
  app.state.now = 10000;
  app.state.audioNow = 20;
  app.toggle(true);
  assert.deepEqual(app.oscillators[0].starts, [33.4]);
  app.toggle(false);
  assert.equal(app.oscillators[0].disconnected, true);
  app.toggle(true);
  assert.deepEqual(app.oscillators[1].starts, [33.4]);
  app.state.now = 23500;
  app.state.audioNow = 33.5;
  app.toggle(false);
  app.toggle(true);
  assert.equal(app.oscillators.length, 2);
});

test("enabling during TC plays once immediately, but enabling after expiry does not beep", async () => {
  const app = await makeApp();
  app.state.onEmpty();
  app.state.now = 23500;
  app.state.audioNow = 33.5;
  app.toggle(true);
  assert.deepEqual(app.oscillators[0].starts, [33.5]);
  app.oscillators[0].onended!();
  app.state.now = 25000;
  app.toggle(false);
  app.toggle(true);
  assert.equal(app.oscillators.length, 1);
});

test("pending audio resume shows a warning and retains the countdown deadline", async () => {
  const app = await makeApp({ audioEnabled: true, suspended: true });
  let resume = () => {};
  app.state.resume = () =>
    new Promise<void>((resolve) => {
      resume = resolve;
    });
  app.state.onEmpty();
  assert.equal(app.oscillators.length, 0);
  assert.match(app.get("audioStatus").textContent, /Audio paused/);
  assert.equal(app.get("audioStatus").hidden, false);
  await flushAudio();
  assert.equal(app.audioContexts[0].state, "suspended");
  assert.equal(app.oscillators.length, 0);
  assert.match(app.get("audioStatus").textContent, /Audio paused/);
  assert.equal(app.errors.length, 0);
  app.state.now = 1000;
  resume();
  await flushAudio();
  assert.deepEqual(app.oscillators[0].starts, [32.4]);
  assert.equal(app.get("audioStatus").textContent, "");
  assert.equal(app.get("audioStatus").hidden, true);
});

test("disabling a cue while resume is pending prevents stale audio scheduling", async () => {
  const app = await makeApp({ audioEnabled: true, suspended: true });
  let resume = () => {};
  app.state.resume = () =>
    new Promise<void>((resolve) => {
      resume = resolve;
    });
  app.state.onEmpty();
  app.toggle(false);
  assert.equal(app.get("audioStatus").hidden, true);
  resume();
  await flushAudio();
  assert.equal(app.oscillators.length, 0);
  assert.equal(app.get("audioStatus").hidden, true);
});

test("restarting while resume is pending schedules only the latest countdown", async () => {
  const app = await makeApp({ audioEnabled: true, suspended: true, browser: true });
  const resumes: (() => void)[] = [];
  app.state.resume = () => new Promise<void>((resolve) => resumes.push(resolve));
  app.get("demoBtn").fire("click");
  app.state.now = 1000;
  app.state.audioNow = 11;
  app.get("demoBtn").fire("click");
  resumes[0]();
  await flushAudio();
  assert.equal(app.oscillators.length, 1);
  assert.deepEqual(app.oscillators[0].starts, [34.4]);
  resumes[1]();
  await flushAudio();
  assert.equal(app.oscillators.length, 1);
  assert.deepEqual(app.oscillators[0].starts, [34.4]);
});

test("a resume that completes after countdown expiry does not play a late cue", async () => {
  const app = await makeApp({ audioEnabled: true, suspended: true });
  let resume = () => {};
  app.state.resume = () =>
    new Promise<void>((resolve) => {
      resume = resolve;
    });
  app.state.onEmpty();
  app.state.now = 25000;
  resume();
  await flushAudio();
  assert.equal(app.oscillators.length, 0);
});

test("suspension cancels a scheduled cue and resume rebases it against the countdown deadline", async () => {
  const app = await makeApp({ audioEnabled: true });
  app.state.onEmpty();
  app.state.now = 10000;
  app.state.audioNow = 20;
  const context = app.audioContexts[0];
  context.changeState("suspended");
  assert.equal(app.oscillators[0].stops.at(-1), undefined);
  assert.equal(app.oscillators[0].disconnected, true);
  assert.equal(app.gains[0].disconnected, true);
  assert.equal(app.get("audioStatus").hidden, false);

  app.state.now = 15000;
  context.changeState("running");
  assert.equal(app.oscillators.length, 2);
  assert.deepEqual(app.oscillators[1].starts, [28.4]);
  assert.equal(app.get("audioStatus").hidden, true);
  context.changeState("running");
  assert.equal(app.oscillators.length, 2);
});

test("resuming a previously scheduled cue after countdown expiry leaves it cancelled", async () => {
  const app = await makeApp({ audioEnabled: true });
  app.state.onEmpty();
  app.state.now = 10000;
  app.state.audioNow = 20;
  app.audioContexts[0].changeState("suspended");
  app.state.now = 25000;
  app.audioContexts[0].changeState("running");
  assert.equal(app.oscillators[0].disconnected, true);
  assert.equal(app.oscillators.length, 1);
  assert.equal(app.get("audioStatus").hidden, true);
});

test("resuming inside the TC window schedules one immediate cue", async () => {
  const app = await makeApp({ audioEnabled: true });
  app.state.onEmpty();
  app.state.now = 10000;
  app.state.audioNow = 20;
  app.audioContexts[0].changeState("suspended");
  app.state.now = 23500;
  app.audioContexts[0].changeState("running");
  assert.equal(app.oscillators.length, 2);
  assert.deepEqual(app.oscillators[1].starts, [20]);
});

test("audio disabled during suspension does not schedule another cue on resume", async () => {
  const app = await makeApp({ audioEnabled: true });
  app.state.onEmpty();
  app.state.now = 10000;
  app.state.audioNow = 20;
  app.audioContexts[0].changeState("suspended");
  assert.equal(app.oscillators[0].disconnected, true);
  app.toggle(false);
  app.state.now = 15000;
  app.audioContexts[0].changeState("running");
  assert.equal(app.oscillators.length, 1);
  assert.equal(app.get("audioStatus").hidden, true);
});

test("suspending a cue that already started does not replay it on resume", async () => {
  const app = await makeApp({ audioEnabled: true });
  app.state.onEmpty();
  app.state.now = 23500;
  app.state.audioNow = 33.5;
  app.audioContexts[0].changeState("suspended");
  assert.equal(app.oscillators[0].disconnected, true);
  app.state.now = 23600;
  app.audioContexts[0].changeState("running");
  assert.equal(app.oscillators.length, 1);
});

test("audio failures are visible and do not stop the countdown", async () => {
  const app = await makeApp({ audioEnabled: true, suspended: true });
  app.state.resume = () => Promise.reject(new Error("Playback blocked"));
  app.state.onEmpty();
  await flushAudio();
  assert.equal(app.errors.length, 1);
  assert.equal(app.get("audioStatus").hidden, false);
  assert.match(app.get("audioStatus").textContent, /Audio unavailable/);
  assert.equal(app.raf.size, 1);
  app.toggle(false);
  assert.equal(app.get("audioStatus").hidden, true);
});

test("unavailable capture is reported without making native calls, and loss of focus is ignored", async () => {
  const app = await makeApp();
  app.alt1.rsLinked = false;
  assert.equal(app.state.capture(null), null);
  assert.equal(app.captures.length, 0);
  assert.match(app.get("captureStatus").textContent, /Waiting/);
  app.alt1.rsLinked = true;
  app.alt1.permissionPixel = false;
  assert.equal(app.state.capture(null), null);
  assert.equal(app.captures.length, 0);
  assert.match(app.get("captureStatus").textContent, /permission/);
  app.alt1.permissionPixel = true;
  assert.ok(app.state.capture(null));
  assert.equal(app.captures.length, 1);
  assert.equal(app.get("captureStatus").hidden, true);
  assert.equal(app.alt1.rsActive, false);
  assert.equal(app.state.minimumInterval(), 40);
  app.alt1.captureInterval = 100;
  assert.equal(app.state.minimumInterval(), 100);
});

test("the native adapter requests regional captures and falls back when a resize invalidates bounds", async () => {
  const app = await makeApp();
  const area = { x: 17, y: 20, width: 276, height: 44 };
  const image = app.state.capture(area)!;
  assert.deepEqual(app.captures[0], area);
  assert.equal(image.x, area.x);
  assert.equal(image.y, area.y);
  assert.equal(image.width, area.width);
  assert.equal(image.height, area.height);
  app.alt1.rsWidth = 250;
  const resized = app.state.capture(area)!;
  assert.equal(app.captures[1], null);
  assert.equal(resized.width, 250);
});

test("native capture errors remain visible until capture succeeds", async () => {
  const app = await makeApp();
  const error = new Error("capturehold failed");
  app.state.captureError = error;
  assert.throws(() => app.state.capture(null), error);
  assert.match(app.get("captureStatus").textContent, /capture failed/);
  assert.equal(app.get("captureStatus").hidden, false);
  app.state.captureError = null;
  app.state.captureUnavailable = true;
  assert.equal(app.state.capture(null), null);
  assert.match(app.get("captureStatus").textContent, /capture failed/);
  assert.equal(app.get("captureStatus").hidden, false);
  app.state.captureUnavailable = false;
  app.state.capture(null);
  assert.equal(app.get("captureStatus").hidden, true);
});

test("null native captures show a failure for both full-window and regional requests", async () => {
  const app = await makeApp();
  app.state.captureUnavailable = true;
  for (const area of [null, { x: 17, y: 20, width: 276, height: 44 }]) {
    assert.equal(app.state.capture(area), null);
    assert.match(app.get("captureStatus").textContent, /capture failed/);
    assert.equal(app.get("captureStatus").hidden, false);
  }
});
