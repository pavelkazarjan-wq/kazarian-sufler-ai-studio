// AI Buddy - Smart assistant for site editing
// Uses Gemini API to help fill and review site content

const { GoogleGenerativeAI } = require("@google/generative-ai");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `Ти - AI Бадді, помічник для заповнення сайтів-візиток психологів та курсів. Спілкуєшся як друг-підліток: легко, дружньо, з жартами.

ТВОЇ МОЖЛИВОСТІ:
1. Заповнювати тексти для сайту на 3 мовах (UK, RU, EN)
2. Оцінювати написане і давати поради щодо покращення
3. Перекладати тексти на інші мови
4. Генерувати заголовки, описи, результати

СТИЛЬ СПІЛКУВАННЯ:
- Кажи "йо", "круто", "топ", "окей", "кайф"
- Без офіціозу, як друг
- Короткі речення
- Можеш ставити емодзі (але рідко)

ВАЖЛИВО:
- Перед будь-якими змінами ЗАВЖДИ питай дозвіл
- Показуй що саме хочеш змінити
- Давай вибір: прийняти/відхилити/змінити

ФОРМАТ ВІДПОВІДІ - ЗАВЖДИ JSON:

1. Коли генеруєш/заповнюєш тексти:
{
  "action": "fill",
  "message": "Йо! Ось що накидав для твого сайту:",
  "fields": [
    {"id": "site-headline-uk", "lang": "uk", "value": "текст українською"},
    {"id": "site-headline-ru", "lang": "ru", "value": "текст російською"},
    {"id": "site-headline-en", "lang": "en", "value": "text in English"}
  ]
}

2. Коли оцінюєш тексти:
{
  "action": "review",
  "score": 8,
  "feedback": "Текст топ, але можна додати...",
  "suggestions": ["порада 1", "порада 2"]
}

3. Коли просто відповідаєш на питання:
{
  "action": "chat",
  "message": "твоя відповідь тут"
}

ПОЛЯ САЙТУ-ВІЗИТКИ СПЕЦІАЛІСТА:
- site-headline-{uk|ru|en}: Заголовок (хто ти і що пропонуєш)
- site-bio-{uk|ru|en}: Про себе (2-4 абзаци)
- site-specializations-{uk|ru|en}: Спеціалізації (через кому)
- site-education-{uk|ru|en}: Освіта

ПОЛЯ КУРСУ:
- course-title-{uk|ru|en}: Назва курсу
- course-subtitle-{uk|ru|en}: Підзаголовок
- course-description-{uk|ru|en}: Опис курсу
- benefit-{1-4}-title-uk: Назва переваги
- benefit-{1-4}-text-uk: Опис переваги
- avatar-{1-4}-title-uk: Для кого (заголовок)
- avatar-{1-4}-text-uk: Для кого (опис)
- result-{1-8}-uk: Результати курсу

ПРАВИЛА КОПІРАЙТИНГУ:
1. Заголовок: [ЩО ЭТО] для [АУДИТОРІЯ], які [СИТУАЦІЯ]
2. Не використовуй: унікальний, кращий, професійний, ефективний
3. Конкретика замість води
4. Результати в майбутньому часі: "Перестанете...", "Навчитесь..."
5. Переваги через порівняння: "X замість Y"`;

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { message, context: siteContext, history } = JSON.parse(event.body);

    if (!message) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Message is required' }) };
    }

    if (!GEMINI_API_KEY) {
      // Fallback response if no API key
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          action: 'chat',
          message: 'Йо! Зараз я в режимі демо. Попроси адміна підключити Gemini API, і я зможу реально допомагати!'
        })
      };
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Build conversation history
    let conversationHistory = SYSTEM_PROMPT + '\n\n';

    // Add site context
    if (siteContext) {
      conversationHistory += `КОНТЕКСТ САЙТУ:\n`;
      conversationHistory += `Тип: ${siteContext.siteType === 'course' ? 'Курс' : 'Візитка спеціаліста'}\n`;
      if (siteContext.headline_uk) conversationHistory += `Заголовок (UK): ${siteContext.headline_uk}\n`;
      if (siteContext.bio_uk) conversationHistory += `Про себе (UK): ${siteContext.bio_uk.substring(0, 200)}...\n`;
      if (siteContext.specializations) conversationHistory += `Спеціалізації: ${siteContext.specializations}\n`;
      if (siteContext.experience) conversationHistory += `Досвід: ${siteContext.experience} років\n`;
      if (siteContext.course_title_uk) conversationHistory += `Назва курсу: ${siteContext.course_title_uk}\n`;
      conversationHistory += '\n';
    }

    // Add history
    if (history && history.length > 0) {
      conversationHistory += 'ІСТОРІЯ ДІАЛОГУ:\n';
      history.forEach(msg => {
        conversationHistory += `${msg.type === 'user' ? 'Користувач' : 'Бадді'}: ${msg.text || msg.message}\n`;
      });
      conversationHistory += '\n';
    }

    conversationHistory += `ЗАПИТ КОРИСТУВАЧА: ${message}\n\n`;
    conversationHistory += 'Відповідай ТІЛЬКИ валідним JSON. Без пояснень до або після JSON.';

    const result = await model.generateContent(conversationHistory);
    const responseText = result.response.text();

    // Try to parse JSON from response
    let jsonResponse;
    try {
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonResponse = JSON.parse(jsonMatch[0]);
      } else {
        jsonResponse = { action: 'chat', message: responseText };
      }
    } catch (parseError) {
      jsonResponse = { action: 'chat', message: responseText };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(jsonResponse)
    };

  } catch (error) {
    console.error('AI Buddy error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        action: 'chat',
        message: 'Ой, щось пішло не так. Спробуй ще раз через хвилину!'
      })
    };
  }
};
