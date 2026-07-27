# Spec: LTA Down Detector

## Status
Approved

## Problem

When the LTA traffic camera service is unavailable (network failure, LTA server down, zero images returned), the bot silently fails. The owner wants to be alerted via PM on first detection, and pinged if the outage persists for 5 hours.

## Solution

Add failure detection to the image fetch cycle, with stateful alerting. The owner has muted the bot so they can track events in their chat history with the bot.

## Down Detection

In `src/fetch_images.ts`, `pullImagesFromUrl`:
- If `axios.get(url)` throws (network error, HTTP error), throw a typed `LtaServiceError` so the caller can distinguish it from other errors
- If `axios.get` succeeds but `imageUrls.length === 0`, also throw `LtaServiceError`
- All other errors (file write, etc.) are logged but do NOT trigger the down detector

In `src/index.ts`, within the 10-minute cron callback:
- Wrap `timestampsPromise` rejection in a handler that calls `onLtaDown()`
- Wrap the success path to call `onLtaRecovered()` when images are successfully pulled

## State

Module-level state in a new `src/down_detector.ts`:

```ts
interface DownState {
  isDown: boolean;
  firstFailureAt: number | null;  // Date.now() timestamp
  ownerPingedAt: number | null;   // Date.now() timestamp of 5-hour ping
}
```

Persisted to `./.down_detector_state.json` so state survives bot restarts.

## Alert Logic

### `onLtaDown()`

1. If `state.isDown === false` (entering down state):
   - Set `state.isDown = true`, `state.firstFailureAt = Date.now()`, `state.ownerPingedAt = null`
   - Save state to disk
   - PM owner: `"⚠️ LTA traffic camera service is down"`
2. If `state.isDown === true` (still down):
   - Check: `Date.now() - state.firstFailureAt >= 5 * 60 * 60 * 1000` AND `state.ownerPingedAt === null`
   - If both true: PM owner: `"⚠️ @francisyzy LTA still down after 5 hours"`, set `state.ownerPingedAt = Date.now()`, save state

### `onLtaRecovered()`

1. If `state.isDown === true` (was down, now recovered):
   - PM owner: `"✅ LTA traffic camera service has recovered"`
2. Reset all state fields to initial values (`isDown: false`, timestamps to `null`)
3. Save state to disk

## New Env Vars

Added to `.env.example`:

```
## Down Detector
# Your Telegram user ID (get it from @userinfobot)
OWNER_TELEGRAM_ID=123456789

# Your Telegram username (for the 5-hour ping — include the @)
OWNER_USERNAME=@francisyzy
```

`config.ts` reads both values.

## Error Type

```ts
// src/errors.ts
export class LtaServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LtaServiceError";
  }
}
```

## File Changes

| File | Change |
|------|--------|
| `src/errors.ts` | New file — `LtaServiceError` class |
| `src/down_detector.ts` | New file — state management + `onLtaDown()` + `onLtaRecovered()` |
| `src/fetch_images.ts` | Throw `LtaServiceError` on network failure or 0 images |
| `src/index.ts` | Import down detector, call `onLtaDown()` on rejection, `onLtaRecovered()` on success |
| `src/config.ts` | Add `OWNER_TELEGRAM_ID` and `OWNER_USERNAME` to config |
| `.env.example` | Add `OWNER_TELEGRAM_ID` and `OWNER_USERNAME` |
| `.gitignore` | Add `./.down_detector_state.json` |

## No New Dependencies

Uses existing `axios`, `fs`, `date-fns`.

## Scope

- Does not affect image scraping, watermarking, or merging logic
- Does not retry the fetch within a cycle on failure — detection is per-cycle only
