import { simpleCompare, type ImgRef, type PointLike, type RectLike } from "alt1";

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

export class EmptyHpDetector {
  private position: PointLike | null = null;
  private wasEmpty = false;

  constructor(private readonly images: DetectionImages) {}

  get captureArea(): RectLike | null {
    if (!this.position) return null;
    return {
      x: this.position.x + LEFT_EDGE_OFFSET.x,
      y: this.position.y,
      width:
        Math.max(
          this.images.voragoName.width,
          HP_NUMBER_OFFSET.x + this.images.noHpNumber.width,
          LEFT_EDGE_OFFSET.x + this.images.zeroHp.width,
        ) - LEFT_EDGE_OFFSET.x,
      height: Math.max(
        this.images.voragoName.height,
        HP_NUMBER_OFFSET.y + this.images.noHpNumber.height,
        LEFT_EDGE_OFFSET.y + this.images.zeroHp.height,
      ),
    };
  }

  startPolling(
    capture: (area: RectLike | null) => ImgRef | null,
    onEmpty: () => void,
    minimumInterval: () => number = () => 0,
  ): void {
    const poll = () => {
      let interval = SEARCH_INTERVAL;
      let minimum = 0;
      try {
        const hint = minimumInterval();
        if (Number.isFinite(hint) && hint > 0 && hint <= 2147483647) minimum = hint;
        const area = this.captureArea;
        const image = capture(area);
        let captured = image !== null;
        const cropped =
          image &&
          area &&
          image.x === area.x &&
          image.y === area.y &&
          image.width === area.width &&
          image.height === area.height;
        const captureFull = cropped
          ? () => {
              const full = capture(null);
              captured = full !== null;
              return full;
            }
          : undefined;
        if (image && this.detect(image, captureFull)) {
          onEmpty();
        }
        if (captured && this.position) {
          interval = TRACKED_INTERVAL;
        }
      } finally {
        // Keep retrying after errors without swallowing them or queuing slow scans.
        setTimeout(poll, Math.max(interval, minimum));
      }
    };
    poll();
  }

  detect(image: ImgRef, captureFull?: () => ImgRef | null): boolean {
    if (
      !this.position ||
      !this.matchesAt(image, this.images.voragoName, this.position.x, this.position.y)
    ) {
      // Do not observe a missing bar until the full-window fallback has succeeded.
      if (captureFull) {
        const full = captureFull();
        if (!full) return false;
        image = full;
      }
      const found = image.findSubimage(this.images.voragoName)[0];
      this.position = found ? { x: found.x + image.x, y: found.y + image.y } : null;
    }

    const empty =
      this.position !== null &&
      this.matchesAt(
        image,
        this.images.zeroHp,
        this.position.x + LEFT_EDGE_OFFSET.x,
        this.position.y + LEFT_EDGE_OFFSET.y,
      ) &&
      this.matchesAt(
        image,
        this.images.noHpNumber,
        this.position.x + HP_NUMBER_OFFSET.x,
        this.position.y + HP_NUMBER_OFFSET.y,
      );

    // Keep observing during the countdown so a lingering empty bar cannot restart it.
    const newlyEmpty = empty && !this.wasEmpty;
    this.wasEmpty = empty;
    return newlyEmpty;
  }

  private matchesAt(image: ImgRef, template: ImageData, x: number, y: number): boolean {
    x -= image.x;
    y -= image.y;
    if (x < 0 || y < 0 || x + template.width > image.width || y + template.height > image.height) {
      return false;
    }
    const region = image.read(x, y, template.width, template.height);
    return Number.isFinite(simpleCompare(region, template, 0, 0));
  }
}
