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