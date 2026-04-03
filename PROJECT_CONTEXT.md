# KazarianWEBINARStudio - Контекст проекта

## Общая информация

**Название:** KazarianWEBINARStudio (Kazarian AI Webinar Studio)
**Владелец:** Павел Казарьян (pavel.kazarjan@gmail.com)
**Назначение:** SaaS-платформа для проведения вебинаров, консультаций и онлайн-трансляций

**Production URL:** https://kazarian-webinar-ai-studio.netlify.app
**Netlify Admin:** https://app.netlify.com/projects/kazarian-webinar-ai-studio

---

## Структура проекта

```
C:\Users\pavel\webinar-studio-saas\
├── public/                     # Статические файлы (фронтенд)
│   ├── app.html               # ГЛАВНЫЙ ФАЙЛ (~19000+ строк) - студия хоста
│   ├── watch.html             # Страница клиента консультации
│   ├── login.html             # Авторизация
│   ├── profile.html           # Профиль пользователя
│   ├── producer.html          # Продюсер трансляции
│   ├── index.html             # Лендинг
│   └── auth/
│       └── callback.html      # OAuth callback + сброс пароля
├── netlify/
│   └── functions/             # Serverless функции
│       ├── auth.js            # Аутентификация
│       ├── gemini-generate.js # AI генерация (Gemini)
│       ├── save-review.js     # Сохранение отзывов
│       └── package.json       # Зависимости функций
├── netlify.toml               # Конфигурация Netlify
└── PROJECT_CONTEXT.md         # Этот файл
```

---

## Технологический стек

### Frontend
- **Vanilla JS** (без фреймворков)
- **PeerJS** - WebRTC для видеозвонков
- **Supabase JS** - база данных и авторизация
- **Canvas API** - рендеринг видео, слайдов, оверлеев

### Backend (Netlify Functions)
- **Node.js 18**
- **Supabase** (PostgreSQL + Realtime)
- **Google Gemini API** - AI анализ
- **Google Calendar API** - синхронизация расписания

### Инфраструктура
- **Netlify** - хостинг и деплой
- **Supabase** - БД, авторизация, realtime
- **PeerJS Server** - кастомный на peerjs.tgcombain.org.ua

---

## Деплой

### Команда деплоя:
```bash
cd "C:\Users\pavel\webinar-studio-saas" && netlify deploy --prod
```

