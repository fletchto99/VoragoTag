import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ImageData, ImgRefData, type RectLike } from "alt1";
import sharp from "sharp";

import { EmptyHpDetector } from "../src/hp";

async function loadImage(...path: string[]): Promise<ImageData> {
  const { data, info } = await sharp(join(...path))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new ImageData(new Uint8ClampedArray(data), info.width, info.height);
}

const fixtures = Promise.all([
  Promise.all([
    loadImage("src", "vorago_name.data.png"),
    loadImage("src", "zero_hp.data.png"),
    loadImage("src", "no_hp_number.data.png"),
  ]).then(([voragoName, zeroHp, noHpNumber]) => ({ voragoName, zeroHp, noHpNumber })),
  loadImage("test", "fixtures", "hp-empty.png"),
  loadImage("test", "fixtures", "hp-populated.png"),
]);

function copy(image: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(image.data), image.width, image.height);
}

function place(image: ImageData, x: number, y: number): ImageData {
  const frame = new ImageData(Math.max(900, x + image.width), Math.max(300, y + image.height));
  for (let row = 0; row < image.height; row++) {
    const pixels = image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4);
    frame.data.set(pixels, ((row + y) * frame.width + x) * 4);
  }
  return frame;
}

async function resize(image: ImageData, scale: number, kernel: "nearest" | "cubic") {
  const { data, info } = await sharp(image.data, {
    raw: { width: image.width, height: image.height, channels: 4 },
  })
    .resize(Math.round(image.width * scale), Math.round(image.height * scale), { kernel })
    .raw()
    .toBuffer({ resolveWithObject: true });
  return new ImageData(new Uint8ClampedArray(data), info.width, info.height);
}

test("scaled captures distinguish empty and populated bars", async (t) => {
  const [templates, empty, populated] = await fixtures;
  for (const scale of [0.75, 0.8, 0.9, 1.1, 1.2, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]) {
    for (const kernel of ["nearest", "cubic"] as const) {
      await t.test(`${Math.round(scale * 100)}% ${kernel}`, async () => {
        const detector = new EmptyHpDetector(templates);
        const active = new ImgRefData(await resize(populated, scale, kernel));
        const depleted = new ImgRefData(await resize(empty, scale, kernel));
        assert.equal(detector.detect(active), false);
        assert.notEqual(detector.captureArea, null, "locates a populated bar");
        assert.equal(detector.detect(depleted), true);
        assert.equal(detector.detect(depleted), false);
      });
    }
  }
});

test("scaled low HP and HP numbers do not trigger", async (t) => {
  const [templates, empty, populated] = await fixtures;
  const numbered = copy(empty);
  for (let y = 44; y < 60; y++) {
    for (let x = 274; x < 280; x++) {
      const source = ((y + 1) * populated.width + x + 5) * 4;
      numbered.data.set(populated.data.subarray(source, source + 4), (y * numbered.width + x) * 4);
    }
  }
  for (const scale of [0.75, 0.8, 0.9, 1.1, 1.2, 1.25, 1.5, 1.75, 2, 2.25, 2.5, 2.75, 3]) {
    const low = copy(empty);
    // Keep at least one captured pixel; downscaling can erase a source column entirely.
    fill(low, 37, 41, Math.ceil(1 / scale), 21, [0, 180, 0, 255]);
    for (const kernel of ["nearest", "cubic"] as const) {
      await t.test(`${Math.round(scale * 100)}% ${kernel}`, async () => {
        for (const frame of [low, numbered]) {
          const detector = new EmptyHpDetector(templates);
          const image = new ImgRefData(await resize(frame, scale, kernel));
          assert.equal(detector.detect(image), false);
          assert.notEqual(detector.captureArea, null);
        }
      });
    }
  }
});

