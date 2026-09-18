// @ts-ignore - omggif does not ship types
import { GifWriter } from "omggif";
import Jimp from "jimp";
import { format, subDays } from "date-fns";
import * as fs from "fs";
import * as path from "path";
import bot from "./lib/bot";
import config from "./config";
import { ARCHIVE_DIR, GIFS_DIR as GIF_OUTPUT_DIR, GIF_PIN_STATE_FILE as PIN_STATE_FILE } from "./paths";

const GIF_MAX_WIDTH = 400;
const FRAME_DELAY_CS = 5; // centiseconds between frames (20 fps)
const GIF_TRAILER = 0x3b;

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


const PALETTE_SIZE = 256;

// Build a 256-color palette for one frame by median cut, with each entry
// packed as a single 0xRRGGBB integer (omggif's expected shape — it does
// `rgb >> 16 & 0xff` internally, not [r,g,b] arrays).
//
// Median cut splits colour space by *range*, not by frequency, so rare but
// saturated pixels (tail lights, road signs) still get palette entries. The
// previous "256 most frequent exact colours" approach filled every slot with
// a shade of road/sky grey and the GIF came out monochrome.
function buildPalette(frame: InstanceType<typeof Jimp>): number[] {
  const data = frame.bitmap.data;
  const pixelCount = frame.getWidth() * frame.getHeight();

  // Dedupe to unique colours first — it shrinks the split work a lot on
  // photographic frames and does not change where the medians land much.
  const unique = new Set<number>();
  for (let i = 0; i < pixelCount * 4; i += 4) {
    unique.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2]);
  }
  const colors = Uint32Array.from(unique);

  type Box = { start: number; end: number; range: number; channel: number };

  const measure = (start: number, end: number): Box => {
    let minR = 255, minG = 255, minB = 255;
    let maxR = 0, maxG = 0, maxB = 0;
    for (let i = start; i < end; i++) {
      const c = colors[i];
      const r = (c >> 16) & 0xff, g = (c >> 8) & 0xff, b = c & 0xff;
      if (r < minR) minR = r; if (r > maxR) maxR = r;
      if (g < minG) minG = g; if (g > maxG) maxG = g;
      if (b < minB) minB = b; if (b > maxB) maxB = b;
    }
    const rr = maxR - minR, rg = maxG - minG, rb = maxB - minB;
    let channel = 0, range = rr;
    if (rg > range) { channel = 1; range = rg; }
    if (rb > range) { channel = 2; range = rb; }
    return { start, end, range, channel };
  };

  const shiftFor = (channel: number) => (channel === 0 ? 16 : channel === 1 ? 8 : 0);

  // Split [start, end) at the median of `channel` with a histogram pass and
  // an in-place partition, O(n) instead of a comparator sort. Returns the
  // index of the first element in the upper half.
  const partition = (start: number, end: number, channel: number): number => {
    const shift = shiftFor(channel);
    const hist = new Uint32Array(256);
    for (let i = start; i < end; i++) hist[(colors[i] >> shift) & 0xff]++;
    const half = (end - start) >> 1;
    let threshold = 0;
    for (let acc = 0; threshold < 255; threshold++) {
      acc += hist[threshold];
      if (acc >= half) break;
    }
    // Everything strictly below `threshold` goes left. If that would leave
    // the left side empty (threshold is the box minimum), include it too —
    // the box has range > 0 so the right side stays non-empty.
    let belowCount = 0;
    for (let v = 0; v < threshold; v++) belowCount += hist[v];
    const goesLeft = belowCount > 0 ? (v: number) => v < threshold : (v: number) => v <= threshold;
    let i = start, j = end - 1;
    while (i <= j) {
      if (goesLeft((colors[i] >> shift) & 0xff)) { i++; continue; }
      const tmp = colors[i]; colors[i] = colors[j]; colors[j] = tmp; j--;
    }
    return i;
  };

  const boxes: Box[] = [measure(0, colors.length)];
  while (boxes.length < PALETTE_SIZE) {
    // Split the box with the widest colour range that still has >1 colour.
    let bi = -1;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].range > 0 && (bi < 0 || boxes[i].range > boxes[bi].range)) bi = i;
    }
    if (bi < 0) break;
    const box = boxes[bi];
    const mid = partition(box.start, box.end, box.channel);
    boxes[bi] = measure(box.start, mid);
    boxes.push(measure(mid, box.end));
  }

  const palette = boxes.map(({ start, end }) => {
    let r = 0, g = 0, b = 0;
    for (let i = start; i < end; i++) {
      const c = colors[i];
      r += (c >> 16) & 0xff; g += (c >> 8) & 0xff; b += c & 0xff;
    }
    const n = end - start;
    return (Math.round(r / n) << 16) | (Math.round(g / n) << 8) | Math.round(b / n);
  });

  // Pad to 256 — omggif rejects any length that isn't a power of 2 in [2, 256].
  while (palette.length < PALETTE_SIZE) palette.push(0);
  return palette;
}

