import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  fetchKlines,
  fetch24h,
  toBinancePair,
  formatPrice,
  formatPercent,
} from "@/lib/market";
import { sma, smaSeries, rsi, rsiZone, trend } from "@/lib/indicators";
import { OrderFlowPanel } from "@/components/order-flow-panel";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, ArrowDownRight, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/_authed/coin/$symbol")({
  component: CoinDetail,
});

type Range = 7 | 30;

function CoinDetail() {
  const { symbol } = Route.useParams();
  const pair = toBinancePair(symbol);
  const [range, setRange] = useState<Range>(30);

  // 60 velas diarias: suficiente para SMA50 aunque el gráfico muestre 7/30.
  const klines = useQuery({
    queryKey: ["klines", pair],
    queryFn: () => fetchKlines(pair, "1d", 60),
    staleTime: 60_000,
  });

  const ticker = useQuery({
    queryKey: ["market", "24h", [pair]],
    queryFn: () => fetch24h([pair]),
    refetchInterval: 15_000,
  });

  const closes = klines.data?.map((c) => c.close) ?? [];
  const s20 = sma(closes, 20);
  const s50 = sma(closes, 50);
  const rsi14 = rsi(closes, 14);
  const zone = rsiZone(rsi14);
  const t = closes.length ? trend(closes) : "lateral";
  const sma20Full = smaSeries(closes, 20);

  // Datos del gráfico: últimas `range` velas con su SMA20.
  const chartData = (klines.data ?? [])
    .map((c, i) => ({
      date: new Date(c.time).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
      }),
      close: c.close,
      sma20: sma20Full[i],
    }))
    .slice(-range);

  const t24 = ticker.data?.[0];
  const up = (t24?.priceChangePercent ?? 0) >= 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          to="/"
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver al mercado
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-sm font-bold">
              {symbol.slice(0, 3)}
            </span>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                {symbol.toUpperCase()}
                <span className="ml-1 text-base font-normal text-muted-foreground">
                  / USDT
                </span>
              </h1>
              {t24 ? (
                <div className="flex items-center gap-2">
                  <span className="text-lg font-bold">
                    {formatPrice(t24.lastPrice)}
                  </span>
                  <span
                    className={`flex items-center gap-0.5 text-sm font-medium ${
                      up ? "text-emerald-500" : "text-red-500"
                    }`}
                  >
                    {up ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : (
                      <ArrowDownRight className="h-4 w-4" />
                    )}
                    {formatPercent(t24.priceChangePercent)}
                  </span>
                </div>
              ) : (
                <Skeleton className="mt-1 h-6 w-32" />
              )}
            </div>
          </div>
          <TrendBadge trend={t} />
        </div>
      </div>

      {/* Gráfico */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Precio</CardTitle>
          <div className="flex gap-1">
            {([7, 30] as Range[]).map((r) => (
              <Button
                key={r}
                size="sm"
                variant={range === r ? "secondary" : "ghost"}
                onClick={() => setRange(r)}
              >
                {r}d
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {klines.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : klines.isError ? (
            <p className="py-12 text-center text-sm text-destructive">
              No se pudo cargar el gráfico.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  minTickGap={24}
                  stroke="currentColor"
                  opacity={0.5}
                />
                <YAxis
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 11 }}
                  width={64}
                  stroke="currentColor"
                  opacity={0.5}
                  tickFormatter={(v) => formatPrice(v)}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover, 0 0% 10%))",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => formatPrice(v)}
                />
                <Line
                  type="monotone"
                  dataKey="close"
                  name="Precio"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="sma20"
                  name="SMA 20"
                  stroke="#6366f1"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Indicator
          label="SMA 20"
          value={s20 != null ? formatPrice(s20) : "—"}
          loading={klines.isLoading}
        />
        <Indicator
          label="SMA 50"
          value={s50 != null ? formatPrice(s50) : "—"}
          loading={klines.isLoading}
        />
        <Indicator
          label="RSI (14)"
          value={rsi14 != null ? rsi14.toFixed(1) : "—"}
          hint={zone.label}
          hintTone={zone.tone}
          loading={klines.isLoading}
        />
        <Indicator
          label="Tendencia"
          value={t}
          loading={klines.isLoading}
        />
      </div>

      {/* Flujo de órdenes y ballenas */}
      <OrderFlowPanel pair={pair} />

      <p className="text-xs text-muted-foreground">
        Indicadores calculados sobre velas diarias. Herramienta educativa, no es
        asesoría financiera.
      </p>
    </div>
  );
}

function TrendBadge({ trend }: { trend: string }) {
  const map: Record<string, string> = {
    alcista: "bg-emerald-500/10 text-emerald-500",
    bajista: "bg-red-500/10 text-red-500",
    lateral: "bg-secondary text-muted-foreground",
  };
  return (
    <span
      className={`rounded-md px-2.5 py-1 text-sm font-medium capitalize ${
        map[trend] ?? map.lateral
      }`}
    >
      Tendencia {trend}
    </span>
  );
}

function Indicator({
  label,
  value,
  hint,
  hintTone,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  hintTone?: "over" | "under" | "neutral";
  loading?: boolean;
}) {
  const toneClass =
    hintTone === "over"
      ? "text-red-500"
      : hintTone === "under"
        ? "text-emerald-500"
        : "text-muted-foreground";
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-6 w-20" />
        ) : (
          <div className="mt-1 text-xl font-semibold capitalize">{value}</div>
        )}
        {hint && !loading && (
          <div className={`text-xs ${toneClass}`}>{hint}</div>
        )}
      </CardContent>
    </Card>
  );
}
