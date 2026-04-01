const fetch = require('node-fetch');

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
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    if (!GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY not configured');
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

FACE MATCHING CHECKLIST:
- Same eye color, shape, and position as second image
- Same nose shape and size as second image
- Same mouth and lips as second image
- Same face contour and jawline as second image
- Same skin tone and texture as second image
- Same hair color, style, and hairline as second image
- Same facial hair (if any) as second image

OUTPUT REQUIREMENTS:
- 9:16 vertical portrait format
- Photorealistic quality matching template style
- Two distinct people: psychologist LEFT (unchanged), client RIGHT (face from second image)
- All text overlays preserved`;

    // Prepare image data
    const templateImageData = templateImage.replace(/^data:image\/\w+;base64,/, '');
    const clientImageData = clientImage.replace(/^data:image\/\w+;base64,/, '');

    // Image generation models
    const models = [
      'gemini-2.0-flash-exp-image-generation',
      'gemini-3.1-flash-image-preview'
    ];

    let lastError = null;

    for (const modelName of models) {
      try {
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${GEMINI_API_KEY}`;

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
            temperature: 0.9,
            topK: 32,
            topP: 1,
            maxOutputTokens: 4096
          }
        };

        console.log(`Trying model: ${modelName}`);

        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(requestBody)
        });

        const result = await response.json();

        if (!response.ok) {
          console.log(`Model ${modelName} failed:`, result.error?.message);
          lastError = result.error?.message || 'Unknown error';
          continue;
        }

        // Check for image in response
        if (result.candidates && result.candidates[0]?.content?.parts) {
          for (const part of result.candidates[0].content.parts) {
            if (part.inlineData) {
              return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                  success: true,
                  image: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
                  model: modelName
                })
              };
            }
          }

          // No image but got text response
          const textResponse = result.candidates[0].content.parts
            .filter(p => p.text)
            .map(p => p.text)
            .join('\n');

          return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
              success: false,
              error: 'Model returned text instead of image',
              text: textResponse,
              model: modelName
            })
          };
        }

      } catch (err) {
        console.log(`Model ${modelName} error:`, err.message);
        lastError = err.message;
        continue;
      }
    }

    throw new Error(`All models failed. Last error: ${lastError}`);

  } catch (error) {
    console.error('Gemini photo error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};
