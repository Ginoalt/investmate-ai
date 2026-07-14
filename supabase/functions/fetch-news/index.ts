// Edge function: trae noticias cripto de feeds RSS públicos (gratis, sin API
// key), les detecta la moneda relacionada y un sentimiento por heurística de
// palabras, y las guarda (dedup por URL) en la tabla `news`.
//
// El análisis de sentimiento serio (con IA) lo hace el agente en un paso
// posterior; acá solo dejamos una señal básica y barata.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const FEEDS = [
  { url: "https://cointelegraph.com/rss", source: "Cointelegraph" },
  { url: "https://decrypt.co/feed", source: "Decrypt" },
  { url: "https://news.bitcoin.com/feed/", source: "Bitcoin.com" },
];

// Monedas que sabemos mapear desde el texto de la noticia.
const COIN_MAP: Record<string, string[]> = {
  BTC: ["bitcoin", "btc"],
  ETH: ["ethereum", "ether", "eth"],
  SOL: ["solana", "sol"],
  XRP: ["xrp", "ripple"],
  BNB: ["bnb", "binance coin"],
  ADA: ["cardano", "ada"],
  DOGE: ["dogecoin", "doge"],
  AVAX: ["avalanche", "avax"],
  LINK: ["chainlink", "link"],
};

const BULLISH = [
  "surge",
  "soar",
  "rally",
  "jump",
  "gain",
  "bull",
  "record high",
  "all-time high",
  "breakout",
  "adoption",
  "approve",
  "upgrade",
  "partnership",
  "inflow",
];
const BEARISH = [
  "crash",
  "plunge",
  "drop",
  "fall",
  "slump",
  "bear",
  "hack",
  "exploit",
  "lawsuit",
  "ban",
  "scam",
  "sell-off",
  "liquidation",
  "outflow",
  "warns",
];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ParsedItem = {
  title: string;
  url: string;
  publishedAt: string;
  description: string;
};

/** Quita CDATA y tags HTML, colapsa espacios. */
function clean(s: string): string {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function pick(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i"));
  return m ? clean(m[1]) : "";
}

/** Parsea items de un XML RSS con regex (sin dependencias). */
export function parseRss(xml: string): ParsedItem[] {
  const items: ParsedItem[] = [];
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) ?? [];
  for (const block of blocks) {
    const title = pick(block, "title");
    const link = pick(block, "link");
    const pub = pick(block, "pubDate");
    const desc = pick(block, "description");
    if (!title || !link) continue;
    items.push({
      title,
      url: link,
      publishedAt: pub ? new Date(pub).toISOString() : new Date().toISOString(),
      description: desc,
    });
  }
  return items;
}

function detectSymbol(text: string): string {
  const lower = text.toLowerCase();
  for (const [symbol, keywords] of Object.entries(COIN_MAP)) {
    if (keywords.some((k) => lower.includes(k))) return symbol;
  }
  return "CRYPTO"; // noticia general de cripto
}

function detectSentiment(text: string): {
  sentiment: "positive" | "neutral" | "negative";
  score: number;
} {
  const lower = text.toLowerCase();
  let s = 0;
  for (const w of BULLISH) if (lower.includes(w)) s++;
  for (const w of BEARISH) if (lower.includes(w)) s--;
  if (s > 0) return { sentiment: "positive", score: Math.min(1, s / 3) };
  if (s < 0) return { sentiment: "negative", score: Math.max(-1, s / 3) };
  return { sentiment: "neutral", score: 0 };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const rows: Record<string, unknown>[] = [];
    for (const feed of FEEDS) {
      try {
        const res = await fetch(feed.url, {
          headers: { "User-Agent": "Mozilla/5.0 InvestBotLab" },
        });
        if (!res.ok) continue;
        const xml = await res.text();
        for (const item of parseRss(xml).slice(0, 20)) {
          const text = `${item.title} ${item.description}`;
          const { sentiment, score } = detectSentiment(text);
          rows.push({
            symbol: detectSymbol(text),
            headline: item.title,
            url: item.url,
            source: feed.source,
            published_at: item.publishedAt,
            sentiment,
            sentiment_score: score,
            summary: item.description.slice(0, 280) || null,
          });
        }
      } catch (_e) {
        // un feed caído no debe tumbar el resto
      }
    }

    let inserted = 0;
    if (rows.length > 0) {
      const { error, count } = await supabase
        .from("news")
        .upsert(rows, { onConflict: "url", ignoreDuplicates: true, count: "exact" });
      if (error) throw error;
      inserted = count ?? 0;
    }

    return new Response(
      JSON.stringify({ fetched: rows.length, inserted }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
