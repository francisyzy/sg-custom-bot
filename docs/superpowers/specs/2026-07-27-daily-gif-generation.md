# Spec: Daily GIF Generation

## Status
Approved

## Problem

The bot posts a combined image every 10 minutes but does not generate or send a daily GIF summary. The `gifDirectory = "./gifs"` directory and its creation logic already exist in `src/index.ts` but are unused.

## Goal

After every 12am (midnight), generate a GIF from the previous day's captured images, send it to the Telegram channel, pin it, then clean up.

## Architecture

### Image Lifecycle

The current cron runs every 10 minutes and calls `clearImages(outputDirectory)` which **deletes** all images. To preserve yesterday's images for the GIF:

1. After each 10-minute cycle completes (images downloaded, watermarked, merged, sent), **copy** the individual image files from `./images/` into `./archive/YYYY-MM-DD/` (one subdirectory per day)
2. The `./images/` directory is not modified — it continues to hold only the current cycle's images for the combined.jpg
3. The `./archive/` directory accumulates daily subdirectories as a cache

### New Directory

```
./archive/
  2026-07-26/
    image0.jpg
    image1.jpg
    image2.jpg
    image3.jpg
  2026-07-27/
    image0.jpg
    ...
```

### GIF Cron

A second `node-cron` schedule runs once daily at midnight:
```ts
schedule("0 0 * * *", () => {
  generateDailyGif();
});
```

### `generateDailyGif()` Function

Located in a new file `src/generate_gif.ts`:

1. **Find yesterday's directory**: use `date-fns` — `format(subDays(new Date(), 1), "yyyy-MM-dd")` — look for `./archive/<date>/`
2. **Exit silently if no archive found**: log a message, do nothing
3. **Sort images** by filename numerically
4. **Resize each image** to max width **400px** using `Jimp` (already a dependency) to keep GIF file size manageable (~<10MB target for Telegram upload)
5. **Encode GIF** using `omggif` — pure JS, no system dependencies. npm package: `omggif`
6. **Save** to `./gifs/YYYY-MM-DD.gif`
7. **Send to channel**: use `bot.telegram.sendAnimation(config.CHANNEL, { source: gifBuffer })` (small GIFs sent as animation; if >50MB, fall back to `sendDocument`)
8. **Pin the message**: store the returned `message_id`, call `bot.telegram.pinChatMessage(config.CHANNEL, messageId)`
9. **Unpin previous GIF**: maintain a persistent state file (e.g. `./.gif_pin_state.json`) tracking `lastPinnedMessageId`. On pin, unpin the old one first
10. **Clean up archive**: after successful send, delete all files in `./archive/<yesterday>/`

### Pin State File

`./.gif_pin_state.json`:
```json
{ "lastPinnedMessageId": null }
```

Read/write with `fs.promises`. Added to `.gitignore`.

### Error Handling

- If image processing or GIF encoding fails, log the error and skip — do not crash the process
- If send fails, log the error and skip — do not clean up archive (retry next day)

## New Dependencies

| Package | Reason |
|---------|--------|
| `omggif` | Pure JS GIF encoder, no native compilation needed |

## Env Var Additions

None required. Uses existing `config.CHANNEL`.

## File Changes

| File | Change |
|------|--------|
| `src/generate_gif.ts` | New file — `generateDailyGif()` function |
| `src/index.ts` | Import `generateDailyGif`, add daily cron, add archive copy after each cycle |
| `.gitignore` | Add `./archive/`, `./gifs/`, `./.gif_pin_state.json` |
| `package.json` | Add `omggif` dependency |

## Scope

- Does not modify existing image scraping, watermarking, or merging logic
- GIF is purely additive
