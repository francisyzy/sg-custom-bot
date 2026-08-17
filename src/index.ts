import fs from "fs";

import config from "./config";

import bot from "./lib/bot";
import { clearImages, pullImagesFromUrl } from "./fetch_images";
import {
  addTextWatermarkWithBackgroundToImage,
  mergeImages,
} from "./manipulate_images";
import path from "path";
import { schedule } from "node-cron";
import { format } from "date-fns";
import { createDirectoryIfNotExists } from "./utils";
import { generateDailyGif } from "./generate_gif";
import { onLtaDown, onLtaRecovered } from "./down_detector";
import { LtaServiceError } from "./errors";

const websiteUrl =
  "https://onemotoring.lta.gov.sg/content/onemotoring/home/driving/traffic_information/traffic-cameras.html";
const outputDirectory = "./images"; // Replace with the desired output directory path
const combinedImagePath = outputDirectory + "/combined.jpg";
const gifDirectory = "./gifs"; // Replace with the desired output directory path

if(process.env.NODE_ENV === "production"){
  console.log("Startup Prod");
}

// Check if the outputDirectory exists
createDirectoryIfNotExists(outputDirectory);
// Check if the gifDirectory exists
createDirectoryIfNotExists(gifDirectory);

// https://crontab.guru/#*/10_*_*_*_*
schedule("*/10 * * * *", () => {
  clearImages(outputDirectory);

  const timestampsPromise = pullImagesFromUrl(
    websiteUrl,
    outputDirectory,
  );

  timestampsPromise
    .then(async (timestamps) => {
      // Recovery bookkeeping is best-effort: a misconfigured owner ID must not
      // stop us from posting the images we just fetched.
      try {
        onLtaRecovered();
      } catch (err) {
        console.error("Failed to record LTA recovery:", err);
      }
      const files = await fs.promises.readdir(outputDirectory);
      let imagePaths: string[] = [];
      for (const file of files) {
        imagePaths.push(path.join(outputDirectory, file));
      }
      for (let index = 0; index < imagePaths.length; index++) {
        const imagePath = imagePaths[index];
        let timestamp = "";
        if (timestamps) {
          timestamp = timestamps[index];
        }
        await addTextWatermarkWithBackgroundToImage(
          imagePath,
          config.WATERMARK,
          timestamp,
        );
      }
      const mergedImage = await mergeImages(imagePaths, combinedImagePath);
      const image = await fs.promises.readFile(combinedImagePath);
      if (process.env.NODE_ENV === "production") {
        if (config.CHANNEL === undefined) {
          throw new Error("CHANNEL must be provided!");
        }
        await bot.telegram.sendPhoto(config.CHANNEL, { source: image });
        console.log("message sent!");
      } else {
        console.log("Not production, not sending message");
      }

      // Archive the combined grid for the daily GIF. One frame per cycle,
      // named by timestamp so generate_gif's lexical sort replays the day in
      // chronological order. Archiving the individual camera images instead
      // would collide, since they are always image0..3.jpg.
      //
      // Stored as PNG, not JPG: Jimp 0.22's JPG encoder writes files whose
      // byte-stuffed entropy segments are not valid, so any subsequent
      // Jimp.read of them returns all-black pixels and the daily GIF ends
      // up all-black. PNG roundtrip is unaffected and costs ~200KB/day.
      const now = new Date();
      const archiveDir = path.join("./archive", format(now, "yyyy-MM-dd"));
      createDirectoryIfNotExists(archiveDir);
      const frameName = `${format(now, "HH-mm-ss")}.png`;
      if (mergedImage !== null) {
        await mergedImage.writeAsync(path.join(archiveDir, frameName));
      }
    })
    .catch((err) => {
      // Only an LtaServiceError means LTA itself is unreachable. Anything else
      // (watermarking, merging, Telegram, archiving) is our own failure and
      // must not trigger a false "LTA is down" alert to the owner.
      if (err instanceof LtaServiceError) {
        console.error("Image fetch failed:", err);
        try {
          onLtaDown();
        } catch (alertErr) {
          console.error("Failed to record LTA downtime:", alertErr);
        }
      } else {
        console.error("Camera cycle failed:", err);
      }
    });
});

// Midnight cron: generate daily GIF
schedule("0 0 * * *", () => {
  generateDailyGif();
});

// A stray rejection anywhere would otherwise terminate the process (Node >=15),
// silently taking the bot offline until it is manually restarted. Log and stay up.
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled promise rejection:", reason);
});

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
