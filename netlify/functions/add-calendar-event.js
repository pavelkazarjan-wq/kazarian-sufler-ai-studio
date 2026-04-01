const { google } = require('googleapis');

// Service Account credentials from environment variables ONLY
const SERVICE_ACCOUNT = {
  client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n')
};

// Calendar ID (your email)
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'pavel.kazarjan@gmail.com';

// Create Google Calendar client
function getCalendarClient() {
  if (!SERVICE_ACCOUNT.client_email || !SERVICE_ACCOUNT.private_key) {
    throw new Error('Google Calendar credentials not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_KEY environment variables.');
  }

  const auth = new google.auth.JWT(
    SERVICE_ACCOUNT.client_email,
    null,
    SERVICE_ACCOUNT.private_key,
    ['https://www.googleapis.com/auth/calendar']
  );
  return google.calendar({ version: 'v3', auth });
}

// Helper function to add event (can be imported by other functions)
async function addCalendarEvent({ clientName, scheduledDateTime, scheduledTime, sessionId, shortLink, duration = 60 }) {
  const calendar = getCalendarClient();

  // Use scheduledDateTime string if provided, otherwise fall back to timestamp
  let startLocal;
  if (scheduledDateTime) {
    // Already in format "YYYY-MM-DDTHH:MM:SS"
    startLocal = scheduledDateTime;
  } else if (scheduledTime) {
    // Legacy: convert timestamp (but this won't work correctly due to server timezone)
    const startTime = new Date(scheduledTime);
    const pad = n => n.toString().padStart(2, '0');
    startLocal = `${startTime.getFullYear()}-${pad(startTime.getMonth() + 1)}-${pad(startTime.getDate())}T${pad(startTime.getHours())}:${pad(startTime.getMinutes())}:${pad(startTime.getSeconds())}`;
  } else {
    throw new Error('scheduledDateTime or scheduledTime is required');
  }

  // Calculate end time (add duration minutes)
  // Use Date object to handle day rollover correctly
  const startDate = new Date(startLocal);
  const endDate = new Date(startDate.getTime() + duration * 60 * 1000);
  const pad = n => n.toString().padStart(2, '0');
  const endLocal = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-${pad(endDate.getDate())}T${pad(endDate.getHours())}:${pad(endDate.getMinutes())}:${pad(endDate.getSeconds())}`;

  const event = {
    summary: `Консультація: ${clientName}`,
    description: `Онлайн консультація з ${clientName}\n\nПосилання для клієнта: ${shortLink}\n\nSession ID: ${sessionId}`,
    start: {
      dateTime: startLocal,
      timeZone: 'Europe/Kyiv'
    },
    end: {
      dateTime: endLocal,
      timeZone: 'Europe/Kyiv'
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 15 },
        { method: 'popup', minutes: 5 }
      ]
    }
  };

  const result = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    resource: event
  });

  return result.data;
}

// Netlify function handler for direct API calls
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { clientName, scheduledDateTime, scheduledTime, sessionId, shortLink, duration } = body;

    if (!clientName || (!scheduledDateTime && !scheduledTime)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'clientName and scheduledDateTime are required' })
      };
    }

    const calendarEvent = await addCalendarEvent({
      clientName,
      scheduledDateTime,
      scheduledTime,
      sessionId: sessionId || 'unknown',
      shortLink: shortLink || '',
      duration: duration || 60
    });

    console.log('Created calendar event:', calendarEvent.id);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        eventId: calendarEvent.id,
        htmlLink: calendarEvent.htmlLink
      })
    };

  } catch (error) {
    console.error('Calendar event error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Export helper for use in other functions
module.exports.addCalendarEvent = addCalendarEvent;
