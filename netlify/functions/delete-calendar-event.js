const { google } = require('googleapis');

// Service Account credentials from environment variables ONLY
const SERVICE_ACCOUNT = {
  client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n')
};

// Calendar ID
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'pavel.kazarjan@gmail.com';

// Create Google Calendar client
function getCalendarClient() {
  if (!SERVICE_ACCOUNT.client_email || !SERVICE_ACCOUNT.private_key) {
    throw new Error('Google Calendar credentials not configured');
  }

  const auth = new google.auth.JWT(
    SERVICE_ACCOUNT.client_email,
    null,
    SERVICE_ACCOUNT.private_key,
    ['https://www.googleapis.com/auth/calendar']
  );
  return google.calendar({ version: 'v3', auth });
}

// Helper function to delete event (can be imported by other functions)
async function deleteCalendarEvent(eventId) {
  const calendar = getCalendarClient();

  await calendar.events.delete({
    calendarId: CALENDAR_ID,
    eventId: eventId
  });

  return { success: true, eventId };
}

// Netlify function handler for direct API calls
exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'DELETE') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { eventId } = body;

    if (!eventId) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'eventId is required' })
      };
    }

    await deleteCalendarEvent(eventId);
    console.log('Deleted calendar event:', eventId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        eventId: eventId
      })
    };

  } catch (error) {
    console.error('Delete calendar event error:', error);

    // If event not found, still return success (already deleted)
    if (error.code === 404 || error.message?.includes('Not Found')) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          eventId: event.body ? JSON.parse(event.body).eventId : null,
          note: 'Event was already deleted or not found'
        })
      };
    }

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Export helper for use in other functions
module.exports.deleteCalendarEvent = deleteCalendarEvent;
