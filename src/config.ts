import * as dotenv from "dotenv";

dotenv.config();

const config = {
  API_TOKEN: process.env.API_TOKEN,
  WATERMARK: process.env.CHANNEL || "watermark",
  CHANNEL: process.env.CHANNEL
};

export default config;
