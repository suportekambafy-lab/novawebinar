-- Optimização automática do tráfego: a partir de N dias, o tráfego desloca-se todos os dias para a variante
-- que vai à frente (ver src/lib/ab-tests/optimize.ts). `optimized_at` marca a última passagem.
ALTER TABLE public.ab_tests
  ADD COLUMN IF NOT EXISTS auto_optimize_after_days integer NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS optimized_at timestamptz;
