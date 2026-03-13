exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
    // Check API token
    const API_TOKEN = process.env.CONSULTATION_API_TOKEN;
    const authHeader = event.headers.authorization || event.headers.Authorization;

    if (!API_TOKEN) {
      throw new Error('CONSULTATION_API_TOKEN not configured');
    }

    if (!authHeader || authHeader !== `Bearer ${API_TOKEN}`) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Unauthorized' })
      };
    }

    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const {
      clientName = 'Клиент',
      validDays = 30,  // Default 30 days
      scheduledTime = null,  // ISO string or timestamp for scheduled session
      clientPhone = '',
      clientEmail = '',
      notes = ''
    } = body;

    // Generate unique session ID
    const sessionId = 'cons-' + Date.now().toString(36) + Math.random().toString(36).substr(2, 8);

    // Calculate expiration date
    const expiresAt = Date.now() + (validDays * 24 * 60 * 60 * 1000);

    // Parse scheduled time if provided
    let startsAt = null;
    if (scheduledTime) {
      startsAt = typeof scheduledTime === 'string'
        ? new Date(scheduledTime).getTime()
        : scheduledTime;
    }

    // Encode consultation data into URL-safe token
    const consultationData = {
      s: sessionId,           // session
      n: clientName,          // name
      e: expiresAt,           // expires
      c: Date.now(),          // created
      t: startsAt             // scheduled time (null if not set)
    };

    // Simple encoding (base64)
    const token = Buffer.from(JSON.stringify(consultationData)).toString('base64url');

    // Build consultation URL
    const baseUrl = process.env.URL || 'https://kazarian-webinar-ai-studio.netlify.app';
    const consultationLink = `${baseUrl}/pip.html?mode=client&token=${token}`;

    // Return the generated link
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        link: consultationLink,
        sessionId: sessionId,
        clientName: clientName,
        expiresAt: new Date(expiresAt).toISOString(),
        validDays: validDays,
        scheduledTime: startsAt ? new Date(startsAt).toISOString() : null
      })
    };

  } catch (error) {
    console.error('Generate link error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};
