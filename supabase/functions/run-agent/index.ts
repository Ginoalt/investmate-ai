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

async function marketSignals(pair: string) {
  // klines para indicadores
  const kl = await fetch(`${SPOT}/klines?symbol=${pair}&interval=1d&limit=60`);
  const candles = (await kl.json()) as unknown[][];
  const closes = candles.map((c) => Number(c[4]));
  const price = closes[closes.length - 1] ?? 0;
  const r = rsi(closes, 14);
  const s20 = sma(closes, 20), s50 = sma(closes, 50);
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

  return { price, rsi: r, trend, imbalance, cvd };
}

// ---------- decisión por reglas ----------

type Signals = Awaited<ReturnType<typeof marketSignals>> & {
  newsScore: number;
};

function decide(s: Signals) {
  const trendScore = s.trend === "alcista" ? 1 : s.trend === "bajista" ? -1 : 0;
  let rsiBias = 0;
  if (s.rsi != null) {
    if (s.rsi < 30) rsiBias = 0.5; // sobrevendido -> sesgo compra
    else if (s.rsi > 70) rsiBias = -0.5; // sobrecomprado -> sesgo venta
  }
  const score =
    0.4 * s.imbalance +
    0.25 * s.cvd +
    0.2 * trendScore +
    0.1 * s.newsScore +
    0.05 * rsiBias;

  let action: "buy" | "sell" | "hold" = "hold";
  if (score > 0.2) action = "buy";
  else if (score < -0.2) action = "sell";

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

async function aiRationale(symbol: string, s: Signals, action: string): Promise<string> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) return templateRationale(symbol, s, action);
  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Sos un trader cripto experto. Explicá en 2-3 frases, en español rioplatense, por qué la decisión sugerida tiene sentido según las señales. Sé concreto, mencioná las señales que más pesan. No des consejo financiero personalizado; es un análisis educativo.",
          },
          {
            role: "user",
            content: `Moneda ${symbol}. Decisión: ${action}. Señales -> order book imbalance: ${s.imbalance.toFixed(2)}, CVD: ${s.cvd.toFixed(2)}, tendencia: ${s.trend}, RSI: ${s.rsi?.toFixed(0) ?? "n/d"}, sentimiento noticias: ${s.newsScore.toFixed(2)}.`,
          },
        ],
      }),
    });
    if (!res.ok) return templateRationale(symbol, s, action);
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content?.trim();
    return text || templateRationale(symbol, s, action);
  } catch (_e) {
    return templateRationale(symbol, s, action);
  }
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
  const { action, confidence } = decide(signals);
  const rationale = await aiRationale(symbol, signals, action);

  await admin.from("decisions").insert({
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
    },
    sentiment: { newsScore },
    price_at_decision: signals.price,
  });

  return { symbol, action, confidence };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, serviceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const cronSecret = Deno.env.get("AGENT_CRON_SECRET");
    const isCron =
      cronSecret && req.headers.get("x-agent-secret") === cronSecret;

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
