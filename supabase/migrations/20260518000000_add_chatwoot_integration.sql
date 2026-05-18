-- Integração com Chatwoot: espelho de campanhas e forward de eventos
ALTER TABLE public.campaigns
  ADD COLUMN IF NOT EXISTS chatwoot_sync boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS chatwoot_label text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS chatwoot_agent_id integer DEFAULT NULL;

-- Settings para conexão com Chatwoot
-- Inserir via painel do Supabase ou substituir os valores abaixo
INSERT INTO public.settings (key, value) VALUES
  ('chatwoot_base_url',    ''),
  ('chatwoot_api_token',   ''),
  ('chatwoot_account_id',  ''),
  ('chatwoot_inbox_id',    ''),
  ('chatwoot_webhook_url', '')
ON CONFLICT (key) DO NOTHING;