### Environment Variables (Netlify):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `GEMINI_API_KEY`
- `OPENAI_API_KEY`
- `GOOGLE_CALENDAR_ID`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_KEY`
- `RESEND_API_KEY`
- `AUTH_PASSWORD`
- `CONSULTATION_API_TOKEN`

---

## Ключевые файлы и что в них искать

### app.html (главный файл)
| Строки (примерно) | Что там |
|-------------------|---------|
| 1-100 | Meta, in-app browser detection |
| 2700-3000 | HTML: guest-waiting-toast, кнопки |
| 3290-3320 | Кнопки консультации (btn-consultation, btn-hangup, btn-invite-second) |
| 5290-5400 | Client registration в waiting_clients |
| 8476-8500 | Глобальные переменные (guestStream, guestStream2, MAX_GUESTS) |
| 9190-9280 | Supabase init, auth check |
| 9360-9410 | Realtime подписка на waiting_clients (уведомления о клиентах) |
| 9400-9510 | showSupabaseGuestNotification, admitSupabaseClient |
| 10520-10780 | initConsultationPeer - PeerJS для консультаций |
| 10650-10760 | consultationPeer.on('call') - обработка входящих звонков |
| 11140-11260 | enableThreeParticipantMode, disableThreeParticipantMode |
| 11203-11280 | stopGuestConnection - отключение гостей |
| 11220-11250 | Cross-connect audio+video между клиентами |
| 12160-12200 | Второй блок cross-connect |
| 14760-14840 | btnCamera handler |
| 14830-14850 | btnMirror handler (зеркало хоста) |
| 15300-15400 | Canvas rendering (watermark, overlays) |
| 17500-17700 | Recording canvas render loop |

### watch.html (клиент консультации)
- Зал ожидания (waiting room)
- Регистрация в Supabase waiting_clients
- PeerJS подключение к хосту
- UI для клиента во время консультации

### netlify.toml
- CSP headers
- Redirects (/c/* -> functions)
- Build settings

---

## База данных (Supabase)

### Таблица: profiles
```sql
id (uuid, PK, references auth.users)
full_name (text)
title (text)
watermark_text (text)  -- для водяного знака в записи
```

### Таблица: waiting_clients
```sql
id (uuid, PK)
session_id (text)      -- ID консультации
client_name (text)
status (text)          -- 'waiting', 'admitted', 'rejected', 'scheduled'
scheduled_time (timestamp)
calendar_event_id (text)
created_at (timestamp)
```

---

## Последние выполненные работы (Апрель 2026)

### 1. Парные консультации (3 участника)
- **Проблема:** Второй клиент не мог подключиться к консультации
- **Решение:**
  - Убрана блокировка уведомлений по session_id (теперь только по record ID)
  - Каждый клиент создаёт свою запись в waiting_clients (через sessionStorage)
  - Добавлена кнопка "+ Пригласить" (btn-invite-second)
  - Cross-connect: клиенты видят и слышат друг друга (audio + video)

### 2. Кнопка зеркала хоста
- Добавлена кнопка btn-mirror
- Переключает scaleX(-1) на cameraVideo и splitCamera

### 3. Водяной знак в записи
- Берётся из userProfile.watermark_text
- Рисуется в правом нижнем углу recording canvas

### 4. Исправления багов
- XSS уязвимости (innerHTML -> textContent)
- Password reset flow (redirectTo -> /auth/callback.html)
- Profile loading race condition
- Calendar concurrent event prevention
- Calendar deletion rollback fix

### 5. CSP headers
- Обновлены для разрешения всех необходимых доменов

---

## Как работает консультация

### Поток хоста:
1. Хост нажимает "Консультация" -> создаётся session_id
2. Создаётся consultationPeer с этим ID
3. Хост получает ссылку: `/watch.html?session=SESSION_ID`
4. Отправляет клиенту

### Поток клиента:
1. Клиент открывает watch.html
2. Регистрируется в waiting_clients (status: 'waiting')
3. Ждёт в "зале ожидания"
4. Хост получает уведомление через Supabase Realtime
5. Хост нажимает "Одобрить" -> status меняется на 'admitted'
6. Клиент получает обновление, звонит хосту через PeerJS
7. Устанавливается видеосвязь

### Парная консультация (3 участника):
1. Первый клиент подключается (guestStream, slot 0)
2. Появляется кнопка "+ Пригласить"
3. Хост копирует ту же ссылку, отправляет второму
4. Второй клиент регистрируется (новая запись в waiting_clients)
5. Хост получает второе уведомление, одобряет
6. Второй подключается (guestStream2, slot 1)
7. Cross-connect: треки клиентов добавляются друг другу
8. Все трое видят и слышат друг друга

---

## Известные проблемы / TODO

1. **Multiple GoTrueClient instances** - предупреждение в консоли (не критично)
2. **PeerJS reconnection** - иногда теряется соединение, есть retry логика
3. **STREAM_SERVER_API_KEY** - задокументировано для переноса в Netlify Function

---

## Команды для отладки

```bash
# Деплой
cd "C:\Users\pavel\webinar-studio-saas" && netlify deploy --prod

# Статус Netlify
netlify status

# Логи функций
netlify functions:log

# Переменные окружения
netlify env:list
```

---

## Контакты и ресурсы

- **Netlify:** https://app.netlify.com/projects/kazarian-webinar-ai-studio
- **Supabase:** Dashboard проекта (ngxbfuimddefjeufwcwf)
- **PeerJS Server:** peerjs.tgcombain.org.ua:443

---

*Последнее обновление: 2026-04-05*
