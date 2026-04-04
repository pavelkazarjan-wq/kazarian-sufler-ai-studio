// AI Buddy - Smart assistant for site editing
// Uses OpenAI GPT to help fill and review site content

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

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

    if (!OPENAI_API_KEY) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          action: 'chat',
          message: 'Йо! Зараз я в режимі демо. Попроси адміна підключити OpenAI API, і я зможу реально допомагати!'
        })
      };
    }

    // Build messages for OpenAI
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT }
    ];

    // Add site context
    if (siteContext) {
      let contextText = `КОНТЕКСТ САЙТУ:\n`;
      contextText += `Тип: ${siteContext.siteType === 'course' ? 'Курс' : 'Візитка спеціаліста'}\n`;
      if (siteContext.headline_uk) contextText += `Заголовок (UK): ${siteContext.headline_uk}\n`;
      if (siteContext.bio_uk) contextText += `Про себе (UK): ${siteContext.bio_uk.substring(0, 200)}...\n`;
      if (siteContext.specializations) contextText += `Спеціалізації: ${siteContext.specializations}\n`;
      if (siteContext.experience) contextText += `Досвід: ${siteContext.experience} років\n`;
      if (siteContext.course_title_uk) contextText += `Назва курсу: ${siteContext.course_title_uk}\n`;
      messages.push({ role: 'system', content: contextText });
    }

    // Add history
    if (history && history.length > 0) {
      history.forEach(msg => {
        messages.push({
          role: msg.type === 'user' ? 'user' : 'assistant',
          content: msg.text || msg.message
        });
      });
    }

    // Add current message
    messages.push({ role: 'user', content: message + '\n\nВідповідай ТІЛЬКИ валідним JSON.' });

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: messages,
        temperature: 0.7,
        max_tokens: 2000
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content;

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
