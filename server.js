const express = require('express');
const cors = require('cors');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Supabase init
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ngxbfuimddefjeufwcwf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Google Calendar setup
const SERVICE_ACCOUNT = {
  client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
  private_key: (process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '').replace(/\\n/g, '\n')
};
const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;

function getCalendarClient() {
  if (!SERVICE_ACCOUNT.client_email || !SERVICE_ACCOUNT.private_key) {
    return null;
  }
  const auth = new google.auth.JWT(
    SERVICE_ACCOUNT.client_email,
    null,
    SERVICE_ACCOUNT.private_key,
    ['https://www.googleapis.com/auth/calendar']
  );
  return google.calendar({ version: 'v3', auth });
}

// =============================================
// API ROUTES
// =============================================

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Generate consultation link
app.post('/api/generate-link', async (req, res) => {
  try {
    const {
      clientName = 'Клиент',
      validDays = 30,
      scheduledTime = null,
      date = null,
      time = null,
      clientPhone = '',
      clientEmail = '',
      notes = '',
      userId = null
    } = req.body;

    // Generate IDs
    const sessionId = 'cons-' + Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
    const shortCode = Date.now().toString(36).slice(-4) + Math.random().toString(36).substring(2, 5);
    const expiresAt = Date.now() + (validDays * 24 * 60 * 60 * 1000);

    // Parse scheduled time
    let startsAt = null;
    if (date && time) {
      const dateTimeStr = `${date}T${time}:00`;
      startsAt = new Date(dateTimeStr).getTime();
    } else if (scheduledTime) {
      startsAt = typeof scheduledTime === 'string' ? new Date(scheduledTime).getTime() : scheduledTime;
    }

    // Build URLs
    const baseUrl = process.env.BASE_URL || `http://localhost:${PORT}`;
    const consultationData = {
      s: sessionId,
      n: clientName,
      e: expiresAt,
      c: Date.now(),
      t: startsAt
    };
    const token = Buffer.from(JSON.stringify(consultationData)).toString('base64url');
    const consultationLink = `${baseUrl}/app.html?mode=client&token=${token}`;
    const shortLink = `${baseUrl}/c/${shortCode}`;

    let calendarEventId = null;

    // Add to Google Calendar if scheduled
    if (startsAt) {
      const calendar = getCalendarClient();
      if (calendar && CALENDAR_ID) {
        try {
          const startDate = new Date(startsAt);
          const endDate = new Date(startDate.getTime() + 60 * 60 * 1000);

          const event = {
            summary: `Консультація: ${clientName}`,
            description: `Онлайн консультація з ${clientName}\n\nПосилання: ${shortLink}\n\nSession ID: ${sessionId}`,
            start: { dateTime: startDate.toISOString(), timeZone: 'Europe/Kyiv' },
            end: { dateTime: endDate.toISOString(), timeZone: 'Europe/Kyiv' },
            reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }] }
          };

          const result = await calendar.events.insert({ calendarId: CALENDAR_ID, resource: event });
          calendarEventId = result.data.id;
          console.log('Added to Google Calendar:', calendarEventId);
        } catch (err) {
          console.error('Calendar error:', err.message);
        }
      }
    }

    // Save to Supabase if scheduled
    if (startsAt) {
      try {
        await supabase.from('waiting_clients').insert({
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
          calendar_event_id: calendarEventId,
          user_id: userId
        });
        console.log('Saved to Supabase:', sessionId);
      } catch (err) {
        console.error('Supabase error:', err.message);
      }
    }

    res.json({
      success: true,
      link: startsAt ? shortLink : consultationLink,
      fullLink: consultationLink,
      shortLink: shortLink,
      shortCode: shortCode,
      sessionId: sessionId,
      clientName: clientName,
      expiresAt: new Date(expiresAt).toISOString(),
      scheduledTime: startsAt ? new Date(startsAt).toISOString() : null,
      calendarEventId: calendarEventId
    });

  } catch (error) {
    console.error('Generate link error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Add calendar event
app.post('/api/add-calendar-event', async (req, res) => {
  try {
    const { clientName, scheduledDateTime, scheduledTime, sessionId, shortLink, duration = 60 } = req.body;

    const calendar = getCalendarClient();
    if (!calendar || !CALENDAR_ID) {
      return res.status(500).json({ error: 'Calendar not configured' });
    }

    let startLocal = scheduledDateTime || new Date(scheduledTime).toISOString();
    const startDate = new Date(startLocal);
    const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

    const event = {
      summary: `Консультація: ${clientName}`,
      description: `Онлайн консультація з ${clientName}\n\nПосилання: ${shortLink}\n\nSession ID: ${sessionId}`,
      start: { dateTime: startDate.toISOString(), timeZone: 'Europe/Kyiv' },
      end: { dateTime: endDate.toISOString(), timeZone: 'Europe/Kyiv' },
      reminders: { useDefault: false, overrides: [{ method: 'popup', minutes: 15 }, { method: 'popup', minutes: 5 }] }
    };

    const result = await calendar.events.insert({ calendarId: CALENDAR_ID, resource: event });

    res.json({
      success: true,
      eventId: result.data.id,
      htmlLink: result.data.htmlLink
    });

  } catch (error) {
    console.error('Add calendar event error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Delete calendar event
app.post('/api/delete-calendar-event', async (req, res) => {
  try {
    const { eventId } = req.body;

    if (!eventId) {
      return res.status(400).json({ error: 'eventId is required' });
    }

    const calendar = getCalendarClient();
    if (!calendar || !CALENDAR_ID) {
      return res.status(500).json({ error: 'Calendar not configured' });
    }

    await calendar.events.delete({ calendarId: CALENDAR_ID, eventId: eventId });
    console.log('Deleted calendar event:', eventId);

    res.json({ success: true, eventId: eventId });

  } catch (error) {
    if (error.code === 404) {
      return res.json({ success: true, eventId: req.body.eventId, note: 'Event already deleted' });
    }
    console.error('Delete calendar event error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get scheduled consultations
app.get('/api/consultations', async (req, res) => {
  try {
    const { userId } = req.query;

    let query = supabase
      .from('waiting_clients')
      .select('*')
      .eq('status', 'scheduled')
      .order('scheduled_time', { ascending: true });

    if (userId) {
      query = query.eq('user_id', userId);
    }

    const { data, error } = await query;

    if (error) throw error;

    res.json({ success: true, consultations: data });

  } catch (error) {
    console.error('Get consultations error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Short link redirect
app.get('/c/:code', async (req, res) => {
  try {
    const { code } = req.params;

    const { data, error } = await supabase
      .from('waiting_clients')
      .select('link, token')
      .eq('short_code', code)
      .single();

    if (error || !data) {
      return res.status(404).send('Ссылка не найдена или устарела');
    }

    res.redirect(data.link);

  } catch (error) {
    console.error('Short link error:', error);
    res.status(500).send('Ошибка сервера');
  }
});

// Serve static files for all other routes
app.get('*', (req, res) => {
  // Sanitize path to prevent directory traversal
  const safePath = path.normalize(req.path).replace(/^(\.\.[\/\\])+/, '');
  const filePath = path.join(__dirname, 'public', safePath);

  // Ensure file is within public directory
  const publicDir = path.resolve(__dirname, 'public');
  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.startsWith(publicDir)) {
    return res.status(403).send('Forbidden');
  }

  res.sendFile(resolvedPath, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Open http://localhost:${PORT}`);
});
