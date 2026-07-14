-- Histórico del valor del portafolio para dibujar la curva de evolución.
-- El agente escribe un snapshot cada vez que corre (manual o por cron).
CREATE TABLE public.portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  equity NUMERIC(18,4) NOT NULL,
  cash NUMERIC(18,4) NOT NULL,
  positions_value NUMERIC(18,4) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX portfolio_snapshots_user_time_idx
  ON public.portfolio_snapshots(user_id, created_at);

GRANT SELECT ON public.portfolio_snapshots TO authenticated;
GRANT ALL ON public.portfolio_snapshots TO service_role;

ALTER TABLE public.portfolio_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own snapshots read"
  ON public.portfolio_snapshots FOR SELECT
  USING (auth.uid() = user_id);