test("scaled captures require both the Vorago name and the empty bar", async () => {
  const [templates, empty] = await fixtures;
  const noName = copy(empty);
  fill(noName, 213, 20, 80, 15, [20, 29, 31, 255]);
  const noBar = copy(empty);
  fill(noBar, 33, 40, 439, 24, [20, 29, 31, 255]);
  for (const scale of [0.8, 1.25, 1.5, 2, 3]) {
    for (const frame of [noName, noBar]) {
      const detector = new EmptyHpDetector(templates);
      assert.equal(detector.detect(new ImgRefData(await resize(frame, scale, "cubic"))), false);
    }
  }
});

test("scaled tracking uses cropped game coordinates and survives fractional alignment", async (t) => {
  const [templates, empty] = await fixtures;
  for (const [scale, x, y] of [
    [0.8, 9, 17],
    [1.25, 1, 1],
    [1.5, 9, 17],
    [2, 270, 130],
  ]) {
    for (const kernel of ["nearest", "cubic"] as const) {
      await t.test(`${scale} at ${x},${y} ${kernel}`, async () => {
        const detector = new EmptyHpDetector(templates);
        const pixels = await resize(place(empty, x, y), scale, kernel);
        const frame = new ImgRefData(pixels, 100, 50);
        assert.equal(detector.detect(frame), true);
        const area = detector.captureArea!;
        const cropped = new TrackedImage(
          frame.read(area.x - frame.x, area.y - frame.y, area.width, area.height),
          area.x,
          area.y,
        );
        assert.equal(detector.detect(cropped), false);
        assert.equal(cropped.searches, 0);
        assert.deepEqual(detector.captureArea, area);
        assert.ok(cropped.reads.every((read) => read.width <= Math.ceil(80 * scale)));
      });
    }
  }
});

test("changing scale reacquires the bar without retriggering a continuously empty bar", async () => {
  const [templates, empty, populated] = await fixtures;
  const detector = new EmptyHpDetector(templates);
  for (const [index, scale] of [1, 1.25, 1.5, 2, 0.8, 1].entries()) {
    const frame = new ImgRefData(await resize(empty, scale, "cubic"));
    assert.equal(detector.detect(frame), index === 0);
    assert.ok(detector.captureArea);
  }
  assert.equal(detector.detect(new ImgRefData(await resize(populated, 1.5, "cubic"))), false);
  assert.equal(detector.detect(new ImgRefData(await resize(empty, 1.5, "cubic"))), true);
});

test("small scale changes at the same name position update the tracking geometry", async () => {
  const [templates, empty] = await fixtures;
  const detector = new EmptyHpDetector(templates);
  for (const [index, scale] of [1.25, 1.2, 1.1, 0.9, 0.8, 0.75].entries()) {
    const frame = new ImgRefData(
      await resize(empty, scale, "cubic"),
      1000 - Math.round(213 * scale),
      200 - Math.round(20 * scale),
    );
    assert.equal(detector.detect(frame), index === 0);
    assert.ok(Math.abs(detector.captureArea!.width - (276 * scale + 2)) <= 1);
  }
});

class TrackedImage extends ImgRefData {
  searches = 0;
  reads: { x: number; y: number; width: number; height: number }[] = [];

  override findSubimage(needle: ImageData) {
    this.searches++;
    return super.findSubimage(needle);
  }

  override read(x = 0, y = 0, width = this.width, height = this.height) {
    this.reads.push({ x, y, width, height });
    return super.read(x, y, width, height);
  }
}

function fill(
  image: ImageData,
  x: number,
  y: number,
  width: number,
  height: number,
  color: [number, number, number, number],
) {
  for (let row = y; row < y + height; row++) {
    for (let col = x; col < x + width; col++) {
      image.data.set(color, (row * image.width + col) * 4);
    }
  }
}

test("the supplied empty bar triggers once while it remains visible", async () => {
  const [template, empty] = await fixtures;
  const detector = new EmptyHpDetector(template);
  const image = new ImgRefData(empty);
  assert.equal(detector.detect(image), true);
  for (let frame = 0; frame < 600; frame++) {
    assert.equal(detector.detect(image), false);
  }
});

