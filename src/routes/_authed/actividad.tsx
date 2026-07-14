import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { usePortfolio, usePositions, useTrades } from "@/lib/portfolio";
import { useDecisions, type Decision } from "@/lib/agent";
import { useSnapshots } from "@/lib/activity";
import { fetch24h, formatPrice, formatPercent, baseAsset } from "@/lib/market";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity,
  TrendingUp,
  TrendingDown,
  Minus,
  Circle,
  Bot,
} from "lucide-react";

export const Route = createFileRoute("/_authed/actividad")({
  component: Actividad,
});

function safeWhen(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es });
  } catch {
    return "";
  }
}

const ACTION: Record<string, { label: string; cls: string }> = {
  buy: { label: "Comprar", cls: "bg-emerald-500/10 text-emerald-500" },
  sell: { label: "Vender", cls: "bg-red-500/10 text-red-500" },
  hold: { label: "Mantener", cls: "bg-secondary text-muted-foreground" },
};

function Actividad() {
  const portfolio = usePortfolio();
  const positions = usePositions();
  const trades = useTrades(15);
  const decisions = useDecisions(undefined, 25);
  const snapshots = useSnapshots();

  // equity en vivo (para el número grande y el último punto de la curva)
  const posSymbols = positions.data?.map((p) => p.symbol) ?? [];
  const prices = useQuery({
    queryKey: ["market", "24h", "activity", posSymbols],
    queryFn: () => fetch24h(posSymbols),
    enabled: posSymbols.length > 0,
    refetchInterval: 20_000,
  });
  const priceBy = useMemo(
    () => new Map((prices.data ?? []).map((t) => [t.symbol, t.lastPrice])),
    [prices.data],
  );
  const positionsValue = (positions.data ?? []).reduce(
    (s, p) => s + p.quantity * (priceBy.get(p.symbol) ?? p.avg_price),
    0,
  );
  const cash = portfolio.data?.cash_balance ?? 0;
  const equity = cash + positionsValue;
  const initial = portfolio.data?.initial_balance ?? 100;
  const pnl = equity - initial;
  const pnlPct = initial > 0 ? (pnl / initial) * 100 : 0;

  // datos de la curva: snapshots + punto "ahora"
  const chartData = useMemo(() => {
    const pts = (snapshots.data ?? []).map((s) => ({
      t: new Date(s.created_at).getTime(),
      label: new Date(s.created_at).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
      }),
      equity: s.equity,
    }));
    if (!portfolio.isLoading) {
      pts.push({ t: Date.now(), label: "ahora", equity });
    }
    return pts;
  }, [snapshots.data, equity, portfolio.isLoading]);

  const lastDecision = decisions.data?.[0];
  const paused = portfolio.data?.is_paused ?? false;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Sala de operaciones
          </h1>
          <p className="text-sm text-muted-foreground">
            Cómo está operando el bot, en vivo. Entrá cuando quieras a ver qué
            hace.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm font-medium ${
              paused
                ? "bg-amber-500/10 text-amber-500"
                : "bg-emerald-500/10 text-emerald-500"
            }`}
          >
            <Circle
              className={`h-2.5 w-2.5 ${paused ? "" : "animate-pulse fill-current"}`}
            />
            Agente {paused ? "pausado" : "activo"}
          </span>
        </div>
      </div>

      {/* Equity + P&L */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Metric
          label="Valor del portafolio"
          value={formatPrice(equity)}
          loading={portfolio.isLoading}
        />
        <Metric
          label="Ganancia/Pérdida"
          value={`${pnl >= 0 ? "+" : ""}${formatPrice(pnl)}`}
          hint={formatPercent(pnlPct)}
          tone={pnl >= 0 ? "up" : "down"}
          loading={portfolio.isLoading}
        />
        <Metric
          label="Operaciones"
          value={String(trades.data?.length ?? 0)}
          loading={trades.isLoading}
        />
        <Metric
          label="Última decisión"
          value={
            lastDecision
              ? formatDistanceToNow(new Date(lastDecision.created_at), {
                  addSuffix: true,
                  locale: es,
                })
              : "—"
          }
          loading={decisions.isLoading}
        />
      </div>

      {/* Curva de evolución */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            Evolución del portafolio
          </CardTitle>
        </CardHeader>
        <CardContent>
          {snapshots.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : chartData.length < 2 ? (
            <div className="flex h-56 flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
              <Activity className="h-6 w-6" />
              <p>
                Todavía no hay suficiente histórico para el gráfico.
                <br />
                Se va llenando cada vez que el agente corre (manual o por cron).
              </p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 8 }}>
                <defs>
                  <linearGradient id="eq" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  minTickGap={28}
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
                    background: "rgba(20,20,25,0.95)",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [formatPrice(v), "Valor"]}
                />
                <Area
                  type="monotone"
                  dataKey="equity"
                  stroke="#10b981"
                  strokeWidth={2}
                  fill="url(#eq)"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Feed de análisis del agente */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="h-4 w-4" />
              Análisis del agente
            </CardTitle>
          </CardHeader>
          <CardContent>
            {decisions.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (decisions.data?.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                El agente todavía no analizó nada. Corré una moneda o esperá al
                cron.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {decisions.data!.map((d) => (
                  <DecisionLine key={d.id} d={d} />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Operaciones recientes */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Operaciones del bot</CardTitle>
          </CardHeader>
          <CardContent>
            {trades.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : (trades.data?.length ?? 0) === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                Todavía no hay operaciones.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border">
                {trades.data!.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-xs font-medium ${
                          t.side === "buy"
                            ? "bg-emerald-500/10 text-emerald-500"
                            : "bg-red-500/10 text-red-500"
                        }`}
                      >
                        {t.side === "buy" ? "Compra" : "Venta"}
                      </span>
                      <span className="font-medium">{baseAsset(t.symbol)}</span>
                      <span className="text-xs text-muted-foreground">
                        {t.quantity.toPrecision(3)} @ {formatPrice(t.price)}
                      </span>
                    </span>
                    <span className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{formatPrice(t.total_value)}</span>
                      <span>{safeWhen(t.executed_at)}</span>
                      {t.pnl != null && (
                        <span
                          className={
                            t.pnl >= 0 ? "text-emerald-500" : "text-red-500"
                          }
                        >
                          {t.pnl >= 0 ? "+" : ""}
                          {formatPrice(t.pnl)}
                        </span>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DecisionLine({ d }: { d: Decision }) {
  const a = ACTION[d.action] ?? ACTION.hold;
  const Icon =
    d.action === "buy" ? TrendingUp : d.action === "sell" ? TrendingDown : Minus;
  return (
    <div className="flex flex-col gap-1 py-2.5">
      <div className="flex items-center justify-between">
        <Link
          to="/coin/$symbol"
          params={{ symbol: d.symbol }}
          className="flex items-center gap-2 text-sm font-medium hover:text-primary"
        >
          <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-xs ${a.cls}`}>
            <Icon className="h-3 w-3" />
            {a.label}
          </span>
          {d.symbol}
        </Link>
        <span className="text-xs text-muted-foreground">
          {(d.confidence * 100).toFixed(0)}% ·{" "}
          {formatDistanceToNow(new Date(d.created_at), {
            addSuffix: true,
            locale: es,
          })}
        </span>
      </div>
      <p className="line-clamp-2 text-xs text-muted-foreground">{d.rationale}</p>
    </div>
  );
}

function Metric({
  label,
  value,
  hint,
  tone,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down";
  loading?: boolean;
}) {
  const toneCls =
    tone === "up" ? "text-emerald-500" : tone === "down" ? "text-red-500" : "";
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-6 w-20" />
        ) : (
          <div className={`mt-1 text-lg font-bold ${toneCls}`}>{value}</div>
        )}
        {hint && !loading && (
          <div className={`text-xs ${toneCls || "text-muted-foreground"}`}>
            {hint}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
