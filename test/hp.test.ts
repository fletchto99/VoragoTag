import { test } from "node:test";
import assert from "node:assert/strict";
import { join } from "node:path";
import { ImageData, ImgRefData } from "alt1";
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
  const frame = new ImageData(900, 300);
  for (let row = 0; row < image.height; row++) {
    const pixels = image.data.subarray(row * image.width * 4, (row + 1) * image.width * 4);
    frame.data.set(pixels, ((row + y) * frame.width + x) * 4);
  }
  return frame;
}

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
