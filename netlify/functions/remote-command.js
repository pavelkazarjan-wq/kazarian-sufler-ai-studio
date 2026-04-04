// Broadcast sync endpoint - returns empty commands array
// This endpoint is polled by the React app for remote commands

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  // Return empty commands array
  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      commands: [],
      timestamp: Date.now()
    })
  };
};