test("the supplied populated bar does not trigger", async () => {
  const [template, , populated] = await fixtures;
  assert.equal(new EmptyHpDetector(template).detect(new ImgRefData(populated)), false);
});

test("a full bar or even a single remaining green column does not trigger", async () => {
  const [template, empty] = await fixtures;
  for (const width of [1, 2, 10, 435]) {
    const image = copy(empty);
    fill(image, 37, 41, width, 21, [0, 180, 0, 255]);
    assert.equal(
      new EmptyHpDetector(template).detect(new ImgRefData(image)),
      false,
      `${width} green pixels wide`,
    );
  }
});

test("an HP number prevents a trigger even when the green fill has rounded away", async () => {
  const [template, empty, populated] = await fixtures;
  const image = copy(empty);
  // Copy the '1' from 86,451, accounting for the screenshots' (5, 1) offset.
  for (let y = 44; y < 60; y++) {
    for (let x = 274; x < 280; x++) {
      const source = ((y + 1) * populated.width + x + 5) * 4;
      image.data.set(populated.data.subarray(source, source + 4), (y * image.width + x) * 4);
    }
  }
  assert.equal(new EmptyHpDetector(template).detect(new ImgRefData(image)), false);
});

test("an empty bar without the Vorago name does not trigger", async () => {
  const [template, empty] = await fixtures;
  const image = copy(empty);
  fill(image, 213, 20, 80, 15, [20, 29, 31, 255]);
  assert.equal(new EmptyHpDetector(template).detect(new ImgRefData(image)), false);
});

test("the Vorago name without the empty bar does not trigger", async () => {
  const [template, empty] = await fixtures;
  const image = copy(empty);
  fill(image, 33, 40, 439, 24, [0, 0, 0, 255]);
  assert.equal(new EmptyHpDetector(template).detect(new ImgRefData(image)), false);
});

test("clipping a required detection region does not trigger", async () => {
  const [template, empty] = await fixtures;
  for (const [x, y, width, height] of [
    [0, 0, 280, empty.height],
    [30, 0, 480, empty.height],
    [0, 0, empty.width, 55],
  ]) {
    const clipped = new ImgRefData(empty).read(x, y, width, height);
    assert.equal(new EmptyHpDetector(template).detect(new ImgRefData(clipped)), false);
  }
});

test("the empty bar can move anywhere in the captured game window", async () => {
  const [template, empty] = await fixtures;
  const image = place(empty, 270, 130);
  assert.equal(new EmptyHpDetector(template).detect(new ImgRefData(image)), true);
});

test("pixels outside the three small detection regions are not required", async () => {
  const [templates, empty] = await fixtures;
  const image = copy(empty);
  const regions = [
    { template: templates.voragoName, x: 213, y: 20 },
    { template: templates.zeroHp, x: 17, y: 40 },
    { template: templates.noHpNumber, x: 213, y: 42 },
  ];
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const included = regions.some(({ template, x: left, y: top }) => {
        const tx = x - left;
        const ty = y - top;
        return (
          tx >= 0 &&
          ty >= 0 &&
          tx < template.width &&
          ty < template.height &&
          template.data[(ty * template.width + tx) * 4 + 3] !== 0
        );
      });
      if (!included) image.data.set([200, 30, 180, 255], (y * image.width + x) * 4);
    }
  }
  assert.equal(new EmptyHpDetector(templates).detect(new ImgRefData(image)), true);
});

test("small capture color differences still match", async () => {
  const [template, empty] = await fixtures;
  const image = copy(empty);
  for (let i = 0; i < image.data.length; i += 4) {
    for (let channel = 0; channel < 3; channel++) image.data[i + channel] += 3;
  }
  assert.equal(new EmptyHpDetector(template).detect(new ImgRefData(image)), true);
});

