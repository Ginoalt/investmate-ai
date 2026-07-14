import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ComposedChart,
  Line,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { fetchKlines, toBinancePair, formatPrice, formatPercent } from "@/lib/market";
import { useDecisions, type Decision } from "@/lib/agent";
import { useWatchlist } from "@/lib/watchlist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GraduationCap,
  TrendingUp,
  TrendingDown,
  Minus,
  Info,
  Trophy,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authed/aprender")({
  component: Aprender,
});

type EvaluatedDecision = Decision & {
  outcomePct: number; // rendimiento de la decisión mirando el precio posterior
  hit: boolean;
};

function Aprender() {
  const watchlist = useWatchlist();
  const [symbol, setSymbol] = useState("BTC");
  const pair = toBinancePair(symbol);

  const klines = useQuery({
    queryKey: ["klines", pair, "aprender"],
    queryFn: () => fetchKlines(pair, "1d", 120),
    staleTime: 60_000,
  });
  const decisions = useDecisions(symbol, 100);

  // Evaluar cada decisión mirando el precio ~10 velas después (o el último).
  const evaluated = useMemo<EvaluatedDecision[]>(() => {
    const candles = klines.data ?? [];
    if (!candles.length || !decisions.data) return [];
    return decisions.data
      .filter((d) => d.action !== "hold")
      .map((d) => {
        const t = new Date(d.created_at).getTime();
        let idx = candles.findIndex((c) => c.time >= t);
        if (idx === -1) idx = candles.length - 1;
        const future = candles[Math.min(idx + 10, candles.length - 1)];
        const entry = d.price_at_decision;
        const change = future ? ((future.close - entry) / entry) * 100 : 0;
        const outcomePct = d.action === "buy" ? change : -change;
        return { ...d, outcomePct, hit: outcomePct > 0 };
      });
  }, [klines.data, decisions.data]);

  // Datos del gráfico: precio + marcadores de compra/venta.
  const chartData = useMemo(() => {
    const candles = klines.data ?? [];
    return candles.map((c) => {
      const dayDecisions = evaluated.filter((d) => {
        const t = new Date(d.created_at).getTime();
        return Math.abs(t - c.time) < 12 * 3600 * 1000; // dentro del mismo día
      });
      const buy = dayDecisions.find((d) => d.action === "buy");
      const sell = dayDecisions.find((d) => d.action === "sell");
      return {
        label: new Date(c.time).toLocaleDateString("es-AR", {
          day: "2-digit",
          month: "2-digit",
        }),
        price: c.close,
        buy: buy ? buy.price_at_decision : null,
        sell: sell ? sell.price_at_decision : null,
      };
    });
  }, [klines.data, evaluated]);

  const best = [...evaluated].sort((a, b) => b.outcomePct - a.outcomePct);
  const winners = best.filter((d) => d.hit).slice(0, 4);
  const losers = best.filter((d) => !d.hit).slice(-3).reverse();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Aprender</h1>
        <p className="text-sm text-muted-foreground">
          Mirá cómo opera el bot sobre el gráfico y aprendé de sus mejores (y
          peores) decisiones.
        </p>
      </div>

      {/* Selector de moneda */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          className="w-28"
        />
        {(watchlist.data ?? []).slice(0, 6).map((w) => (
          <Button
            key={w.id}
            size="sm"
            variant="outline"
            onClick={() => setSymbol(w.display_name ?? w.symbol.replace(/USDT$/, ""))}
          >
            {w.display_name ?? w.symbol.replace(/USDT$/, "")}
          </Button>
        ))}
      </div>

      {/* Gráfico con operaciones marcadas */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GraduationCap className="h-4 w-4" />
            Operaciones del bot sobre el precio de {symbol.toUpperCase()}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {klines.isLoading ? (
            <Skeleton className="h-72 w-full" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={chartData} margin={{ top: 8, right: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={28} stroke="currentColor" opacity={0.5} />
                  <YAxis tick={{ fontSize: 11 }} width={64} stroke="currentColor" opacity={0.5} tickFormatter={(v) => formatPrice(v)} />
                  <Tooltip
                    contentStyle={{ background: "rgba(20,20,25,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number, name) => [formatPrice(v), name === "buy" ? "Compra" : name === "sell" ? "Venta" : "Precio"]}
                  />
                  <Line type="monotone" dataKey="price" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
                  <Scatter dataKey="buy" fill="#10b981" shape="triangle" />
                  <Scatter dataKey="sell" fill="#ef4444" shape="triangle" />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="mt-2 flex items-center justify-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 bg-emerald-500" /> Compra del bot
                </span>
                <span className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 bg-red-500" /> Venta del bot
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {decisions.isLoading ? (
        <Skeleton className="h-40 w-full" />
      ) : evaluated.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            El bot todavía no tomó decisiones de compra/venta en {symbol.toUpperCase()}.
            Dejá correr el agente y volvé — acá vas a ver qué decidió y si acertó.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Aciertos */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Trophy className="h-4 w-4 text-emerald-500" />
                Mejores decisiones (aprendé qué funcionó)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {winners.length === 0 ? (
                <p className="text-sm text-muted-foreground">Todavía sin aciertos claros.</p>
              ) : (
                winners.map((d) => <DecisionLesson key={d.id} d={d} />)
              )}
            </CardContent>
          </Card>

          {/* Errores */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <XCircle className="h-4 w-4 text-red-500" />
                Errores (aprendé qué evitar)
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {losers.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin errores marcados todavía.</p>
              ) : (
                losers.map((d) => <DecisionLesson key={d.id} d={d} />)
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        El resultado de cada decisión se mide mirando el precio ~10 días después.
        Es para aprender qué señales suelen funcionar, no una medida contable
        exacta. Herramienta educativa, no es asesoría financiera.
      </p>
    </div>
  );
}

function DecisionLesson({ d }: { d: EvaluatedDecision }) {
  const Icon =
    d.action === "buy" ? TrendingUp : d.action === "sell" ? TrendingDown : Minus;
  const ind = d.indicators;
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Icon className={`h-4 w-4 ${d.action === "buy" ? "text-emerald-500" : "text-red-500"}`} />
          {d.action === "buy" ? "Comprar" : "Vender"} a {formatPrice(d.price_at_decision)}
        </span>
        <span className={`text-sm font-semibold ${d.hit ? "text-emerald-500" : "text-red-500"}`}>
          {formatPercent(d.outcomePct)}
        </span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{d.rationale}</p>
      {ind && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
          {ind.trend && <span>tendencia: {ind.trend}</span>}
          {ind.rsi != null && <span>RSI: {ind.rsi.toFixed(0)}</span>}
          {ind.imbalance != null && <span>libro: {(ind.imbalance * 100).toFixed(0)}%</span>}
          {ind.cvd != null && <span>CVD: {ind.cvd.toFixed(2)}</span>}
          {ind.fib != null && <span>fib: {ind.fib.toFixed(2)}</span>}
          {ind.macd != null && <span>MACD: {ind.macd.toFixed(2)}</span>}
        </div>
      )}
    </div>
  );
}
