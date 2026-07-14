-- Activa que el bot corra SOLO, sin configuración manual.
--   - run-agent cada 30 min: analiza, decide y opera (paper) la watchlist.
--   - fetch-news cada 1 h: mantiene las noticias frescas.
--
-- Usa la clave publicable (pública, ya expuesta en el frontend) y el modo
-- {"mode":"cron"} que run-agent acepta sin secreto, para que arranque solo.
-- El impacto está acotado: paper trading sobre la config de cada usuario y
-- explicaciones gratis (sin costo de IA). Se puede endurecer luego con un
-- secret AGENT_CRON_SECRET.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN PERFORM cron.unschedule('investbot-agent-30m'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('investbot-news-1h');  EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('investbot-agent-30m', '*/30 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://nrwhvcyxylsiwsbvlmwn.supabase.co/functions/v1/run-agent',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_iQZUsOqd6sqMrZXcIRqO6g_VCEkHf3E',
      'Authorization', 'Bearer sb_publishable_iQZUsOqd6sqMrZXcIRqO6g_VCEkHf3E'
    ),
    body := jsonb_build_object('mode', 'cron')
  );
$cron$);

SELECT cron.schedule('investbot-news-1h', '0 * * * *', $cron$
  SELECT net.http_post(
    url := 'https://nrwhvcyxylsiwsbvlmwn.supabase.co/functions/v1/fetch-news',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_iQZUsOqd6sqMrZXcIRqO6g_VCEkHf3E',
      'Authorization', 'Bearer sb_publishable_iQZUsOqd6sqMrZXcIRqO6g_VCEkHf3E'
    ),
    body := '{}'::jsonb
  );
$cron$);
