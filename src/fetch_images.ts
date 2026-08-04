import axios from "axios";
import cheerio from "cheerio";
import fs from "fs";
import { parse, format } from "date-fns";
import { LtaServiceError } from "./errors";

// Cameras to publish, by their 1-based position on the LTA page:
//   1. View from Woodlands Causeway (Towards Johor)
//   2. View from Woodlands Checkpoint (Towards BKE)
//   5. View from Second Link at Tuas
//   6. View from Tuas Checkpoint
// The page also carries Woodlands Flyover (3), After Tuas West Road (4) and
// two Sentosa Gateway cameras (7, 8), which we skip.
const SELECTED_CAMERAS = [1, 2, 5, 6];

export async function pullImagesFromUrl(
  url: string,
  outputPath: string,
): Promise<string[] | undefined> {
  return new Promise<string[]>(async (resolve, reject) => {
    try {
      const response = await axios.get(url);
      const html = response.data;
      const $ = cheerio.load(html);

      // Find all <img> tags and extract the "src" attribute
      const allImageUrls: string[] = [];
      $("img").each((_, element) => {
        const imageUrl = $(element).attr("src");
        if (imageUrl) {
          if (imageUrl.includes("trafficsmart")) {
            allImageUrls.push(imageUrl);
          }
        }
      });

      if (allImageUrls.length === 0) {
        throw new LtaServiceError("LTA returned 0 images — service may be down");
      }

      const allTimestamps: string[] = [];

      const leftSpans = $(".timestamp .left");

      leftSpans.each((index, element) => {
        allTimestamps.push($(element).text());
      });

      // Keep only the cameras we publish. Timestamps are filtered with the
      // same indices so they stay paired with their image.
      const missing = SELECTED_CAMERAS.filter(
        (position) => position > allImageUrls.length,
      );
      if (missing.length > 0) {
        throw new LtaServiceError(
          `LTA returned ${allImageUrls.length} images, expected at least ` +
            `${Math.max(...SELECTED_CAMERAS)} (missing camera positions: ${missing.join(", ")})`,
        );
      }

      const imageUrls = SELECTED_CAMERAS.map(
        (position) => allImageUrls[position - 1],
      );
      const timestamps = SELECTED_CAMERAS.map(
        (position) => allTimestamps[position - 1],
      );

      // Download each image
      const downloadPromises = imageUrls.map((imageUrl, index) => {
        const imageFilename = `${outputPath}/image${index}.jpg`; // You can modify the filename pattern as per your needs
        return axios({
          method: "GET",
          url: imageUrl,
          responseType: "stream",
        }).then((response) => {
          response.data.pipe(fs.createWriteStream(imageFilename));
          return new Promise<void>((resolve) => {
            response.data.on("end", () => {
              console.log(
                `Image ${index + 1} downloaded successfully!`,
              );
              resolve();
            });
          });
        });
      });

      // Wait for all image downloads to complete
      await Promise.all(downloadPromises);

      resolve(timestamps);

      console.log("All images downloaded successfully!");
    } catch (error) {
      console.error("Error pulling images:", error);
      throw new LtaServiceError(
        error instanceof Error ? error.message : "Unknown error pulling images"
      );
    }
  });
}
export async function clearImages(directoryPath: string) {
  fs.readdir(directoryPath, (err, files) => {
    if (err) {
      console.error("Error reading directory:", err);
      return;
    }

    // Filter the files to include only the ones with the .jpg extension
    const jpgFiles = files.filter((file) => file.endsWith(".jpg"));

    // Delete each .jpg file
    jpgFiles.forEach((file) => {
      const filePath = `${directoryPath}/${file}`;
      fs.unlink(filePath, (error) => {
        if (error) {
          console.error(`Error deleting file: ${filePath}`, error);
        } else {
          console.log(`File deleted: ${filePath}`);
        }
      });
    });
  });
}

