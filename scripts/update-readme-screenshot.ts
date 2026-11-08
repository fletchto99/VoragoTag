import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import { SECTIONS, TOTAL_TIME, snapRemainingSeconds } from "../src/timer";

async function main() {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const config = JSON.parse(await readFile(join(root, "src", "appconfig.json"), "utf8"));
  const output = join(root, "docs", "readme-screenshot.png");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: config.defaultWidth, height: config.defaultHeight },
      deviceScaleFactor: 2,
    });
    const errors: Error[] = [];
    page.on("pageerror", (error) => errors.push(error));
    await page.clock.install({ time: new Date(0) });
    await page.clock.pauseAt(new Date(1000));
    await page.goto(pathToFileURL(join(root, "dist", "index.html")).href);
    await page.getByRole("button", { name: "Start demo timer" }).click();
    await page.evaluate(() => {
      document.body.classList.remove("browser");
      for (const id of ["demoBtn", "addAppBtn"]) {
        document.getElementById(id)!.style.display = "none";
      }
    });

    const elapsed = SECTIONS[0].duration + SECTIONS[1].duration / 2;
    await page.clock.runFor(elapsed * 1000);
    await page.evaluate(() => document.fonts.ready);
    const remaining = snapRemainingSeconds(TOTAL_TIME - elapsed).toFixed(1) + "s";
    assert.equal(await page.locator("#remaining_time").textContent(), remaining);
    assert.equal(await page.getByRole("button", { name: "Start demo timer" }).isVisible(), false);
    assert.equal(await page.getByRole("button", { name: "Add to Alt1" }).isVisible(), false);
    assert.deepEqual(errors, [], "The app must render without browser errors");

    await mkdir(dirname(output), { recursive: true });
    await page.locator("#appFrame").screenshot({ path: output });
    console.log(`Updated ${output}`);
  } finally {
    await browser.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
