-- Local and CI Provisioning for Cron
-- Set configuration for the current session and for future connections
SELECT set_config('app.settings.edge_function_url', 'http://supabase-kong:8000/functions/v1/process-notification-outbox', false);
SELECT set_config('app.settings.notification_cron_secret', 'test-cron-secret-123', false);

-- Now explicitly schedule the cron job since migration 0010 safely skipped it
DO $$
DECLARE
  job_record RECORD;
  func_url text;
  cron_secret text;
BEGIN
  FOR job_record IN SELECT jobid FROM cron.job WHERE jobname = 'process-notification-outbox' LOOP
    PERFORM cron.unschedule(job_record.jobid);
  END LOOP;

  func_url := current_setting('app.settings.edge_function_url', true);
  cron_secret := current_setting('app.settings.notification_cron_secret', true);

  IF func_url IS NOT NULL AND func_url != '' AND cron_secret IS NOT NULL AND cron_secret != '' THEN
    PERFORM cron.schedule(
      'process-notification-outbox',
      '* * * * *',
      format(
        'SELECT net.http_post(url => %L, headers => jsonb_build_object(''Content-Type'', ''application/json'', ''Authorization'', ''Bearer '' || %L))',
        func_url, cron_secret
      )
    );
  END IF;
END $$;
