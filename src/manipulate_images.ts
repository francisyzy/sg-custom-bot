import {
  Jimp,
  JimpInstance,
  HorizontalAlign,
  VerticalAlign,
  cssColorToHex,
  loadFont,
  measureText,
} from "jimp";
import { SANS_64_BLACK } from "jimp/fonts";

export async function mergeImages(
  imagePaths: string[],
  outputPath: string,
): Promise<JimpInstance | null> {
  try {
    const images = await Promise.all(
      imagePaths.map((path) => Jimp.read(path)),
    );

    const mergedWidth = images[0].width * 2; // Adjust the width as needed
    const mergedHeight = images[0].height * 2; // Adjust the height as needed

    const mergedImage = new Jimp({
      width: mergedWidth,
      height: mergedHeight,
    });

    mergedImage.blit({ src: images[0], x: 0, y: 0 }); // Top-left image
    mergedImage.blit({ src: images[1], x: images[0].width, y: 0 }); // Top-right image
    mergedImage.blit({ src: images[2], x: 0, y: images[0].height }); // Bottom-left image
    mergedImage.blit({
      src: images[3],
      x: images[0].width,
      y: images[0].height,
    }); // Bottom-right image

    // jimp 1.x picks the encoder from the extension and types the path as
    // `${string}.${ext}`, hence the cast
    await mergedImage.write(outputPath as `${string}.${string}`);

    console.log("Images merged successfully!");
    return mergedImage;
  } catch (error) {
    console.error("Error merging images:", error);
    return null;
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
    const font = await loadFont(SANS_64_BLACK); // Adjust the font and size as needed
    const timestampTextWidth = measureText(font, timestamp);
    const watermarkTextWidth = measureText(font, watermarkText);
    const URLTextWidth = measureText(font, URL);
    const baseY =
      imagePath.includes("3") || imagePath.includes("0")
        ? image.height - 245
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
          cssColorToHex(backgroundColor),
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
          cssColorToHex(backgroundColor),
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
          cssColorToHex(backgroundColor),
          URL_X + x,
          URL_Y + y,
        );
      }
    }

    // Add the text watermark to the image
    image.print({
      font,
      x: watermarkX,
      y: watermarkY,
      text: {
        text: watermarkText,
        alignmentX: HorizontalAlign.LEFT,
        alignmentY: VerticalAlign.MIDDLE,
      },
    });
    image.print({
      font,
      x: timestampX,
      y: timestampY,
      text: {
        text: timestamp,
        alignmentX: HorizontalAlign.LEFT,
        alignmentY: VerticalAlign.MIDDLE,
      },
    });
    image.print({
      font,
      x: URL_X,
      y: URL_Y,
      text: {
        text: URL,
        alignmentX: HorizontalAlign.LEFT,
        alignmentY: VerticalAlign.MIDDLE,
      },
    });

    // Save the resulting image
    await image.write(imagePath as `${string}.${string}`);

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
