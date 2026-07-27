# Daily GIF Generation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** At midnight each day, generate a GIF from the previous day's captured images, send it to the Telegram channel, pin it, then clean up.

**Architecture:**
- Archive images to `./archive/YYYY-MM-DD/` after each 10-minute cycle (preserving source images before `clearImages` wipes them)
- New `src/generate_gif.ts` contains `generateDailyGif()` using `omggif` for encoding + `Jimp` for resizing
- Pin state persisted to `./.gif_pin_state.json`

**Tech Stack:** `omggif` (new), `Jimp` (existing), `node-cron` (existing), `date-fns` (existing)

---

### Task 1: Install `omggif` dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install `omggif`**

```bash
cd /home/user/sg-custom-bot/sg-custom-bot && npm install omggif
```

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "deps: add omggif for GIF encoding

Co-Authored-By: francis <work@francisyzy.com>"
```

---

### Task 2: Create `src/generate_gif.ts`

**Files:**
- Create: `src/generate_gif.ts`

- [ ] **Step 1: Write `generateDailyGif()`

```ts
import fs from "fs";
import path from "path";
import { format, subDays } from "date-fns";
import Jimp from "jimp";
import { GifWriter } from "omggif";

import bot from "./lib/bot";
import config from "./config";

const GIF_MAX_WIDTH = 400;
const ARCHIVE_DIR = "./archive";
const GIF_OUTPUT_DIR = "./gifs";
const PIN_STATE_FILE = "./.gif_pin_state.json";

interface PinState {
  lastPinnedMessageId: number | null;
}

function getPinState(): PinState {
  try {
    return JSON.parse(fs.readFileSync(PIN_STATE_FILE, "utf-8"));
  } catch {
    return { lastPinnedMessageId: null };
  }
}

function savePinState(state: PinState): void {
  fs.writeFileSync(PIN_STATE_FILE, JSON.stringify(state, null, 2));
}

function getYesterdayDir(): string | null {
  const yesterday = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const dir = path.join(ARCHIVE_DIR, yesterday);
  return fs.existsSync(dir) ? dir : null;
}

async function resizeImage(imagePath: string): Promise<Jimp> {
  const image = await Jimp.read(imagePath);
  if (image.getWidth() > GIF_MAX_WIDTH) {
    image.resize(GIF_MAX_WIDTH, Jimp.AUTO);
  }
  return image;
}

function encodeGif(frames: Jimp[]): Buffer {
  const first = frames[0];
  const w = first.getWidth();
  const h = first.getHeight();
  const buffer = Buffer.alloc((w * h + w * h / 8) * frames.length + 100);
  const writer = new GifWriter(buffer, w, h, { loop: 0 });

  for (const frame of frames) {
    const rgba = frame.bitmap.data;
    const delay = 50; // 5 fps (50 = 20 ticks/sec, 50 = 1/2 sec per frame)
    const indices = Buffer.alloc(w * h);
    for (let i = 0; i < w * h; i++) {
      indices[i] = 0; // no palette mapping — raw RGBA below
    }
    // omggif requires a palette — use a simple grayscale approach
    // For simplicity, encode as a 1-frame GIF if omggif palette mode is tricky
    // Instead, use Jimp to get raw RGBA and encode manually
    writer.addFrame(0, 0, w, h, Array.from(rgba), {
      palette: buildPalette(frames),
      delay,
    });
  }
  return Buffer.from(writer.buffer().slice(0, writer.end()));
}

function buildPalette(frames: Jimp[]): number[][] {
  // Build a simple 256-color palette from all frame pixels
  const palette: number[][] = [];
  // Fill with grayscale + common colors for trafficsmart images
  for (let i = 0; i < 256; i++) {
    palette.push([i, i, i]);
  }
  // Mark first 3 palette entries as white, black, transparent
  palette[0] = [0, 0, 0];       // black
  palette[1] = [255, 255, 255]; // white
  palette[2] = [0, 0, 0];       // transparent placeholder
  return palette;
}

async function generateDailyGif(): Promise<void> {
  const yesterdayDir = getYesterdayDir();
  if (!yesterdayDir) {
    console.log("No archive found for yesterday, skipping GIF generation.");
    return;
  }

  const files = fs.readdirSync(yesterdayDir).filter((f) => f.endsWith(".jpg"));
  if (files.length === 0) {
    console.log("No images in yesterday's archive, skipping GIF generation.");
    return;
  }

  files.sort();

  console.log(`Generating GIF from ${files.length} images...`);

  const resizedFrames: Jimp[] = [];
  for (const file of files) {
    try {
      const frame = await resizeImage(path.join(yesterdayDir, file));
      resizedFrames.push(frame);
    } catch (err) {
      console.error(`Failed to resize ${file}:`, err);
    }
  }

  if (resizedFrames.length === 0) {
    console.error("No frames successfully resized, skipping GIF.");
    return;
  }

  // Encode GIF using Jimp RGBA output + omggif
  const gifBuffer = await encodeGifFromFrames(resizedFrames);

  const dateStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const gifPath = path.join(GIF_OUTPUT_DIR, `${dateStr}.gif`);
  fs.writeFileSync(gifPath, gifBuffer);

  console.log(`GIF saved to ${gifPath} (${(gifBuffer.length / 1024 / 1024).toFixed(2)} MB)`);

  // Send to channel
  const state = getPinState();

  // Unpin previous if exists
  if (state.lastPinnedMessageId !== null) {
    try {
      await bot.telegram.unpinChatMessage(config.CHANNEL, state.lastPinnedMessageId);
    } catch (err) {
      console.warn("Failed to unpin previous message (may not exist):", err);
    }
  }

  // Pin new message
  const message = await bot.telegram.sendAnimation(config.CHANNEL, { source: gifBuffer });
  await bot.telegram.pinChatMessage(config.CHANNEL, message.message_id);

  // Update state
  state.lastPinnedMessageId = message.message_id;
  savePinState(state);

  console.log(`GIF sent and pinned (message_id: ${message.message_id})`);

  // Cleanup archive
  for (const file of files) {
    fs.unlinkSync(path.join(yesterdayDir, file));
  }
  fs.rmdirSync(yesterdayDir);
  console.log(`Cleaned up archive: ${yesterdayDir}`);
}

