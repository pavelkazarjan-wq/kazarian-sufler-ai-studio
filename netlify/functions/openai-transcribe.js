// Using native fetch and Blob (Node 18+)

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

    // Parse the request body (base64 encoded audio)
    const body = JSON.parse(event.body);
    const { audioBase64, language = 'ru' } = body;

    if (!audioBase64) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing audioBase64 parameter' })
      };
    }

    // Convert base64 to buffer
    const audioBuffer = Buffer.from(audioBase64, 'base64');

    console.log('Audio size:', (audioBuffer.length / 1024 / 1024).toFixed(2), 'MB');

    // Rate limit: Max 25MB (OpenAI limit)
    const MAX_SIZE_MB = 25;
    if (audioBuffer.length > MAX_SIZE_MB * 1024 * 1024) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ error: `Audio file too large. Max ${MAX_SIZE_MB}MB allowed.` })
      };
    }

    // Create form data using native FormData and Blob (Node 18+)
    const formData = new FormData();
    // Use Blob with filename in append (works in Node 18+)
    const audioBlob = new Blob([audioBuffer], { type: 'audio/webm' });
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    formData.append('language', language);
    // Add prompt to provide context and prevent hallucinations on silent/quiet audio
    formData.append('prompt', 'Это запись психологической консультации. Психолог и клиент обсуждают эмоции, чувства, отношения, терапию.');

    // Call OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: formData
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        text: result.text
      })
    };

  } catch (error) {
    console.error('Transcription error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};
