const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  // CORS headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
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
    // Parse the request body
    const body = JSON.parse(event.body || '{}');
    const { sessionId, clientName, rating, comment, timestamp } = body;

    if (!rating || rating < 1 || rating > 5) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid rating (must be 1-5)' })
      };
    }

    // Review data
    const review = {
      sessionId: sessionId || 'unknown',
      clientName: clientName || 'Анонимный клиент',
      rating: rating,
      comment: comment || '',
      timestamp: timestamp || new Date().toISOString(),
      ip: event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'unknown'
    };

    // Log the review
    console.log('📝 New review received:', JSON.stringify(review, null, 2));

    // Send email notification via Resend
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'psiholikar@gmail.com';

    if (RESEND_API_KEY) {
      const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
      const dateStr = new Date(timestamp).toLocaleString('ru-RU', { timeZone: 'Europe/Kiev' });

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px;">
            📋 Новый отзыв о консультации
          </h2>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 10px; background: #f8fafc; font-weight: bold; width: 120px;">Клиент:</td>
              <td style="padding: 10px; background: #f8fafc;">${review.clientName}</td>
            </tr>
            <tr>
              <td style="padding: 10px; font-weight: bold;">Сессия:</td>
              <td style="padding: 10px; font-family: monospace; color: #64748b;">${review.sessionId}</td>
            </tr>
            <tr>
              <td style="padding: 10px; background: #f8fafc; font-weight: bold;">Оценка:</td>
              <td style="padding: 10px; background: #f8fafc; font-size: 20px;">${stars} (${rating}/5)</td>
            </tr>
            <tr>
              <td style="padding: 10px; font-weight: bold;">Дата:</td>
              <td style="padding: 10px;">${dateStr}</td>
            </tr>
          </table>
          ${comment ? `
            <div style="background: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 20px 0;">
              <strong>💬 Комментарий:</strong>
              <p style="margin: 10px 0 0 0; color: #334155;">"${comment}"</p>
            </div>
          ` : ''}
          <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">
            KazarianWEBINARStudio — Автоматическое уведомление
          </p>
        </div>
      `;

      try {
        const emailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'KazarianStudio <onboarding@resend.dev>',
            to: ADMIN_EMAIL,
            subject: `⭐ Новый отзыв: ${rating}/5 от ${review.clientName}`,
            html: emailHtml
          })
        });
        const emailResult = await emailResponse.json();
        if (!emailResponse.ok) {
          console.error('Resend API error:', emailResult);
        } else {
          console.log('✅ Email sent to:', ADMIN_EMAIL, 'ID:', emailResult.id);
        }
      } catch (emailError) {
        console.error('Email notification error:', emailError);
      }
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        message: 'Review saved successfully'
      })
    };

  } catch (error) {
    console.error('Save review error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};
