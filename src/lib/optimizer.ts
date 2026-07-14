// Auto-optimizador.
//
// Prueba muchas combinaciones de parámetros sobre el histórico y devuelve las
// mejores — así el sistema "elige la config" en vez de que la ajustes a mano.
//
// HONESTIDAD ANTI-OVERFITTING: divide el histórico en dos.
//   - "in-sample" (primer 70%): acá se buscan/rankean las configs.
//   - "out-of-sample" (último 30%, que la búsqueda NO vio): se mide si la config
//     sigue funcionando en datos nuevos.
// Una config que gana in-sample pero pierde out-of-sample está sobreajustada
// (memorizó el pasado). Las que ganan en AMBOS son las que valen.
import type { Candle } from "@/lib/market";
import { runBacktest, DEFAULT_PARAMS, type BacktestParams } from "@/lib/backtest";

export type SampleMetrics = {
  totalReturnPct: number;
  winRate: number;
  numTrades: number;
  maxDrawdownPct: number;
};

export type OptimizerResult = {
  params: BacktestParams;
  inSample: SampleMetrics;
  outOfSample: SampleMetrics;
  score: number;
  robust: boolean; // ¿aguanta out-of-sample?
};

// Valores a probar por parámetro. El producto cartesiano es el espacio de búsqueda.
const SEARCH_SPACE = {
  threshold: [0.15, 0.2, 0.25],
  stopLossPct: [6, 10],
  takeProfitPct: [20, 40],
  trailingStopPct: [0, 12],
  useRegimeFilter: [true, false],
  useVolumeFilter: [false, true],
} as const;

function* combinations(): Generator<Partial<BacktestParams>> {
  const keys = Object.keys(SEARCH_SPACE) as (keyof typeof SEARCH_SPACE)[];
  const idx = keys.map(() => 0);
  while (true) {
    const combo: Record<string, number | boolean> = {};
    keys.forEach((k, i) => {
      combo[k] = SEARCH_SPACE[k][idx[i]] as number | boolean;
    });
    yield combo as Partial<BacktestParams>;
    // incrementar el "contador mixto"
    let pos = keys.length - 1;
    while (pos >= 0) {
      idx[pos]++;
      if (idx[pos] < SEARCH_SPACE[keys[pos]].length) break;
      idx[pos] = 0;
      pos--;
    }
    if (pos < 0) break;
  }
}

function pick(m: BacktestResultMetrics): SampleMetrics {
  return {
    totalReturnPct: m.totalReturnPct,
    winRate: m.winRate,
    numTrades: m.numTrades,
    maxDrawdownPct: m.maxDrawdownPct,
  };
}
type BacktestResultMetrics = ReturnType<typeof runBacktest>["metrics"];

/**
 * Optimiza sobre `candles`. Devuelve las mejores `top` configs, rankeadas por
 * su rendimiento in-sample (penalizando drawdown), con su validación
 * out-of-sample para detectar overfitting.
 */
export function optimize(
  candles: Candle[],
  base: BacktestParams = DEFAULT_PARAMS,
  top = 8,
): OptimizerResult[] {
  const split = Math.floor(candles.length * 0.7);
  const train = candles.slice(0, split);
  const warmup = base.smaLong + 5;
  const test = candles.slice(Math.max(0, split - warmup)); // con calentamiento

  const results: OptimizerResult[] = [];

  for (const combo of combinations()) {
    const params: BacktestParams = { ...base, ...combo };
    const inRes = runBacktest(train, params);
    if (inRes.metrics.numTrades < 2) continue; // descartar configs que casi no operan
    const outRes = runBacktest(test, params);

    // Ranking: rendimiento in-sample penalizado por drawdown.
    const score =
      inRes.metrics.totalReturnPct - 0.25 * inRes.metrics.maxDrawdownPct;
    // Robusta si también gana (o casi) out-of-sample.
    const robust =
      outRes.metrics.totalReturnPct > 0 ||
      outRes.metrics.totalReturnPct >= inRes.metrics.totalReturnPct * 0.5;

    results.push({
      params,
      inSample: pick(inRes.metrics),
      outOfSample: pick(outRes.metrics),
      score,
      robust,
    });
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, top);
}
