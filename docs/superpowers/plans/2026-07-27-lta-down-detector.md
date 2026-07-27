# LTA Down Detector — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect when LTA traffic camera fetch fails, PM the owner immediately, then ping them after 5 hours of continued outage. Recoveries trigger a recovery notification.

**Architecture:**
- New `src/errors.ts` — typed `LtaServiceError`
- New `src/down_detector.ts` — state management + alert functions, persisted to `./.down_detector_state.json`
- `src/fetch_images.ts` — throw `LtaServiceError` on network failure or zero images
- `src/index.ts` — call `onLtaDown()` / `onLtaRecovered()` in the cron callback
- `config.ts` + `.env.example` — new `OWNER_TELEGRAM_ID` and `OWNER_USERNAME` vars

**Tech Stack:** Existing deps only (`axios`, `fs`, `date-fns`)

---

### Task 1: Create `src/errors.ts`

**Files:**
- Create: `src/errors.ts`

- [ ] **Step 1: Write the error class**

```ts
export class LtaServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LtaServiceError";
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/errors.ts
git commit -m "feat: add LtaServiceError type for down detection

Co-Authored-By: francis <work@francisyzy.com>"
```

---

### Task 2: Update `config.ts` with new env vars

**Files:**
- Modify: `src/config.ts`

- [ ] **Step 1: Add `OWNER_TELEGRAM_ID` and `OWNER_USERNAME` to config**

Read `src/config.ts`, then edit:

```ts
const config = {
  API_TOKEN: process.env.API_TOKEN,
  WATERMARK: process.env.CHANNEL || "watermark",
  CHANNEL: process.env.CHANNEL,
  OWNER_TELEGRAM_ID: process.env.OWNER_TELEGRAM_ID,
  OWNER_USERNAME: process.env.OWNER_USERNAME,
};
```

- [ ] **Step 2: Commit**

```bash
git add src/config.ts
git commit -m "feat: add OWNER_TELEGRAM_ID and OWNER_USERNAME to config

Co-Authored-By: francis <work@francisyzy.com>"
```

---

### Task 3: Create `src/down_detector.ts`

**Files:**
- Create: `src/down_detector.ts`

- [ ] **Step 1: Write the down detector module**

```ts
import fs from "fs";
import bot from "./lib/bot";
import config from "./config";

const STATE_FILE = "./.down_detector_state.json";

interface DownState {
  isDown: boolean;
  firstFailureAt: number | null;  // Date.now() timestamp
  ownerPingedAt: number | null;    // Date.now() timestamp of the 5-hour ping
}

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

function loadState(): DownState {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf-8"));
  } catch {
    return { isDown: false, firstFailureAt: null, ownerPingedAt: null };
  }
}

function saveState(state: DownState): void {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function ownerId(): string {
  if (!config.OWNER_TELEGRAM_ID) {
    throw new Error("OWNER_TELEGRAM_ID is not set");
  }
  return config.OWNER_TELEGRAM_ID;
}

export function onLtaDown(): void {
  const state = loadState();

  if (!state.isDown) {
    // Entering down state for the first time
    state.isDown = true;
    state.firstFailureAt = Date.now();
    state.ownerPingedAt = null;
    saveState(state);

    bot.telegram
      .sendMessage(ownerId(), "⚠️ LTA traffic camera service is down")
      .catch((err) => console.error("Failed to send down alert:", err));
  } else {
    // Already down — check if 5 hours have passed without a ping
    if (
      state.firstFailureAt !== null &&
      state.ownerPingedAt === null &&
      Date.now() - state.firstFailureAt >= FIVE_HOURS_MS
    ) {
      state.ownerPingedAt = Date.now();
      saveState(state);

      const username = config.OWNER_USERNAME || "@francisyzy";
      bot.telegram
        .sendMessage(ownerId(), `⚠️ ${username} LTA still down after 5 hours`)
        .catch((err) => console.error("Failed to send 5-hour ping:", err));
    }
  }
}

export function onLtaRecovered(): void {
  const state = loadState();

  if (state.isDown) {
    state.isDown = false;
    state.firstFailureAt = null;
    state.ownerPingedAt = null;
    saveState(state);

    bot.telegram
      .sendMessage(ownerId(), "✅ LTA traffic camera service has recovered")
      .catch((err) => console.error("Failed to send recovery alert:", err));
  }
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/user/sg-custom-bot/sg-custom-bot && npx tsc --noEmit src/down_detector.ts
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/down_detector.ts
git commit -m "feat: add LTA down detector with stateful alerting

PMs owner on first failure, pings after 5 hours of continued outage,
and sends recovery notification when service recovers.

Co-Authored-By: francis <work@francisyzy.com>"
```

