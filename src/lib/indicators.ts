// Indicadores técnicos calculados a partir de precios de cierre.
// Todo el cálculo es local (no necesita API): recibe un array de cierres
// ordenado del más viejo al más nuevo.

/** Media móvil simple del último tramo de `period` valores. */
export function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Serie completa de SMA (útil para dibujar sobre el gráfico). */
export function smaSeries(values: number[], period: number): (number | null)[] {
  return values.map((_, i) => {
    if (i + 1 < period) return null;
    const slice = values.slice(i + 1 - period, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

/**
 * RSI (Relative Strength Index) de Wilder sobre `period` velas (default 14).
 * Devuelve un valor 0–100, o null si no hay suficientes datos.
 */
export function rsi(values: number[], period = 14): number | null {
  if (values.length < period + 1) return null;

  let gains = 0;
  let losses = 0;
  // Primer promedio (SMA de ganancias/pérdidas de las primeras `period` velas).
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  // Suavizado de Wilder para el resto de la serie.
  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const gain = diff >= 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export type Trend = "alcista" | "bajista" | "lateral";

/**
 * Tendencia simple combinando cruce de medias (SMA20 vs SMA50) y posición
 * del precio respecto a la SMA20.
 */
export function trend(values: number[]): Trend {
  const s20 = sma(values, 20);
  const s50 = sma(values, 50);
  const last = values[values.length - 1];
  if (s20 == null || s50 == null || last == null) return "lateral";

  const spread = (s20 - s50) / s50; // separación relativa entre medias
  if (spread > 0.005 && last > s20) return "alcista";
  if (spread < -0.005 && last < s20) return "bajista";
  return "lateral";
}

// ---------- EMA / MACD ----------

/** Serie de media móvil exponencial (sembrada con SMA del primer tramo). */
export function emaSeries(values: number[], period: number): (number | null)[] {
  const out: (number | null)[] = new Array(values.length).fill(null);
  if (values.length < period) return out;
  const k = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  out[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }
  return out;
}

export type Macd = {
  macd: number;
  signal: number;
  histogram: number;
  score: number; // -1..1
};

/** MACD (12/26/9). Score positivo = momentum alcista. */
export function macd(
  values: number[],
  fast = 12,
  slow = 26,
  signalPeriod = 9,
): Macd | null {
  if (values.length < slow + signalPeriod) return null;
  const emaFast = emaSeries(values, fast);
  const emaSlow = emaSeries(values, slow);
  const macdLine = values.map((_, i) =>
    emaFast[i] != null && emaSlow[i] != null
      ? (emaFast[i] as number) - (emaSlow[i] as number)
      : null,
  );
  const clean = macdLine.filter((x): x is number => x != null);
  const signalArr = emaSeries(clean, signalPeriod);
  const macdVal = clean[clean.length - 1];
  const signalVal = signalArr[signalArr.length - 1];
  if (macdVal == null || signalVal == null) return null;
  const histogram = macdVal - signalVal;
  // Normalizamos el histograma por el precio para un score acotado.
  const price = values[values.length - 1] || 1;
  const score = Math.max(-1, Math.min(1, (histogram / price) * 300));
  return { macd: macdVal, signal: signalVal, histogram, score };
}

// ---------- Bandas de Bollinger ----------

export type Bollinger = {
  upper: number;
  middle: number;
  lower: number;
  percentB: number; // 0 = banda inferior, 1 = superior
  score: number; // -1..1 (positivo = cerca de la inferior, sesgo compra)
};

export function bollinger(
  values: number[],
  period = 20,
  mult = 2,
): Bollinger | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const mid = slice.reduce((a, b) => a + b, 0) / period;
  const variance =
    slice.reduce((a, b) => a + (b - mid) ** 2, 0) / period;
  const sd = Math.sqrt(variance);
  const upper = mid + mult * sd;
  const lower = mid - mult * sd;
  const price = values[values.length - 1];
  const width = upper - lower;
  const percentB = width > 0 ? (price - lower) / width : 0.5;
  // cerca de la banda inferior => sobreventa => sesgo compra (+)
  const score = Math.max(-1, Math.min(1, (0.5 - percentB) * 2));
  return { upper, middle: mid, lower, percentB, score };
}

// ---------- Fibonacci ----------

export type FibLevel = { ratio: number; price: number };
export type Fibonacci = {
  high: number;
  low: number;
  trend: "up" | "down";
  levels: FibLevel[];
  retracement: number; // 0..1 cuánto retrocedió desde el extremo
  nearest: FibLevel | null;
  score: number; // -1..1
};

const FIB_RATIOS = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1];

/**
 * Retrocesos de Fibonacci sobre el swing (máximo/mínimo) de las últimas
 * `lookback` velas. En tendencia alcista, un retroceso "sano" a la zona
 * 0.382–0.618 es zona de compra; romper por debajo de 0.786 debilita la señal.
 */
export function fibonacci(
  candles: { high: number; low: number; close: number }[],
  lookback = 60,
): Fibonacci | null {
  const slice = candles.slice(-lookback);
  if (slice.length < 10) return null;

  let hi = -Infinity,
    lo = Infinity,
    hiIdx = 0,
    loIdx = 0;
  slice.forEach((c, i) => {
    if (c.high > hi) {
      hi = c.high;
      hiIdx = i;
    }
    if (c.low < lo) {
      lo = c.low;
      loIdx = i;
    }
  });

  const trend: "up" | "down" = hiIdx >= loIdx ? "up" : "down";
  const range = hi - lo || 1;
  const price = slice[slice.length - 1].close;

  // En alcista medimos retrocesos desde el máximo hacia abajo; en bajista al revés.
  const levels: FibLevel[] = FIB_RATIOS.map((r) => ({
    ratio: r,
    price: trend === "up" ? hi - range * r : lo + range * r,
  }));

  let nearest = levels[0];
  let minD = Infinity;
  for (const l of levels) {
    const d = Math.abs(l.price - price) / price;
    if (d < minD) {
      minD = d;
      nearest = l;
    }
  }

  const retracement =
    trend === "up" ? (hi - price) / range : (price - lo) / range;

  let score = 0;
  if (trend === "up") {
    if (retracement >= 0.3 && retracement <= 0.65) score = 0.6; // pullback comprable
    else if (retracement > 0.8) score = -0.5; // se rompió el retroceso
    else if (retracement < 0.15) score = 0.15; // pegado a máximos
  } else {
    if (retracement >= 0.3 && retracement <= 0.65) score = -0.6; // rebote vendible
    else if (retracement > 0.8) score = 0.5; // recuperó, posible giro
  }

  return { high: hi, low: lo, trend, levels, retracement, nearest, score };
}

/** Interpretación textual rápida del RSI. */
export function rsiZone(value: number | null): {
  label: string;
  tone: "over" | "under" | "neutral";
} {
  if (value == null) return { label: "—", tone: "neutral" };
  if (value >= 70) return { label: "sobrecomprado", tone: "over" };
  if (value <= 30) return { label: "sobrevendido", tone: "under" };
  return { label: "neutral", tone: "neutral" };
}