test("a new empty bar triggers after HP returns or the bar disappears", async () => {
  const [template, empty, populated] = await fixtures;
  for (const next of [populated, new ImageData(empty.width, empty.height)]) {
    const detector = new EmptyHpDetector(template);
    assert.equal(detector.detect(new ImgRefData(empty)), true);
    assert.equal(detector.detect(new ImgRefData(next)), false);
    assert.equal(detector.detect(new ImgRefData(empty)), true);
  }
});

test("cached detection reads only small regions without another full-screen search", async () => {
  const [templates, empty] = await fixtures;
  const detector = new EmptyHpDetector(templates);
  const image = new TrackedImage(empty);
  assert.equal(detector.detect(image), true);
  assert.equal(image.searches, 1);
  image.reads = [];

  assert.equal(detector.detect(image), false);
  assert.equal(image.searches, 1);
  assert.deepEqual(image.reads, [
    { x: 213, y: 20, width: 80, height: 15 },
    { x: 17, y: 40, width: 36, height: 24 },
    { x: 213, y: 42, width: 80, height: 20 },
  ]);
});

test("a populated bar keeps its cached position until HP reaches zero", async () => {
  const [templates, empty, populated] = await fixtures;
  const detector = new EmptyHpDetector(templates);
  const active = new TrackedImage(place(populated, 100, 100));
  assert.equal(detector.detect(active), false);
  assert.equal(active.searches, 1);
  assert.equal(detector.detect(active), false);
  assert.equal(active.searches, 1);

  // Align the name despite the different cropping of the reference screenshots.
  const depleted = new TrackedImage(place(empty, 105, 101));
  assert.equal(detector.detect(depleted), true);
  assert.equal(depleted.searches, 0);
});

test("moving an empty bar reacquires the name without triggering again", async () => {
  const [templates, empty] = await fixtures;
  const detector = new EmptyHpDetector(templates);
  assert.equal(detector.detect(new ImgRefData(empty)), true);
  const moved = new TrackedImage(place(empty, 270, 130));
  assert.equal(detector.detect(moved), false);
  assert.equal(moved.searches, 1);
  assert.equal(detector.detect(moved), false);
  assert.equal(moved.searches, 1);
});

test("a cached name is revalidated so another boss cannot use the old position", async () => {
  const [templates, empty] = await fixtures;
  const detector = new EmptyHpDetector(templates);
  assert.equal(detector.detect(new ImgRefData(empty)), true);
  const otherBoss = copy(empty);
  fill(otherBoss, 213, 20, 80, 15, [20, 29, 31, 255]);
  const frame = new TrackedImage(otherBoss);
  assert.equal(detector.detect(frame), false);
  assert.equal(frame.searches, 1);
});

test("shrinking the game window safely invalidates an out-of-bounds cached name", async () => {
  const [templates, empty] = await fixtures;
  const detector = new EmptyHpDetector(templates);
  assert.equal(detector.detect(new ImgRefData(place(empty, 270, 130))), true);
  const resized = new TrackedImage(empty);
  assert.equal(detector.detect(resized), false);
  assert.equal(resized.searches, 1);
  assert.equal(detector.detect(new ImgRefData(new ImageData(100, 50))), false);
});

test("polling checks a tracked bar every 25ms and keeps observing after a trigger", async (t) => {
  const [templates, empty, populated] = await fixtures;
  const active = new TrackedImage(place(populated, 100, 100));
  const depleted = new TrackedImage(place(empty, 105, 101));
  let frame = active;
  const capture = t.mock.fn(() => frame);
  const onEmpty = t.mock.fn();
  t.mock.timers.enable({ apis: ["setTimeout"] });

  new EmptyHpDetector(templates).startPolling(capture, onEmpty);
  assert.equal(capture.mock.callCount(), 1);
  assert.equal(active.searches, 1);
  assert.equal(onEmpty.mock.callCount(), 0);

  t.mock.timers.tick(24);
  assert.equal(capture.mock.callCount(), 1);
  t.mock.timers.tick(1);
  assert.equal(capture.mock.callCount(), 2);
  assert.equal(active.searches, 1);

  frame = depleted;
  t.mock.timers.tick(25);
  assert.equal(capture.mock.callCount(), 3);
  assert.equal(onEmpty.mock.callCount(), 1);
  assert.equal(depleted.searches, 0);
  t.mock.timers.tick(25);
  assert.equal(capture.mock.callCount(), 4);
  assert.equal(onEmpty.mock.callCount(), 1);

  frame = active;
  t.mock.timers.tick(25);
  frame = depleted;
  t.mock.timers.tick(25);
  assert.equal(onEmpty.mock.callCount(), 2);
});

