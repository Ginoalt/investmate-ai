DO $$ BEGIN PERFORM cron.unschedule('investbot-reoptimize-daily'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule('investbot-reoptimize-daily', '0 4 * * *', $cron$
  SELECT net.http_post(
    url := 'https://nrwhvcyxylsiwsbvlmwn.supabase.co/functions/v1/reoptimize',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'sb_publishable_iQZUsOqd6sqMrZXcIRqO6g_VCEkHf3E',
      'Authorization', 'Bearer sb_publishable_iQZUsOqd6sqMrZXcIRqO6g_VCEkHf3E'
    ),
    body := jsonb_build_object('mode', 'cron')
  );
$cron$);