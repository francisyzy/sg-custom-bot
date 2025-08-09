import axios from "axios";
import cheerio from "cheerio";
import fs from "fs";
import { parse, format } from "date-fns";

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
      const imageUrls: string[] = [];
      $("img").each((_, element) => {
        const imageUrl = $(element).attr("src");
        if (imageUrl) {
          if (imageUrl.includes("trafficsmart")) {
            imageUrls.push("https:" + imageUrl);
          }
        }
      });

      const timestamps: string[] = [];

      const leftSpans = $(".timestamp .left");

      leftSpans.each((index, element) => {
        timestamps.push($(element).text());
      });

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
      reject();
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