test("polling captures and searches only every 100ms until the bar is located", async (t) => {
  const [templates, empty] = await fixtures;
  const missing = new TrackedImage(new ImageData(900, 300));
  let frame = missing;
  const capture = t.mock.fn(() => frame);
  const onEmpty = t.mock.fn();
  t.mock.timers.enable({ apis: ["setTimeout"] });

  new EmptyHpDetector(templates).startPolling(capture, onEmpty);
  assert.equal(capture.mock.callCount(), 1);
  assert.equal(missing.searches, 1);
  t.mock.timers.tick(99);
  assert.equal(capture.mock.callCount(), 1);
  t.mock.timers.tick(1);
  assert.equal(capture.mock.callCount(), 2);
  assert.equal(missing.searches, 2);
  assert.equal(onEmpty.mock.callCount(), 0);

  frame = new TrackedImage(empty);
  t.mock.timers.tick(99);
  assert.equal(capture.mock.callCount(), 2);
  t.mock.timers.tick(1);
  assert.equal(capture.mock.callCount(), 3);
  assert.equal(frame.searches, 1);
  assert.equal(onEmpty.mock.callCount(), 1);
  t.mock.timers.tick(24);
  assert.equal(capture.mock.callCount(), 3);
  t.mock.timers.tick(1);
  assert.equal(capture.mock.callCount(), 4);
  assert.equal(frame.searches, 1);
  assert.equal(onEmpty.mock.callCount(), 1);
});

test("polling immediately searches a moved bar and slows down only when it is missing", async (t) => {
  const [templates, empty] = await fixtures;
  let frame = new TrackedImage(empty);
  const capture = t.mock.fn(() => frame);
  const onEmpty = t.mock.fn();
  t.mock.timers.enable({ apis: ["setTimeout"] });

  new EmptyHpDetector(templates).startPolling(capture, onEmpty);
  assert.equal(onEmpty.mock.callCount(), 1);

  frame = new TrackedImage(place(empty, 270, 130));
  t.mock.timers.tick(25);
  assert.equal(capture.mock.callCount(), 2);
  assert.equal(frame.searches, 1);
  assert.equal(onEmpty.mock.callCount(), 1);
  t.mock.timers.tick(25);
  assert.equal(capture.mock.callCount(), 3);
  assert.equal(frame.searches, 1);

  frame = new TrackedImage(new ImageData(900, 300));
  t.mock.timers.tick(25);
  assert.equal(capture.mock.callCount(), 4);
  assert.equal(frame.searches, 1);
  t.mock.timers.tick(99);
  assert.equal(capture.mock.callCount(), 4);
  t.mock.timers.tick(1);
  assert.equal(capture.mock.callCount(), 5);
  assert.equal(frame.searches, 2);
});