---

### Task 4: Update `src/fetch_images.ts` to throw `LtaServiceError`

**Files:**
- Modify: `src/fetch_images.ts`

- [ ] **Step 1: Update imports and add error throws**

Read `src/fetch_images.ts`. Add import at top:

```ts
import { LtaServiceError } from "./errors";
```

In `pullImagesFromUrl`, replace the existing `catch (error)` block (at the bottom of the try block) and update the logic:

After `const response = await axios.get(url);` add a zero-images check:

```ts
if (imageUrls.length === 0) {
  throw new LtaServiceError("LTA returned 0 images — service may be down");
}
```

In the `catch (error)` block, throw `LtaServiceError` instead of just rejecting:

```ts
} catch (error) {
  console.error("Error pulling images:", error);
  throw new LtaServiceError(
    error instanceof Error ? error.message : "Unknown error pulling images"
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/user/sg-custom-bot/sg-custom-bot && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/fetch_images.ts
git commit -m "feat: throw LtaServiceError on fetch failure or zero images

Downstream caller uses this to trigger down detector alerting.

Co-Authored-By: francis <work@francisyzy.com>"
```

---

### Task 5: Wire down detector into `src/index.ts`

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Add import**

Add to the existing imports at the top of `src/index.ts`:

```ts
import { onLtaDown, onLtaRecovered } from "./down_detector";
```

- [ ] **Step 2: Add error handler to the 10-minute cron**

Read the existing cron callback. Find the `timestampsPromise.then(...)` block and wrap it with `.catch()`:

Replace the end of the `then` block's closing `});` with:

```ts
  }).catch((err) => {
    console.error("Image fetch failed:", err);
    onLtaDown();
  });
```

Also inside the `then` block (at the start of the success path), add:

```ts
onLtaRecovered();
```

So the structure becomes:

```ts
const timestampsPromise = pullImagesFromUrl(websiteUrl, outputDirectory);

timestampsPromise
  .then(async (timestamps) => {
    onLtaRecovered();
    // ... existing logic ...
  })
  .catch((err) => {
    console.error("Image fetch failed:", err);
    onLtaDown();
  });
```

- [ ] **Step 3: Type-check and build**

```bash
cd /home/user/sg-custom-bot/sg-custom-bot && npm run build
```

Expected: completes with no errors.

- [ ] **Step 4: Update `.gitignore`**

Add to `.gitignore`:

```
.down_detector_state.json
```

- [ ] **Step 5: Commit**

```bash
git add src/index.ts .gitignore
git commit -m "feat: wire down detector into 10-minute cron cycle

Calls onLtaRecovered() on successful fetch, onLtaDown() on failure.

Co-Authored-By: francis <work@francisyzy.com>"
```

---

### Task 6: Update `.env.example`

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Append new env vars**

Add to the end of `.env.example`:

```
## Down Detector
# Generate from @userinfobot — your numeric Telegram user ID
OWNER_TELEGRAM_ID=123456789

# Your Telegram username (for the 5-hour ping — include the @)
OWNER_USERNAME=@francisyzy
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "docs: add OWNER_TELEGRAM_ID and OWNER_USERNAME to .env.example

Co-Authored-By: francis <work@francisyzy.com>"
```
