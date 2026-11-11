import { ImageData, simpleCompare, type ImgRef, type PointLike, type RectLike } from "alt1";

interface DetectionImages {
  voragoName: ImageData;
  zeroHp: ImageData;
  noHpNumber: ImageData;
}

// Crop offsets relative to the VORAGO name at (213, 20) in the empty reference.
const LEFT_EDGE_OFFSET = { x: -196, y: 20 };
const HP_NUMBER_OFFSET = { x: 0, y: 22 };

const TRACKED_INTERVAL = 25;
const SEARCH_INTERVAL = 100;
const INITIAL_SEARCH_BACKOFF = 1000;
const MAX_SEARCH_BACKOFF = 4000;
const SEARCH_SLICE_INTERVAL = 16;
const SEARCH_TILE_WIDTH = 1024;
const SEARCH_TILE_HEIGHT = 256;
// Mean summed RGB error tolerates resampling without making every text edge optional.
const MAX_NAME_ERROR = 75;
const MAX_SAMPLE_ERROR = 100;

// Search native pixels first, then common Windows DPI and RuneScape UI scales.
const SCALES = [1, 1.25, 1.5, 2, 1.75, 0.75, 0.8, 0.9, 1.1, 1.2, 2.25, 2.5, 2.75, 3];

interface ScaledImages extends DetectionImages {
  scale: number;
  samples: PointLike[];
  anchor: PointLike;
  dark: PointLike;
}

interface NameMatch {
  position: PointLike;
  images: ScaledImages;
  score: number;
}

function nameSignature(image: ImageData) {
  const samples: PointLike[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 8; col++) {
      samples.push({
        x: Math.floor(((col + 0.5) * image.width) / 8),
        y: Math.floor(((row + 0.5) * image.height) / 4),
      });
    }
  }
  let anchor = { x: 0, y: 0 };
  let dark = anchor;
  let maximum = -Infinity;
  let minimum = Infinity;
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const i = (y * image.width + x) * 4;
      if (!image.data[i + 3]) continue;
      const value = image.data[i] + image.data[i + 1] + image.data[i + 2];
      if (value > maximum) {
        maximum = value;
        anchor = { x, y };
      }
      const darkScore = value + (255 - image.data[i + 3]) * 3;
      if (darkScore < minimum) {
        minimum = darkScore;
        dark = { x, y };
      }
    }
  }
  return { samples, anchor, dark };
}

function nameScore(image: ImageData, template: ImageData, x: number, y: number): number {
  let difference = 0;
  let count = 0;
  for (let row = 0; row < template.height; row++) {
    for (let col = 0; col < template.width; col++) {
      const i = (row * template.width + col) * 4;
      if (!template.data[i + 3]) continue;
      const j = ((y + row) * image.width + x + col) * 4;
      for (let channel = 0; channel < 3; channel++) {
        difference += Math.abs(image.data[j + channel] - template.data[i + channel]);
      }
      count++;
    }
  }
  return difference / count;
}

function resizeTemplate(image: ImageData, scale: number, smooth: boolean): ImageData {
  const result = new ImageData(
    Math.max(1, Math.round(image.width * scale)),
    Math.max(1, Math.round(image.height * scale)),
  );
  for (let y = 0; y < result.height; y++) {
    for (let x = 0; x < result.width; x++) {
      const sx = Math.max(0, Math.min(image.width - 1, (x + 0.5) / scale - 0.5));
      const sy = Math.max(0, Math.min(image.height - 1, (y + 0.5) / scale - 0.5));
      const left = smooth ? Math.floor(sx) : Math.round(sx);
      const top = smooth ? Math.floor(sy) : Math.round(sy);
      const right = smooth ? Math.min(left + 1, image.width - 1) : left;
      const bottom = smooth ? Math.min(top + 1, image.height - 1) : top;
      const indices = [
        (top * image.width + left) * 4,
        (top * image.width + right) * 4,
        (bottom * image.width + left) * 4,
        (bottom * image.width + right) * 4,
      ];
      const dx = smooth ? sx - left : 0;
      const dy = smooth ? sy - top : 0;
      const weights = [(1 - dx) * (1 - dy), dx * (1 - dy), (1 - dx) * dy, dx * dy];
      const dest = (y * result.width + x) * 4;
      for (let channel = 0; channel < 3; channel++) {
        result.data[dest + channel] = indices.reduce(
          (sum, index, i) => sum + image.data[index + channel] * weights[i],
          0,
        );
      }
      // Transparent pixels mark unknown background, not black pixels to interpolate.
      result.data[dest + 3] = Math.min(...indices.map((index) => image.data[index + 3]));
    }
  }

  const pixels = result.data.slice();
  const radius = Math.ceil(scale);
  for (let y = 0; y < result.height; y++) {
    for (let x = 0; x < result.width; x++) {
      const dest = (y * result.width + x) * 4;
      if (x < radius || y < radius || x >= result.width - radius || y >= result.height - radius) {
        result.data[dest + 3] = 0;
        continue;
      }
      let contrast = 30;
      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const nx = Math.max(0, Math.min(result.width - 1, x + dx));
          const ny = Math.max(0, Math.min(result.height - 1, y + dy));
          const neighbor = (ny * result.width + nx) * 4;
          if (!pixels[neighbor + 3]) continue;
          let difference = 0;
          for (let channel = 0; channel < 3; channel++) {
            difference += Math.abs(pixels[dest + channel] - pixels[neighbor + channel]);
          }
          contrast = Math.max(contrast, difference * 1.5);
        }
      }
      // Fractional scaling shifts antialiased edges by a pixel. Keep flat bar
      // pixels strict so even a thin remaining HP fill still prevents a trigger.
      result.data[dest + 3] = Math.floor((pixels[dest + 3] * 30) / contrast);
    }
  }
  return result;
}

