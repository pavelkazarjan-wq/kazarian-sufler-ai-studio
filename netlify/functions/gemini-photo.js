const { GoogleGenerativeAI } = require('@google/generative-ai');

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
    const { hostImage, clientImage, hostName, clientName } = body;

    if (!hostImage || !clientImage) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing hostImage or clientImage' })
      };
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

    // Use Gemini with image generation capability
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp-image-generation' });

    const prompt = `Create a warm, professional photo of these two people together in a friendly embrace or standing side by side smiling.
The setting should be a cozy psychologist's office or a neutral professional background.
Make it look natural, like they just finished a great consultation session.
Format: vertical 9:16 portrait orientation.
Style: warm colors, professional but friendly atmosphere.
The first person is ${hostName || 'the psychologist'}, the second is ${clientName || 'the client'}.
Keep their faces accurate and recognizable.

IMPORTANT: Add text overlay at the bottom of the image in a stylish banner:
"Я только что был на консультации у Павла Казарьяна, и я в восторге!"
Make the text readable, white color on a semi-transparent dark background.`;

    // Convert base64 images to parts
    const hostImagePart = {
      inlineData: {
        data: hostImage.replace(/^data:image\/\w+;base64,/, ''),
        mimeType: 'image/jpeg'
      }
    };

    const clientImagePart = {
      inlineData: {
        data: clientImage.replace(/^data:image\/\w+;base64,/, ''),
        mimeType: 'image/jpeg'
      }
    };

    const result = await model.generateContent([prompt, hostImagePart, clientImagePart]);
    const response = await result.response;

    // Check if response contains generated image
    const candidates = response.candidates;
    if (candidates && candidates[0] && candidates[0].content && candidates[0].content.parts) {
      for (const part of candidates[0].content.parts) {
        if (part.inlineData) {
          // Found generated image
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
    }

    // If no image in response, return text response
    const text = response.text();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: false,
        error: 'No image generated',
        text: text
      })
    };

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
