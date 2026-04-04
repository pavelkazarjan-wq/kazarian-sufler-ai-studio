const fetch = require('node-fetch');

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

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'GEMINI_API_KEY not configured' })
      };
    }

    const body = JSON.parse(event.body);
    const { templateImage, clientImage, clientName } = body;

    if (!templateImage || !clientImage) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing templateImage or clientImage' })
      };
    }

    const prompt = `FACE TRANSFER TASK - Add the person from the SECOND image to the empty chair in the FIRST image.

CRITICAL FACE IDENTITY REQUIREMENT:
- The SECOND image contains the CLIENT's face - THIS IS THE ONLY FACE TO USE FOR THE PERSON ON THE RIGHT
- You MUST preserve the EXACT facial features from the second image: eyes, nose, mouth, face shape, skin tone, hair
- Do NOT generate a new face - COPY the face from the second image pixel-perfectly
- The person on the right chair MUST be recognizable as the same person from the second input image

TEMPLATE (FIRST IMAGE):
- Shows a psychologist (bearded man) on the LEFT side - DO NOT CHANGE HIM AT ALL
- Has an EMPTY leather armchair on the RIGHT side
- Has text overlay at the top - PRESERVE ALL TEXT exactly as shown

WHAT TO DO:
1. Keep everything on the LEFT side unchanged (psychologist, lamp, bookshelf)
2. Place the CLIENT from second image sitting in the RIGHT armchair
3. The client's FACE must be IDENTICAL to the second input image
4. Generate appropriate body/clothing that matches the scene lighting
5. Keep all existing text overlay intact

OUTPUT: Generate a photorealistic image in 9:16 vertical portrait format.`;

    // Prepare image data
    const templateImageData = templateImage.replace(/^data:image\/\w+;base64,/, '');
    const clientImageData = clientImage.replace(/^data:image\/\w+;base64,/, '');

    // Use Gemini 2.0 Flash with image generation capability
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`;

    const requestBody = {
      contents: [{
        parts: [
          { text: prompt },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: templateImageData
            }
          },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: clientImageData
            }
          }
        ]
      }],
      generationConfig: {
        temperature: 1,
        topK: 32,
        topP: 1,
        maxOutputTokens: 8192,
        responseModalities: ["TEXT", "IMAGE"]
      }
    };

    console.log('Calling Gemini 2.0 Flash with image generation...');

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    const result = await response.json();

    if (!response.ok) {
      console.error('Gemini API error:', result);
      return {
        statusCode: response.status,
        headers,
        body: JSON.stringify({
          error: result.error?.message || `API error: ${response.status}`,
          details: result.error
        })
      };
    }

    // Check for image in response
    if (result.candidates && result.candidates[0]?.content?.parts) {
      for (const part of result.candidates[0].content.parts) {
        if (part.inlineData) {
          console.log('Image generated successfully');
          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: true,
              image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`
            })
          };
        }
      }

      // No image but got text response - model can't generate images
      const textResponse = result.candidates[0].content.parts
        .filter(p => p.text)
        .map(p => p.text)
        .join('\n');

      console.log('Model returned text instead of image:', textResponse.substring(0, 200));

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: false,
          error: 'Генерація зображень тимчасово недоступна. Модель повернула текст замість зображення.',
          text: textResponse
        })
      };
    }

    // No candidates at all
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'Модель не повернула результат. Спробуйте ще раз.'
      })
    };

  } catch (error) {
    console.error('Gemini photo error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message || 'Внутрішня помилка сервера'
      })
    };
  }
};
