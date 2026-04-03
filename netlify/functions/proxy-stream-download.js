// Proxy stream server download - hides API key from client
const https = require('https');
const http = require('http');

// Stream server config - API key is now server-side only
const STREAM_SERVER_URL = process.env.STREAM_SERVER_URL || 'http://89.167.8.169:3001';
const STREAM_SERVER_API_KEY = process.env.STREAM_SERVER_API_KEY || 'kzrn_stream_2025_xK9mP4vL7nQ2wR5tY8uI1oA3sD6fG0hJ';

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://kazarian-webinar-ai-studio.netlify.app',
  'http://localhost:3000'
];

exports.handler = async (event, context) => {
  // CORS headers
  const origin = event.headers.origin || event.headers.Origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Get download path from query
  const downloadPath = event.queryStringParameters?.path;
  if (!downloadPath) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing download path' })
    };
  }

  // Validate path to prevent directory traversal
  if (downloadPath.includes('..') || !downloadPath.startsWith('/recordings/')) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Invalid path' })
    };
  }

  try {
    // Construct full URL with API key
    const fullUrl = `${STREAM_SERVER_URL}${downloadPath}?key=${STREAM_SERVER_API_KEY}`;
    console.log('Proxying download:', downloadPath);

    // Fetch from stream server
    const response = await new Promise((resolve, reject) => {
      const protocol = fullUrl.startsWith('https') ? https : http;

      const req = protocol.get(fullUrl, { timeout: 30000 }, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks)
          });
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
    });

    if (response.statusCode !== 200) {
      return {
        statusCode: response.statusCode,
        headers,
        body: JSON.stringify({ error: 'Download failed' })
      };
    }

    // Return the file with proper headers
    const filename = downloadPath.split('/').pop();
    return {
      statusCode: 200,
      headers: {
        ...headers,
        'Content-Type': response.headers['content-type'] || 'video/webm',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': response.body.length.toString()
      },
      body: response.body.toString('base64'),
      isBase64Encoded: true
    };

  } catch (err) {
    console.error('Proxy error:', err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Proxy error: ' + err.message })
    };
  }
};
