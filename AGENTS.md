# AGENTS.md

Telegram bot that posts a watermarked 2×2 grid of LTA traffic cameras every 10 minutes and a daily GIF summary at midnight.

## Commands

- `npm run build` — `tsc -p .` (output: `dist/`)
- `npm run dev` — `nodemon src/index.ts`; does **not** post to Telegram
- `npm start` — `node dist/index.js`; only sends when `NODE_ENV=production`

`NODE_ENV=production` gates every Telegram send. Without it the cron cycles run and log but skip posting.

## Env (`.env`)

Copy `.env.example`. All four are required for full behavior:

- `API_TOKEN` — bot token from @BotFather
- `CHANNEL` — channel id **with `@`** (e.g. `@SG_Custom_Camera`)
- `OWNER_TELEGRAM_ID` — owner numeric id from @userinfobot
- `OWNER_USERNAME` — `@handle` used in the 5-hour down ping

`OWNER_TELEGRAM_ID` missing throws inside `down_detector.ts`; the cycle in `index.ts` wraps it in try/catch so the post still goes out.

## Architecture (single entrypoint: `src/index.ts`)

Two `node-cron` jobs:

- `*/10 * * * *` — `clearImages` → `pullImagesFromUrl` → watermark each → `mergeImages` (2×2) → `sendPhoto` → copy one grid frame to `./archive/YYYY-MM-DD/HH-mm-ss.jpg`
- `0 0 * * *` — `generateDailyGif()` reads yesterday's archive, resizes to 400px, encodes GIF, posts + pins (unpinning yesterday's pin first)

`LtaServiceError` (defined in `src/errors.ts`, thrown by `fetch_images.ts`) is the **only** signal that triggers the down detector. Jimp, Telegram, or archiving failures are logged but do **not** alert the owner — by design.

## Camera grid order

`SELECTED_CAMERAS = [5, 6, 1, 2]` in `src/fetch_images.ts` — 1-based positions on the LTA page, in 2×2 order (TL, TR, BL, BR):

- 5. Tuas Second Link
- 6. Tuas Checkpoint
- 1. Woodlands Causeway (towards Johor)
- 2. Woodlands Checkpoint (towards BKE)

Cameras 3, 4, 7, 8 are intentionally skipped. If LTA reorders or adds cameras, this array is the change site.

## Files to know

- `src/fetch_images.ts` — scrapes `https://onemotoring.lta.gov.sg/content/onemotoring/home/driving/traffic_information/traffic-cameras.html`, downloads `image0..3.jpg`
- `src/manipulate_images.ts` — `mergeImages` assumes fixed indices `[0,1,2,3]`. `addTextWatermarkWithBackgroundToImage` uses the heuristic `imagePath.includes("3") || imagePath.includes("0")` to put the watermark strip at the bottom on two of the four images — it is **tied to the `image0..3.jpg` naming convention**, rename with care.
- `src/generate_gif.ts` — uses `omggif` (no types; `@ts-ignore` at the import), owns pin state in `./.gif_pin_state.json`
- `src/down_detector.ts` — state in `./.down_detector_state.json`; alerts once on down, once on recovery, and once with `@OWNER_USERNAME` after 5h
- `src/lib/bot.ts` — bare `Telegraf` instance; throws if `API_TOKEN` is missing

## Gitignored runtime state

- `./images/` — current cycle (cleared every 10 min)
- `./archive/YYYY-MM-DD/` — one combined grid per cycle, named `HH-mm-ss.jpg` (lexical sort = chronological)
- `./gifs/YYYY-MM-DD.gif` — daily output
- `./.gif_pin_state.json`, `./.down_detector_state.json`

## Gotchas

- LTA has changed their URL before (`woodlands.html` → `traffic-cameras.html`). If `fetch_images.ts` returns zero images, check the URL in `src/index.ts` first, then the cheerio selectors.
- A single failed camera download fails the whole 10-minute cycle — intentional, but it means one bad camera blocks the post.
- No tests, no CI, no Dockerfile. Verification is `npm run build` then `npm start` with `NODE_ENV=production` against a real channel.