export class EmptyHpDetector {
  private position: PointLike | null = null;
  private tracking = false;
  private wasEmpty = false;
  private nextSearch = 0;
  private searchBackoff = INITIAL_SEARCH_BACKOFF;
  private readonly templates: ScaledImages[];
  private images: ScaledImages;

  constructor(images: DetectionImages) {
    this.templates = SCALES.flatMap((scale) => {
      if (scale === 1) return [{ ...images, scale }];
      const zeroHp = resizeTemplate(images.zeroHp, scale, true);
      const noHpNumber = resizeTemplate(images.noHpNumber, scale, true);
      return [true, false].map((smooth) => ({
        scale,
        voragoName: resizeTemplate(images.voragoName, scale, smooth),
        zeroHp,
        noHpNumber,
      }));
    }).map((entry) => ({ ...entry, ...nameSignature(entry.voragoName) }));
    this.images = this.templates[0];
  }

  private offset(point: PointLike): PointLike {
    return {
      x: Math.round(point.x * this.images.scale),
      y: Math.round(point.y * this.images.scale),
    };
  }

  get captureArea(): RectLike | null {
    if (!this.position) return null;
    const left = this.offset(LEFT_EDGE_OFFSET);
    const number = this.offset(HP_NUMBER_OFFSET);
    const padding = this.images.scale === 1 ? 0 : 1;
    return {
      x: this.position.x + left.x - padding,
      y: this.position.y - padding,
      width:
        Math.max(
          this.images.voragoName.width,
          number.x + this.images.noHpNumber.width,
          left.x + this.images.zeroHp.width,
        ) -
        left.x +
        padding * 2,
      height:
        Math.max(
          this.images.voragoName.height,
          number.y + this.images.noHpNumber.height,
          left.y + this.images.zeroHp.height,
        ) +
        padding * 2,
    };
  }

  startPolling(
    capture: (area: RectLike | null) => ImgRef | null,
    onEmpty: () => void,
    minimumInterval: () => number = () => 0,
  ): void {
    let scan: Generator<void, boolean> | null = null;
    let minimum = 0;
    const poll = () => {
      let interval = SEARCH_INTERVAL;
      try {
        if (!scan) {
          minimum = 0;
          const hint = minimumInterval();
          if (Number.isFinite(hint) && hint > 0 && hint <= 2147483647) minimum = hint;
          const search = performance.now() >= this.nextSearch;
          const area = this.captureArea;
          if (!area && !search) {
            interval = Math.max(SEARCH_INTERVAL, this.nextSearch - performance.now());
            return;
          }
          const image = capture(area);
          if (!image) return;
          const cropped =
            area &&
            image.x === area.x &&
            image.y === area.y &&
            image.width === area.width &&
            image.height === area.height;
          scan = this.detectSteps(image, cropped ? () => capture(null) : undefined, search);
        }

        const step = scan.next();
        if (!step.done) return;
        scan = null;
        if (this.tracking) interval = TRACKED_INTERVAL;
        else if (!this.position) {
          interval = Math.max(SEARCH_INTERVAL, this.nextSearch - performance.now());
        }
        if (step.value) onEmpty();
      } catch (error) {
        scan = null;
        throw error;
      } finally {
        // Alt1 has one bound image per app: never recapture between search slices.
        // Yield without swallowing errors or starting overlapping scans.
        setTimeout(poll, scan ? SEARCH_SLICE_INTERVAL : Math.max(interval, minimum));
      }
    };
    poll();
  }

