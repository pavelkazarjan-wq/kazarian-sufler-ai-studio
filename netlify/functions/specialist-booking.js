// API for booking consultations from public specialist pages
// POST: Creates a booking request and adds to waiting_clients for dashboard

const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ngxbfuimddefjeufwcwf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const BASE_URL = process.env.URL || 'https://expertpage.pro';

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

    // Create waiting_clients entry for dashboard display
    let consultationLink = null;
    let shortCode = null;

    if (preferred_date && preferred_time) {
      let serviceName = 'Консультація';
      let serviceDuration = 60;

      if (service_id) {
        const { data: serviceData } = await supabase
          .from('specialist_services')
          .select('name_uk, duration')
          .eq('id', service_id)
          .single();

        if (serviceData) {
          serviceName = serviceData.name_uk || serviceName;
          serviceDuration = serviceData.duration || serviceDuration;
        }
      }

      // Generate session ID and token for consultation link
      const sessionId = 'cons-' + crypto.randomBytes(12).toString('hex');
      shortCode = crypto.randomBytes(4).toString('hex');

      // Parse scheduled time
      const dateTimeStr = `${preferred_date}T${preferred_time}:00`;
      const scheduledTime = new Date(dateTimeStr);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      // Create token for consultation link
      const consultationData = {
        s: sessionId,
        n: client_name,
        e: expiresAt.getTime(),
        c: Date.now(),
        t: scheduledTime.getTime()
      };
      const token = Buffer.from(JSON.stringify(consultationData)).toString('base64url');
      consultationLink = `${BASE_URL}/pip.html?mode=client&token=${token}`;
      const shortLink = `${BASE_URL}/c/${shortCode}`;

      // Create notes with booking info
      const notesText = `Заявка з сайту /p/${slug}. ${serviceName}.${message ? '\nПовідомлення: ' + message : ''}`;

      // Insert into waiting_clients for dashboard display
      const { error: waitingError } = await supabase
        .from('waiting_clients')
        .insert({
          session_id: sessionId,
          client_name,
          status: 'scheduled',
          scheduled_time: scheduledTime.toISOString(),
          token: token,
          link: consultationLink,
          short_code: shortCode,
          client_phone: client_phone || null,
          client_email: client_email || null,
          notes: notesText,
          expires_at: expiresAt.toISOString(),
          user_id: site.user_id
        });

      if (waitingError) {
        console.error('Waiting clients error:', waitingError);
        // Don't fail the booking
      } else {
        console.log('✅ Created waiting_clients entry:', sessionId);
      }

      // Also create calendar session for profile calendar
      const sessionData = {
        user_id: site.user_id,
        client_name,
        session_type: 'primary',
        session_date: preferred_date,
        session_time: preferred_time,
        duration: serviceDuration,
        notes: notesText
      };

      const { error: sessionError } = await supabase
        .from('calendar_sessions')
        .insert(sessionData);

      if (sessionError) {
        console.error('Calendar session error:', sessionError);
      }
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
        consultation_link: consultationLink,
        short_code: shortCode,
        message: paymentRequired
          ? 'Заявка створена. Очікуйте посилання на оплату.'
          : consultationLink
            ? 'Заявка створена! Посилання на консультацію надіслано.'
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
