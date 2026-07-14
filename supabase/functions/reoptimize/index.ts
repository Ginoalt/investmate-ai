// Edge function: auto-reoptimización periódica.
//
// El bot se re-optimiza SOLO. Cada día (cron) reoptimiza un grupo rotativo de
// monedas del universo: corre el optimizador sobre el histórico, valida
// out-of-sample, y guarda la mejor config robusta en agent_configs. En ~1
// semana cubre todo el universo, adaptándose al mercado que cambia.
//
// Se rota por día para no exceder el límite de tiempo de la edge function.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SPOT = "https://data-api.binance.vision/api/v3";
const UNIVERSE = [
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "ADAUSDT",
  "DOGEUSDT", "AVAXUSDT", "LINKUSDT", "DOTUSDT", "LTCUSDT", "TRXUSDT",
  "ATOMUSDT", "UNIUSDT", "NEARUSDT", "APTUSDT", "ARBUSDT", "INJUSDT",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-agent-secret",
};

// ---------- indicadores ----------
function sma(v: number[], p: number): number | null {
  if (v.length < p) return null;
  return v.slice(-p).reduce((a, b) => a + b, 0) / p;
}
function rsi(v: number[], p = 14): number | null {
  if (v.length < p + 1) return null;
  let g = 0, l = 0;
  for (let i = 1; i <= p; i++) { const d = v[i] - v[i - 1]; if (d >= 0) g += d; else l -= d; }
  let ag = g / p, al = l / p;
  for (let i = p + 1; i < v.length; i++) {
    const d = v[i] - v[i - 1];
    ag = (ag * (p - 1) + (d > 0 ? d : 0)) / p;
    al = (al * (p - 1) + (d < 0 ? -d : 0)) / p;
  }
  if (al === 0) return 100;
  return 100 - 100 / (1 + ag / al);
}
function emaS(v: number[], p: number): (number | null)[] {
  const o: (number | null)[] = new Array(v.length).fill(null);
  if (v.length < p) return o;
  const k = 2 / (p + 1);
  let pr = v.slice(0, p).reduce((a, b) => a + b, 0) / p;
  o[p - 1] = pr;
  for (let i = p; i < v.length; i++) { pr = v[i] * k + pr * (1 - k); o[i] = pr; }
  return o;
}
function macd(v: number[]): number {
  if (v.length < 35) return 0;
  const ef = emaS(v, 12), es = emaS(v, 26);
  const ml = v.map((_, i) => (ef[i] != null && es[i] != null ? (ef[i] as number) - (es[i] as number) : null)).filter((x): x is number => x != null);
  const sa = emaS(ml, 9);
  const mv = ml[ml.length - 1], sv = sa[sa.length - 1];
  if (mv == null || sv == null) return 0;
  return Math.max(-1, Math.min(1, ((mv - sv) / (v[v.length - 1] || 1)) * 300));
}
function boll(v: number[], p = 20): number {
  if (v.length < p) return 0;
  const s = v.slice(-p);
  const mid = s.reduce((a, b) => a + b, 0) / p;
  const sd = Math.sqrt(s.reduce((a, b) => a + (b - mid) ** 2, 0) / p);
  const up = mid + 2 * sd, lo = mid - 2 * sd;
  const pb = up - lo > 0 ? (v[v.length - 1] - lo) / (up - lo) : 0.5;
  return Math.max(-1, Math.min(1, (0.5 - pb) * 2));
}
type Candle = { time: number; high: number; low: number; close: number; volume: number };
function fib(cn: Candle[], lb = 60): number {
  const s = cn.slice(-lb);
  if (s.length < 10) return 0;
  let hi = -Infinity, lo = Infinity, hiI = 0, loI = 0;
  s.forEach((c, i) => { if (c.high > hi) { hi = c.high; hiI = i; } if (c.low < lo) { lo = c.low; loI = i; } });
  const tr = hiI >= loI ? "up" : "down";
  const range = hi - lo || 1;
  const price = s[s.length - 1].close;
  const rt = tr === "up" ? (hi - price) / range : (price - lo) / range;
  if (tr === "up") { if (rt >= 0.3 && rt <= 0.65) return 0.6; if (rt > 0.8) return -0.5; if (rt < 0.15) return 0.15; }
  else { if (rt >= 0.3 && rt <= 0.65) return -0.6; if (rt > 0.8) return 0.5; }
  return 0;
}

