import { Message } from "typegram";
import { Telegraf } from "telegraf";

import config from "./config";

import { toEscapeHTMLMsg } from "./utils/messageHandler";
import { printBotInfo } from "./utils/consolePrintUsername";

import bot from "./lib/bot";
import helper from "./commands/helper";
import echo from "./commands/echo";
import catchAll from "./commands/catch-all";

//Production Settings
if (process.env.NODE_ENV === "production") {
  //Production Logging
  bot.use((ctx, next) => {
    if (ctx.message &&
      config.LOG_GROUP_ID &&
      ctx.message.from.username != config.OWNER_USERNAME
    ) {
      let userInfo = `name: <a href="tg://user?id=${ctx.message.from.id
        }">${toEscapeHTMLMsg(ctx.message.from.first_name)}</a>`;
      if (ctx.message.from.username) {
        userInfo += ` (@${ctx.message.from.username
          })`;
      }
      const text = `\ntext: ${(ctx.message as Message.TextMessage).text
        }`;
      const logMessage = userInfo + toEscapeHTMLMsg(text);
      bot.telegram.sendMessage(config.LOG_GROUP_ID, logMessage, {
        parse_mode: "HTML",
      });
    }
    return next();
  });
  bot.launch({
    webhook: {
      domain: config.URL,
      port: Number(config.PORT),
    },
  });
} else {
  //Development logging
  bot.use(Telegraf.log());
  bot.launch();
  printBotInfo(bot);
}

helper();
echo();

//Catch all unknown messages/commands
catchAll();

// Enable graceful stop
process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
