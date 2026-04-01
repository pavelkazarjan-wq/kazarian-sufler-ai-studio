const crypto = require('crypto');
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: 'Method not allowed' };
  }

  try {
    const MERCHANT_SECRET = process.env.WAYFORPAY_MERCHANT_SECRET;

    if (!MERCHANT_SECRET) {
      throw new Error('WayForPay secret not configured');
    }

    // Parse callback data
    const data = JSON.parse(event.body);

    console.log('💳 WayForPay callback received:', JSON.stringify(data, null, 2));

    const {
      merchantAccount,
      orderReference,
      amount,
      currency,
      authCode,
      transactionStatus,
      reasonCode,
      reason,
      merchantSignature,
      clientName,
      email,
      phone,
      createdDate,
      processingDate
    } = data;

    // Verify signature
    const responseSignatureString = [
      merchantAccount,
      orderReference,
      amount,
      currency,
      authCode,
      transactionStatus,
      reasonCode
    ].join(';');

    const expectedSignature = crypto
      .createHmac('md5', MERCHANT_SECRET)
      .update(responseSignatureString)
      .digest('hex');

    if (merchantSignature !== expectedSignature) {
      console.error('Invalid WayForPay signature');
      // Still return OK to avoid retries, but log the issue
    }

    const isSuccess = transactionStatus === 'Approved';

    // Send email notification
    const RESEND_API_KEY = process.env.RESEND_API_KEY;
    const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'psiholikar@gmail.com';

    if (RESEND_API_KEY) {
      const statusEmoji = isSuccess ? '✅' : '❌';
      const statusText = isSuccess ? 'Успішна оплата' : `Статус: ${transactionStatus}`;

      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: ${isSuccess ? '#10b981' : '#ef4444'}; border-bottom: 2px solid ${isSuccess ? '#10b981' : '#ef4444'}; padding-bottom: 10px;">
            💳 ${statusText}
          </h2>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr>
              <td style="padding: 10px; background: #f8fafc; font-weight: bold;">Замовлення:</td>
              <td style="padding: 10px; background: #f8fafc; font-family: monospace;">${orderReference}</td>
            </tr>
            <tr>
              <td style="padding: 10px; font-weight: bold;">Сума:</td>
              <td style="padding: 10px; font-size: 18px; color: #10b981; font-weight: bold;">${amount} ${currency}</td>
            </tr>
            <tr>
              <td style="padding: 10px; background: #f8fafc; font-weight: bold;">Клієнт:</td>
              <td style="padding: 10px; background: #f8fafc;">${clientName || 'Не вказано'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; font-weight: bold;">Email:</td>
              <td style="padding: 10px;">${email || 'Не вказано'}</td>
            </tr>
            <tr>
              <td style="padding: 10px; background: #f8fafc; font-weight: bold;">Телефон:</td>
              <td style="padding: 10px; background: #f8fafc;">${phone || 'Не вказано'}</td>
            </tr>
            ${!isSuccess ? `
            <tr>
              <td style="padding: 10px; font-weight: bold; color: #ef4444;">Причина:</td>
              <td style="padding: 10px; color: #ef4444;">${reason || reasonCode}</td>
            </tr>
            ` : ''}
            <tr>
              <td style="padding: 10px; font-weight: bold;">Код авторизації:</td>
              <td style="padding: 10px; font-family: monospace;">${authCode || '-'}</td>
            </tr>
          </table>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">
            KazarianWEBINARStudio — WayForPay сповіщення
          </p>
        </div>
      `;

      try {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: 'KazarianStudio <onboarding@resend.dev>',
            to: ADMIN_EMAIL,
            subject: `${statusEmoji} Оплата ${amount} ${currency} - ${clientName || orderReference}`,
            html: emailHtml
          })
        });
      } catch (emailError) {
        console.error('Email error:', emailError);
      }
    }

    // WayForPay expects specific response format
    const responseTime = Math.floor(Date.now() / 1000);
    const responseSignature = crypto
      .createHmac('md5', MERCHANT_SECRET)
      .update([orderReference, 'accept', responseTime].join(';'))
      .digest('hex');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        orderReference: orderReference,
        status: 'accept',
        time: responseTime,
        signature: responseSignature
      })
    };

  } catch (error) {
    console.error('WayForPay callback error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
