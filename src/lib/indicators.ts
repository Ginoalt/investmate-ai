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
