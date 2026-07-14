import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import { fetchKlines, toBinancePair, formatPrice } from "@/lib/market";
import {
  runBacktest,
  DEFAULT_PARAMS,
  type BacktestParams,
  type BacktestResult,
} from "@/lib/backtest";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FlaskConical, Loader2, Info, TrendingUp, TrendingDown } from "lucide-react";

export const Route = createFileRoute("/_authed/backtest")({
  component: Backtest,
});

const PERIODS = [
  { label: "3 meses", limit: 90 },
  { label: "6 meses", limit: 180 },
  { label: "1 año", limit: 365 },
] as const;

function Backtest() {
  const [symbol, setSymbol] = useState("BTC");
  const [limit, setLimit] = useState(180);
  const [params, setParams] = useState<BacktestParams>(DEFAULT_PARAMS);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const candles = await fetchKlines(toBinancePair(symbol), "1d", limit);
      if (candles.length < params.smaLong + 5)
        throw new Error("No hay suficientes datos para ese período");
      setResult(runBacktest(candles, params));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error corriendo el backtest");
      setResult(null);
    } finally {
      setRunning(false);
    }
  }

  const set = (k: keyof BacktestParams, v: number | boolean) =>
    setParams((p) => ({ ...p, [k]: v }));

  const chartData =
    result?.equityCurve.map((pt) => ({
      label: new Date(pt.time).toLocaleDateString("es-AR", {
        day: "2-digit",
        month: "2-digit",
      }),
      Estrategia: pt.equity,
    })) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Backtesting</h1>
        <p className="text-sm text-muted-foreground">
          Probá la estrategia sobre datos históricos reales antes de arriesgar
          nada. Tuneá y buscá edge.
        </p>
      </div>

      {/* Configuración */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4" />
            Configuración
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Moneda</Label>
              <Input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                className="w-28"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Período</Label>
              <div className="flex gap-1">
                {PERIODS.map((pd) => (
                  <Button
                    key={pd.limit}
                    size="sm"
                    variant={limit === pd.limit ? "secondary" : "outline"}
                    onClick={() => setLimit(pd.limit)}
                  >
                    {pd.label}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Param label="Umbral señal" value={params.threshold} step={0.05} onChange={(v) => set("threshold", v)} />
            <Param label="Stop-loss %" value={params.stopLossPct} onChange={(v) => set("stopLossPct", v)} />
            <Param label="Trailing stop %" value={params.trailingStopPct} onChange={(v) => set("trailingStopPct", v)} />
            <Param label="Take-profit %" value={params.takeProfitPct} onChange={(v) => set("takeProfitPct", v)} />
            <Param label="RSI sobreventa" value={params.rsiOversold} onChange={(v) => set("rsiOversold", v)} />
            <Param label="RSI sobrecompra" value={params.rsiOverbought} onChange={(v) => set("rsiOverbought", v)} />
            <Param label="SMA corta" value={params.smaShort} onChange={(v) => set("smaShort", v)} />
            <Param label="SMA larga" value={params.smaLong} onChange={(v) => set("smaLong", v)} />
          </div>

          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={params.useRegimeFilter}
                onChange={(e) => set("useRegimeFilter", e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Filtro de régimen: no comprar en mercado bajista (precio bajo su
              media de {params.regimePeriod} días)
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={params.useVolumeFilter}
                onChange={(e) => set("useVolumeFilter", e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Confirmación por volumen: solo entra si el volumen supera{" "}
              {params.volumeFactor}× el promedio{" "}
              <span className="text-xs text-muted-foreground">(opcional)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={params.useMultiTimeframe}
                onChange={(e) => set("useMultiTimeframe", e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Multi-timeframe: solo entra si el marco semanal también es alcista{" "}
              <span className="text-xs text-muted-foreground">(opcional)</span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={params.useConviction}
                onChange={(e) => set("useConviction", e.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              Sizing por convicción: compra más grande cuando la señal es más
              fuerte (Soros/Kelly)
            </label>
          </div>

          <div className="flex items-center gap-3">
            <Button onClick={run} disabled={running}>
              {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />}
              Correr backtest
            </Button>
            {error && <span className="text-sm text-destructive">{error}</span>}
          </div>
        </CardContent>
      </Card>

      {result && (
        <>
          {/* Métricas */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
            <Metric
              label="Rendimiento"
              value={`${result.metrics.totalReturnPct >= 0 ? "+" : ""}${result.metrics.totalReturnPct.toFixed(1)}%`}
              tone={result.metrics.totalReturnPct >= 0 ? "up" : "down"}
            />
            <Metric
              label="vs Comprar y aguantar"
              value={`${result.metrics.buyHoldReturnPct >= 0 ? "+" : ""}${result.metrics.buyHoldReturnPct.toFixed(1)}%`}
              tone={
                result.metrics.totalReturnPct >= result.metrics.buyHoldReturnPct
                  ? "up"
                  : "down"
              }
            />
            <Metric label="Aciertos" value={`${result.metrics.winRate.toFixed(0)}%`} />
            <Metric label="Operaciones" value={String(result.metrics.numTrades)} />
            <Metric
              label="Caída máx. (DD)"
              value={`-${result.metrics.maxDrawdownPct.toFixed(1)}%`}
              tone="down"
            />
            <Metric
              label="Profit factor"
              value={
                Number.isFinite(result.metrics.profitFactor)
                  ? result.metrics.profitFactor.toFixed(2)
                  : "∞"
              }
              tone={result.metrics.profitFactor >= 1 ? "up" : "down"}
            />
          </div>

          <Verdict result={result} />

          {/* Curva */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Evolución de ${params.initialCapital} con la estrategia
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={280}>
                <LineChart data={chartData} margin={{ top: 8, right: 8, left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.12} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} minTickGap={28} stroke="currentColor" opacity={0.5} />
                  <YAxis tick={{ fontSize: 11 }} width={64} stroke="currentColor" opacity={0.5} tickFormatter={(v) => formatPrice(v)} />
                  <Tooltip
                    contentStyle={{ background: "rgba(20,20,25,0.95)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => formatPrice(v)}
                  />
                  <Legend />
                  <Line type="monotone" dataKey="Estrategia" stroke="#10b981" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </>
      )}

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        El backtest valida solo la parte TÉCNICA (RSI, tendencia, momentum). El
        flujo de órdenes/ballenas y las noticias no tienen datos históricos, así
        que esos se validan hacia adelante con el paper trading. Rendimiento
        pasado no garantiza resultados futuros.
      </p>
    </div>
  );
}

function Verdict({ result }: { result: BacktestResult }) {
  const { totalReturnPct, buyHoldReturnPct, profitFactor } = result.metrics;
  const beatsHold = totalReturnPct > buyHoldReturnPct;
  const profitable = totalReturnPct > 0 && profitFactor >= 1;

  let msg: string;
  let tone: "good" | "bad" | "meh";
  if (profitable && beatsHold) {
    msg = "Esta configuración ganó dinero Y le ganó a comprar y aguantar. Buen candidato — probala en paper trading antes de real.";
    tone = "good";
  } else if (profitable) {
    msg = "Ganó dinero, pero NO le ganó a simplemente comprar y aguantar. El bot no aporta edge acá; seguí tuneando.";
    tone = "meh";
  } else {
    msg = "Esta configuración pierde dinero en el histórico. NO la uses con plata real. Ajustá parámetros o probá otra moneda/período.";
    tone = "bad";
  }

  const cls =
    tone === "good"
      ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
      : tone === "bad"
        ? "border-red-500/40 bg-red-500/10 text-red-500"
        : "border-amber-500/40 bg-amber-500/10 text-amber-500";

  return (
    <div className={`flex items-start gap-2 rounded-lg border p-4 text-sm ${cls}`}>
      {tone === "good" ? (
        <TrendingUp className="mt-0.5 h-4 w-4 shrink-0" />
      ) : (
        <TrendingDown className="mt-0.5 h-4 w-4 shrink-0" />
      )}
      <span>{msg}</span>
    </div>
  );
}

function Param({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "up" | "down";
}) {
  const cls = tone === "up" ? "text-emerald-500" : tone === "down" ? "text-red-500" : "";
  return (
    <Card>
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className={`mt-1 text-lg font-bold ${cls}`}>{value}</div>
      </CardContent>
    </Card>
  );
}