  detect(image: ImgRef, captureFull?: () => ImgRef | null): boolean {
    const scan = this.detectSteps(image, captureFull);
    let step = scan.next();
    while (!step.done) step = scan.next();
    return step.value;
  }

  private *detectSteps(
    image: ImgRef,
    captureFull?: () => ImgRef | null,
    search = true,
  ): Generator<void, boolean> {
    this.tracking = this.position !== null && this.matchesName(image, this.position);
    if (!this.tracking) {
      // Neither a crop miss nor a deferred search proves that the bar disappeared.
      if (!search) return false;
      if (captureFull) {
        const full = captureFull();
        if (!full) return false;
        image = full;
      }
      const found = image.findSubimage(this.templates[0].voragoName)[0];
      if (found) {
        this.images = this.templates[0];
        this.position = { x: found.x + image.x, y: found.y + image.y };
      } else {
        const match = yield* this.findScaledName(image);
        if (!match) {
          const area = this.captureArea;
          if (area && !image.containsArea(area)) this.position = null;
          this.wasEmpty = false;
          this.nextSearch = performance.now() + this.searchBackoff;
          this.searchBackoff = Math.min(this.searchBackoff * 2, MAX_SEARCH_BACKOFF);
          return false;
        }
        this.images = match.images;
        this.position = match.position;
      }
      this.tracking = true;
    }
    this.searchBackoff = INITIAL_SEARCH_BACKOFF;
    this.nextSearch = 0;

    const left = this.offset(LEFT_EDGE_OFFSET);
    const number = this.offset(HP_NUMBER_OFFSET);
    const empty =
      this.position !== null &&
      this.matchesAt(
        image,
        this.images.zeroHp,
        this.position.x + left.x,
        this.position.y + left.y,
        this.images.scale === 1 ? 0 : 1,
        this.images.scale !== 1,
      ) &&
      this.matchesAt(
        image,
        this.images.noHpNumber,
        this.position.x + number.x,
        this.position.y + number.y,
        this.images.scale === 1 ? 0 : 1,
      );

    // Keep observing during the countdown so a lingering empty bar cannot restart it.
    const newlyEmpty = empty && !this.wasEmpty;
    this.wasEmpty = empty;
    return newlyEmpty;
  }

  private matchesName(image: ImgRef, position: PointLike): boolean {
    if (this.images.scale === 1) {
      return this.matchesAt(image, this.images.voragoName, position.x, position.y);
    }
    const x = position.x - image.x;
    const y = position.y - image.y;
    const template = this.images.voragoName;
    if (x < 0 || y < 0 || x + template.width > image.width || y + template.height > image.height) {
      return false;
    }
    return (
      nameScore(image.read(x, y, template.width, template.height), template, 0, 0) < MAX_NAME_ERROR
    );
  }

  private *findScaledName(image: ImgRef): Generator<void, NameMatch | null> {
    // Keep each native transfer and candidate list bounded, even on 4K displays.
    // Overlap by the largest name so a tile boundary cannot cut a match in half.
    const overlapX = Math.max(...this.templates.map((entry) => entry.voragoName.width)) - 1;
    const overlapY = Math.max(...this.templates.map((entry) => entry.voragoName.height)) - 1;
    let best: NameMatch | null = null;
    for (let y = 0; y < image.height; y += SEARCH_TILE_HEIGHT - overlapY) {
      for (let x = 0; x < image.width; x += SEARCH_TILE_WIDTH - overlapX) {
        if (x !== 0 || y !== 0) yield;
        const pixels = image.read(
          x,
          y,
          Math.min(SEARCH_TILE_WIDTH, image.width - x),
          Math.min(SEARCH_TILE_HEIGHT, image.height - y),
        );
        best = this.findScaledNameInTile(pixels, image.x + x, image.y + y, best);
        if (x + pixels.width === image.width) break;
      }
      if (y + SEARCH_TILE_HEIGHT >= image.height) break;
    }
    return best;
  }

