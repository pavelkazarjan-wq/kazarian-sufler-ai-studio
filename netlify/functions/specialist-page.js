// API for public specialist pages
// GET: Returns specialist data for public site rendering

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://ngxbfuimddefjeufwcwf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
    'Cache-Control': 'public, max-age=300' // 5 min cache
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const params = event.queryStringParameters || {};
    const { slug, lang = 'uk' } = params;

    if (!slug) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Slug is required' })
      };
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // Get site data with profile
    const { data: site, error: siteError } = await supabase
      .from('specialist_sites')
      .select(`
        *,
        profiles!inner (
          full_name,
          title,
          photo_url,
          phone,
          telegram,
          instagram,
          youtube,
          facebook,
          website,
          legal_email
        )
      `)
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

    // Get services
    const { data: services, error: servicesError } = await supabase
      .from('specialist_services')
      .select('*')
      .eq('site_id', site.id)
      .eq('is_active', true)
      .order('sort_order');

    if (servicesError) {
      console.log('Services error:', servicesError);
    }
    console.log('Loaded services for site', site.id, ':', services?.length || 0);

    // Get approved reviews
    const { data: reviews, error: reviewsError } = await supabase
      .from('specialist_reviews')
      .select('*')
      .eq('site_id', site.id)
      .eq('is_approved', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(20);

    if (reviewsError) {
      console.log('Reviews error:', reviewsError);
    }
    console.log('Loaded reviews for site', site.id, ':', reviews?.length || 0);

    // Get gallery
    const { data: gallery } = await supabase
      .from('specialist_gallery')
      .select('*')
      .eq('site_id', site.id)
      .order('sort_order');

    // Get available slots (from calendar_sessions) for next 30 days
    const today = new Date();
    const thirtyDaysLater = new Date(today);
    thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);

    const { data: busySlots } = await supabase
      .from('calendar_sessions')
      .select('session_date, session_time, duration')
      .eq('user_id', site.user_id)
      .gte('session_date', today.toISOString().split('T')[0])
      .lte('session_date', thirtyDaysLater.toISOString().split('T')[0]);

    // Build response with language-specific content
    const langSuffix = `_${lang}`;
    const fallbackLang = '_uk';

    const getLocalizedField = (base) => {
      return site[base + langSuffix] || site[base + fallbackLang] || site[base + '_uk'] || '';
    };

    const getLocalizedArray = (base) => {
      return site[base + langSuffix] || site[base + fallbackLang] || site[base + '_uk'] || [];
    };

    // Get site photo for current language
    const getSitePhoto = () => {
      return site[`site_photo_url${langSuffix}`] || site.site_photo_url_uk || site.site_photo_url || site.profiles.photo_url;
    };

    const response = {
      specialist: {
        name: site.profiles.full_name,
        title: site.profiles.title,
        photo: getSitePhoto(),
        logo: site.logo_url || null, // Supports static images and animated GIFs
        headline: getLocalizedField('headline'),
        bio: getLocalizedField('bio'),
        specializations: getLocalizedArray('specializations'),
        education: getLocalizedField('education'),
        experience_years: site.experience_years,
        youtube_video: getLocalizedField('youtube_video_url'),
        video_title: getLocalizedField('video_title')
      },
      diplomas: site.diplomas || [],
      photo_gallery: site.gallery || [],
      contacts: {
        phone: site.show_phone ? site.profiles.phone : null,
        telegram: site.show_telegram ? site.profiles.telegram : null,
        email: site.show_email ? site.profiles.legal_email : null,
        instagram: site.profiles.instagram,
        youtube: site.profiles.youtube,
        facebook: site.profiles.facebook,
        website: site.profiles.website
      },
      services: (services || []).map(s => ({
        id: s.id,
        name: s[`name${langSuffix}`] || s.name_uk,
        description: s[`description${langSuffix}`] || s.description_uk,
        duration: s.duration,
        price: s.price,
        currency: s.currency,
        prepayment_required: s.prepayment_required,
        prepayment_amount: s.prepayment_amount
      })),
      reviews: (reviews || []).map(r => ({
        id: r.id,
        client_name: r.client_name,
        client_photo: r.client_photo_url,
        screenshots: r.screenshots || [],
        rating: r.rating,
        text: r[`text${langSuffix}`] || r.text_uk,
        is_featured: r.is_featured,
        date: r.created_at
      })),
      gallery: (gallery || []).map(g => ({
        id: g.id,
        url: g.image_url,
        caption: g[`caption${langSuffix}`] || g.caption_uk
      })),
      theme: {
        name: site.theme,
        primaryColor: site.primary_color,
        secondaryColor: site.secondary_color,
        fontFamily: site.font_family,
        favicon: site.favicon_url
      },
      custom_head_code: site.custom_head_code || '',
      seo: {
        title: getLocalizedField('meta_title') || `${site.profiles.full_name} | ${site.profiles.title}`,
        description: getLocalizedField('meta_description') || getLocalizedField('bio')?.substring(0, 160),
        image: site.profiles.photo_url
      },
      legal: {
        offer: getLocalizedField('offer'),
        privacy_policy: getLocalizedField('privacy_policy'),
        disclaimer: getLocalizedField('disclaimer')
      },
      booking: {
        enabled: site.booking_enabled,
        payment_required: site.payment_required,
        busy_slots: busySlots || []
      },
      lang: lang,
      available_langs: ['uk', 'ru', 'en']
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Specialist page error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
