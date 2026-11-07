import { simpleCompare, type ImgRef, type PointLike } from "alt1";

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

  startPolling(capture: () => ImgRef | null, onEmpty: () => void): void {
    const poll = () => {
      let interval = SEARCH_INTERVAL;
      try {
        const image = capture();
        if (image && this.detect(image)) {
          onEmpty();
        }
        if (image && this.position) {
          interval = TRACKED_INTERVAL;
        }
      } finally {
        // Keep retrying after errors without swallowing them or queuing slow scans.
        setTimeout(poll, interval);
      }
    };
    poll();
  }

  detect(image: ImgRef): boolean {
    if (
      !this.position ||
      !this.matchesAt(image, this.images.voragoName, this.position.x, this.position.y)
    ) {
      this.position = image.findSubimage(this.images.voragoName)[0] ?? null;
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
    if (x < 0 || y < 0 || x + template.width > image.width || y + template.height > image.height) {
      return false;
    }
    const region = image.read(x, y, template.width, template.height);
    return Number.isFinite(simpleCompare(region, template, 0, 0));
  }
}
