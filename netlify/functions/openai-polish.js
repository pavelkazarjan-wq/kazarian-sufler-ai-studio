// OpenAI API function for polishing/editing scripts

const ALLOWED_ORIGINS = [
  'https://expertpage.pro',
  'https://kazarian-webinar-ai-studio.netlify.app',
  'http://localhost:3000'
];

exports.handler = async (event, context) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    if (!OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY not configured');
    }

    // Parse the request body
    const body = JSON.parse(event.body);
    const { text, instruction, model = 'gpt-4o', maxTokens = 4000, temperature = 0.7 } = body;

    if (!text) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing required parameter: text' })
      };
    }

    // System prompt for polishing
    const systemPrompt = `Ты профессиональный редактор и копирайтер. Твоя задача - улучшить текст, сохранив его смысл и стиль.

Правила:
- Исправь грамматические и орфографические ошибки
- Улучши читаемость и ясность
- Сохрани авторский стиль и тон
- Не добавляй лишнюю информацию
- Верни только улучшенный текст, без комментариев`;

    // Build user prompt
    let userPrompt = `Улучши следующий текст:\n\n${text}`;
    if (instruction) {
      userPrompt = `${instruction}\n\nТекст:\n${text}`;
    }

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: maxTokens,
        temperature: temperature
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    // Extract the text from the response
    const polishedText = result.choices?.[0]?.message?.content || '';

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ text: polishedText })
    };

  } catch (error) {
    console.error('OpenAI polish error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};
