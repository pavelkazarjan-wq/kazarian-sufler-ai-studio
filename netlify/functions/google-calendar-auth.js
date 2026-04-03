// Google Calendar OAuth - Initiate auth flow

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.URL
  ? `${process.env.URL}/.netlify/functions/google-calendar-callback`
  : 'https://kazarian-webinar-ai-studio.netlify.app/.netlify/functions/google-calendar-callback';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly'
].join(' ');

exports.handler = async (event, context) => {
  const origin = event.headers.origin || event.headers.Origin || 'https://kazarian-webinar-ai-studio.netlify.app';

  const headers = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!GOOGLE_CLIENT_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: 'Google Calendar not configured',
        message: 'GOOGLE_CLIENT_ID is not set in environment variables'
      })
    };
  }

  // Get user_id from query params (to link tokens to user)
  const userId = event.queryStringParameters?.user_id || 'default';

  // Build Google OAuth URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('state', userId);

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ authUrl: authUrl.toString() })
  };
};
