// Edge function: el "agente super trader".
//
// Decide con REGLAS (barato y robusto) combinando flujo de órdenes + técnico +
// sentimiento de noticias, y usa la IA SOLO para redactar la explicación
// (con fallback a texto templado si la IA no está disponible).
//
// Modos:
//   - Manual: el frontend lo invoca con el JWT del usuario -> analiza una
//     moneda (body {symbol}) o toda su watchlist.
//   - Cron: se invoca con el header x-agent-secret == AGENT_CRON_SECRET ->
//     analiza la watchlist de todos los usuarios con portafolio no pausado.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SPOT = "https://data-api.binance.vision/api/v3";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-secret",
};

// ---------- señales de mercado (server-side) ----------

function sma(v: number[], p: number): number | null {
  if (v.length < p) return null;
  return v.slice(-p).reduce((a, b) => a + b, 0) / p;
}
function rsi(v: number[], p = 14): number | null {
  if (v.length < p + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) {
    const d = v[i] - v[i - 1];
    if (d >= 0) g += d; else l -= d;
  }
  let ag = g / p, al = l / p;
  for (let i = p + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    ag = (ag * (p - 1) + (d > 0 ? d : 0)) / p;
    al = (al * (p - 1) + (d < 0 ? -d : 0)) / p;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}

function emaSeries(v: number[], p: number): (number | null)[] {
  const out: (number | null)[] = new Array(v.length).fill(null);
  if (v.length < p) return out;
  const k = 2 / (p + 1);
  let prev = v.slice(0, p).reduce((a, b) => a + b, 0) / p;
  out[p - 1] = prev;
  for (let i = p; i < v.length; i++) {
    prev = v[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

/** MACD score -1..1. */
function macdScore(v: number[]): number {
  if (v.length < 35) return 0;
  const ef = emaSeries(v, 12), es = emaSeries(v, 26);
  const ml = v.map((_, i) => (ef[i] != null && es[i] != null ? (ef[i] as number) - (es[i] as number) : null));
  const clean = ml.filter((x): x is number => x != null);
  const sa = emaSeries(clean, 9);
  const mv = clean[clean.length - 1], sv = sa[sa.length - 1];
  if (mv == null || sv == null) return 0;
  const price = v[v.length - 1] || 1;
  return Math.max(-1, Math.min(1, ((mv - sv) / price) * 300));
}

/** Bollinger score -1..1 (positivo = cerca de banda inferior). */
function bollScore(v: number[], p = 20, mult = 2): number {
  if (v.length < p) return 0;
  const s = v.slice(-p);
  const mid = s.reduce((a, b) => a + b, 0) / p;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mid) ** 2, 0) / p);
  const up = mid + mult * sd, lo = mid - mult * sd;
  const price = v[v.length - 1];
  const w = up - lo;
  const pb = w > 0 ? (price - lo) / w : 0.5;
  return Math.max(-1, Math.min(1, (0.5 - pb) * 2));
}

/** Fibonacci score -1..1 sobre el swing de las últimas velas. */
function fibScore(
  candles: { high: number; low: number; close: number }[],
  lookback = 60,
): number {
  const s = candles.slice(-lookback);
  if (s.length < 10) return 0;
  let hi = -Infinity, lo = Infinity, hiI = 0, loI = 0;
  s.forEach((c, i) => {
    if (c.high > hi) { hi = c.high; hiI = i; }
    if (c.low < lo) { lo = c.low; loI = i; }
  });
  const trend = hiI >= loI ? "up" : "down";
  const range = hi - lo || 1;
  const price = s[s.length - 1].close;
  const retr = trend === "up" ? (hi - price) / range : (price - lo) / range;
  if (trend === "up") {
    if (retr >= 0.3 && retr <= 0.65) return 0.6;
    if (retr > 0.8) return -0.5;
    if (retr < 0.15) return 0.15;
  } else {
    if (retr >= 0.3 && retr <= 0.65) return -0.6;
    if (retr > 0.8) return 0.5;
  }
  return 0;
}

async function marketSignals(pair: string) {
  // 150 velas: suficiente para la media de régimen (SMA100) y el resto.
  const kl = await fetch(`${SPOT}/klines?symbol=${pair}&interval=1d&limit=150`);
  const candles = (await kl.json()) as unknown[][];
  const closes = candles.map((c) => Number(c[4]));
  const ohlc = candles.map((c) => ({
    high: Number(c[2]),
    low: Number(c[3]),
    close: Number(c[4]),
  }));
  const volumes = candles.map((c) => Number(c[5]));
  const volWindow = volumes.slice(-20);
  const volAvg = volWindow.reduce((a, b) => a + b, 0) / (volWindow.length || 1);
  const volumeRatio = volAvg > 0 ? volumes[volumes.length - 1] / volAvg : 1;
  const price = closes[closes.length - 1] ?? 0;
  const r = rsi(closes, 14);
  const s20 = sma(closes, 20), s50 = sma(closes, 50);
  const macd = macdScore(closes);
  const boll = bollScore(closes);
  const fib = fibScore(ohlc);
  // Régimen de mercado: alcista si el precio está sobre su media de largo plazo.
  const regimeSma = sma(closes, 100) ?? sma(closes, 50);
  const regimeBullish = regimeSma == null || price > regimeSma;
  let trend: "alcista" | "bajista" | "lateral" = "lateral";
  if (s20 != null && s50 != null) {
    const spread = (s20 - s50) / s50;
    if (spread > 0.005 && price > s20) trend = "alcista";
    else if (spread < -0.005 && price < s20) trend = "bajista";
  }

  // order book imbalance (±1%)
  let imbalance = 0;
  try {
    const dp = await fetch(`${SPOT}/depth?symbol=${pair}&limit=500`);
    const d = (await dp.json()) as { bids: [string, string][]; asks: [string, string][] };
    const mid = (Number(d.bids[0][0]) + Number(d.asks[0][0])) / 2;
    const band = mid * 0.01;
    let bid = 0, ask = 0;
    for (const [p, q] of d.bids) { if (Number(p) < mid - band) break; bid += Number(q); }
    for (const [p, q] of d.asks) { if (Number(p) > mid + band) break; ask += Number(q); }
    if (bid + ask > 0) imbalance = (bid - ask) / (bid + ask);
  } catch (_e) { /* si falla, imbalance 0 */ }

  // CVD (agresión) de trades recientes
  let cvd = 0;
  try {
    const tr = await fetch(`${SPOT}/aggTrades?symbol=${pair}&limit=1000`);
    const trades = (await tr.json()) as { p: string; q: string; m: boolean }[];
    let buy = 0, sell = 0;
    for (const t of trades) {
      const n = Number(t.p) * Number(t.q);
      if (t.m) sell += n; else buy += n;
    }
    if (buy + sell > 0) cvd = (buy / (buy + sell) - 0.5) * 2;
  } catch (_e) { /* idem */ }

  return { price, rsi: r, trend, imbalance, cvd, macd, boll, fib, regimeBullish, volumeRatio };
}

// ---------- decisión por reglas ----------

type Signals = Awaited<ReturnType<typeof marketSignals>> & {
  newsScore: number;
};

function decide(s: Signals, threshold = 0.2) {
  const trendScore = s.trend === "alcista" ? 1 : s.trend === "bajista" ? -1 : 0;
  let rsiBias = 0;
  if (s.rsi != null) {
    if (s.rsi < 30) rsiBias = 0.5; // sobrevendido -> sesgo compra
    else if (s.rsi > 70) rsiBias = -0.5; // sobrecomprado -> sesgo venta
  }
  // Flujo de órdenes sigue pesando fuerte (0.5), + análisis técnico avanzado
  // (0.4: tendencia, MACD, Fibonacci, Bollinger) + noticias/RSI (0.1).
  const score =
    0.3 * s.imbalance +
    0.2 * s.cvd +
    0.15 * trendScore +
    0.1 * s.macd +
    0.1 * s.fib +
    0.05 * s.boll +
    0.05 * s.newsScore +
    0.05 * rsiBias;

  let action: "buy" | "sell" | "hold" = "hold";
  if (score > threshold) action = "buy";
  else if (score < -threshold) action = "sell";

  const confidence = Math.max(0.05, Math.min(0.95, 0.35 + Math.abs(score) * 0.6));
  return { action, confidence: Number(confidence.toFixed(3)), score };
}

function templateRationale(symbol: string, s: Signals, action: string): string {
  const parts = [
    `Order book ${s.imbalance >= 0 ? "comprador" : "vendedor"} (${(s.imbalance * 100).toFixed(0)}%)`,
    `agresión ${s.cvd >= 0 ? "de compra" : "de venta"} (CVD ${s.cvd.toFixed(2)})`,
    `tendencia ${s.trend}`,
    s.rsi != null ? `RSI ${s.rsi.toFixed(0)}` : null,
    `sentimiento noticias ${s.newsScore > 0.1 ? "positivo" : s.newsScore < -0.1 ? "negativo" : "neutro"}`,
  ].filter(Boolean);
  const verbo = action === "buy" ? "COMPRAR" : action === "sell" ? "VENDER" : "MANTENER";
  return `${verbo} ${symbol}: ${parts.join(", ")}.`;
}

// Explicación con IA. Prioridad de proveedor según el secret disponible:
// ANTHROPIC_API_KEY -> OPENAI_API_KEY -> LOVABLE_API_KEY -> texto templado.
// Así podés pasar de los créditos de Lovable a tu propia key sin tocar código.
const SYSTEM_PROMPT =
  "Sos un trader cripto experto. Explicá en 2-3 frases, en español rioplatense, por qué la decisión sugerida tiene sentido según las señales. Sé concreto, mencioná las señales que más pesan. No des consejo financiero personalizado; es un análisis educativo.";

async function aiRationale(symbol: string, s: Signals, action: string): Promise<string> {
  const userMsg = `Moneda ${symbol}. Decisión: ${action}. Señales -> order book imbalance: ${s.imbalance.toFixed(2)}, CVD: ${s.cvd.toFixed(2)}, tendencia: ${s.trend}, RSI: ${s.rsi?.toFixed(0) ?? "n/d"}, MACD: ${s.macd.toFixed(2)}, Fibonacci: ${s.fib.toFixed(2)}, Bollinger: ${s.boll.toFixed(2)}, sentimiento noticias: ${s.newsScore.toFixed(2)}.`;

  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  const openaiKey = Deno.env.get("OPENAI_API_KEY");
  // Lovable AI solo si se activa explícitamente (consume créditos de Lovable).
  // Por defecto NO se usa: sin key propia, la explicación es texto templado gratis.
  const lovableKey =
    Deno.env.get("USE_LOVABLE_AI") === "true"
      ? Deno.env.get("LOVABLE_API_KEY")
      : undefined;

  try {
    if (anthropicKey) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": anthropicKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 250,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: userMsg }],
        }),
      });
      if (res.ok) {
        const d = await res.json();
        const text = d?.content?.[0]?.text?.trim();
        if (text) return text;
      }
    } else if (openaiKey) {
      const res = await openaiCompat(
        "https://api.openai.com/v1/chat/completions",
        openaiKey,
        "gpt-4o-mini",
        userMsg,
      );
      if (res) return res;
    } else if (lovableKey) {
      const res = await openaiCompat(
        "https://ai.gateway.lovable.dev/v1/chat/completions",
        lovableKey,
        "google/gemini-2.5-flash",
        userMsg,
      );
      if (res) return res;
    }
  } catch (_e) {
    /* cae al templado */
  }
  return templateRationale(symbol, s, action);
}

