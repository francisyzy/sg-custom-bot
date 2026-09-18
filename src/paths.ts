import path from "path";

// Under pm2 (or any launcher started from another directory) process.cwd()
// is not the repo, so cwd-relative paths like "./archive" would land in
// $HOME. Anchor every runtime path to the project root instead. This file
// lives one level below the root in both src/ (ts-node) and dist/ (tsc).
export const PROJECT_ROOT = path.resolve(__dirname, "..");

export const ENV_FILE = path.join(PROJECT_ROOT, ".env");
export const IMAGES_DIR = path.join(PROJECT_ROOT, "images");
export const ARCHIVE_DIR = path.join(PROJECT_ROOT, "archive");
export const GIFS_DIR = path.join(PROJECT_ROOT, "gifs");
export const GIF_PIN_STATE_FILE = path.join(PROJECT_ROOT, ".gif_pin_state.json");
export const DOWN_DETECTOR_STATE_FILE = path.join(PROJECT_ROOT, ".down_detector_state.json");
