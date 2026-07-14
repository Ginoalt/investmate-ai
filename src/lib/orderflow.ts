// Flujo de órdenes y "dinero inteligente" (ballenas), todo con datos públicos
// de Binance — sin API key, sin costo. Combina:
//   - Order book (profundidad): presión de compra vs venta en el libro
//   - Trades recientes (CVD): agresión de market-buys vs market-sells
//   - Derivados (funding rate + open interest): posicionamiento apalancado
//
// Aviso: las ballenas manipulan (spoofing, icebergs, OTC/dark pools). Estas
// señales son fuertes pero NO infalibles. Siempre con gestión de riesgo.

const SPOT = "https://data-api.binance.vision/api/v3";
const FUT = "https://fapi.binance.com";

// ---------- Order book ----------

export type BookPressure = {
  bidVolume: number; // volumen de compra dentro de la banda (en la moneda)
  askVolume: number; // volumen de venta dentro de la banda
  imbalance: number; // -1..1 (positivo = más compradores en el libro)
  topBidWall: { price: number; qty: number } | null;
  topAskWall: { price: number; qty: number } | null;
  midPrice: number;
};

/**
 * Analiza el order book dentro de ±`bandPct` del precio medio.
 * `limit` niveles a cada lado (Binance permite hasta 5000).
 */
export async function fetchBookPressure(
  pair: string,
  bandPct = 1,
  limit = 500,
): Promise<BookPressure> {
  const res = await fetch(`${SPOT}/depth?symbol=${pair}&limit=${limit}`);
  if (!res.ok) throw new Error(`depth ${res.status}`);
  const data = (await res.json()) as {
    bids: [string, string][];
    asks: [string, string][];
  };

  const bestBid = Number(data.bids[0]?.[0] ?? 0);
  const bestAsk = Number(data.asks[0]?.[0] ?? 0);
  const mid = (bestBid + bestAsk) / 2 || bestBid || bestAsk;
  const band = mid * (bandPct / 100);

  let bidVolume = 0;
  let askVolume = 0;
  let topBidWall: { price: number; qty: number } | null = null;
  let topAskWall: { price: number; qty: number } | null = null;

  for (const [p, q] of data.bids) {
    const price = Number(p);
    const qty = Number(q);
    if (price < mid - band) break; // bids vienen de mayor a menor
    bidVolume += qty;
    if (!topBidWall || qty > topBidWall.qty) topBidWall = { price, qty };
  }
  for (const [p, q] of data.asks) {
    const price = Number(p);
    const qty = Number(q);
    if (price > mid + band) break; // asks vienen de menor a mayor
    askVolume += qty;
    if (!topAskWall || qty > topAskWall.qty) topAskWall = { price, qty };
  }

  const total = bidVolume + askVolume;
  const imbalance = total > 0 ? (bidVolume - askVolume) / total : 0;

  return { bidVolume, askVolume, imbalance, topBidWall, topAskWall, midPrice: mid };
}

// ---------- CVD / agresión de trades ----------

export type TradeFlow = {
  takerBuyVolume: number; // volumen ejecutado por compradores agresivos (USDT)
  takerSellVolume: number; // por vendedores agresivos (USDT)
  buyRatio: number; // 0..1 (proporción de compra agresiva)
  cvd: number; // -1..1 (positivo = domina la compra)
  trades: number;
};

/**
 * Delta de volumen agresivo (CVD) de los últimos `limit` aggTrades.
 * En aggTrades, `m` = isBuyerMaker: si es true, el agresor fue el VENDEDOR
 * (market-sell); si es false, el agresor fue el COMPRADOR (market-buy).
 */
export async function fetchTradeFlow(
  pair: string,
  limit = 1000,
): Promise<TradeFlow> {
  const res = await fetch(`${SPOT}/aggTrades?symbol=${pair}&limit=${limit}`);
  if (!res.ok) throw new Error(`aggTrades ${res.status}`);
  const data = (await res.json()) as { p: string; q: string; m: boolean }[];

  let takerBuyVolume = 0;
  let takerSellVolume = 0;
  for (const t of data) {
    const notional = Number(t.p) * Number(t.q);
    if (t.m) takerSellVolume += notional;
    else takerBuyVolume += notional;
  }
  const total = takerBuyVolume + takerSellVolume;
  const buyRatio = total > 0 ? takerBuyVolume / total : 0.5;
  return {
    takerBuyVolume,
    takerSellVolume,
    buyRatio,
    cvd: (buyRatio - 0.5) * 2,
    trades: data.length,
  };
}

// ---------- Derivados: funding + open interest ----------

export type Derivatives = {
  fundingRate: number; // tasa actual (fracción, ej. 0.0001 = 0.01%)
  openInterest: number; // OI actual en contratos/moneda
  oiChangePct: number | null; // variación de OI en la ventana reciente (%)
};

export async function fetchDerivatives(pair: string): Promise<Derivatives> {
  const [fundingRes, oiRes, oiHistRes] = await Promise.all([
    fetch(`${FUT}/fapi/v1/premiumIndex?symbol=${pair}`),
    fetch(`${FUT}/fapi/v1/openInterest?symbol=${pair}`),
    fetch(
      `${FUT}/futures/data/openInterestHist?symbol=${pair}&period=1h&limit=24`,
    ),
  ]);

  const funding = fundingRes.ok
    ? ((await fundingRes.json()) as { lastFundingRate: string })
    : null;
  const oi = oiRes.ok
    ? ((await oiRes.json()) as { openInterest: string })
    : null;

  let oiChangePct: number | null = null;
  if (oiHistRes.ok) {
    const hist = (await oiHistRes.json()) as {
      sumOpenInterest: string;
    }[];
    if (hist.length >= 2) {
      const first = Number(hist[0].sumOpenInterest);
      const last = Number(hist[hist.length - 1].sumOpenInterest);
      if (first > 0) oiChangePct = ((last - first) / first) * 100;
    }
  }

  return {
    fundingRate: funding ? Number(funding.lastFundingRate) : 0,
    openInterest: oi ? Number(oi.openInterest) : 0,
    oiChangePct,
  };
}

// ---------- Presión compuesta ----------

export type MarketPressure = {
  score: number; // -1..1
  label: "fuerte venta" | "venta" | "neutral" | "compra" | "fuerte compra";
  tone: "bear" | "soft-bear" | "neutral" | "soft-bull" | "bull";
};

/**
 * Combina order book (0.4) + CVD (0.5) + signo del funding (0.1) en un
 * score -1..1. Es una lectura de "presión", no una predicción.
 */
export function computePressure(
  book: BookPressure,
  flow: TradeFlow,
  deriv: Derivatives,
): MarketPressure {
  const fundingSignal = Math.max(-1, Math.min(1, deriv.fundingRate * 2000));
  const score = Math.max(
    -1,
    Math.min(1, book.imbalance * 0.4 + flow.cvd * 0.5 + fundingSignal * 0.1),
  );

  let label: MarketPressure["label"];
  let tone: MarketPressure["tone"];
  if (score > 0.35) [label, tone] = ["fuerte compra", "bull"];
  else if (score > 0.12) [label, tone] = ["compra", "soft-bull"];
  else if (score < -0.35) [label, tone] = ["fuerte venta", "bear"];
  else if (score < -0.12) [label, tone] = ["venta", "soft-bear"];
  else [label, tone] = ["neutral", "neutral"];

  return { score, label, tone };
}

/** Formatea el funding rate como porcentaje (por período de 8h). */
export function formatFunding(rate: number): string {
  return `${(rate * 100).toFixed(4)}%`;
}
