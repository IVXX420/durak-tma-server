import TelegramBot from 'node-telegram-bot-api';

const token = process.env.BOT_TOKEN;
const webAppUrl = process.env.WEB_APP_URL || 'https://durak-tma-client.vercel.app';

export function startBot() {
  if (!token) {
    console.log('BOT_TOKEN not set, Telegram bot disabled');
    return null;
  }

  const bot = new TelegramBot(token, { polling: true });

  bot.onText(/\/start/, (msg) => {
    const chatId = msg.chat.id;
    const name = msg.from?.first_name || 'Игрок';

    bot.sendMessage(chatId, `🃏 Привет, ${name}!\n\nДобро пожаловать в **Дурак Онлайн** — подкидной, 2 игрока.`, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [[
          { text: '🎮 Играть', web_app: { url: webAppUrl } },
        ]],
      },
    });
  });

  bot.onText(/\/help/, (msg) => {
    bot.sendMessage(msg.chat.id, '🃏 *Дурак Онлайн*\n\n/start — начать игру\n\nСоздай комнату и отправь код другу, или войди по коду.', {
      parse_mode: 'Markdown',
    });
  });

  bot.setMyCommands([
    { command: 'start', description: 'Начать игру' },
    { command: 'help', description: 'Помощь' },
  ]).catch(() => {});

  console.log('🤖 Telegram bot started');
  return bot;
}