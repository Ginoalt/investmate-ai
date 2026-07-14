-- El bot se re-optimiza SOLO: cada día a las 04:00 UTC llama a "reoptimize",
-- que reoptimiza un grupo rotativo de monedas (cubre el universo en ~1 semana)
-- y guarda la mejor config robusta en agent_configs. Se adapta al mercado.
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