test("unavailable captures back off without rearming a continuously empty bar", async (t) => {
  const [templates, empty] = await fixtures;
  const image = new TrackedImage(empty);
  let frame: ImgRefData | null = image;
  const capture = t.mock.fn(() => frame);
  const onEmpty = t.mock.fn();
  t.mock.timers.enable({ apis: ["setTimeout"] });

  new EmptyHpDetector(templates).startPolling(capture, onEmpty);
  assert.equal(onEmpty.mock.callCount(), 1);

  frame = null;
  t.mock.timers.tick(25);
  assert.equal(capture.mock.callCount(), 2);
  t.mock.timers.tick(99);
  assert.equal(capture.mock.callCount(), 2);
  t.mock.timers.tick(1);
  assert.equal(capture.mock.callCount(), 3);

  frame = image;
  t.mock.timers.tick(100);
  assert.equal(capture.mock.callCount(), 4);
  assert.equal(image.searches, 1);
  assert.equal(onEmpty.mock.callCount(), 1);
  t.mock.timers.tick(25);
  assert.equal(capture.mock.callCount(), 5);
  assert.equal(onEmpty.mock.callCount(), 1);
});

test("capture errors remain visible and polling retries after 100ms", async (t) => {
  const [templates, empty] = await fixtures;
  const image = new TrackedImage(empty);
  const error = new Error("capturehold failed");
  let unavailable = true;
  const capture = t.mock.fn(() => {
    if (unavailable) throw error;
    return image;
  });
  const onEmpty = t.mock.fn();
  t.mock.timers.enable({ apis: ["setTimeout"] });

  assert.throws(() => new EmptyHpDetector(templates).startPolling(capture, onEmpty), error);
  assert.equal(capture.mock.callCount(), 1);
  assert.equal(onEmpty.mock.callCount(), 0);

  unavailable = false;
  t.mock.timers.tick(99);
  assert.equal(capture.mock.callCount(), 1);
  t.mock.timers.tick(1);
  assert.equal(capture.mock.callCount(), 2);
  assert.equal(onEmpty.mock.callCount(), 1);
  t.mock.timers.tick(25);
  assert.equal(capture.mock.callCount(), 3);
  assert.equal(image.searches, 1);
  assert.equal(onEmpty.mock.callCount(), 1);
});

test("cached capture bounds enclose all templates and use local coordinates when cropped", async () => {
  const [templates, empty] = await fixtures;
  const detector = new EmptyHpDetector(templates);
  assert.equal(detector.captureArea, null);
  assert.equal(detector.detect(new ImgRefData(empty)), true);
  const area = detector.captureArea!;
  assert.deepEqual(area, { x: 17, y: 20, width: 276, height: 44 });
  const pixels = new ImgRefData(empty).read(area.x, area.y, area.width, area.height);
  const cropped = new TrackedImage(pixels, area.x, area.y);
  assert.equal(detector.detect(cropped), false);
  assert.equal(cropped.searches, 0);
  assert.deepEqual(cropped.reads, [
    { x: 196, y: 0, width: 80, height: 15 },
    { x: 0, y: 20, width: 36, height: 24 },
    { x: 196, y: 22, width: 80, height: 20 },
  ]);
  assert.deepEqual(detector.captureArea, area);
});

test("locating a name in a nonzero-origin image stores game-window coordinates", async () => {
  const [templates, empty] = await fixtures;
  const detector = new EmptyHpDetector(templates);
  assert.equal(detector.detect(new ImgRefData(empty, 100, 50)), true);
  assert.deepEqual(detector.captureArea, { x: 117, y: 70, width: 276, height: 44 });
  assert.equal(detector.detect(new ImgRefData(empty, 100, 50)), false);
});