// ---------- backtest ----------
type Params = {
  threshold: number; stopLossPct: number; takeProfitPct: number;
  trailingStopPct: number; useRegimeFilter: boolean; useConviction: boolean;
};
function score(cn: Candle[], p: Params): number {
  const cl = cn.map((c) => c.close);
  const price = cl[cl.length - 1];
  const s20 = sma(cl, 20), s50 = sma(cl, 50), r = rsi(cl, 14);
  let t = 0;
  if (s20 != null && s50 != null) { const sp = (s20 - s50) / s50; if (sp > 0.005 && price > s20) t = 1; else if (sp < -0.005 && price < s20) t = -1; }
  let rb = 0;
  if (r != null) { if (r < 30) rb = 1; else if (r > 70) rb = -1; }
  let mom = 0;
  if (cl.length > 10) { const past = cl[cl.length - 11]; mom = Math.max(-1, Math.min(1, ((price - past) / past) * 10)); }
  return 0.25 * t + 0.2 * rb + 0.1 * mom + 0.2 * macd(cl) + 0.1 * boll(cl) + 0.15 * fib(cn);
}
function backtest(cn: Candle[], p: Params) {
  const warmup = 52;
  let cash = 100, qty = 0, entry = 0, peakE = 0;
  const cl = cn.map((c) => c.close);
  const trades: number[] = [];
  let peak = 100, maxDd = 0;
  for (let i = 0; i < cn.length; i++) {
    const c = cn[i];
    if (i < warmup) continue;
    const sc = score(cn.slice(0, i + 1), p);
    const rs = sma(cl.slice(0, i + 1), 100);
    const bull = !p.useRegimeFilter || rs == null || c.close > rs;
    if (qty > 0) {
      if (c.close > peakE) peakE = c.close;
      if (c.close <= entry * (1 - p.stopLossPct / 100)) { trades.push(qty * c.close - qty * entry); cash += qty * c.close; qty = 0; }
      else if (p.trailingStopPct > 0 && c.close <= peakE * (1 - p.trailingStopPct / 100)) { trades.push(qty * c.close - qty * entry); cash += qty * c.close; qty = 0; }
      else if (p.takeProfitPct > 0 && c.close >= entry * (1 + p.takeProfitPct / 100)) { trades.push(qty * c.close - qty * entry); cash += qty * c.close; qty = 0; }
      else if (sc < -p.threshold) { trades.push(qty * c.close - qty * entry); cash += qty * c.close; qty = 0; }
    } else if (sc > p.threshold && bull) {
      const frac = p.useConviction ? Math.max(0.3, Math.min(1, (sc - p.threshold) / (1 - p.threshold))) : 1;
      const usd = cash * frac; qty = usd / c.close; entry = c.close; peakE = c.close; cash -= usd;
    }
    const eq = cash + qty * c.close;
    if (eq > peak) peak = eq;
    const dd = (peak - eq) / peak * 100; if (dd > maxDd) maxDd = dd;
  }
  if (qty > 0) { const last = cn[cn.length - 1]; trades.push(qty * last.close - qty * entry); cash += qty * last.close; }
  const wins = trades.filter((t) => t > 0);
  return { ret: (cash - 100), n: trades.length, dd: maxDd, win: trades.length ? wins.length / trades.length * 100 : 0 };
}

// ---------- optimizador ----------
const SPACE = {
  threshold: [0.15, 0.2, 0.25],
  stopLossPct: [6, 10],
  takeProfitPct: [20, 40],
  trailingStopPct: [0, 12],
};
function* combos(): Generator<Params> {
  for (const threshold of SPACE.threshold)
    for (const stopLossPct of SPACE.stopLossPct)
      for (const takeProfitPct of SPACE.takeProfitPct)
        for (const trailingStopPct of SPACE.trailingStopPct)
          yield { threshold, stopLossPct, takeProfitPct, trailingStopPct, useRegimeFilter: true, useConviction: true };
}
function optimize(cn: Candle[]) {
  const split = Math.floor(cn.length * 0.7);
  const train = cn.slice(0, split);
  const test = cn.slice(Math.max(0, split - 55));
  let best: { params: Params; inRet: number; outRet: number; robust: boolean; score: number } | null = null;
  for (const p of combos()) {
    const inR = backtest(train, p);
    if (inR.n < 2) continue;
    const outR = backtest(test, p);
    const sc = inR.ret - 0.25 * inR.dd;
    const robust = outR.ret > 0 || outR.ret >= inR.ret * 0.5;
    if (!best || sc > best.score) best = { params: p, inRet: inR.ret, outRet: outR.ret, robust, score: sc };
  }
  return best;
}

async function fetchKlines(pair: string): Promise<Candle[]> {
  const res = await fetch(`${SPOT}/klines?symbol=${pair}&interval=1d&limit=240`);
  if (!res.ok) throw new Error(`klines ${res.status}`);
  const raw = (await res.json()) as unknown[][];
  return raw.map((k) => ({ time: Number(k[0]), high: Number(k[2]), low: Number(k[3]), close: Number(k[4]), volume: Number(k[5]) }));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const body = await req.json().catch(() => ({}));
    const cronSecret = Deno.env.get("AGENT_CRON_SECRET");
    const isCron = body?.mode === "cron" || (cronSecret && req.headers.get("x-agent-secret") === cronSecret);
    if (!isCron) {
      return new Response(JSON.stringify({ error: "No autorizado" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Grupo rotativo de monedas segun el dia (cubre el universo en ~1 semana).
    const day = new Date().getUTCDay(); // 0..6
    const batch = UNIVERSE.filter((_, i) => i % 7 === day % 7);

    const { data: portfolios } = await admin.from("portfolios").select("user_id");
    const results: unknown[] = [];

    for (const pair of batch) {
      let best: ReturnType<typeof optimize> = null;
      try {
        const candles = await fetchKlines(pair);
        best = optimize(candles);
      } catch (_e) { continue; }
      if (!best) continue;
      const symbol = pair.replace(/USDT$/, "");
      for (const pf of portfolios ?? []) {
        await admin.from("agent_configs").upsert({
          user_id: (pf as { user_id: string }).user_id,
          symbol: pair,
          params: best.params,
          in_sample_return: best.inRet,
          out_of_sample_return: best.outRet,
          robust: best.robust,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,symbol" });
      }
      results.push({ symbol, outRet: Number(best.outRet.toFixed(1)), robust: best.robust });
    }

    return new Response(JSON.stringify({ reoptimized: results.length, day, results }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
