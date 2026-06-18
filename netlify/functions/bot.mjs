import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';

const SYSTEM_INSTRUCTION = `
Ты — приветливый и профессиональный администратор студии маникюра "beautyrecord".
Твоя задача — консультировать клиентов по услугам и ценам.
Если клиент хочет записаться, вежливо напомни ему, что он может воспользоваться формой записи (Mini App), нажав на кнопку "Открыть запись 💅".
Отвечай кратко, доброжелательно, используй emoji (💅, ✨, 🌸).
`;

let cachedBot = null;

function getEnv(name) {
  if (globalThis.Netlify?.env?.get) {
    return globalThis.Netlify.env.get(name) || '';
  }

  return process.env[name] || '';
}

function getWebAppUrl(requestUrl) {
  const envUrl = getEnv('WEB_APP_URL');

  if (envUrl) {
    return envUrl;
  }

  return new URL(requestUrl).origin;
}

function getMiniAppKeyboard(webAppUrl) {
  return {
    reply_markup: {
      inline_keyboard: [
        [
          {
            text: 'Открыть запись 💅',
            web_app: { url: webAppUrl },
          },
        ],
      ],
    },
  };
}

function createBot(requestUrl) {
  if (cachedBot) {
    return cachedBot;
  }

  const telegramToken = getEnv('TELEGRAM_BOT_TOKEN');

  if (!telegramToken) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN environment variable');
  }

  const bot = new Telegraf(telegramToken);

  bot.catch((error, ctx) => {
    console.error('Telegraf middleware error:', {
      error: error?.message || String(error),
      updateId: ctx?.update?.update_id,
    });
  });

  bot.start(async (ctx) => {
    const webAppUrl = getWebAppUrl(requestUrl);

    await ctx.reply(
      'Здравствуйте! Я администратор beautyrecord 🌸\n\nМогу подсказать по услугам, ценам и записи. Для самостоятельной записи откройте форму ниже 💅',
      getMiniAppKeyboard(webAppUrl),
    );
  });

  bot.command('health', async (ctx) => {
    await ctx.reply('Бот работает. Вебхук и обработчик сообщений активны ✨');
  });

  bot.on(message('web_app_data'), async (ctx) => {
    await ctx.reply('Спасибо! Я получила вашу запись через форму 💅\nАдминистратор при необходимости свяжется с вами для подтверждения ✨');
  });

  bot.on(message('text'), async (ctx) => {
    const text = ctx.message?.text?.trim() || '';

    if (!text || text.startsWith('/')) {
      return;
    }

    const webAppUrl = getWebAppUrl(requestUrl);

    try {
      await ctx.telegram.sendChatAction(ctx.chat.id, 'typing');
    } catch (error) {
      console.error('Telegram typing action error:', error?.message || String(error));
    }

    try {
      const answer = await askGemini(text);
      await ctx.reply(answer, getMiniAppKeyboard(webAppUrl));
    } catch (error) {
      console.error('Gemini request error:', error?.message || String(error));

      await ctx.reply(
        'Извините, возникла небольшая ошибка. Попробуйте написать чуть позже! ✨\n\nА записаться можно через форму ниже 💅',
        getMiniAppKeyboard(webAppUrl),
      );
    }
  });

  cachedBot = bot;
  return cachedBot;
}

async function askGemini(userText) {
  const geminiApiKey = getEnv('GEMINI_API_KEY');
  const geminiModel = getEnv('GEMINI_MODEL') || 'gemini-2.0-flash';

  if (!geminiApiKey) {
    throw new Error('Missing GEMINI_API_KEY environment variable');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(geminiModel)}:generateContent?key=${encodeURIComponent(geminiApiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{ text: SYSTEM_INSTRUCTION }],
          },
          contents: [
            {
              role: 'user',
              parts: [{ text: userText }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 350,
          },
        }),
        signal: controller.signal,
      },
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API HTTP ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    const answer = data?.candidates?.[0]?.content?.parts
      ?.map((part) => part.text || '')
      .join('')
      .trim();

    if (!answer) {
      throw new Error('Gemini API returned empty answer');
    }

    return answer;
  } finally {
    clearTimeout(timeout);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

export default async (request) => {
  const requestUrl = request.url;

  if (request.method === 'GET') {
    return json({
      ok: true,
      message: 'Ready for Telegram Webhooks',
      endpoint: `${new URL(requestUrl).origin}/api/bot`,
      defaultNetlifyEndpoint: `${new URL(requestUrl).origin}/.netlify/functions/bot`,
      hasTelegramToken: Boolean(getEnv('TELEGRAM_BOT_TOKEN')),
      hasGeminiApiKey: Boolean(getEnv('GEMINI_API_KEY')),
      webAppUrl: getWebAppUrl(requestUrl),
      nodeVersion: process.version,
    });
  }

  if (request.method !== 'POST') {
    return json({ ok: false, error: 'Method Not Allowed' }, 405);
  }

  try {
    const payload = await request.json();
    const bot = createBot(requestUrl);

    await bot.handleUpdate(payload);

    return new Response('OK', { status: 200 });
  } catch (error) {
    console.error('Webhook handler error:', error?.message || String(error));

    // Telegram should receive 200 to avoid endless webhook retries.
    // Details are written to Netlify Function logs.
    return new Response('OK', { status: 200 });
  }
};
