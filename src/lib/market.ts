// Cliente de datos de mercado cripto.
//
// Usamos el dominio público de datos de mercado de Binance
// (data-api.binance.vision): tiene CORS habilitado, no requiere API key y no
// aplica el bloqueo geográfico del api.binance.com principal. Solo lectura.
const BINANCE = "https://data-api.binance.vision/api/v3";

export type Ticker24h = {
  symbol: string; // par Binance, ej. "BTCUSDT"
  lastPrice: number;
  priceChangePercent: number; // variación 24h en %
  quoteVolume: number; // volumen negociado en USDT (24h)
  highPrice: number;
  lowPrice: number;
};

/** Convierte un símbolo base (ej. "BTC") al par USDT de Binance ("BTCUSDT"). */
export function toBinancePair(symbol: string): string {
  const s = symbol.toUpperCase();
  return s.endsWith("USDT") ? s : `${s}USDT`;
}

/** Nombre base legible a partir de un par ("BTCUSDT" -> "BTC"). */
export function baseAsset(pair: string): string {
  return pair.toUpperCase().replace(/USDT$/, "");
}

/** Trae el ticker 24h de una lista de pares. Devuelve solo los válidos. */
export async function fetch24h(pairs: string[]): Promise<Ticker24h[]> {
  if (pairs.length === 0) return [];
  const symbolsParam = encodeURIComponent(JSON.stringify(pairs));
  const res = await fetch(`${BINANCE}/ticker/24hr?symbols=${symbolsParam}`);
  if (!res.ok) {
    throw new Error(`Binance 24hr ${res.status}: ${await res.text()}`);
  }
  const raw = (await res.json()) as Array<Record<string, string>>;
  return raw.map((r) => ({
    symbol: r.symbol,
    lastPrice: Number(r.lastPrice),
    priceChangePercent: Number(r.priceChangePercent),
    quoteVolume: Number(r.quoteVolume),
    highPrice: Number(r.highPrice),
    lowPrice: Number(r.lowPrice),
  }));
}

/** Formatea un precio en USD con precisión adaptada a la magnitud. */
export function formatPrice(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const digits = value >= 1000 ? 2 : value >= 1 ? 2 : value >= 0.01 ? 4 : 8;
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** Formatea un porcentaje con signo. */
export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

/** Formatea un volumen grande de forma compacta (1.2B, 340M...). */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return "—";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

// Monedas por defecto que mostramos hasta que el usuario arme su watchlist.
export const DEFAULT_PAIRS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
  "DOGEUSDT",
  "AVAXUSDT",
];
