// Todoist API Integration for Calendar Sessions

const TODOIST_API_KEY = process.env.TODOIST_API_KEY;
const TODOIST_API_URL = 'https://api.todoist.com/rest/v2';

const ALLOWED_ORIGINS = [
  'https://kazarian-webinar-ai-studio.netlify.app',
  'http://localhost:3000'
];

exports.handler = async (event, context) => {
  const origin = event.headers.origin || event.headers.Origin || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  const headers = {
    'Access-Control-Allow-Origin': allowedOrigin,
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

  if (!TODOIST_API_KEY) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Todoist API key not configured' })
    };
  }

  try {
    const body = JSON.parse(event.body);
    const { action, session, taskId } = body;

    const sessionTypeLabels = {
      primary: 'Первичная',
      followup: 'Повторная',
      group: 'Групповая',
      supervision: 'Супервизия',
      training: 'Тренинг'
    };

    if (action === 'create' && session) {
      // Create task in Todoist
      const taskContent = `🧠 ${session.client || 'Клиент'} — ${sessionTypeLabels[session.type] || 'Сессия'}`;
      const description = session.notes ? `Заметки: ${session.notes}` : '';

      // Format datetime for Todoist (YYYY-MM-DDTHH:MM)
      const dueString = `${session.date}T${session.time}`;

      const response = await fetch(`${TODOIST_API_URL}/tasks`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TODOIST_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: taskContent,
          description: description,
          due_datetime: dueString,
          priority: session.type === 'primary' ? 4 : 3, // P1 for primary, P2 for others
          labels: ['Сессия', sessionTypeLabels[session.type] || 'Консультация']
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Todoist API error: ${response.status} - ${errorText}`);
      }

      const task = await response.json();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          taskId: task.id,
          taskUrl: task.url
        })
      };

    } else if (action === 'update' && session && taskId) {
      // Update existing task
      const taskContent = `🧠 ${session.client || 'Клиент'} — ${sessionTypeLabels[session.type] || 'Сессия'}`;
      const dueString = `${session.date}T${session.time}`;

      const response = await fetch(`${TODOIST_API_URL}/tasks/${taskId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TODOIST_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          content: taskContent,
          description: session.notes || '',
          due_datetime: dueString
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Todoist update error: ${response.status} - ${errorText}`);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };

    } else if (action === 'delete' && taskId) {
      // Delete task from Todoist
      const response = await fetch(`${TODOIST_API_URL}/tasks/${taskId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${TODOIST_API_KEY}`
        }
      });

      if (!response.ok && response.status !== 404) {
        const errorText = await response.text();
        throw new Error(`Todoist delete error: ${response.status} - ${errorText}`);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };

    } else if (action === 'complete' && taskId) {
      // Mark task as complete
      const response = await fetch(`${TODOIST_API_URL}/tasks/${taskId}/close`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${TODOIST_API_KEY}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Todoist complete error: ${response.status} - ${errorText}`);
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true })
      };

    } else if (action === 'list') {
      // Get upcoming tasks
      const response = await fetch(`${TODOIST_API_URL}/tasks?filter=today | overdue | 7 days`, {
        headers: {
          'Authorization': `Bearer ${TODOIST_API_KEY}`
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Todoist list error: ${response.status} - ${errorText}`);
      }

      const tasks = await response.json();

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          tasks: tasks
        })
      };

    } else if (action === 'check') {
      // Check connection
      const response = await fetch(`${TODOIST_API_URL}/projects`, {
        headers: {
          'Authorization': `Bearer ${TODOIST_API_KEY}`
        }
      });

      if (!response.ok) {
        throw new Error('Invalid API key');
      }

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          success: true,
          connected: true
        })
      };

    } else {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid action' })
      };
    }

  } catch (error) {
    console.error('Todoist sync error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: error.message })
    };
  }
};