// Map each frame's pixels to the nearest palette entry, by squared distance
// in RGB space. Writes palette indices into a Uint8Array for omggif.
//
// No dithering on purpose: on these camera frames it added visible grain
// that shimmers between frames, cost 2.5x the encode time and ~15% file
// size, and the median-cut palette already tracks the source closely.
function rgbaToIndices(
  frame: InstanceType<typeof Jimp>,
  palette: number[],
): Uint8Array {
  const w = frame.getWidth();
  const h = frame.getHeight();
  const data = frame.bitmap.data;
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

  // Nearest-entry lookups are memoised per exact colour; a frame only has a
  // few tens of thousands of distinct colours, far fewer than pixels.
  const cache = new Map<number, number>();
  for (let p = 0, i = 0; p < w * h; p++, i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const key = (r << 16) | (g << 8) | b;
    let idx = cache.get(key);
    if (idx === undefined) {
      idx = 0;
      let bestDist = Infinity;
      for (let k = 0; k < palette.length; k++) {
        const dr = r - pr[k], dg = g - pg[k], db = b - pb[k];
        const dist = dr * dr + dg * dg + db * db;
        if (dist < bestDist) { bestDist = dist; idx = k; }
      }
      cache.set(key, idx);
    }
    indices[p] = idx;
  }

  return indices;
}

// Encode one frame as a complete single-frame GIF (header, frame block,
// trailer). Each archived frame is therefore a valid GIF on its own, and
// the daily GIF is just these concatenated with the duplicate headers and
// trailers stripped — see concatFrameGifs.
function encodeFrameGif(frame: InstanceType<typeof Jimp>): Buffer {
  const w = frame.getWidth();
  const h = frame.getHeight();
  const buffer = Buffer.alloc(w * h * 2 + 4096);

  // Loop=0 = infinite. No global palette on the writer; each frame gets its
  // own Local Color Table so a day that goes from bright noon to sodium-lit
  // night isn't forced to share 256 colours across both.
  const writer = new GifWriter(buffer, w, h, { loop: 0 });
  const palette = buildPalette(frame);
  writer.addFrame(0, 0, w, h, rgbaToIndices(frame, palette), { palette, delay: FRAME_DELAY_CS });
  return buffer.slice(0, writer.end());
}

// Byte length of the header omggif writes for this canvas (signature,
// logical screen descriptor, NETSCAPE loop block). It depends only on w/h
// and our fixed options, so it is identical across a day's frames.
function gifHeaderLength(w: number, h: number): number {
  const buffer = Buffer.alloc(64);
  const writer = new GifWriter(buffer, w, h, { loop: 0 });
  return writer.end() - 1; // minus the trailer byte
}

// Canvas size from the Logical Screen Descriptor (bytes 6-9, little endian).
function gifCanvasSize(gif: Buffer): { w: number; h: number } {
  return { w: gif.readUInt16LE(6), h: gif.readUInt16LE(8) };
}

