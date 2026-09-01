CREATE TABLE public.telegram_verifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  identifier TEXT NOT NULL,
  identifier_type TEXT NOT NULL DEFAULT 'username',
  status TEXT NOT NULL DEFAULT 'pending',
  telegram_user_id BIGINT,
  telegram_username TEXT,
  telegram_first_name TEXT,
  error_message TEXT,
  verified_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_telegram_verifications_code ON public.telegram_verifications (code);

GRANT ALL ON public.telegram_verifications TO service_role;
ALTER TABLE public.telegram_verifications ENABLE ROW LEVEL SECURITY;