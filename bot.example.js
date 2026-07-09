/**
 * Пример Telegram-бота для запуска Mini App.
 *
 * 1. Создайте бота через @BotFather
 * 2. Получите токен и задайте WEB_APP_URL (HTTPS обязателен для TMA)
 * 3. npm install node-telegram-bot-api
 * 4. BOT_TOKEN=xxx WEB_APP_URL=https://your-domain.com node bot.example.js
 */

import TelegramBot from 'node-telegram-bot-api';

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEB_APP_URL;

if (!token || !webAppUrl) {
  console.error('Задайте BOT_TOKEN и WEB_APP_URL');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '🃏 Добро пожаловать в Дурак Онлайн!', {
    reply_markup: {
      inline_keyboard: [[
        { text: '🎮 Играть', web_app: { url: webAppUrl } },
      ]],
    },
  });
});

console.log('Bot started');