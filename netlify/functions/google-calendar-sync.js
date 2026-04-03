// Google Calendar Sync - Create/Update/Delete events

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

const ALLOWED_ORIGINS = [
  'https://kazarian-webinar-ai-studio.netlify.app',
  'http://localhost:3000'
];

async function refreshAccessToken(refreshToken) {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    })
  });

  if (!response.ok) {
    throw new Error('Failed to refresh token');
  }

  return response.json();
}

exports.handler = async (event, context) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { action, session, accessToken, refreshToken, eventId } = body;

    if (!accessToken) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'No access token provided' })
      };
    }

    let currentAccessToken = accessToken;

    // Helper function to make authenticated requests
    async function makeRequest(url, options = {}) {
      let response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${currentAccessToken}`,
          'Content-Type': 'application/json',
          ...options.headers
        }
      });

      // If token expired, try to refresh
      if (response.status === 401 && refreshToken) {
        const newTokens = await refreshAccessToken(refreshToken);
        currentAccessToken = newTokens.access_token;

        response = await fetch(url, {
          ...options,
          headers: {
            'Authorization': `Bearer ${currentAccessToken}`,
            'Content-Type': 'application/json',
            ...options.headers
          }
        });
      }

      return response;
    }

    const sessionTypeNames = {
      primary: 'Первичная консультация',
      followup: 'Повторная сессия',
      group: 'Групповая терапия',
      supervision: 'Супервизия',
      training: 'Обучение/тренинг'
    };

    if (action === 'create' && session) {
      // Create event in Google Calendar
      const startDateTime = new Date(`${session.date}T${session.time}:00`);
      const endDateTime = new Date(startDateTime.getTime() + (session.duration || 60) * 60000);

      const event = {
        summary: `${session.client || 'Клиент'} - ${sessionTypeNames[session.type] || 'Сессия'}`,
        description: session.notes || '',
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: 'Europe/Kiev'
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: 'Europe/Kiev'
        },
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 30 },
            { method: 'email', minutes: 60 }
          ]
        }
      };

      const response = await makeRequest(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          body: JSON.stringify(event)
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create event: ${errorText}`);
      }

      const createdEvent = await response.json();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          eventId: createdEvent.id,
          newAccessToken: currentAccessToken !== accessToken ? currentAccessToken : null
        })
      };

    } else if (action === 'delete' && eventId) {
      // Delete event from Google Calendar
      const response = await makeRequest(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`,
        { method: 'DELETE' }
      );

      if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        throw new Error(`Failed to delete event: ${errorText}`);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          newAccessToken: currentAccessToken !== accessToken ? currentAccessToken : null
        })
      };

    } else if (action === 'list') {
      // List upcoming events
      const now = new Date().toISOString();
      const response = await makeRequest(
        `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&maxResults=50&singleEvents=true&orderBy=startTime`
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to list events: ${errorText}`);
      }

      const data = await response.json();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          events: data.items || [],
          newAccessToken: currentAccessToken !== accessToken ? currentAccessToken : null
        })
      };

    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid action' })
      };
    }

  } catch (error) {
    console.error('Google Calendar sync error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
