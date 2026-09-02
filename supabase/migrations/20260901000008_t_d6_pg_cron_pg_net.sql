-- Idempotent provisioning of pg_cron and pg_net for the notification outbox worker
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- pg_cron is enabled by default in Supabase, but we can't CREATE EXTENSION pg_cron safely
-- without superuser in some environments. Supabase manages it. 
-- We just schedule the job.

DO $$
BEGIN
  -- Unschedule if it exists to be idempotent
  PERFORM cron.unschedule('process-notification-outbox');
  
  -- The url depends on the environment. We use a custom Postgres setting.
  -- e.g. ALTER DATABASE postgres SET app.settings.edge_function_url = 'http://...';
  -- Default to local kong if not set.
  PERFORM cron.schedule(
    'process-notification-outbox',
    '* * * * *',
    $cron$
      SELECT net.http_post(
        url => COALESCE(
          current_setting('app.settings.edge_function_url', true),
          'http://supabase-kong:8000/functions/v1/process-notification-outbox'
        ),
        headers => jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || COALESCE(
            current_setting('app.settings.notification_cron_secret', true),
            'local_cron_secret'
          )
        )
      );
    $cron$
  );
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE 'Failed to schedule cron: %', SQLERRM;
END;
$$;
