// AI Legal Assistant - Generates legal documents for websites
// Uses OpenAI GPT to create Offer Agreement, Privacy Policy, Disclaimer

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const LEGAL_SYSTEM_PROMPT = `Ти — AI юрист, який створює юридичні документи для українських підприємців (ФОП та ТОВ).

ТВОЯ ЗАДАЧА:
Генерувати професійні юридичні документи на 3 мовах: українська (UK), російська (RU), англійська (EN).

ТИПИ ДОКУМЕНТІВ:
1. ДОГОВІР ОФЕРТИ (offer) - публічна оферта на надання послуг
2. ПОЛІТИКА КОНФІДЕНЦІЙНОСТІ (privacy) - обробка персональних даних згідно GDPR та українського законодавства
3. ВІДМОВА ВІД ВІДПОВІДАЛЬНОСТІ (disclaimer) - обмеження відповідальності за результати

СТИЛЬ:
- Офіційний юридичний стиль
- Відповідність українському законодавству
- Структуровані пункти з нумерацією
- Чіткі формулювання без двозначностей

ФОРМАТ ВІДПОВІДІ - JSON:
{
  "offer_uk": "текст договору українською",
  "offer_ru": "текст договору російською",
  "offer_en": "terms of service in English",
  "privacy_uk": "політика конфіденційності українською",
  "privacy_ru": "политика конфиденциальности на русском",
  "privacy_en": "privacy policy in English",
  "disclaimer_uk": "відмова від відповідальності українською",
  "disclaimer_ru": "отказ от ответственности на русском",
  "disclaimer_en": "disclaimer in English"
}

ОБОВ'ЯЗКОВІ ПУНКТИ ДОГОВОРУ ОФЕРТИ:
1. Предмет договору
2. Права та обов'язки сторін
3. Порядок оплати
4. Порядок надання послуг
5. Відповідальність сторін
6. Форс-мажор
7. Вирішення спорів
8. Заключні положення
9. Реквізити виконавця

ОБОВ'ЯЗКОВІ ПУНКТИ ПОЛІТИКИ КОНФІДЕНЦІЙНОСТІ:
1. Загальні положення
2. Які дані збираємо
3. Мета збору даних
4. Зберігання та захист даних
5. Передача даних третім особам
6. Cookies
7. Права користувача
8. Зміни до політики
9. Контактна інформація

ОБОВ'ЯЗКОВІ ПУНКТИ ВІДМОВИ ВІД ВІДПОВІДАЛЬНОСТІ:
1. Загальні положення
2. Обмеження відповідальності
3. Результати не гарантовано
4. Психологічні послуги не замінюють медичну допомогу
5. Індивідуальна відповідальність клієнта

ВАЖЛИВО:
- Документи мають бути повними, готовими до використання
- Підставляй реальні дані: назву компанії, ЄДРПОУ, адресу, email
- Для психологічних послуг обов'язково зазначай, що це НЕ медичні послуги`;

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
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  try {
    const { type, companyName, companyCode, address, email, services, siteType } = JSON.parse(event.body);

    if (!companyName) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Company name is required' }) };
    }

    if (!OPENAI_API_KEY) {
      // Return demo documents if no API key
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(getDemoLegalDocs(companyName, companyCode, address, email, services))
      };
    }

    let userPrompt = 'ДАНІ ДЛЯ ДОКУМЕНТІВ:\n';
    userPrompt += `Назва: ${companyName}\n`;
    userPrompt += `ЄДРПОУ/ІПН: ${companyCode || 'не вказано'}\n`;
    userPrompt += `Адреса: ${address || 'не вказано'}\n`;
    userPrompt += `Email: ${email || 'не вказано'}\n`;
    userPrompt += `Послуги: ${services || 'Психологічні консультації, коучинг, тренінги'}\n`;
    userPrompt += `Тип сайту: ${siteType === 'course' ? 'Онлайн курс' : 'Психологічні послуги'}\n\n`;

    if (type === 'offer') {
      userPrompt += 'Згенеруй ТІЛЬКИ договір оферти (offer_uk, offer_ru, offer_en).\n';
    } else if (type === 'privacy') {
      userPrompt += 'Згенеруй ТІЛЬКИ політику конфіденційності (privacy_uk, privacy_ru, privacy_en).\n';
    } else if (type === 'disclaimer') {
      userPrompt += 'Згенеруй ТІЛЬКИ відмову від відповідальності (disclaimer_uk, disclaimer_ru, disclaimer_en).\n';
    } else {
      userPrompt += 'Згенеруй ВСІ три документи на трьох мовах.\n';
    }

    userPrompt += '\nВідповідай ТІЛЬКИ валідним JSON. Без пояснень до або після JSON.';

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: LEGAL_SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.5,
        max_tokens: 4000
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${errorText}`);
    }

    const data = await response.json();
    const responseText = data.choices[0].message.content;

    // Parse JSON from response
    let jsonResponse;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        jsonResponse = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('No JSON found');
      }
    } catch (parseError) {
      console.error('Parse error:', parseError);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(getDemoLegalDocs(companyName, companyCode, address, email, services))
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(jsonResponse)
    };

  } catch (error) {
    console.error('AI Legal error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to generate documents' })
    };
  }
};

// Demo legal documents when API is not available
function getDemoLegalDocs(companyName, companyCode, address, email, services) {
  const date = new Date().toLocaleDateString('uk-UA');

  return {
    offer_uk: `ДОГОВІР ПУБЛІЧНОЇ ОФЕРТИ
