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

const websiteUrl =
  "https://onemotoring.lta.gov.sg/content/onemotoring/home/driving/traffic_information/traffic-cameras/woodlands.html"; // Replace with the target website URL
const outputDirectory = "./images"; // Replace with the desired output directory path
const combinedImagePath = outputDirectory + "/combined.jpg";

// Check if the directory exists
if (!fs.existsSync(outputDirectory)) {
  // Create the directory
  fs.mkdirSync(outputDirectory);
  console.log(`Directory "${outputDirectory}" created successfully.`);
} else {
  console.log(`Directory "${outputDirectory}" already exists.`);
}

// https://crontab.guru/#*/10_*_*_*_*
schedule("*/10 * * * *", () => {
  clearImages(outputDirectory);

  const timestampsPromise = pullImagesFromUrl(
    websiteUrl,
    outputDirectory,
  );

  timestampsPromise.then(async (timestamps) => {
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
    await mergeImages(imagePaths, combinedImagePath);
    fs.promises.readFile(combinedImagePath).then((image) => {
      if (config.CHANNEL === undefined) {
        throw new Error("CHANNEL must be provided!");
      }
      bot.telegram.sendPhoto(config.CHANNEL, { source: image }).then(()=>{
        console.log("message sent!");
      });
    });
  });
});

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
