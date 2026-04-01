const crypto = require('crypto');

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
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
    const AUTH_PASSWORD = process.env.AUTH_PASSWORD;
    if (!AUTH_PASSWORD) {
      throw new Error('AUTH_PASSWORD not configured');
    }

    // Parse the request body
    const body = JSON.parse(event.body);
    const { password } = body;

    if (!password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing password parameter' })
      };
    }

    // Check password
    if (password === AUTH_PASSWORD) {
      // Generate session token (simple hash of timestamp + secret)
      const token = crypto
        .createHash('sha256')
        .update(`${Date.now()}_${AUTH_PASSWORD}_${Math.random()}`)
        .digest('hex');

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          token: token,
          message: 'Authentication successful'
        })
      };
    } else {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({
          success: false,
          message: 'Invalid password'
        })
      };
    }

  } catch (error) {
    console.error('Authentication error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message
      })
    };
  }
};
