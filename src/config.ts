import * as dotenv from "dotenv";
import { ENV_FILE } from "./paths";

dotenv.config({ path: ENV_FILE });

const config = {
  API_TOKEN: process.env.API_TOKEN,
  WATERMARK: process.env.CHANNEL || "watermark",
  CHANNEL: process.env.CHANNEL,
  OWNER_TELEGRAM_ID: process.env.OWNER_TELEGRAM_ID,
  OWNER_USERNAME: process.env.OWNER_USERNAME
};

export default config;
