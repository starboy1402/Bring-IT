import { execSync } from 'child_process';

try {
  const useDocker = process.env.CI !== 'true';
  const cmd = useDocker
    ? `docker exec supabase_db_bringit psql -U postgres -d postgres -t -A -c "SELECT count(*) FROM cron.job WHERE jobname = 'process-notification-outbox'"`
    : `psql -d "postgresql://postgres:postgres@localhost:54322/postgres" -t -A -c "SELECT count(*) FROM cron.job WHERE jobname = 'process-notification-outbox'"`;

  const output = execSync(cmd, { encoding: 'utf-8' });
  const count = parseInt(output.trim(), 10);
  if (count !== 1) {
    console.error("Expected exactly 1 cron job, found " + count);
    process.exit(1);
  }
  console.log("Cron job verified successfully (count: " + count + ")");
} catch (e) {
  console.error("Failed to run psql or verify cron job: " + e.message);
  process.exit(1);
}
