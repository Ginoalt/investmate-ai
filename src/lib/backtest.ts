// Motor de backtesting.
//
// Corre una estrategia TÉCNICA sobre velas históricas y mide si habría ganado.
// Regla de oro: en cada vela solo usa datos hasta esa vela (sin lookahead bias),
// así el resultado es honesto y no "hace trampa" mirando el futuro.
//
// LIMITACIÓN IMPORTANTE: el flujo de órdenes/ballenas y el sentimiento de
// noticias NO se pueden backtestear (no hay order book ni noticias históricas
// accesibles). Por eso el backtest valida la parte TÉCNICA de la estrategia
// (RSI, tendencia, momentum). El resto se valida hacia adelante con el paper
// trading (panel "¿el agente acierta?" y la curva de evolución).
import type { Candle } from "@/lib/market";
import { sma, rsi } from "@/lib/indicators";

export type BacktestParams = {
  smaShort: number;
  smaLong: number;
  rsiPeriod: number;
  rsiOversold: number;
  rsiOverbought: number;
  threshold: number; // score mínimo para operar (0-1)
  stopLossPct: number; // corta la posición si cae este %
  initialCapital: number;
};

export const DEFAULT_PARAMS: BacktestParams = {
  smaShort: 20,
  smaLong: 50,
  rsiPeriod: 14,
  rsiOversold: 30,
  rsiOverbought: 70,
  threshold: 0.2,
  stopLossPct: 8,
  initialCapital: 100,
};

export type BacktestTrade = {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  pnl: number;
  pnlPct: number;
  reason: "signal" | "stop-loss";
};

export type EquityPoint = { time: number; equity: number; price: number };

export type BacktestResult = {
  trades: BacktestTrade[];
  equityCurve: EquityPoint[];
  metrics: {
    finalEquity: number;
    totalReturnPct: number;
    buyHoldReturnPct: number; // comparación: ¿le gana a solo comprar y aguantar?
    winRate: number; // % de trades ganadores
    numTrades: number;
    maxDrawdownPct: number;
    profitFactor: number; // ganancias brutas / pérdidas brutas
    avgTradePct: number;
  };
};

/** Score técnico -1..1 con los datos hasta `closes` (última vela = actual). */
function technicalScore(closes: number[], p: BacktestParams): number {
  const price = closes[closes.length - 1];
  const s20 = sma(closes, p.smaShort);
  const s50 = sma(closes, p.smaLong);
  const r = rsi(closes, p.rsiPeriod);

  let trendScore = 0;
  if (s20 != null && s50 != null) {
    const spread = (s20 - s50) / s50;
    if (spread > 0.005 && price > s20) trendScore = 1;
    else if (spread < -0.005 && price < s20) trendScore = -1;
  }

  let rsiBias = 0;
  if (r != null) {
    if (r < p.rsiOversold) rsiBias = 1;
    else if (r > p.rsiOverbought) rsiBias = -1;
  }

  // momentum: retorno de las últimas ~10 velas
  let momentum = 0;
  if (closes.length > 10) {
    const past = closes[closes.length - 11];
    const ret = (price - past) / past;
    momentum = Math.max(-1, Math.min(1, ret * 10));
  }

  return 0.4 * trendScore + 0.35 * rsiBias + 0.25 * momentum;
}

export function runBacktest(
  candles: Candle[],
  params: BacktestParams,
): BacktestResult {
  const p = params;
  const warmup = Math.max(p.smaLong, p.rsiPeriod) + 2;
  let cash = p.initialCapital;
  let qty = 0; // unidades en posición
  let entryPrice = 0;
  let entryTime = 0;

  const trades: BacktestTrade[] = [];
  const equityCurve: EquityPoint[] = [];
  let peak = p.initialCapital;
  let maxDrawdownPct = 0;

  const closes: number[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    closes.push(c.close);
    if (i < warmup) {
      equityCurve.push({ time: c.time, equity: cash, price: c.close });
      continue;
    }

    const score = technicalScore(closes, p);
    const inPosition = qty > 0;

    // Salida por stop-loss
    if (inPosition && c.close <= entryPrice * (1 - p.stopLossPct / 100)) {
      const proceeds = qty * c.close;
      const pnl = proceeds - qty * entryPrice;
      trades.push({
        entryTime,
        exitTime: c.time,
        entryPrice,
        exitPrice: c.close,
        pnl,
        pnlPct: ((c.close - entryPrice) / entryPrice) * 100,
        reason: "stop-loss",
      });
      cash += proceeds;
      qty = 0;
    } else if (inPosition && score < -p.threshold) {
      // Salida por señal
      const proceeds = qty * c.close;
      const pnl = proceeds - qty * entryPrice;
      trades.push({
        entryTime,
        exitTime: c.time,
        entryPrice,
        exitPrice: c.close,
        pnl,
        pnlPct: ((c.close - entryPrice) / entryPrice) * 100,
        reason: "signal",
      });
      cash += proceeds;
      qty = 0;
    } else if (!inPosition && score > p.threshold) {
      // Entrada: todo el capital disponible
      qty = cash / c.close;
      entryPrice = c.close;
      entryTime = c.time;
      cash = 0;
    }

    const equity = cash + qty * c.close;
    equityCurve.push({ time: c.time, equity, price: c.close });
    if (equity > peak) peak = equity;
    const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
    if (dd > maxDrawdownPct) maxDrawdownPct = dd;
  }

  // Cierre forzado al final para medir todo
  if (qty > 0) {
    const last = candles[candles.length - 1];
    const proceeds = qty * last.close;
    trades.push({
      entryTime,
      exitTime: last.time,
      entryPrice,
      exitPrice: last.close,
      pnl: proceeds - qty * entryPrice,
      pnlPct: ((last.close - entryPrice) / entryPrice) * 100,
      reason: "signal",
    });
    cash += proceeds;
    qty = 0;
  }

  const finalEquity = cash;
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((s, t) => s + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0));
  const firstPrice = candles[0]?.close ?? 0;
  const lastPrice = candles[candles.length - 1]?.close ?? 0;

  return {
    trades,
    equityCurve,
    metrics: {
      finalEquity,
      totalReturnPct:
        ((finalEquity - p.initialCapital) / p.initialCapital) * 100,
      buyHoldReturnPct:
        firstPrice > 0 ? ((lastPrice - firstPrice) / firstPrice) * 100 : 0,
      winRate: trades.length ? (wins.length / trades.length) * 100 : 0,
      numTrades: trades.length,
      maxDrawdownPct,
      profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0,
      avgTradePct: trades.length
        ? trades.reduce((s, t) => s + t.pnlPct, 0) / trades.length
        : 0,
    },
  };
}