  private findScaledNameInTile(
    pixels: ImageData,
    originX: number,
    originY: number,
    best: NameMatch | null,
  ): NameMatch | null {
    // Native matching rejects individual antialiased pixels. Shortlist gold-on-dark
    // text, then compare the complete name at each scale in this small tile.
    const bright: PointLike[] = [];
    const darkAt = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= pixels.width || y >= pixels.height) return false;
      const i = (y * pixels.width + x) * 4;
      return pixels.data[i] + pixels.data[i + 1] + pixels.data[i + 2] < 180;
    };
    for (let y = 0; y < pixels.height; y++) {
      for (let x = 0; x < pixels.width; x++) {
        const i = (y * pixels.width + x) * 4;
        const red = pixels.data[i];
        const green = pixels.data[i + 1];
        const blue = pixels.data[i + 2];
        if (
          red > 110 &&
          green > 100 &&
          blue > 70 &&
          red >= green - 5 &&
          red < green + 55 &&
          green > blue + 10 &&
          green < blue + 65 &&
          red > blue + 20
        ) {
          // A glyph has nearby dark background; a large gold panel does not.
          if (
            darkAt(x - 4, y) ||
            darkAt(x + 4, y) ||
            darkAt(x, y - 4) ||
            darkAt(x, y + 4) ||
            darkAt(x - 2, y) ||
            darkAt(x + 2, y) ||
            darkAt(x, y - 2) ||
            darkAt(x, y + 2)
          ) {
            bright.push({ x, y });
          }
        }
      }
    }
    for (const candidate of this.templates.slice(1)) {
      const needle = candidate.voragoName;
      for (const point of bright) {
        const x = point.x - candidate.anchor.x;
        const y = point.y - candidate.anchor.y;
        if (
          x < 0 ||
          y < 0 ||
          x + needle.width > pixels.width ||
          y + needle.height > pixels.height
        ) {
          continue;
        }
        const darkA = (candidate.dark.y * needle.width + candidate.dark.x) * 4;
        const darkB = ((y + candidate.dark.y) * pixels.width + x + candidate.dark.x) * 4;
        let darkError = 0;
        for (let channel = 0; channel < 3; channel++) {
          darkError += Math.abs(needle.data[darkA + channel] - pixels.data[darkB + channel]);
        }
        if (darkError > MAX_SAMPLE_ERROR) continue;
        let error = 0;
        for (const sample of candidate.samples) {
          const a = (sample.y * needle.width + sample.x) * 4;
          const b = ((y + sample.y) * pixels.width + x + sample.x) * 4;
          for (let channel = 0; channel < 3; channel++) {
            error += Math.abs(needle.data[a + channel] - pixels.data[b + channel]);
          }
          if (error > candidate.samples.length * MAX_SAMPLE_ERROR) break;
        }
        if (error > candidate.samples.length * MAX_SAMPLE_ERROR) continue;
        const score = nameScore(pixels, needle, x, y);
        if (score < (best?.score ?? MAX_NAME_ERROR)) {
          best = {
            score,
            images: candidate,
            position: { x: x + originX, y: y + originY },
          };
        }
      }
    }
    return best;
  }

  private matchesAt(
    image: ImgRef,
    template: ImageData,
    x: number,
    y: number,
    radius = 0,
    rejectFill = false,
  ): boolean {
    x -= image.x;
    y -= image.y;
    const regionX = Math.max(0, x - radius);
    const regionY = Math.max(0, y - radius);
    const width = Math.min(image.width, x + template.width + radius) - regionX;
    const height = Math.min(image.height, y + template.height + radius) - regionY;
    if (width < template.width || height < template.height) return false;
    const region = image.read(regionX, regionY, width, height);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const left = x + dx - regionX;
        const top = y + dy - regionY;
        if (
          left < 0 ||
          top < 0 ||
          left + template.width > region.width ||
          top + template.height > region.height
        ) {
          continue;
        }
        if (!Number.isFinite(simpleCompare(region, template, left, top, rejectFill ? 40 : 30))) {
          continue;
        }
        let filled = false;
        if (rejectFill) {
          for (
            let row = Math.ceil(2 * this.images.scale);
            row < template.height - Math.ceil(2 * this.images.scale);
            row++
          ) {
            for (let col = Math.floor(20 * this.images.scale) - 1; col < template.width; col++) {
              const i = ((top + row) * region.width + left + col) * 4;
              if (
                region.data[i + 1] > region.data[i] + 15 &&
                region.data[i + 1] > region.data[i + 2] + 15
              ) {
                filled = true;
              }
            }
          }
        }
        if (!filled) return true;
      }
    }
    return false;
  }
}