/** Llama a un endpoint compatible con la API de OpenAI (OpenAI, Lovable gateway). */
async function openaiCompat(
  url: string,
  key: string,
  model: string,
  userMsg: string,
): Promise<string | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMsg },
      ],
    }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

// ---------- núcleo: analizar una moneda para un usuario ----------

async function analyzeCoin(
  admin: ReturnType<typeof createClient>,
  userId: string,
  pair: string,
) {
  const symbol = pair.replace(/USDT$/, "");
  const market = await marketSignals(pair);

  // sentimiento de noticias recientes (de la tabla news)
  const { data: news } = await admin
    .from("news")
    .select("sentiment_score")
    .in("symbol", [symbol, "CRYPTO"])
    .order("published_at", { ascending: false })
    .limit(15);
  const scores = (news ?? [])
    .map((n: { sentiment_score: number | null }) => n.sentiment_score ?? 0)
    .filter((x) => typeof x === "number");
  const newsScore = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  const signals: Signals = { ...market, newsScore };

  // Config óptima para esta moneda (del optimizador). Si no hay, defaults.
  const { data: cfgRow } = await admin
    .from("agent_configs")
    .select("params")
    .eq("user_id", userId)
    .eq("symbol", pair)
    .maybeSingle();
  const cfg = (cfgRow?.params ?? {}) as {
    threshold?: number;
    stopLossPct?: number;
    takeProfitPct?: number;
    useRegimeFilter?: boolean;
    useVolumeFilter?: boolean;
    volumeFactor?: number;
  };
  const threshold = cfg.threshold ?? 0.2;
  const useRegime = cfg.useRegimeFilter ?? true;
  const useVolume = cfg.useVolumeFilter ?? false;
  const volumeFactor = cfg.volumeFactor ?? 1.3;

  const { action, confidence } = decide(signals, threshold);
  const rationale = await aiRationale(symbol, signals, action);

  // Permiso de compra según los filtros configurados.
  const buyAllowed =
    (!useRegime || signals.regimeBullish) &&
    (!useVolume || signals.volumeRatio >= volumeFactor);

  const { data: decision } = await admin
    .from("decisions")
    .insert({
      user_id: userId,
      symbol,
      asset_type: "crypto",
      action,
      confidence,
      rationale,
      indicators: {
        rsi: signals.rsi,
        trend: signals.trend,
        imbalance: signals.imbalance,
        cvd: signals.cvd,
        macd: signals.macd,
        fib: signals.fib,
        boll: signals.boll,
      },
      sentiment: { newsScore },
      price_at_decision: signals.price,
    })
    .select("id")
    .single();

  const executed = await executeDecision(
    admin,
    userId,
    pair,
    action,
    confidence,
    signals.price,
    buyAllowed,
    { stopLossPct: cfg.stopLossPct, takeProfitPct: cfg.takeProfitPct },
  );
  if (executed && decision?.id) {
    await admin.from("decisions").update({ executed: true }).eq("id", decision.id);
  }

  return { symbol, action, confidence, executed };
}

