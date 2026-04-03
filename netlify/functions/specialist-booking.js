// API for booking consultations from public specialist pages
// POST: Creates a booking request

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ngxbfuimddefjeufwcwf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
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
    const body = JSON.parse(event.body || '{}');
    const {
      slug,
      service_id,
      client_name,
      client_phone,
      client_email,
      preferred_date,
      preferred_time,
      message
    } = body;

    // Validation
    if (!slug || !client_name) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Slug and client_name are required' })
      };
    }

    if (!client_phone && !client_email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Phone or email is required' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get site by slug
    const { data: site, error: siteError } = await supabase
      .from('specialist_sites')
      .select('id, user_id, booking_enabled, payment_required')
      .eq('slug', slug)
      .eq('is_published', true)
      .single();

    if (siteError || !site) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Specialist not found' })
      };
    }

    if (!site.booking_enabled) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Booking is disabled for this specialist' })
      };
    }

    // Check if service requires prepayment
    let paymentRequired = site.payment_required;
    if (service_id) {
      const { data: service } = await supabase
        .from('specialist_services')
        .select('prepayment_required, prepayment_amount, price')
        .eq('id', service_id)
        .single();

      if (service?.prepayment_required) {
        paymentRequired = true;
      }
    }

    // Create booking
    const bookingData = {
      site_id: site.id,
      service_id: service_id || null,
      client_name,
      client_phone: client_phone || null,
      client_email: client_email || null,
      preferred_date: preferred_date || null,
      preferred_time: preferred_time || null,
      message: message || null,
      status: 'pending',
      payment_status: paymentRequired ? 'pending' : 'none'
    };

    const { data: booking, error: bookingError } = await supabase
      .from('specialist_bookings')
      .insert(bookingData)
      .select()
      .single();

    if (bookingError) {
      console.error('Booking error:', bookingError);
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Failed to create booking' })
      };
    }

    // Get specialist info for notification
    const { data: profile } = await supabase
      .from('profiles')
      .select('full_name, telegram_chat_id, telegram_bot_token, telegram_notifications_enabled')
      .eq('id', site.user_id)
      .single();

    // Send Telegram notification to specialist if enabled
    if (profile?.telegram_chat_id && profile?.telegram_bot_token && profile?.telegram_notifications_enabled) {
      const dateStr = preferred_date ? new Date(preferred_date).toLocaleDateString('uk-UA') : 'не вказано';
      const timeStr = preferred_time || 'не вказано';

      const notificationText =
        `📝 <b>Нова заявка на консультацію!</b>\n\n` +
        `👤 Клієнт: ${client_name}\n` +
        `📱 Телефон: ${client_phone || 'не вказано'}\n` +
        `📧 Email: ${client_email || 'не вказано'}\n` +
        `📅 Бажана дата: ${dateStr}\n` +
        `🕐 Бажаний час: ${timeStr}\n` +
        (message ? `💬 Повідомлення: ${message}\n` : '') +
        `\nВідкрийте кабінет для підтвердження.`;

      try {
        await fetch(`https://api.telegram.org/bot${profile.telegram_bot_token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: profile.telegram_chat_id,
            text: notificationText,
            parse_mode: 'HTML'
          })
        });
      } catch (e) {
        console.error('Telegram notification error:', e);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        booking_id: booking.id,
        payment_required: paymentRequired,
        message: paymentRequired
          ? 'Заявка створена. Очікуйте посилання на оплату.'
          : 'Заявка створена. Спеціаліст зв\'яжеться з вами найближчим часом.'
      })
    };

  } catch (error) {
    console.error('Booking error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
