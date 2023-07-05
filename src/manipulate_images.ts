import Jimp from "jimp";

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
  imagePath: string,
  watermarkText: string,
  timestamp: string,
): Promise<void> {
  try {
    timestamp = " " + timestamp + " ";
    watermarkText = " " + watermarkText + " ";
    const URL = " t.me/" + watermarkText.replace(" @", "");
    const image = await Jimp.read(imagePath);

    // Set the text and background properties
    const font = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK); // Adjust the font and size as needed
    const timestampTextWidth = Jimp.measureText(font, timestamp);
    const watermarkTextWidth = Jimp.measureText(font, watermarkText);
    const URLTextWidth = Jimp.measureText(font, URL);
    const baseY =
      imagePath.includes("3") || imagePath.includes("0")
        ? image.getHeight() - 245
        : 0;
    const backgroundColor = "white"; // Adjust the background color as needed
    const timestampX = 0; // Adjust the X position as needed
    const timestampY = baseY + 35; // Adjust the Y position as needed
    const timestampBackgroundHeight = 70; // Adjust the background height as needed
    const URL_X = 0; // Adjust the X position as needed
    const URL_Y = baseY + 175; // Adjust the Y position as needed
    const URLBackgroundHeight = 75; // Adjust the background height as needed
    const watermarkX = 0; // Adjust the X position as needed
    const watermarkY = baseY + 105; // Adjust the Y position as needed
    const watermarkBackgroundHeight = 70; // Adjust the background height as needed

    // Create the background rectangle
    const timestampBackgroundWidth = timestampTextWidth; // Adjust the padding as needed
    for (let x = 0; x < timestampBackgroundWidth; x++) {
      for (let y = 0; y < timestampBackgroundHeight; y++) {
        image.setPixelColor(
          Jimp.cssColorToHex(backgroundColor),
          timestampX + x,
          timestampY + y,
        );
      }
    }

    // Create the background rectangle
    const watermarkBackgroundWidth = watermarkTextWidth; // Adjust the padding as needed
    for (let x = 0; x < watermarkBackgroundWidth; x++) {
      for (let y = 0; y < watermarkBackgroundHeight; y++) {
        image.setPixelColor(
          Jimp.cssColorToHex(backgroundColor),
          watermarkX + x,
          watermarkY + y,
        );
      }
    }

    // Create the background rectangle
    const URLBackgroundWidth = URLTextWidth; // Adjust the padding as needed
    for (let x = 0; x < URLBackgroundWidth; x++) {
      for (let y = 0; y < URLBackgroundHeight; y++) {
        image.setPixelColor(
          Jimp.cssColorToHex(backgroundColor),
          URL_X + x,
          URL_Y + y,
        );
      }
    }

    // Add the text watermark to the image
    image.print(font, watermarkX, watermarkY, {
      text: watermarkText,
      alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
      alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
    });
    image.print(font, timestampX, timestampY, {
      text: timestamp,
      alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
      alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
    });
    image.print(font, URL_X, URL_Y, {
      text: URL,
      alignmentX: Jimp.HORIZONTAL_ALIGN_LEFT,
      alignmentY: Jimp.VERTICAL_ALIGN_MIDDLE,
    });

    // Save the resulting image
    await image.writeAsync(imagePath);

    console.log("Text watermark with background added successfully!");
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
