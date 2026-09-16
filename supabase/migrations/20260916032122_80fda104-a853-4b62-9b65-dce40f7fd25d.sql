ALTER TABLE public.entities REPLICA IDENTITY FULL;
ALTER TABLE public.knowledge_grants REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.entities;
ALTER PUBLICATION supabase_realtime ADD TABLE public.knowledge_grants;