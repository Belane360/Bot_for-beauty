const { Telegraf } = require('telegraf');
const { GoogleGenAI } = require('@google/genai');

const bot = new Telegraf(process.env.8869464220:AAHFUNcTE-rptGPq-Myy7ZdTdwW4BmhGsYk);
const ai = new GoogleGenAI({ apiKey: process.env.AQ.Ab8RN6K6Fk9UR41b7qDpiYXv-V3XCsyuicuF63dngRKAN9nuGg });

const SYSTEM_INSTRUCTION = `
Ты — приветливый и профессиональный администратор студии маникюра "beautyrecord". 
Твоя задача — консультировать клиентов по услугам и ценам.
Если клиент хочет записаться, вежливо напомни ему, что он может воспользоваться формой записи (Mini App), нажав на кнопку внизу экрана.
Отвечай кратко, доброжелательно, используй emoji (💅, ✨, 🌸).
`;

bot.on('text', async (ctx) => {
  if (ctx.message.text.startsWith('/')) return;

  try {
    // Используем модель gemini-2.5-flash через правильный вызов SDK
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: ctx.message.text,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        temperature: 0.7,
      }
    });

    await ctx.reply(response.text);
  } catch (error) {
    console.error('Gemini Error:', error);
    await ctx.reply('Извините, возникла небольшая ошибка. Попробуйте написать чуть позже! ✨');
  }
});

// Обработчик вебхука Netlify
exports.handler = async (event) => {
  try {
    if (event.httpMethod === 'POST' && event.body) {
      const payload = JSON.parse(event.body);
      await bot.handleUpdate(payload);
      return { statusCode: 200, body: 'OK' };
    }
    return { statusCode: 200, body: 'Ready for Telegram Webhooks' };
  } catch (err) {
    console.error('Handler Error:', err);
    return { statusCode: 500, body: err.toString() };
  }
};