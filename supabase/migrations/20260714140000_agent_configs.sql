-- Config óptima por moneda que el agente usa para decidir.
-- La escribe el usuario desde el optimizador (la config robusta que elija);
-- el agente la lee en cada corrida. Si no hay config para una moneda, usa
-- los valores por defecto.
CREATE TABLE public.agent_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL, -- par Binance, ej. "BTCUSDT"
  params JSONB NOT NULL,
  in_sample_return NUMERIC,
  out_of_sample_return NUMERIC,
  robust BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_configs TO authenticated;
GRANT ALL ON public.agent_configs TO service_role;

ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own agent configs"
  ON public.agent_configs FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
