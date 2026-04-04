const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase with fallback
const FALLBACK_URL = 'https://ngxbfuimddefjeufwcwf.supabase.co';
const FALLBACK_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5neGJmdWltZGRlZmpldWZ3Y3dmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUyMDQ5MjYsImV4cCI6MjA4MDc4MDkyNn0.xRRF3L8BCzM5qTKzODT3IfayIQ1x4u0sa-4ki3UbhkI';

const supabaseUrl = process.env.SUPABASE_URL || FALLBACK_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || FALLBACK_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Allowed origins for CORS
const ALLOWED_ORIGINS = [
  'https://expertpage.pro',
  'https://kazarian-webinar-ai-studio.netlify.app',
  'https://n8n.kazarian.studio',
  'http://localhost:3000',
  'http://localhost:5678'
];

exports.handler = async (event, context) => {
  // CORS headers - restrict to allowed origins
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
    return { statusCode: 200, headers, body: '' };
  }

  // Only allow GET
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    if (!supabase) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Supabase not configured' })
      };
    }

    // Get consultations scheduled in the future or within the last hour
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    const { data, error } = await supabase
      .from('waiting_clients')
      .select('*')
      .not('scheduled_time', 'is', null)
      .gte('scheduled_time', oneHourAgo.toISOString())
      .in('status', ['scheduled', 'waiting'])
      .order('scheduled_time', { ascending: true });

    if (error) {
      console.error('Supabase query error:', error);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Database query failed' })
      };
    }

    // Transform data for frontend
    const consultations = (data || []).map(item => ({
      id: item.id,
      sessionId: item.session_id,
      clientName: item.client_name || 'Клиент',
      scheduledTime: new Date(item.scheduled_time).getTime(),
      status: item.status,
      token: item.token || null,
      link: item.link || null,
      clientPhone: item.client_phone || null,
      clientEmail: item.client_email || null,
      notes: item.notes || null
    }));

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        consultations: consultations,
        count: consultations.length
      })
    };

  } catch (error) {
    console.error('Get scheduled error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
