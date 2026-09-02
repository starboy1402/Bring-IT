-- Enable Realtime for the messages table
-- Phase 4 requires Realtime chat recovery, which relies on the `supabase_realtime` publication

begin;
  -- Add messages to the realtime publication if not already added
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'messages'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
    END IF;
  END
  $$;
commit;