на надання послуг

${companyName}
${companyCode ? `ЄДРПОУ/ІПН: ${companyCode}` : ''}
${address ? `Адреса: ${address}` : ''}
Дата: ${date}

1. ЗАГАЛЬНІ ПОЛОЖЕННЯ
1.1. Цей Договір є офіційною пропозицією (публічною офертою) ${companyName} (далі — Виконавець) на надання послуг: ${services || 'психологічні консультації та тренінги'}.
1.2. Акцептом оферти є оплата послуг.

2. ПРЕДМЕТ ДОГОВОРУ
2.1. Виконавець надає, а Замовник оплачує послуги згідно з обраним тарифом.

3. ПРАВА ТА ОБОВ'ЯЗКИ СТОРІН
3.1. Виконавець зобов'язується надати послуги якісно та вчасно.
3.2. Замовник зобов'язується вчасно оплатити послуги.

4. ПОРЯДОК ОПЛАТИ
4.1. Оплата здійснюється на розрахунковий рахунок Виконавця.
4.2. Послуга вважається оплаченою з моменту зарахування коштів.

5. ВІДПОВІДАЛЬНІСТЬ СТОРІН
5.1. Сторони несуть відповідальність згідно з чинним законодавством України.

6. ВИРІШЕННЯ СПОРІВ
6.1. Спори вирішуються шляхом переговорів або в судовому порядку.

7. РЕКВІЗИТИ ВИКОНАВЦЯ
${companyName}
${companyCode ? `ЄДРПОУ/ІПН: ${companyCode}` : ''}
${address ? `Адреса: ${address}` : ''}
${email ? `Email: ${email}` : ''}`,

    offer_ru: `ДОГОВОР ПУБЛИЧНОЙ ОФЕРТЫ
на оказание услуг

${companyName}
${companyCode ? `ЕДРПОУ/ИНН: ${companyCode}` : ''}
${address ? `Адрес: ${address}` : ''}
Дата: ${date}

1. ОБЩИЕ ПОЛОЖЕНИЯ
1.1. Настоящий Договор является официальным предложением (публичной офертой) ${companyName} на оказание услуг.

[Полный текст договора на русском языке]`,

    offer_en: `PUBLIC OFFER AGREEMENT

${companyName}
Date: ${date}

1. GENERAL PROVISIONS
1.1. This Agreement is an official offer by ${companyName} to provide services.

[Full agreement text in English]`,

    privacy_uk: `ПОЛІТИКА КОНФІДЕНЦІЙНОСТІ

${companyName}
Дата: ${date}

1. ЗАГАЛЬНІ ПОЛОЖЕННЯ
Ця Політика конфіденційності описує, як ${companyName} збирає, використовує та захищає персональні дані.

2. ЯКІ ДАНІ МИ ЗБИРАЄМО
- Ім'я та прізвище
- Email
- Номер телефону
- Дані про оплату

3. МЕТА ЗБОРУ ДАНИХ
- Надання послуг
- Комунікація
- Покращення сервісу

4. ЗАХИСТ ДАНИХ
Ми використовуємо сучасні методи захисту персональних даних.

5. ПРАВА КОРИСТУВАЧА
Ви маєте право на доступ, виправлення та видалення своїх даних.

6. КОНТАКТНА ІНФОРМАЦІЯ
${email ? `Email: ${email}` : ''}`,

    privacy_ru: `ПОЛИТИКА КОНФИДЕНЦИАЛЬНОСТИ

${companyName}

[Полный текст политики конфиденциальности на русском языке]`,

    privacy_en: `PRIVACY POLICY

${companyName}

[Full privacy policy text in English]`,

    disclaimer_uk: `ВІДМОВА ВІД ВІДПОВІДАЛЬНОСТІ

${companyName}

1. ЗАГАЛЬНІ ПОЛОЖЕННЯ
Послуги ${companyName} мають інформаційний та консультаційний характер.

2. ОБМЕЖЕННЯ ВІДПОВІДАЛЬНОСТІ
Виконавець не несе відповідальності за результати застосування отриманої інформації.

3. МЕДИЧНЕ ЗАСТЕРЕЖЕННЯ
Психологічні послуги НЕ є медичними послугами та не замінюють консультацію лікаря.

4. ІНДИВІДУАЛЬНА ВІДПОВІДАЛЬНІСТЬ
Клієнт самостійно приймає рішення та несе за них відповідальність.`,

    disclaimer_ru: `ОТКАЗ ОТ ОТВЕТСТВЕННОСТИ

${companyName}

[Полный текст отказа от ответственности на русском языке]`,

    disclaimer_en: `DISCLAIMER

${companyName}

[Full disclaimer text in English]`
  };
}