async function encodeGifFromFrames(frames: Jimp[]): Promise<Buffer> {
  const w = frames[0].getWidth();
  const h = frames[0].getHeight();

  // Build 256-color palette from actual image pixels
  const colorCounts = new Map<string, number>();
  for (const frame of frames) {
    const data = frame.bitmap.data;
    for (let i = 0; i < data.length; i += 4) {
      const key = `${data[i]},${data[i + 1]},${data[i + 2]}`;
      colorCounts.set(key, (colorCounts.get(key) || 0) + 1);
    }
  }

  // Take top 256 most common colors
  const sortedColors = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 256)
    .map(([color]) => color.split(",").map(Number));

  const palette: number[][] = sortedColors;
  while (palette.length < 256) palette.push([0, 0, 0]);

  // Map pixels to palette indices
  function rgbaToIndex(frame: Jimp): Uint8Array {
    const data = frame.bitmap.data;
    const indices = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const r = data[i * 4];
      const g = data[i * 4 + 1];
      const b = data[i * 4 + 2];
      // Find closest palette color
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let j = 0; j < palette.length; j++) {
        const [pr, pg, pb] = palette[j];
        const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = j;
        }
      }
      indices[i] = bestIdx;
    }
    return indices;
  }

  const totalSize = (w * h + Math.ceil(w / 2) * h) * frames.length + 1024;
  const buffer = Buffer.alloc(totalSize);
  const writer = new GifWriter(buffer, w, h, { loop: 0 });

  for (const frame of frames) {
    const indices = rgbaToIndex(frame);
    const delay = 5; // 0.5s per frame at 10 ticks/100ms
    try {
      writer.addFrame(0, 0, w, h, indices as unknown as number[], {
        palette,
        delay,
      });
    } catch {
      // If frame encoding fails, skip it
      console.warn("Skipping frame due to encoding error");
    }
  }

  const end = writer.end();
  return buffer.slice(0, end);
}

export { generateDailyGif };
```

- [ ] **Step 2: Type-check the new file**

```bash
cd /home/user/sg-custom-bot/sg-custom-bot && npx tsc --noEmit src/generate_gif.ts
```

Expected: no errors (or resolve any import/typing issues).

- [ ] **Step 3: Commit**

```bash
git add src/generate_gif.ts
git commit -m "feat: add daily GIF generation with omggif

Co-Authored-By: francis <work@francisyzy.com>"
```

---

### Task 3: Wire GIF into `src/index.ts`

**Files:**
- Modify: `src/index.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Add archive copy after each cycle**

Read `src/index.ts`. After the `fs.promises.readFile(combinedImagePath)` block (after the `process.env.NODE_ENV === "production"` send block), add:

```ts
// Archive images for daily GIF
const archiveDate = format(new Date(), "yyyy-MM-dd");
const archiveDir = path.join("./archive", archiveDate);
createDirectoryIfNotExists(archiveDir);
for (const imagePath of imagePaths) {
  const dest = path.join(archiveDir, path.basename(imagePath));
  fs.copyFileSync(imagePath, dest);
}
```

Add `format` to the `date-fns` import at the top of `src/index.ts` if not already there.

- [ ] **Step 2: Import and schedule `generateDailyGif`**

Add import:
```ts
import { format } from "date-fns";
import { generateDailyGif } from "./generate_gif";
```

Add after the existing `schedule("*/10 * * * *", ...)` call:
```ts
// Midnight: generate yesterday's GIF
schedule("0 0 * * *", () => {
  generateDailyGif();
});
```

- [ ] **Step 3: Update `.gitignore`**

Add these three lines to `.gitignore`:
```
archive/
gifs/
.gif_pin_state.json
```

- [ ] **Step 4: Run build**

```bash
cd /home/user/sg-custom-bot/sg-custom-bot && npm run build
```

Expected: completes with no errors.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts .gitignore
git commit -m "feat: wire daily GIF cron and archive copy into index

Archives images after each cycle for next day's GIF.
Adds midnight cron to generate, send, pin, and clean up GIF.

Co-Authored-By: francis <work@francisyzy.com>"
```
