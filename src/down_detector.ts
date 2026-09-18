import fs from "fs";
import bot from "./lib/bot";
import config from "./config";
import { DOWN_DETECTOR_STATE_FILE as STATE_FILE } from "./paths";

const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;

interface DownState {
  isDown: boolean;
  firstFailureAt: number | null;
  ownerPingedAt: number | null;
}

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
  const id = config.OWNER_TELEGRAM_ID;
  if (!id) throw new Error("OWNER_TELEGRAM_ID is not set");
  return id;
}

export function onLtaDown(): void {
  const state = loadState();

  if (!state.isDown) {
    state.isDown = true;
    state.firstFailureAt = Date.now();
    state.ownerPingedAt = null;
    saveState(state);

      bot.telegram
        .sendMessage(ownerId(), "⚠️ LTA traffic camera service is down")
        .catch((err) => console.error(`[${new Date().toISOString()}] Failed to send down alert:`, err));
  } else {
    const downLongEnough =
      state.firstFailureAt !== null &&
      Date.now() - state.firstFailureAt >= FIVE_HOURS_MS;
    const notYetPinged = state.ownerPingedAt === null;

    if (downLongEnough && notYetPinged) {
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
