// Netlify Scheduled Function for automatic reminders
// Runs every 15 minutes to check and send reminders
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ngxbfuimddefjeufwcwf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

// Schedule: every 15 minutes
exports.config = {
  schedule: '*/15 * * * *'
};

exports.handler = async (event, context) => {
  console.log('Reminder scheduler triggered at:', new Date().toISOString());

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
  const results = { sent_12h: 0, sent_1h: 0, errors: [] };

  const sessionTypes = {
    primary: 'Первичная консультация',
    followup: 'Повторная сессия',
    group: 'Групповая терапия',
    supervision: 'Супервизия',
    training: 'Тренинг'
  };

  // Process 12-hour reminders
  try {
    const { data: sessions12h, error } = await supabase.rpc('get_calendar_reminders', {
      reminder_type: '12h'
    });

    if (error) {
      results.errors.push({ type: '12h', error: error.message });
    } else if (sessions12h && sessions12h.length > 0) {
      for (const session of sessions12h) {
        const sent = await sendReminder(session, '12h', sessionTypes);
        if (sent) {
          await supabase
            .from('calendar_sessions')
            .update({ reminder_12h_sent: true })
            .eq('id', session.session_id);
          results.sent_12h++;
        }
      }
    }
  } catch (err) {
    results.errors.push({ type: '12h', error: err.message });
  }

  // Process 1-hour reminders
  try {
    const { data: sessions1h, error } = await supabase.rpc('get_calendar_reminders', {
      reminder_type: '1h'
    });

    if (error) {
      results.errors.push({ type: '1h', error: error.message });
    } else if (sessions1h && sessions1h.length > 0) {
      for (const session of sessions1h) {
        const sent = await sendReminder(session, '1h', sessionTypes);
        if (sent) {
          await supabase
            .from('calendar_sessions')
            .update({ reminder_1h_sent: true })
            .eq('id', session.session_id);
          results.sent_1h++;
        }
      }
    }
  } catch (err) {
    results.errors.push({ type: '1h', error: err.message });
  }

  console.log('Reminder scheduler results:', results);

  return {
    statusCode: 200,
    body: JSON.stringify(results)
  };
};

async function sendReminder(session, reminderType, sessionTypes) {
  if (!session.telegram_bot_token || !session.telegram_chat_id) {
    return false;
  }

  const sessionDate = new Date(session.session_datetime);
  const dateStr = sessionDate.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long'
  });
  const timeStr = sessionDate.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit'
  });

  const timeText = reminderType === '12h' ? '12 часов' : 'час';
  const emoji = reminderType === '12h' ? '📅' : '⏰';

  const message =
    `${emoji} <b>Напоминание о сессии</b>\n\n` +
    `👤 Клиент: ${session.client_name || 'Не указан'}\n` +
    `📋 Тип: ${sessionTypes[session.session_type] || 'Сессия'}\n` +
    `📆 Дата: ${dateStr}\n` +
    `🕐 Время: ${timeStr}\n\n` +
    `Сессия начнётся через ${timeText}!`;

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${session.telegram_bot_token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: session.telegram_chat_id,
          text: message,
          parse_mode: 'HTML'
        })
      }
    );
    return response.ok;
  } catch (err) {
    console.error('Send reminder error:', err);
    return false;
  }
}
