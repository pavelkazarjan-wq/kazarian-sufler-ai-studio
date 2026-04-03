// Google Calendar OAuth Callback - Exchange code for tokens

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.URL
  ? `${process.env.URL}/.netlify/functions/google-calendar-callback`
  : 'https://kazarian-webinar-ai-studio.netlify.app/.netlify/functions/google-calendar-callback';

exports.handler = async (event, context) => {
  const code = event.queryStringParameters?.code;
  const userId = event.queryStringParameters?.state || 'default';
  const error = event.queryStringParameters?.error;

  // Handle error from Google
  if (error) {
    return {
      statusCode: 302,
      headers: {
        Location: `/profile.html?gcal_error=${encodeURIComponent(error)}`
      }
    };
  }

  if (!code) {
    return {
      statusCode: 302,
      headers: {
        Location: '/profile.html?gcal_error=no_code'
      }
    };
  }

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    return {
      statusCode: 302,
      headers: {
        Location: '/profile.html?gcal_error=not_configured'
      }
    };
  }

  try {
    // Exchange code for tokens
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        code: code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code'
      })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error('Token exchange failed:', errorText);
      return {
        statusCode: 302,
        headers: {
          Location: '/profile.html?gcal_error=token_failed'
        }
      };
    }

    const tokens = await tokenResponse.json();

    // Get user's calendar info
    const calendarResponse = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList/primary', {
      headers: {
        'Authorization': `Bearer ${tokens.access_token}`
      }
    });

    let calendarEmail = '';
    if (calendarResponse.ok) {
      const calendarData = await calendarResponse.json();
      calendarEmail = calendarData.summary || calendarData.id || '';
    }

    // Redirect back to profile with tokens in URL (will be stored in localStorage)
    // Note: In production, tokens should be stored securely server-side
    const tokenData = {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in,
      email: calendarEmail,
      connected_at: Date.now()
    };

    const encodedTokens = encodeURIComponent(Buffer.from(JSON.stringify(tokenData)).toString('base64'));

    return {
      statusCode: 302,
      headers: {
        Location: `/profile.html?gcal_tokens=${encodedTokens}`
      }
    };

  } catch (error) {
    console.error('Google Calendar callback error:', error);
    return {
      statusCode: 302,
      headers: {
        Location: `/profile.html?gcal_error=${encodeURIComponent(error.message)}`
      }
    };
  }
};
