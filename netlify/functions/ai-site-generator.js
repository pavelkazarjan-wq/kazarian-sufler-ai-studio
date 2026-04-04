// AI Site Generator - Generate site content from user prompt
// Uses Gemini API to create multilingual content for specialist pages

const { GoogleGenerativeAI } = require("@google/generative-ai");

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

const SYSTEM_PROMPT = `Ти - експертний копірайтер для створення персональних сайтів спеціалістів (психологи, коучі, лікарі, маркетологи тощо).

ТВОЯ ЗАДАЧА:
Створити контент для сайту-візитки на основі короткого опису від користувача.
Генеруй контент на 3 мовах: українська (UK), російська (RU), англійська (EN).

ФОРМАТ ВІДПОВІДІ - ТІЛЬКИ JSON:
{
  "headline_uk": "Заголовок українською (1-2 речення, хто ти і для кого)",
  "headline_ru": "Заголовок російською",
  "headline_en": "Headline in English",

  "bio_uk": "Біографія українською (3-4 абзаци, 300-500 символів)",
  "bio_ru": "Біография російською",
  "bio_en": "Biography in English",

  "specializations_uk": "спеціалізація1, спеціалізація2, спеціалізація3",
  "specializations_ru": "специализация1, специализация2, специализация3",
  "specializations_en": "specialization1, specialization2, specialization3",

  "education_uk": "Освіта та сертифікати",
  "education_ru": "Образование и сертификаты",
  "education_en": "Education and certifications"
}

ПРАВИЛА КОПІРАЙТИНГУ:
1. Заголовок: [Хто я] для [Аудиторія], які [Проблема/бажання]
2. НЕ використовуй слова: унікальний, кращий, професійний, ефективний, якісний
3. Конкретика замість загальних фраз
4. Біографія від першої особи ("Я допомагаю...", "Мій підхід...")
5. Показуй результати для клієнта, а не процес
6. Спеціалізації: 3-6 конкретних напрямків
7. Тон: теплий, професійний, людяний

ПРИКЛАД ХОРОШОГО ЗАГОЛОВКУ:
"Психолог для тих, хто втомився від тривоги та хоче повернути спокій"
"Коуч для підприємців, які застрягли між "добре" і "відмінно""

НЕ ДОДАВАЙ нічого крім JSON. Відповідь має парситися як JSON.`;

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { prompt, userName } = JSON.parse(event.body);

    if (!prompt || prompt.length < 50) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Prompt too short (min 50 characters)' })
      };
    }

    if (prompt.length > 1000) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Prompt too long (max 1000 characters)' })
      };
    }

    if (!GEMINI_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'AI service not configured' })
      };
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const userMessage = userName
      ? `Ім'я спеціаліста: ${userName}\n\nОпис від користувача:\n${prompt}`
      : `Опис від користувача:\n${prompt}`;

    const result = await model.generateContent([
      { text: SYSTEM_PROMPT },
      { text: userMessage }
    ]);

    const responseText = result.response.text();

    // Parse JSON from response
    let jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Invalid AI response format');
    }

    const generatedContent = JSON.parse(jsonMatch[0]);

    // Validate required fields
    const requiredFields = ['headline_uk', 'headline_ru', 'headline_en', 'bio_uk', 'bio_ru', 'bio_en'];
    for (const field of requiredFields) {
      if (!generatedContent[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(generatedContent)
    };

  } catch (error) {
    console.error('AI Site Generator error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Generation failed', details: error.message })
    };
  }
};
