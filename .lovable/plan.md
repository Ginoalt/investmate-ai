# InvestBot Lab — Plan de construcción

Agente personal de análisis de mercados + paper trading. Todo simulado, sin ejecución real. Aviso educativo visible en toda la app.

## Stack
- Frontend: React + Tailwind + shadcn/ui, tema oscuro financiero (fondos casi negros, acentos verde/rojo para P/L, tipografía mono para cifras).
- Backend: **Lovable Cloud** (Supabase gestionado) — auth, Postgres con RLS, edge functions, secrets, cron.
- IA: **Lovable AI Gateway** (`google/gemini-2.5-flash` por defecto: barato y rápido para sentimiento + decisiones).
- APIs externas: CoinGecko (cripto, sin key), Alpha Vantage (acciones, key), CryptoPanic o NewsAPI (noticias, key).

## Fases

### Fase 1 — Fundaciones
- Activar Lovable Cloud.
- Design system oscuro en `src/styles.css` (tokens: bg, panel, border, positive, negative, warning, muted; fuente sans + mono para números).
- Layout con sidebar (Dashboard, Watchlist, Noticias, Portafolio, Decisiones, Config) + banner permanente arriba: *"Paper trading, sin dinero real. Herramienta educativa. No es asesoría financiera."*

### Fase 2 — Auth
- Página `/auth` (email + password, signUp con `emailRedirectTo`).
- Layout protegido `_authenticated` (gestionado por integración).
- Trigger `handle_new_user` que crea `profiles` y `portfolios` con saldo inicial $100 y guardarraíles por defecto.

### Fase 3 — Esquema DB (migración con GRANTs + RLS por `auth.uid()`)
- `profiles(id, email, created_at)`
- `watchlist(id, user_id, symbol, asset_type: 'crypto'|'stock', display_name)`
- `portfolios(id, user_id, cash_balance, initial_balance, is_paused, created_at)`
- `positions(id, portfolio_id, symbol, asset_type, quantity, avg_price)`
- `trades(id, portfolio_id, symbol, side: 'buy'|'sell', quantity, price, executed_at, decision_id, pnl)`
- `decisions(id, user_id, symbol, action: 'buy'|'sell'|'hold', confidence numeric, rationale text, indicators jsonb, sentiment jsonb, price_at_decision, created_at, outcome numeric null)`
- `news(id, symbol, headline, url, source, published_at, sentiment: 'positive'|'neutral'|'negative', sentiment_score, summary)` — cache compartido, RLS SELECT abierto a `authenticated`.
- `risk_settings(user_id pk, stop_loss_pct, max_daily_loss_pct, max_position_pct, agent_interval_minutes)`

### Fase 4 — Datos de mercado (edge functions)
- `market-price`: precios spot + histórico 7/30d. Ruta por `asset_type` a CoinGecko o Alpha Vantage. Cache in-memory corto para respetar rate limits.
- Hook `useAssetData(symbol)` con TanStack Query.
- Componentes: `WatchlistTable` (precio, %24h, sparkline), `AssetChart` (Recharts, toggle 7/30d).

### Fase 5 — Indicadores técnicos
- Utilidad TS pura: `sma(prices, n)`, `rsi(prices, 14)`, `trend()` (comparando SMA20 vs SMA50).
- Se calculan client-side sobre el histórico ya traído. Se muestran en la ficha de cada activo y se envían al agente.

### Fase 6 — Noticias + sentimiento
- Secret: `NEWS_API_KEY` (CryptoPanic por defecto, o NewsAPI).
- Edge `fetch-news`: por símbolo, trae titulares recientes, deduplica por url, para cada nuevo llama Lovable AI (`gemini-2.5-flash`) con prompt de clasificación → `{sentiment, score, summary}`, upsert en `news`.
- UI: feed por activo con badge de sentimiento y resumen.

### Fase 7 — Agente Super Trader
- Edge `agent-run` (invocable manual + cron cada N min vía pg_cron sobre la URL pública estable).
- Por cada activo en la watchlist del usuario:
  1. Trae precio + histórico → calcula indicadores.
  2. Trae últimas 5 noticias con sentimiento agregado.
  3. Prompt estructurado al LLM (Output.object con schema mínimo: action, confidence 0-1, rationale) — con guardarraíl try/catch por `NoObjectGeneratedError`.
  4. Inserta en `decisions`.
  5. Si `!is_paused` y confidence ≥ umbral, ejecuta la operación simulada respetando guardarraíles (tamaño máx por posición, saldo disponible, stop-loss sobre posiciones abiertas, corte por pérdida diaria).
- Botón "Ejecutar agente ahora" en UI para no depender del cron.

### Fase 8 — Portafolio simulado
- Motor de ejecución `paper-trade` (server fn / edge): valida guardarraíles, actualiza `positions` + `cash_balance`, inserta `trade` linkeado a la decisión.
- UI Portafolio: valor total (cash + posiciones a precio actual), P/L absoluto y %, tabla de posiciones con P/L por activo, historial de trades.
- Panel "¿El agente acierta?": % de decisiones ganadoras (comparando precio en decisión vs precio actual N horas después), gráfico de equity curve.

### Fase 9 — Guardarraíles + botón de pánico
- Página Config: stop-loss %, pérdida máx diaria %, tamaño máx por posición %, intervalo del agente.
- Botón **PÁNICO** (rojo, con confirm): edge `panic-liquidate` → vende todas las posiciones a precio actual, marca `portfolio.is_paused = true`.
- Toggle Pausar/Reanudar agente.

### Fase 10 — Pulido
- SEO básico (title, description, og en `__root.tsx`; og:image sólo en rutas hoja con imagen real).
- sitemap.xml + robots.txt + llms.txt.
- Estados de carga con skeletons, errores con toasts.

## Detalles técnicos clave
- Todas las tablas: `GRANT SELECT, INSERT, UPDATE, DELETE ... TO authenticated` + `GRANT ALL ... TO service_role`, luego `ENABLE RLS` + policies por `auth.uid() = user_id`.
- Roles no necesarios (single-user personal).
- Secrets: `NEWS_API_KEY`, `ALPHA_VANTAGE_KEY`. `LOVABLE_API_KEY` ya existe.
- Server fns para todo lo interno (`createServerFn`), server routes sólo para el webhook del cron (`/api/public/agent-tick` protegido con `AGENT_CRON_SECRET`).
- Sin datos ficticios sembrados: al primer login la watchlist arranca vacía con CTA para añadir BTC, ETH, AAPL, etc.

## Preguntas antes de arrancar
Voy a asumir estos defaults salvo que digas otra cosa:
1. **Fuente de noticias**: CryptoPanic (gratis, foco cripto) — sirve también para tickers cripto; si quieres cobertura de acciones uso NewsAPI.
2. **Intervalo del agente**: 15 min por defecto (ajustable en Config).
3. **Umbral de confianza para ejecutar**: 0.6.
4. **Idioma UI**: español (por tu prompt).
5. **Cron**: pg_cron llamando al endpoint público con secret; alternativa es sólo botón manual "Ejecutar ahora".

¿Arranco con estos defaults o cambias alguno?
