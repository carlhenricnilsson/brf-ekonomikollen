-- ============================================================
-- BRF-admin, betalningar och vouchers
-- Kör detta i Supabase SQL Editor
-- ============================================================

-- Kopplingstabell: vilka BRF:er en brf_admin har tillgång till
CREATE TABLE IF NOT EXISTS brf_admin_brfs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brf_base_name text NOT NULL,  -- t.ex. "BRF Solgläntan" (utan år)
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_brf_admin_brfs_user ON brf_admin_brfs(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_brf_admin_brfs_unique ON brf_admin_brfs(user_id, brf_base_name);

-- Betalningar per rapport
CREATE TABLE IF NOT EXISTS payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  survey_id uuid NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
  amount_sek integer NOT NULL DEFAULT 5995,  -- pris i SEK
  status text NOT NULL DEFAULT 'pending',     -- pending, completed, refunded
  stripe_payment_intent_id text,
  stripe_session_id text,
  voucher_id uuid REFERENCES vouchers(id),
  created_at timestamptz DEFAULT now(),
  paid_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_survey ON payments(survey_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_survey_user ON payments(user_id, survey_id);

-- Vouchers (rabattkoder från superadmin)
CREATE TABLE IF NOT EXISTS vouchers (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  discount_percent integer NOT NULL DEFAULT 100,  -- 100 = helt gratis
  max_uses integer DEFAULT 1,
  times_used integer DEFAULT 0,
  created_by uuid REFERENCES auth.users(id),
  valid_until timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(code);

-- Invitations
CREATE TABLE IF NOT EXISTS invitations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text NOT NULL,
  brf_base_name text,
  invited_by uuid REFERENCES auth.users(id),
  accepted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Säkerställ att user_profiles har rätt kolumner
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE user_profiles ADD COLUMN IF NOT EXISTS phone text;
