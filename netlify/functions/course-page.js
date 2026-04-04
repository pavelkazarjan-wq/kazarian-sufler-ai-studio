// API for public course landing pages
// GET: Returns course data for public site rendering

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

    // Get site data with profile (course type)
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
      .eq('site_type', 'course')
      .single();

    if (siteError || !site) {
      return {
        statusCode: 404,
        headers,
        body: JSON.stringify({ error: 'Course not found' })
      };
    }

    // Get course modules
    const { data: modules } = await supabase
      .from('course_modules')
      .select('*')
      .eq('site_id', site.id)
      .eq('is_active', true)
      .order('sort_order');

    // Get approved reviews
    const { data: reviews } = await supabase
      .from('specialist_reviews')
      .select('*')
      .eq('site_id', site.id)
      .eq('is_approved', true)
      .order('is_featured', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(12);

    // Language helpers
    const langSuffix = `_${lang}`;
    const fallbackLang = '_uk';

    const getLocalizedField = (base) => {
      return site[base + langSuffix] || site[base + fallbackLang] || site[base + '_uk'] || '';
    };

    const getLocalizedArray = (base) => {
      return site[base + langSuffix] || site[base + fallbackLang] || site[base + '_uk'] || [];
    };

    const getSitePhoto = () => {
      return site[`site_photo_url${langSuffix}`] || site.site_photo_url_uk || site.site_photo_url || site.profiles.photo_url;
    };

    // Parse course-specific data from JSON fields
    const parseCourseField = (fieldName) => {
      try {
        const field = site[fieldName];
        if (!field) return [];
        if (typeof field === 'string') return JSON.parse(field);
        return field;
      } catch {
        return [];
      }
    };

    // Build benefits array
    const benefits = [];
    for (let i = 1; i <= 4; i++) {
      const title = site[`benefit_${i}_title${langSuffix}`] || site[`benefit_${i}_title_uk`];
      const text = site[`benefit_${i}_text${langSuffix}`] || site[`benefit_${i}_text_uk`];
      if (title || text) {
        benefits.push({ title, text });
      }
    }

    // Build audience array
    const audience = [];
    for (let i = 1; i <= 4; i++) {
      const title = site[`avatar_${i}_title${langSuffix}`] || site[`avatar_${i}_title_uk`];
      const text = site[`avatar_${i}_text${langSuffix}`] || site[`avatar_${i}_text_uk`];
      if (title || text) {
        audience.push({ title, text });
      }
    }

    // Build results array
    const results = [];
    for (let i = 1; i <= 8; i++) {
      const result = site[`result_${i}${langSuffix}`] || site[`result_${i}_uk`];
      if (result) {
        results.push(result);
      }
    }

    // Build FAQ from JSON field
    const faq = parseCourseField(`faq${langSuffix}`) || parseCourseField('faq_uk') || [];

    // Build response
    const response = {
      course: {
        title: site[`course_title${langSuffix}`] || site.course_title_uk || getLocalizedField('headline'),
        subtitle: site[`course_subtitle${langSuffix}`] || site.course_subtitle_uk || getLocalizedField('bio'),
        description: site[`course_description${langSuffix}`] || site.course_description_uk,
        photo: getSitePhoto(),
        price: site.course_price,
        salePrice: site.course_sale_price,
        showTimer: site.course_show_timer,
        timerEnd: site.course_timer_end,
        videoUrl: getLocalizedField('youtube_video_url'),
        videoTitle: getLocalizedField('video_title'),
        metaTitle: getLocalizedField('meta_title') || site[`course_title${langSuffix}`] || site.course_title_uk,
        metaDescription: getLocalizedField('meta_description') || site[`course_subtitle${langSuffix}`] || site.course_subtitle_uk,
        finalTitle: site[`final_title${langSuffix}`] || site.final_title_uk,
        finalSubtitle: site[`final_subtitle${langSuffix}`] || site.final_subtitle_uk,
        guarantee: site[`guarantee${langSuffix}`] || site.guarantee_uk
      },
      author: {
        name: site.profiles.full_name,
        title: site.profiles.title,
        photo: site.profiles.photo_url,
        bio: getLocalizedField('bio'),
        specializations: getLocalizedArray('specializations'),
        experience: site.experience_years,
        diplomas: site.diplomas || []
      },
      modules: (modules || []).map(m => ({
        id: m.id,
        title: m[`title${langSuffix}`] || m.title_uk,
        description: m[`description${langSuffix}`] || m.description_uk,
        result: m[`result${langSuffix}`] || m.result_uk
      })),
      benefits,
      audience,
      results,
      faq,
      reviews: (reviews || []).map(r => ({
        id: r.id,
        name: r.client_name,
        photo: r.client_photo_url,
        rating: r.rating,
        text: r[`text${langSuffix}`] || r.text_uk
      })),
      theme: {
        name: site.theme,
        primaryColor: site.primary_color,
        secondaryColor: site.secondary_color,
        fontFamily: site.font_family,
        favicon: site.favicon_url
      },
      custom_head_code: site.custom_head_code || '',
      contacts: {
        phone: site.show_phone ? site.profiles.phone : null,
        telegram: site.show_telegram ? site.profiles.telegram : null,
        email: site.show_email ? site.profiles.legal_email : null,
        instagram: site.profiles.instagram,
        youtube: site.profiles.youtube
      },
      legal: {
        offer: getLocalizedField('offer'),
        privacy_policy: getLocalizedField('privacy_policy')
      },
      lang,
      available_langs: ['uk', 'ru', 'en']
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Course page error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
