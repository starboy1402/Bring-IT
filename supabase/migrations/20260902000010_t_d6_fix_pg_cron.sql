-- Idempotent provisioning of pg_cron and pg_net for the notification outbox worker
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $$
DECLARE
  job_record RECORD;
  func_url text;
  cron_secret text;
BEGIN
  -- Unschedule matching jobs by existing jobid only and handle duplicates
  FOR job_record IN SELECT jobid FROM cron.job WHERE jobname = 'process-notification-outbox' LOOP
    PERFORM cron.unschedule(job_record.jobid);
  END LOOP;

  -- Read configuration safely using current_setting(..., true) to return null if missing
  func_url := current_setting('app.settings.edge_function_url', true);
  cron_secret := current_setting('app.settings.notification_cron_secret', true);

  -- Only schedule if config is explicitly provided and not empty
  IF func_url IS NOT NULL AND func_url != '' AND cron_secret IS NOT NULL AND cron_secret != '' THEN
    PERFORM cron.schedule(
      'process-notification-outbox',
      '* * * * *',
      format(
        'SELECT net.http_post(url => %L, headers => jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', ''Bearer '' || %L))',
        func_url, cron_secret
      )
    );
  ELSE
    RAISE NOTICE 'Missing app.settings.edge_function_url or app.settings.notification_cron_secret. Cron job process-notification-outbox NOT scheduled.';
    -- Production Provisioning: Set these settings via SQL (ALTER DATABASE postgres SET app.settings.edge_function_url = '...') before applying migrations, or via Vault.
    -- Local/CI Provisioning: Inject via [db.settings.custom_db_config] in supabase/config.toml, or directly via setup script.
  END IF;
END $$;
