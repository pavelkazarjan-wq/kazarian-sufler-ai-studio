const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase - credentials MUST be in environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in environment variables');
}

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

exports.handler = async (event) => {
  // Get short code from path: /.netlify/functions/c/abc123
  const pathParts = event.path.split('/');
  const shortCode = pathParts[pathParts.length - 1];

  if (!shortCode || shortCode === 'c') {
    return {
      statusCode: 400,
      body: 'Short code required'
    };
  }

  // Validate short code format (alphanumeric only, 5-15 chars)
  if (!/^[a-z0-9]{5,15}$/i.test(shortCode)) {
    return {
      statusCode: 400,
      body: 'Invalid short code format'
    };
  }

  try {
    // Look up the short code in database (exact match only - safe)
    const { data, error } = await supabase
      .from('waiting_clients')
      .select('link, token, session_id, expires_at')
      .eq('short_code', shortCode)
      .single();

    if (error || !data) {
      // Try exact session_id match (safe - no wildcards)
      const { data: dataBySession } = await supabase
        .from('waiting_clients')
        .select('link, token, session_id, expires_at')
        .eq('session_id', shortCode)
        .single();

      if (dataBySession && dataBySession.link) {
        // Check expiration
        if (dataBySession.expires_at && new Date(dataBySession.expires_at) < new Date()) {
          return {
            statusCode: 410,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
            body: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Ссылка устарела</title></head>
<body style="font-family:sans-serif;text-align:center;padding:50px;">
<h1>⏰ Ссылка устарела</h1>
<p>Срок действия этой консультации истёк. Обратитесь к специалисту за новой ссылкой.</p>
</body></html>`
          };
        }
        return {
          statusCode: 302,
          headers: { Location: dataBySession.link }
        };
      }

      return {
        statusCode: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Ссылка не найдена</title></head>
<body style="font-family:sans-serif;text-align:center;padding:50px;">
<h1>😔 Ссылка не найдена</h1>
<p>Возможно, консультация была отменена или ссылка устарела.</p>
</body></html>`
      };
    }

    // Check expiration
    if (data.expires_at && new Date(data.expires_at) < new Date()) {
      return {
        statusCode: 410,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
        body: `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Ссылка устарела</title></head>
<body style="font-family:sans-serif;text-align:center;padding:50px;">
<h1>⏰ Ссылка устарела</h1>
<p>Срок действия этой консультации истёк. Обратитесь к специалисту за новой ссылкой.</p>
</body></html>`
      };
    }

    // Redirect to full consultation link
    return {
      statusCode: 302,
      headers: { Location: data.link }
    };

  } catch (err) {
    console.error('Redirect error:', err);
    return {
      statusCode: 500,
      body: 'Server error'
    };
  }
};