/**
 * Ejecuta la decisión sobre el portafolio simulado respetando guardarraíles:
 * agente no pausado, confianza mínima, límite de pérdida diaria y tamaño
 * máximo por posición. Devuelve true si operó.
 */
async function executeDecision(
  admin: ReturnType<typeof createClient>,
  userId: string,
  pair: string,
  action: "buy" | "sell" | "hold",
  confidence: number,
  price: number,
  buyAllowed: boolean,
  overrides: { stopLossPct?: number; takeProfitPct?: number } = {},
): Promise<boolean> {
  if (price <= 0) return false;
  const takeProfitPct = overrides.takeProfitPct ?? 25; // objetivo de ganancia

  const { data: portfolio } = await admin
    .from("portfolios")
    .select("id, cash_balance, initial_balance, is_paused")
    .eq("user_id", userId)
    .single();
  if (!portfolio || portfolio.is_paused) return false;

  const { data: risk } = await admin
    .from("risk_settings")
    .select("min_confidence, max_position_pct, max_daily_loss_pct, stop_loss_pct")
    .eq("user_id", userId)
    .single();
  const minConf = Number(risk?.min_confidence ?? 0.6);
  const maxPosPct = Number(risk?.max_position_pct ?? 25);
  const maxDailyLossPct = Number(risk?.max_daily_loss_pct ?? 5);
  const stopLossPct = overrides.stopLossPct ?? Number(risk?.stop_loss_pct ?? 10);
  const initial = Number(portfolio.initial_balance);
  const cash = Number(portfolio.cash_balance);

  // Posición actual en el par.
  const { data: pos } = await admin
    .from("positions")
    .select("id, quantity, avg_price")
    .eq("portfolio_id", portfolio.id)
    .eq("symbol", pair)
    .maybeSingle();
  const hasPos = pos && Number(pos.quantity) > 0;

  const sellAll = async () => {
    const qty = Number(pos!.quantity);
    const proceeds = qty * price;
    const pnl = (price - Number(pos!.avg_price)) * qty;
    await admin.from("positions").delete().eq("id", pos!.id);
    await admin
      .from("portfolios")
      .update({ cash_balance: cash + proceeds })
      .eq("id", portfolio.id);
    await admin.from("trades").insert({
      portfolio_id: portfolio.id,
      user_id: userId,
      symbol: pair,
      asset_type: "crypto",
      side: "sell",
      quantity: qty,
      price,
      total_value: proceeds,
      pnl,
    });
  };

  // 1) Salidas de protección (se aplican SIEMPRE, más allá de la decisión).
  if (hasPos) {
    const avg = Number(pos!.avg_price);
    if (price <= avg * (1 - stopLossPct / 100)) {
      await sellAll();
      return true;
    }
    if (price >= avg * (1 + takeProfitPct / 100)) {
      await sellAll();
      return true;
    }
  }

  // 2) Decisión del agente.
  if (action === "hold" || confidence < minConf) return false;

  // Límite de pérdida diaria: si ya se superó, pausar y no operar.
  const startOfDay = new Date();
  startOfDay.setUTCHours(0, 0, 0, 0);
  const { data: todayTrades } = await admin
    .from("trades")
    .select("pnl")
    .eq("user_id", userId)
    .gte("executed_at", startOfDay.toISOString());
  const realizedToday = (todayTrades ?? []).reduce(
    (sum: number, t: { pnl: number | null }) => sum + (Number(t.pnl) || 0),
    0,
  );
  if (realizedToday <= -(initial * (maxDailyLossPct / 100))) {
    await admin.from("portfolios").update({ is_paused: true }).eq("id", portfolio.id);
    return false;
  }

  if (action === "sell") {
    if (!hasPos) return false;
    await sellAll();
    return true;
  }

  // BUY — bloqueado por los filtros configurados (régimen/volumen).
  if (!buyAllowed) return false;
  // Sizing por convicción (Soros/Kelly): a mayor confianza, posición más grande.
  const conviction = Math.max(0.3, Math.min(1, (confidence - 0.35) / 0.6));
  const usd = Math.min((maxPosPct / 100) * initial, cash) * conviction;
  if (usd < 1) return false;
  const qty = usd / price;

  if (hasPos) {
    const oldQty = Number(pos!.quantity);
    const oldAvg = Number(pos!.avg_price);
    const newQty = oldQty + qty;
    await admin
      .from("positions")
      .update({ quantity: newQty, avg_price: (oldQty * oldAvg + qty * price) / newQty })
      .eq("id", pos!.id);
  } else {
    await admin.from("positions").insert({
      portfolio_id: portfolio.id,
      user_id: userId,
      symbol: pair,
      asset_type: "crypto",
      quantity: qty,
      avg_price: price,
    });
  }
  await admin
    .from("portfolios")
    .update({ cash_balance: cash - usd })
    .eq("id", portfolio.id);
  await admin.from("trades").insert({
    portfolio_id: portfolio.id,
    user_id: userId,
    symbol: pair,
    asset_type: "crypto",
    side: "buy",
    quantity: qty,
    price,
    total_value: usd,
  });
  return true;
}

