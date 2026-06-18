function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

function textResponse(text, status = 200) {
  return new Response(text, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });
}

function getEnv(name) {
  if (globalThis.Netlify?.env?.get) {
    return Netlify.env.get(name);
  }
  return process.env[name];
}

function getSystemInstruction() {
  return `
Ты — приветливый и профессиональный администратор студии маникюра "beautyrecord".
Твоя задача — консультировать клиентов по услугам, ценам и свободной записи.
Если клиент хочет записаться, вежливо напомни ему, что он может воспользоваться формой записи Mini App, нажав кнопку записи.
Отвечай кратко, доброжелательно, по-русски, используй умеренно emoji: 💅, ✨, 🌸.
Не выдумывай точные цены, если их нет в сообщении клиента. Предлагай уточнить стоимость у мастера или выбрать услугу в приложении.
`;
}

function getServiceName(service) {
  const names = {
    manicure: 'маникюр',
    pedicure: 'педикюр',
    combo: 'маникюр + педикюр',
  };
  return names[service] || service || 'услугу';
}

function minutesToTime(minutes) {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}

function formatBookingMessage(webAppData) {
  try {
    const booking = JSON.parse(webAppData);
    const serviceName = getServiceName(booking.service);
    const startTime = minutesToTime(Number(booking.start));
    const endTime = minutesToTime(Number(booking.start) + Number(booking.duration));

    return `Спасибо! Запись принята 💅\n\nУслуга: ${serviceName}\nДата: ${booking.date}\nВремя: ${startTime}–${endTime}\n\nЕсли захотите изменить запись, напишите сюда ✨`;
  } catch (error) {
    console.error('Booking parse error:', error);
    return 'Спасибо! Данные записи получены 💅 Если нужно что-то уточнить, напишите сюда.';
  }
}

async function sendTelegramMessage(token, chatId, text, webAppUrl) {
  const payload = {
    chat_id: chatId,
    text,
  };

  if (webAppUrl) {
    payload.reply_markup = {
      inline_keyboard: [
        [
          {
            text: 'Записаться онлайн 💅',
            web_app: { url: webAppUrl },
          },
        ],
      ],
    };
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const result = await response.json().catch(() => null);

  if (!response.ok) {
    console.error('Telegram sendMessage error:', result || response.statusText);
    throw new Error('Telegram sendMessage failed');
  }

  return result;
}

async function generateAiReply(apiKey, userText) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: getSystemInstruction() }],
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
    },
  );

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    console.error('Gemini API error:', data || response.statusText);
    throw new Error('Gemini API request failed');
  }

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || '')
    .join('')
    .trim();

  return text || 'Конечно, подскажу 🌸 Для записи удобнее открыть форму ниже и выбрать услугу, дату и время.';
}

function getStartMessage() {
  return 'Здравствуйте! Я AI-администратор студии beautyrecord 🌸\n\nМогу подсказать по услугам и помочь с записью. Чтобы выбрать дату и свободное время, нажмите кнопку ниже 💅';
}

async function handleTelegramUpdate(update) {
  const telegramToken = getEnv('TELEGRAM_BOT_TOKEN');
  const geminiApiKey = getEnv('GEMINI_API_KEY');
  const webAppUrl = getEnv('WEB_APP_URL') || 'https://beautyrecord.netlify.app/';

  if (!telegramToken) {
    console.error('Missing TELEGRAM_BOT_TOKEN');
    return;
  }

  const message = update.message || update.edited_message;
  const chatId = message?.chat?.id;

  if (!chatId) {
    return;
  }

  if (message.web_app_data?.data) {
    await sendTelegramMessage(telegramToken, chatId, formatBookingMessage(message.web_app_data.data), webAppUrl);
    return;
  }

  const text = message.text?.trim();

  if (!text) {
    await sendTelegramMessage(telegramToken, chatId, 'Я пока умею отвечать на текстовые сообщения ✨', webAppUrl);
    return;
  }

  if (text.startsWith('/start')) {
    await sendTelegramMessage(telegramToken, chatId, getStartMessage(), webAppUrl);
    return;
  }

  if (text.startsWith('/')) {
    await sendTelegramMessage(telegramToken, chatId, 'Напишите вопрос обычным сообщением, и я помогу 🌸', webAppUrl);
    return;
  }

  if (!geminiApiKey) {
    console.error('Missing GEMINI_API_KEY');
    await sendTelegramMessage(
      telegramToken,
      chatId,
      'Сейчас AI-ассистент не настроен, но вы можете записаться через форму ниже 💅',
      webAppUrl,
    );
    return;
  }

  try {
    const aiReply = await generateAiReply(geminiApiKey, text);
    await sendTelegramMessage(telegramToken, chatId, aiReply, webAppUrl);
  } catch (error) {
    console.error('AI reply error:', error);
    await sendTelegramMessage(
      telegramToken,
      chatId,
      'Извините, возникла небольшая ошибка. Попробуйте написать чуть позже ✨',
      webAppUrl,
    );
  }
}

export default async (request) => {
  if (request.method === 'GET') {
    return jsonResponse({
      ok: true,
      message: 'Ready for Telegram Webhooks',
      hasTelegramToken: Boolean(getEnv('TELEGRAM_BOT_TOKEN')),
      hasGeminiApiKey: Boolean(getEnv('GEMINI_API_KEY')),
      webAppUrl: getEnv('WEB_APP_URL') || 'https://beautyrecord.netlify.app/',
      nodeVersion: process.version,
    });
  }

  if (request.method !== 'POST') {
    return textResponse('Method Not Allowed', 405);
  }

  try {
    const update = await request.json();
    await handleTelegramUpdate(update);
    return textResponse('OK');
  } catch (error) {
    console.error('Webhook handler error:', error);
    return textResponse('Internal Server Error', 500);
  }
};

export const config = {
  path: '/api/bot',
};
