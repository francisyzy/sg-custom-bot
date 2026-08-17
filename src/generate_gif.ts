// @ts-ignore - omggif does not ship types
import { GifWriter } from "omggif";
import Jimp from "jimp";
import { format, subDays } from "date-fns";
import * as fs from "fs";
import * as path from "path";
import bot from "./lib/bot";
import config from "./config";

const GIF_MAX_WIDTH = 400;
const ARCHIVE_DIR = "./archive";
const GIF_OUTPUT_DIR = "./gifs";
const PIN_STATE_FILE = "./.gif_pin_state.json";

interface PinState {
  lastPinnedMessageId: number | null;
}

function getYesterdayDir(): string | null {
  const dateStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
  const dirPath = path.join(ARCHIVE_DIR, dateStr);
  if (fs.existsSync(dirPath)) {
    return dirPath;
  }
  return null;
}

async function resizeImage(imagePath: string): Promise<InstanceType<typeof Jimp>> {
  const image = await Jimp.read(imagePath);
  if (image.getWidth() > GIF_MAX_WIDTH) {
    image.resize(GIF_MAX_WIDTH, Jimp.AUTO);
  }
  return image;
}

// Build a 256-color palette across all frames by frequency, with each
// entry packed as a single 0xRRGGBB integer (omggif's expected shape —
// it does `rgb >> 16 & 0xff` internally, not [r,g,b] arrays).
function buildPalette(frames: InstanceType<typeof Jimp>[]): number[] {
  const counts = new Map<number, number>();

  for (const frame of frames) {
    frame.scan(0, 0, frame.getWidth(), frame.getHeight(), function (_x, _y, idx) {
      const r = this.bitmap.data[idx + 0];
      const g = this.bitmap.data[idx + 1];
      const b = this.bitmap.data[idx + 2];
      const packed = (r << 16) | (g << 8) | b;
      counts.set(packed, (counts.get(packed) ?? 0) + 1);
    });
  }

  const palette = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 256)
    .map(([packed]) => packed);

  // Pad to 256 — omggif rejects any length that isn't a power of 2 in [2, 256].
  while (palette.length < 256) palette.push(0);
  return palette;
}

// Map each frame's pixels to the nearest palette entry, by squared distance
// in RGB space. Writes palette indices into a Uint8Array for omggif.
function rgbaToIndices(
  frame: InstanceType<typeof Jimp>,
  palette: number[],
): Uint8Array {
  const w = frame.getWidth();
  const h = frame.getHeight();
  const indices = new Uint8Array(w * h);

  // Decode the packed palette into parallel r/g/b arrays once — doing the
  // bit-shifts inside the inner loop was the hot path.
  const pr = new Uint8Array(palette.length);
  const pg = new Uint8Array(palette.length);
  const pb = new Uint8Array(palette.length);
  for (let i = 0; i < palette.length; i++) {
    pr[i] = (palette[i] >> 16) & 0xff;
    pg[i] = (palette[i] >> 8) & 0xff;
    pb[i] = palette[i] & 0xff;
  }

  let pixelIdx = 0;
  frame.scan(0, 0, w, h, function (_x, _y, idx) {
    const r = this.bitmap.data[idx + 0];
    const g = this.bitmap.data[idx + 1];
    const b = this.bitmap.data[idx + 2];

    let bestIdx = 0;
    let bestDist = Infinity;
    for (let i = 0; i < palette.length; i++) {
      const dr = r - pr[i];
      const dg = g - pg[i];
      const db = b - pb[i];
      const dist = dr * dr + dg * dg + db * db;
      if (dist < bestDist) {
        bestDist = dist;
        bestIdx = i;
      }
    }

    indices[pixelIdx++] = bestIdx;
  });

  return indices;
}

function encodeGif(frames: InstanceType<typeof Jimp>[]): Buffer {
  const w = frames[0].getWidth();
  const h = frames[0].getHeight();
  const estimatedSize = w * h * frames.length * 2 + 1024;
  const buffer = Buffer.alloc(estimatedSize);

  const palette = buildPalette(frames);

  // Loop=0 = infinite. No global palette on the writer; we attach a local
  // palette per frame instead so omggif writes the right Local Color Table
  // block and frames stay self-describing.
  const writer = new GifWriter(buffer, w, h, { loop: 0 });

  for (const frame of frames) {
    const indices = rgbaToIndices(frame, palette);
    writer.addFrame(0, 0, w, h, indices, { palette, delay: 5 });
  }

  const length = writer.end();
  return buffer.slice(0, length);
}

function getPinState(): PinState {
  try {
    if (fs.existsSync(PIN_STATE_FILE)) {
      return JSON.parse(fs.readFileSync(PIN_STATE_FILE, "utf-8")) as PinState;
    }
  } catch {
    // ignore parse errors
  }
  return { lastPinnedMessageId: null };
}

function savePinState(state: PinState): void {
  fs.writeFileSync(PIN_STATE_FILE, JSON.stringify(state, null, 2));
}

async function generateDailyGif(): Promise<void> {
  try {
    const yesterdayDir = getYesterdayDir();
    if (!yesterdayDir) {
      console.log("[GIF] No archive directory found for yesterday.");
      return;
    }

    const files = fs.readdirSync(yesterdayDir).filter((f) => f.endsWith(".jpg") || f.endsWith(".jpeg") || f.endsWith(".png"));
    if (files.length === 0) {
      console.log("[GIF] No images found in archive directory.");
      return;
    }

    files.sort();

    // Resize all images
    const resizedFrames: InstanceType<typeof Jimp>[] = [];
    for (const file of files) {
      const image = await resizeImage(path.join(yesterdayDir, file));
      resizedFrames.push(image);
    }

    // Encode GIF
    const gifBuffer = encodeGif(resizedFrames);

    // Ensure output dir exists
    if (!fs.existsSync(GIF_OUTPUT_DIR)) {
      fs.mkdirSync(GIF_OUTPUT_DIR, { recursive: true });
    }

    const dateStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const gifPath = path.join(GIF_OUTPUT_DIR, `${dateStr}.gif`);
    fs.writeFileSync(gifPath, gifBuffer);
    console.log(`[GIF] Written to ${gifPath}`);

    // CHANNEL may be undefined — guard against it
    const channel = config.CHANNEL as string | undefined;
    if (!channel) {
      console.error("[GIF] config.CHANNEL is not set.");
      return;
    }

    // Handle pin state
    const pinState = getPinState();

    if (pinState.lastPinnedMessageId !== null) {
      try {
        await bot.telegram.unpinChatMessage(channel, pinState.lastPinnedMessageId);
      } catch (err) {
        console.error("[GIF] Failed to unpin previous message:", err);
      }
    }

    const message = await bot.telegram.sendAnimation(channel, { source: gifBuffer });
    await bot.telegram.pinChatMessage(channel, message.message_id);

    pinState.lastPinnedMessageId = message.message_id;
    savePinState(pinState);

    // Clean up archive
    for (const file of files) {
      fs.unlinkSync(path.join(yesterdayDir, file));
    }
    fs.rmdirSync(yesterdayDir);
    console.log("[GIF] Completed and archive cleaned up.");
  } catch (err) {
    console.error("[GIF] Error during GIF generation:", err);
  }
}

export { generateDailyGif };
