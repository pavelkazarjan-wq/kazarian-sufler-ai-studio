const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { addCalendarEvent } = require('./add-calendar-event');

// Initialize Supabase - credentials MUST be in environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment variables');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://expertpage.pro',
  'https://kazarian-webinar-ai-studio.netlify.app',
  'https://n8n.kazarian.studio',
  'http://localhost:3000',
  'http://localhost:5678'  // n8n local
];

exports.handler = async (event, context) => {
  // CORS headers - restrict to allowed origins
  const origin = event.headers.origin || event.headers.Origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
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
    let {
      clientName = 'Клиент',
      validDays = 30,  // Default 30 days
      scheduledTime = null,  // ISO string or timestamp for scheduled session
      date = null,  // YYYY-MM-DD format
      time = null,  // HH:MM format
      clientPhone = '',
      clientEmail = '',
      notes = ''
    } = body;

    // Input validation
    // Validate and sanitize clientName (max 100 chars, no HTML)
    clientName = String(clientName || 'Клиент').slice(0, 100).replace(/<[^>]*>/g, '');

    // Validate validDays (1-365)
    validDays = Math.max(1, Math.min(365, parseInt(validDays) || 30));

    // Validate date format (YYYY-MM-DD)
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid date format. Use YYYY-MM-DD' })
      };
    }

    // Validate time format (HH:MM)
    if (time && !/^\d{2}:\d{2}$/.test(time)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid time format. Use HH:MM' })
      };
    }

    // Validate email format if provided
    if (clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid email format' })
      };
    }

    // Sanitize phone and notes (max lengths)
    clientPhone = String(clientPhone || '').slice(0, 20);
    notes = String(notes || '').slice(0, 1000);

    // Generate unique session ID and short code with cryptographic entropy
    const sessionId = 'cons-' + crypto.randomBytes(12).toString('hex');
    const shortCode = crypto.randomBytes(4).toString('hex');

    // Calculate expiration date
    const expiresAt = Date.now() + (validDays * 24 * 60 * 60 * 1000);

    // Parse scheduled time - support both formats:
    // 1. scheduledTime (ISO string or timestamp)
    // 2. date + time (YYYY-MM-DD + HH:MM)
    let startsAt = null;
    if (date && time) {
      // Combine date and time (assuming Kyiv timezone UTC+2/+3)
      const dateTimeStr = `${date}T${time}:00`;
      startsAt = new Date(dateTimeStr).getTime();
      console.log(`Parsed date+time: ${dateTimeStr} -> ${startsAt}`);
    } else if (scheduledTime) {
      startsAt = typeof scheduledTime === 'string'
        ? new Date(scheduledTime).getTime()
        : scheduledTime;
    }

    // Validate scheduled time is not in the past (allow 5 min buffer)
    if (startsAt && startsAt < Date.now() - (5 * 60 * 1000)) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Scheduled time cannot be in the past' })
      };
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
    const baseUrl = process.env.URL || 'https://expertpage.pro';
    const consultationLink = `${baseUrl}/pip.html?mode=client&token=${token}`;

    // Build short link
    const shortLink = `${baseUrl}/c/${shortCode}`;

    // Save to Supabase if scheduled
    let calendarEventId = null;
    if (supabase && startsAt) {
      // First add to Google Calendar to get eventId
      try {
        const calendarEvent = await addCalendarEvent({
          clientName: clientName,
          scheduledTime: startsAt,
          sessionId: sessionId,
          shortLink: shortLink,
          duration: 60  // 60 minutes default
        });
        calendarEventId = calendarEvent.id;
        console.log('Added to Google Calendar:', calendarEventId);
      } catch (calErr) {
        console.error('Failed to add to Google Calendar:', calErr);
        // Continue anyway - consultation link is still valid
      }

      // Save to Supabase with calendar_event_id
      try {
        await supabase
          .from('waiting_clients')
          .insert({
            session_id: sessionId,
            client_name: clientName,
            status: 'scheduled',
            scheduled_time: new Date(startsAt).toISOString(),
            token: token,
            link: consultationLink,
            short_code: shortCode,
            client_phone: clientPhone || null,
            client_email: clientEmail || null,
            notes: notes || null,
            expires_at: new Date(expiresAt).toISOString(),
            calendar_event_id: calendarEventId
          });
        console.log('Saved scheduled consultation to Supabase:', sessionId);
      } catch (dbErr) {
        console.error('Failed to save to Supabase:', dbErr);
        // Continue anyway - link is still valid
      }
    }

    // Return the generated link (short link for scheduled, full for instant)
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        link: startsAt ? shortLink : consultationLink,
        fullLink: consultationLink,
        shortLink: shortLink,
        shortCode: shortCode,
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
