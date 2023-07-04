import { Message } from "typegram";
import { Telegraf } from "telegraf";

import config from "./config";

import { toEscapeHTMLMsg } from "./utils/messageHandler";
import { printBotInfo } from "./utils/consolePrintUsername";

import bot from "./lib/bot";
import helper from "./commands/helper";
import echo from "./commands/echo";
import catchAll from "./commands/catch-all";
import { clearImages, pullImagesFromUrl } from "./fetch_images";
import { addTextWatermarkWithBackgroundToImage } from "./manipulate_images";

// bot.use((ctx, next) => {
//   if (
//     ctx.message &&
//     config.LOG_GROUP_ID &&
//     ctx.message.from.username != config.OWNER_USERNAME
//   ) {
//     let userInfo = `name: <a href="tg://user?id=${
//       ctx.message.from.id
//     }">${toEscapeHTMLMsg(ctx.message.from.first_name)}</a>`;
//     if (ctx.message.from.username) {
//       userInfo += ` (@${ctx.message.from.username})`;
//     }
//     const text = `\ntext: ${
//       (ctx.message as Message.TextMessage).text
//     }`;
//     const logMessage = userInfo + toEscapeHTMLMsg(text);
//     bot.telegram.sendMessage(config.LOG_GROUP_ID, logMessage, {
//       parse_mode: "HTML",
//     });
//   }
//   return next();
// });
// bot.use(Telegraf.log());
// bot.launch();
// printBotInfo(bot);

const websiteUrl =
  "https://onemotoring.lta.gov.sg/content/onemotoring/home/driving/traffic_information/traffic-cameras/woodlands.html"; // Replace with the target website URL
const outputDirectory = "./images"; // Replace with the desired output directory path

clearImages(outputDirectory);

const timestampsPromise = pullImagesFromUrl(
  websiteUrl,
  outputDirectory,
);

timestampsPromise.then((timestamps) => {
  addTextWatermarkWithBackgroundToImage(
    outputDirectory,
    config.WATERMARK,
    outputDirectory,
  );
});

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
