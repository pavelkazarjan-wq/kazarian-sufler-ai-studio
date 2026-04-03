// Telegram Bot for Session Reminders - Per-User Tokens
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ngxbfuimddefjeufwcwf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const ALLOWED_ORIGINS = [
  'https://kazarian-webinar-ai-studio.netlify.app',
  'http://localhost:3000'
];

exports.handler = async (event, context) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    const { action, userId, botToken, chatId, message } = body;

    switch (action) {
      case 'save-token':
        return saveToken(userId, botToken, headers);

      case 'verify-token':
        return verifyToken(botToken, headers);

      case 'get-link':
        return getConnectionLink(userId, botToken, headers);

      case 'check-connection':
        return checkConnection(userId, headers);

      case 'save-chat-id':
        return saveChatId(userId, chatId, headers);

      case 'disconnect':
        return disconnectTelegram(userId, headers);

      case 'send-reminder':
        return sendReminder(botToken, chatId, message, headers);

      case 'send-reminders':
        return sendAllReminders(headers);

      case 'test-message':
        return testMessage(botToken, chatId, headers);

      default:
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid action' })
        };
    }

  } catch (error) {
    console.error('Telegram bot error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// Save user's bot token to profile
async function saveToken(userId, botToken, headers) {
  if (!userId || !botToken) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing userId or botToken' })
    };
  }

  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('profiles')
    .update({ telegram_bot_token: botToken })
    .eq('id', userId);

  if (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true })
  };
}

// Verify bot token is valid
async function verifyToken(botToken, headers) {
  if (!botToken) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Missing botToken' })
    };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await response.json();

    if (data.ok) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          bot: {
            id: data.result.id,
            username: data.result.username,
            first_name: data.result.first_name
          }
        })
      };
    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid bot token', details: data.description })
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to verify token' })
    };
  }
}

// Get bot link for user to start chat
async function getConnectionLink(userId, botToken, headers) {
  if (!botToken) {
    // Get token from profile
    const supabase = createSupabaseClient();
    const { data } = await supabase
      .from('profiles')
      .select('telegram_bot_token')
      .eq('id', userId)
      .single();

    botToken = data?.telegram_bot_token;
  }

  if (!botToken) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: 'Bot token not configured' })
    };
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
    const data = await response.json();

    if (data.ok) {
      const code = Buffer.from(userId).toString('base64');
      const link = `https://t.me/${data.result.username}?start=${code}`;

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true, link, botUsername: data.result.username })
      };
    }
  } catch (err) {
    console.error('Get link error:', err);
  }

  return {
    statusCode: 500,
    headers,
    body: JSON.stringify({ error: 'Failed to get bot info' })
  };
}

// Check if user has Telegram connected
async function checkConnection(userId, headers) {
  const supabase = createSupabaseClient();

  const { data, error } = await supabase
    .from('profiles')
    .select('telegram_chat_id, telegram_bot_token, telegram_notifications_enabled, reminder_minutes')
    .eq('id', userId)
    .single();

  if (error || !data) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ connected: false, hasToken: false })
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({
      connected: !!data.telegram_chat_id,
      hasToken: !!data.telegram_bot_token,
      notifications_enabled: data.telegram_notifications_enabled,
      reminder_minutes: data.reminder_minutes
    })
  };
}

// Save chat ID after user starts the bot
async function saveChatId(userId, chatId, headers) {
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('profiles')
    .update({
      telegram_chat_id: chatId,
      telegram_notifications_enabled: true
    })
    .eq('id', userId);

  if (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true })
  };
}

// Disconnect Telegram
async function disconnectTelegram(userId, headers) {
  const supabase = createSupabaseClient();

  const { error } = await supabase
    .from('profiles')
    .update({
      telegram_chat_id: null,
      telegram_notifications_enabled: false
    })
    .eq('id', userId);

  if (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true })
  };
}

// Send a single reminder
async function sendReminder(botToken, chatId, message, headers) {
  const result = await sendTelegramMessage(botToken, chatId, message);

  return {
    statusCode: result ? 200 : 500,
    headers,
    body: JSON.stringify({ success: result })
  };
}

// Test message to verify connection
async function testMessage(botToken, chatId, headers) {
  const message = 'Telegram успешно подключён! Теперь вы будете получать напоминания о сессиях.';
  const result = await sendTelegramMessage(botToken, chatId, message);

  return {
    statusCode: result ? 200 : 500,
    headers,
    body: JSON.stringify({ success: result })
  };
}

// Send all pending reminders (called by scheduler)
async function sendAllReminders(headers) {
  const supabase = createSupabaseClient();

  // Get sessions needing reminders using the function
  const { data: sessions, error } = await supabase.rpc('get_calendar_reminders', {
    minutes_before: 60
  });

  if (error) {
    console.error('Get sessions error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }

  if (!sessions || sessions.length === 0) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ sent: 0 })
    };
  }

  const sessionTypes = {
    primary: 'Первичная консультация',
    followup: 'Повторная сессия',
    group: 'Групповая терапия',
    supervision: 'Супервизия',
    training: 'Тренинг'
  };

  let sent = 0;
  for (const session of sessions) {
    const time = new Date(session.session_datetime).toLocaleTimeString('ru-RU', {
      hour: '2-digit',
      minute: '2-digit'
    });

    const message =
      `Напоминание о сессии\n\n` +
      `Клиент: ${session.client_name || 'Не указан'}\n` +
      `Тип: ${sessionTypes[session.session_type] || 'Сессия'}\n` +
      `Время: ${time}\n\n` +
      `Сессия начнётся через час!`;

    const result = await sendTelegramMessage(
      session.telegram_bot_token,
      session.telegram_chat_id,
      message
    );

    if (result) {
      // Mark reminder as sent
      await supabase
        .from('calendar_sessions')
        .update({ reminder_sent: true })
        .eq('id', session.session_id);
      sent++;
    }
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ sent })
  };
}

// Send message via Telegram API
async function sendTelegramMessage(botToken, chatId, text) {
  if (!botToken || !chatId) return false;

  try {
    const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: text,
        parse_mode: 'HTML'
      })
    });

    return response.ok;
  } catch (err) {
    console.error('Send message error:', err);
    return false;
  }
}

// Create Supabase client with service key
function createSupabaseClient() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}