/** Guarda un snapshot del valor del portafolio (para la curva de evolución). */
async function writeSnapshot(
  admin: ReturnType<typeof createClient>,
  userId: string,
) {
  const { data: portfolio } = await admin
    .from("portfolios")
    .select("id, cash_balance")
    .eq("user_id", userId)
    .single();
  if (!portfolio) return;
  const cash = Number(portfolio.cash_balance);

  const { data: positions } = await admin
    .from("positions")
    .select("symbol, quantity")
    .eq("portfolio_id", portfolio.id)
    .gt("quantity", 0);

  let positionsValue = 0;
  const list = positions ?? [];
  if (list.length > 0) {
    try {
      const symbols = encodeURIComponent(
        JSON.stringify(list.map((p: { symbol: string }) => p.symbol)),
      );
      const res = await fetch(`${SPOT}/ticker/price?symbols=${symbols}`);
      if (res.ok) {
        const prices = (await res.json()) as { symbol: string; price: string }[];
        const by = new Map(prices.map((p) => [p.symbol, Number(p.price)]));
        for (const p of list) {
          positionsValue += Number(p.quantity) * (by.get(p.symbol) ?? 0);
        }
      }
    } catch (_e) { /* si falla el precio, va 0 */ }
  }

  await admin.from("portfolio_snapshots").insert({
    user_id: userId,
    cash,
    positions_value: positionsValue,
    equity: cash + positionsValue,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    // Cron: por header secreto (seguro) o por body {mode:"cron"} (sin config,
    // para que el bot arranque solo). El impacto está acotado: paper trading
    // sobre la config de cada usuario, sin costo de IA (explicaciones gratis).
    const cronSecret = Deno.env.get("AGENT_CRON_SECRET");
    const isCron =
      body?.mode === "cron" ||
      (cronSecret && req.headers.get("x-agent-secret") === cronSecret);

    const results: unknown[] = [];

    if (isCron) {
      // Todos los usuarios con portafolio no pausado.
      const { data: portfolios } = await admin
        .from("portfolios")
        .select("user_id")
        .eq("is_paused", false);
      for (const p of portfolios ?? []) {
        const { data: wl } = await admin
          .from("watchlist")
          .select("symbol")
          .eq("user_id", p.user_id)
          .eq("asset_type", "crypto");
        for (const w of wl ?? []) {
          results.push(await analyzeCoin(admin, p.user_id, w.symbol));
        }
        await writeSnapshot(admin, p.user_id);
      }
    } else {
      // Modo manual: resolver el usuario del JWT.
      const authHeader = req.headers.get("Authorization") ?? "";
      const token = authHeader.replace("Bearer ", "");
      const userClient = createClient(url, Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? serviceKey, {
        global: { headers: { Authorization: `Bearer ${token}` } },
      });
      const { data: userData } = await userClient.auth.getUser(token);
      const userId = userData?.user?.id;
      if (!userId) {
        return new Response(JSON.stringify({ error: "No autorizado" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const symbol: string | undefined = body?.symbol;
      let pairs: string[];
      if (symbol) {
        pairs = [symbol.toUpperCase().endsWith("USDT") ? symbol.toUpperCase() : `${symbol.toUpperCase()}USDT`];
      } else {
        const { data: wl } = await admin
          .from("watchlist")
          .select("symbol")
          .eq("user_id", userId)
          .eq("asset_type", "crypto");
        pairs = (wl ?? []).map((w: { symbol: string }) => w.symbol);
      }
      for (const pair of pairs) {
        results.push(await analyzeCoin(admin, userId, pair));
      }
      await writeSnapshot(admin, userId);
    }

    return new Response(JSON.stringify({ analyzed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
