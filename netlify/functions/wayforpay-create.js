const crypto = require('crypto');

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
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
    const MERCHANT_ACCOUNT = process.env.WAYFORPAY_MERCHANT_ACCOUNT;
    const MERCHANT_SECRET = process.env.WAYFORPAY_MERCHANT_SECRET;
    const MERCHANT_DOMAIN = process.env.WAYFORPAY_MERCHANT_DOMAIN || 'expertpage.pro';

    if (!MERCHANT_ACCOUNT || !MERCHANT_SECRET) {
      throw new Error('WayForPay keys not configured');
    }

    const body = JSON.parse(event.body || '{}');
    const {
      amount = 1500,
      productName = 'Консультація психолога',
      clientName = 'Клієнт',
      clientEmail = '',
      clientPhone = '',
      sessionId = ''
    } = body;

    // Generate unique order reference
    const orderReference = `order_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const orderDate = Math.floor(Date.now() / 1000);

    // WayForPay signature string (order matters!)
    const signatureString = [
      MERCHANT_ACCOUNT,
      MERCHANT_DOMAIN,
      orderReference,
      orderDate,
      amount,
      'UAH',
      productName,
      1,        // productCount
      amount    // productPrice
    ].join(';');

    // Create HMAC-MD5 signature
    const merchantSignature = crypto
      .createHmac('md5', MERCHANT_SECRET)
      .update(signatureString)
      .digest('hex');

    // Payment form data
    const paymentData = {
      merchantAccount: MERCHANT_ACCOUNT,
      merchantDomainName: MERCHANT_DOMAIN,
      merchantSignature: merchantSignature,
      orderReference: orderReference,
      orderDate: orderDate,
      amount: amount,
      currency: 'UAH',
      productName: [productName],
      productCount: [1],
      productPrice: [amount],
      returnUrl: `${process.env.URL || 'https://expertpage.pro'}/pip.html?mode=client&payment=success&session=${sessionId}`,
      serviceUrl: `${process.env.URL || 'https://expertpage.pro'}/.netlify/functions/wayforpay-callback`,
      language: 'UA'
    };

    if (clientName) paymentData.clientFirstName = clientName;
    if (clientEmail) paymentData.clientEmail = clientEmail;
    if (clientPhone) paymentData.clientPhone = clientPhone;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        paymentData: paymentData,
        orderReference: orderReference
      })
    };

  } catch (error) {
    console.error('WayForPay create error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