test("regional polling reacquires a moved empty bar without treating the crop miss as a reset", async (t) => {
  const [templates, empty] = await fixtures;
  let frame = new ImgRefData(place(empty, 0, 0));
  const requests: (RectLike | null)[] = [];
  const capture = (area: RectLike | null) => {
    requests.push(area);
    if (!area) return frame;
    return new ImgRefData(frame.read(area.x, area.y, area.width, area.height), area.x, area.y);
  };
  const onEmpty = t.mock.fn();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  new EmptyHpDetector(templates).startPolling(capture, onEmpty);
  assert.equal(onEmpty.mock.callCount(), 1);

  t.mock.timers.tick(25);
  assert.deepEqual(requests, [null, { x: 17, y: 20, width: 276, height: 44 }]);
  frame = new ImgRefData(place(empty, 270, 130));
  t.mock.timers.tick(25);
  assert.deepEqual(requests.slice(-2), [{ x: 17, y: 20, width: 276, height: 44 }, null]);
  assert.equal(onEmpty.mock.callCount(), 1);
  t.mock.timers.tick(25);
  assert.deepEqual(requests.at(-1), { x: 287, y: 150, width: 276, height: 44 });
  assert.equal(onEmpty.mock.callCount(), 1);

  frame = new ImgRefData(new ImageData(900, 300));
  t.mock.timers.tick(25);
  assert.equal(requests.at(-1), null);
  const count = requests.length;
  t.mock.timers.tick(99);
  assert.equal(requests.length, count);
  frame = new ImgRefData(place(empty, 270, 130));
  t.mock.timers.tick(1);
  assert.equal(requests.at(-1), null);
  assert.equal(onEmpty.mock.callCount(), 2);
});

test("failed full-window fallback preserves the empty edge and uses the slower retry interval", async (t) => {
  const [templates, empty] = await fixtures;
  const detector = new EmptyHpDetector(templates);
  assert.equal(detector.detect(new ImgRefData(empty)), true);
  const area = detector.captureArea!;
  let failed = true;
  const capture = t.mock.fn((requested: RectLike | null) => {
    if (failed) {
      return requested
        ? new ImgRefData(new ImageData(area.width, area.height), area.x, area.y)
        : null;
    }
    return new ImgRefData(empty);
  });
  const onEmpty = t.mock.fn();
  t.mock.timers.enable({ apis: ["setTimeout"] });
  detector.startPolling(capture, onEmpty);
  assert.equal(capture.mock.callCount(), 2);
  assert.deepEqual(detector.captureArea, area);
  t.mock.timers.tick(99);
  assert.equal(capture.mock.callCount(), 2);
  failed = false;
  t.mock.timers.tick(1);
  assert.equal(capture.mock.callCount(), 3);
  assert.equal(onEmpty.mock.callCount(), 0);
});

test("polling respects a changing Alt1 minimum interval in tracking and search modes", async (t) => {
  const [templates, empty] = await fixtures;
  let frame = new ImgRefData(empty);
  let minimum = 150;
  const capture = t.mock.fn(() => frame);
  t.mock.timers.enable({ apis: ["setTimeout"] });
  new EmptyHpDetector(templates).startPolling(
    capture,
    () => {},
    () => minimum,
  );
  t.mock.timers.tick(149);
  assert.equal(capture.mock.callCount(), 1);
  minimum = 40;
  t.mock.timers.tick(1);
  assert.equal(capture.mock.callCount(), 2);
  t.mock.timers.tick(39);
  assert.equal(capture.mock.callCount(), 2);
  frame = new ImgRefData(new ImageData(900, 300));
  minimum = 200;
  t.mock.timers.tick(1);
  assert.equal(capture.mock.callCount(), 3);
  t.mock.timers.tick(199);
  assert.equal(capture.mock.callCount(), 3);
  t.mock.timers.tick(1);
  assert.equal(capture.mock.callCount(), 4);
});

test("invalid capture-rate hints retain the normal tracked cadence", async (t) => {
  const [templates, empty] = await fixtures;
  let hint = NaN;
  const capture = t.mock.fn(() => new ImgRefData(empty));
  t.mock.timers.enable({ apis: ["setTimeout"] });
  new EmptyHpDetector(templates).startPolling(
    capture,
    () => {},
    () => hint,
  );
  for (const invalid of [-1, 0, Infinity, 2147483648, NaN]) {
    hint = invalid;
    const count = capture.mock.callCount();
    t.mock.timers.tick(24);
    assert.equal(capture.mock.callCount(), count);
    t.mock.timers.tick(1);
    assert.equal(capture.mock.callCount(), count + 1);
  }
});