// Splice single-frame GIFs into one animation: first file's header, every
// file's frame block, one trailer. Frames whose canvas differs from the
// first are skipped — a decoder takes the canvas from the header and would
// render a mismatched frame as garbage.
function concatFrameGifs(frameFiles: string[]): Buffer | null {
  let header: Buffer | null = null;
  let canvas = { w: 0, h: 0 };
  let headerLength = 0;
  const blocks: Buffer[] = [];

  for (const file of frameFiles) {
    const gif = fs.readFileSync(file);
    if (gif.length < 14 || gif.toString("latin1", 0, 6) !== "GIF89a" || gif[gif.length - 1] !== GIF_TRAILER) {
      console.warn(`[${new Date().toISOString()}] [GIF] Skipping ${file}: not a complete GIF`);
      continue;
    }
    const size = gifCanvasSize(gif);
    if (header === null) {
      canvas = size;
      headerLength = gifHeaderLength(size.w, size.h);
      header = gif.slice(0, headerLength);
    } else if (size.w !== canvas.w || size.h !== canvas.h) {
      console.warn(`[${new Date().toISOString()}] [GIF] Skipping ${file}: ${size.w}x${size.h} != ${canvas.w}x${canvas.h}`);
      continue;
    }
    blocks.push(gif.slice(headerLength, gif.length - 1));
  }

  if (header === null) return null;
  return Buffer.concat([header, ...blocks, Buffer.from([GIF_TRAILER])]);
}

// Called from the 10-minute cycle with the merged grid still in memory.
// Doing the resize + quantize here (a few seconds) instead of at midnight
// means the daily GIF is a byte-concat and posts on time even on a slow box.
async function archiveGifFrame(image: InstanceType<typeof Jimp>, now: Date): Promise<string> {
  const frame = image.clone();
  if (frame.getWidth() > GIF_MAX_WIDTH) {
    frame.resize(GIF_MAX_WIDTH, Jimp.AUTO);
  }
  const dir = path.join(ARCHIVE_DIR, format(now, "yyyy-MM-dd"));
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, `${format(now, "HH-mm-ss")}.gif`);
  // Write to a temp name and rename so a crash mid-write can't leave a
  // truncated .gif for midnight to pick up.
  const tmpPath = `${filePath}.tmp`;
  fs.writeFileSync(tmpPath, encodeFrameGif(frame));
  fs.renameSync(tmpPath, filePath);
  return filePath;
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
      console.log(`[${new Date().toISOString()}] [GIF] No archive directory found for yesterday.`);
      return;
    }

    // Only the per-cycle frames (HH-mm-ss.gif). Anything else in the
    // directory — stray files from older archivers, .tmp partial writes —
    // is ignored here and removed with the directory at the end.
    const files = fs
      .readdirSync(yesterdayDir)
      .filter((f) => /^\d{2}-\d{2}-\d{2}\.gif$/.test(f))
      .sort(); // zero-padded HH-mm-ss: lexical order is chronological
    if (files.length === 0) {
      console.log(`[${new Date().toISOString()}] [GIF] No frames found in archive directory.`);
      return;
    }

    const gifBuffer = concatFrameGifs(files.map((f) => path.join(yesterdayDir, f)));
    if (gifBuffer === null) {
      console.log(`[${new Date().toISOString()}] [GIF] No usable frames in archive directory.`);
      return;
    }

    // Ensure output dir exists
    if (!fs.existsSync(GIF_OUTPUT_DIR)) {
      fs.mkdirSync(GIF_OUTPUT_DIR, { recursive: true });
    }

    const dateStr = format(subDays(new Date(), 1), "yyyy-MM-dd");
    const gifPath = path.join(GIF_OUTPUT_DIR, `${dateStr}.gif`);
    fs.writeFileSync(gifPath, gifBuffer);
    console.log(`[${new Date().toISOString()}] [GIF] Written to ${gifPath}`);

    // CHANNEL may be undefined — guard against it
    const channel = config.CHANNEL as string | undefined;
    if (!channel) {
      console.error(`[${new Date().toISOString()}] [GIF] config.CHANNEL is not set.`);
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

    // Telegraf names a bare Buffer upload "animation.mp4" by default, so
    // Telegram received GIF bytes labelled as MP4. Give it a real .gif name.
    const message = await bot.telegram.sendAnimation(channel, {
      source: gifBuffer,
      filename: `${dateStr}.gif`,
    });
    await bot.telegram.pinChatMessage(channel, message.message_id);

    pinState.lastPinnedMessageId = message.message_id;
    savePinState(pinState);

    // Clean up archive (recursive: stray non-frame files must not leave the
    // day directory behind).
    fs.rmSync(yesterdayDir, { recursive: true, force: true });
    console.log("[GIF] Completed and archive cleaned up.");
  } catch (err) {
    console.error("[GIF] Error during GIF generation:", err);
  }
}

export { archiveGifFrame, generateDailyGif, buildPalette, rgbaToIndices, encodeFrameGif, concatFrameGifs };
