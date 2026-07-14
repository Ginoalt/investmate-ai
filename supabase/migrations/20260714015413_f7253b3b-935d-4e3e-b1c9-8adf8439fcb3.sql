
-- Enums
CREATE TYPE public.asset_type AS ENUM ('crypto', 'stock');
CREATE TYPE public.trade_side AS ENUM ('buy', 'sell');
CREATE TYPE public.decision_action AS ENUM ('buy', 'sell', 'hold');
CREATE TYPE public.news_sentiment AS ENUM ('positive', 'neutral', 'negative');

-- profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own profile read" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "own profile write" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- watchlist
CREATE TABLE public.watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  asset_type public.asset_type NOT NULL,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, symbol, asset_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.watchlist TO authenticated;
GRANT ALL ON public.watchlist TO service_role;
ALTER TABLE public.watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own watchlist" ON public.watchlist FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- portfolios
CREATE TABLE public.portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  cash_balance NUMERIC(18,4) NOT NULL DEFAULT 100,
  initial_balance NUMERIC(18,4) NOT NULL DEFAULT 100,
  is_paused BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.portfolios TO authenticated;
GRANT ALL ON public.portfolios TO service_role;
ALTER TABLE public.portfolios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own portfolio" ON public.portfolios FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- positions
CREATE TABLE public.positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  asset_type public.asset_type NOT NULL,
  quantity NUMERIC(24,8) NOT NULL DEFAULT 0,
  avg_price NUMERIC(18,8) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(portfolio_id, symbol, asset_type)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.positions TO authenticated;
GRANT ALL ON public.positions TO service_role;
ALTER TABLE public.positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own positions" ON public.positions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- trades
CREATE TABLE public.trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.portfolios(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  asset_type public.asset_type NOT NULL,
  side public.trade_side NOT NULL,
  quantity NUMERIC(24,8) NOT NULL,
  price NUMERIC(18,8) NOT NULL,
  total_value NUMERIC(18,4) NOT NULL,
  pnl NUMERIC(18,4),
  decision_id UUID,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trades TO authenticated;
GRANT ALL ON public.trades TO service_role;
ALTER TABLE public.trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own trades" ON public.trades FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- decisions
CREATE TABLE public.decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  asset_type public.asset_type NOT NULL,
  action public.decision_action NOT NULL,
  confidence NUMERIC(4,3) NOT NULL,
  rationale TEXT NOT NULL,
  indicators JSONB,
  sentiment JSONB,
  price_at_decision NUMERIC(18,8) NOT NULL,
  executed BOOLEAN NOT NULL DEFAULT false,
  outcome NUMERIC(10,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.decisions TO authenticated;
GRANT ALL ON public.decisions TO service_role;
ALTER TABLE public.decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own decisions" ON public.decisions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- news (cache compartido)
CREATE TABLE public.news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  headline TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  source TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  sentiment public.news_sentiment,
  sentiment_score NUMERIC(4,3),
  summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX news_symbol_published_idx ON public.news(symbol, published_at DESC);
GRANT SELECT ON public.news TO authenticated;
GRANT ALL ON public.news TO service_role;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read news" ON public.news FOR SELECT TO authenticated USING (true);

-- risk_settings
CREATE TABLE public.risk_settings (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stop_loss_pct NUMERIC(5,2) NOT NULL DEFAULT 10,
  max_daily_loss_pct NUMERIC(5,2) NOT NULL DEFAULT 5,
  max_position_pct NUMERIC(5,2) NOT NULL DEFAULT 25,
  min_confidence NUMERIC(4,3) NOT NULL DEFAULT 0.6,
  agent_interval_minutes INTEGER NOT NULL DEFAULT 15,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.risk_settings TO authenticated;
GRANT ALL ON public.risk_settings TO service_role;
ALTER TABLE public.risk_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own risk" ON public.risk_settings FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Trigger: create profile + portfolio + risk on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles(id, email) VALUES (NEW.id, NEW.email);
  INSERT INTO public.portfolios(user_id) VALUES (NEW.id);
  INSERT INTO public.risk_settings(user_id) VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
