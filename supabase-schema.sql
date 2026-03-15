-- =============================================
-- KazarianWEBINARStudio - Supabase Schema
-- =============================================

-- Таблица сессий (консультации, вебинары)
CREATE TABLE sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Основная информация
  client_name TEXT,
  host_name TEXT DEFAULT 'Павел Казарьян',
  session_type TEXT DEFAULT 'consultation', -- 'consultation', 'webinar', 'recording'

  -- Время
  duration_seconds INTEGER,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,

  -- Контент
  transcription TEXT,
  protocol TEXT,
  summary TEXT,

  -- Файлы (URLs из Supabase Storage)
  audio_url TEXT,
  video_url TEXT,

  -- Оценка клиента
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  review_text TEXT,

  -- Метаданные
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Индексы для быстрого поиска
CREATE INDEX idx_sessions_created_at ON sessions(created_at DESC);
CREATE INDEX idx_sessions_client_name ON sessions(client_name);
CREATE INDEX idx_sessions_session_type ON sessions(session_type);

-- Включить Row Level Security (RLS)
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;

-- Политика: разрешить всё для аутентифицированных пользователей
-- (для начала оставим открытым, потом можно добавить auth)
CREATE POLICY "Allow all for now" ON sessions
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- =============================================
-- Storage Bucket для аудио/видео файлов
-- =============================================
-- Выполнить в Supabase Dashboard -> Storage:
-- 1. Создать bucket "recordings"
-- 2. Сделать его public или с политиками доступа

-- =============================================
-- Пример вставки данных
-- =============================================
-- INSERT INTO sessions (client_name, duration_seconds, transcription, protocol)
-- VALUES ('Иван Иванов', 1800, 'Текст транскрипции...', 'Текст протокола...');

-- =============================================
-- Функция для автоматического обновления updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.metadata = jsonb_set(
    COALESCE(NEW.metadata, '{}'::jsonb),
    '{updated_at}',
    to_jsonb(NOW())
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER sessions_updated_at
  BEFORE UPDATE ON sessions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
