import Jimp from "jimp";
import path from "path";
import fs from "fs";

export async function mergeImages(
  imagePaths: string[],
  outputPath: string,
): Promise<void> {
  try {
    const images = await Promise.all(
      imagePaths.map((path) => Jimp.read(path)),
    );

    const mergedWidth = images[0].getWidth() * 2; // Adjust the width as needed
    const mergedHeight = images[0].getHeight() * 2; // Adjust the height as needed

    const mergedImage = new Jimp(mergedWidth, mergedHeight);

    mergedImage.blit(images[0], 0, 0); // Top-left image
    mergedImage.blit(images[1], images[0].getWidth(), 0); // Top-right image
    mergedImage.blit(images[2], 0, images[0].getHeight()); // Bottom-left image
    mergedImage.blit(
      images[3],
      images[0].getWidth(),
      images[0].getHeight(),
    ); // Bottom-right image

    await mergedImage.writeAsync(outputPath);

    console.log("Images merged successfully!");
  } catch (error) {
    console.error("Error merging images:", error);
  }
}

export async function addTextWatermarkWithBackgroundToImage(
  directoryPath: string,
  watermarkText: string,
  outputPath: string,
): Promise<void> {
  try {
    const files = await fs.promises.readdir(directoryPath);
    for (const file of files) {
      const imagePath = path.join(directoryPath, file);

      const image = await Jimp.read(imagePath);

      // Set the text and background properties
      const watermarkFont = await Jimp.loadFont(
        Jimp.FONT_SANS_32_BLACK,
      ); // Adjust the font and size as needed
      const watermarkTextWidth = Jimp.measureText(
        watermarkFont,
        watermarkText,
      );
      const watermarkX = 0; // Adjust the X position as needed
      const watermarkY = 40; // Adjust the Y position as needed
      const watermarkBackgroundHeight = 40; // Adjust the background height as needed
      const watermarkBackgroundColor = "white"; // Adjust the background color as needed

      // Create the background rectangle
      const watermarkBackgroundWidth = watermarkTextWidth + 10; // Adjust the padding as needed
      for (let x = 0; x < watermarkBackgroundWidth; x++) {
        for (let y = 0; y < watermarkBackgroundHeight; y++) {
          image.setPixelColor(
            Jimp.cssColorToHex(watermarkBackgroundColor),
            watermarkX + x,
            watermarkY + y,
          );
        }
      }

      // Add the text watermark to the image
      image.print(watermarkFont, watermarkX, watermarkY, {
        text: watermarkText,
        alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
        alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
      });

      // Save the resulting image
      await image.writeAsync(outputPath);

      console.log(
        "Text watermark with background added successfully!",
      );
    }
  } catch (error) {
    console.error(
      "Error adding text watermark with background:",
      error,
    );
  }
}

// // Usage example
// const imagePath = "./images/image0.jpg"; // Replace with the path to your image file
// const watermarkText = "Watermark Text"; // Replace with the desired watermark text

// addTextWatermarkWithBackgroundToImage(
//   imagePath,
//   watermarkText,
//   outputPath,
// );

// // Usage example
// const imagePaths = [
//   "./images/image0.jpg", // Replace with the path to your fourth image
//   "./images/image1.jpg", // Replace with the path to your first image
//   "./images/image2.jpg", // Replace with the path to your second image
//   "./images/image3.jpg", // Replace with the path to your third image
// ];
// const outputPath = "merged_image.jpg"; // Replace with the desired output path and filename

// mergeImages(imagePaths, outputPath);
