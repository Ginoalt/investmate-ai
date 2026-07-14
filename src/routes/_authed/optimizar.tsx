import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { fetchKlines, toBinancePair } from "@/lib/market";
import { optimize, type OptimizerResult } from "@/lib/optimizer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Wand2, Loader2, Info, CheckCircle2, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authed/optimizar")({
  component: Optimizar,
});

const PERIODS = [
  { label: "6 meses", limit: 180 },
  { label: "1 año", limit: 365 },
] as const;

function Optimizar() {
  const [symbol, setSymbol] = useState("BTC");
  const [limit, setLimit] = useState(365);
  const [results, setResults] = useState<OptimizerResult[] | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setError(null);
    setResults(null);
    try {
      const candles = await fetchKlines(toBinancePair(symbol), "1d", limit);
      if (candles.length < 120)
        throw new Error("Necesito al menos ~120 días de datos");
      // Dejar pintar el spinner antes del cómputo (bloquea unos segundos).
      await new Promise((r) => setTimeout(r, 30));
      setResults(optimize(candles));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error optimizando");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Auto-optimizador
        </h1>
        <p className="text-sm text-muted-foreground">
          El sistema prueba solo cientos de combinaciones y encuentra las
          mejores. Vos no configurás nada.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4" />
            Buscar la mejor estrategia
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-4">
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
          <Button onClick={run} disabled={running}>
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Wand2 className="h-4 w-4" />
            )}
            {running ? "Optimizando…" : "Optimizar"}
          </Button>
          {error && <span className="text-sm text-destructive">{error}</span>}
        </CardContent>
      </Card>

      {results && (
        <>
          <div className="flex items-start gap-2 rounded-lg border border-border bg-secondary/30 p-4 text-sm text-muted-foreground">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Rankeadas por rendimiento <b>in-sample</b> (primer 70% del
              histórico). La columna <b>out-of-sample</b> mide en el último 30%
              que la búsqueda NO vio: si ahí también gana (✓ robusta),
              probablemente tenga edge real; si ahí pierde, memorizó el pasado
              (overfitting).
            </span>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Mejores configuraciones</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="pb-2">#</th>
                      <th className="pb-2 text-right">In-sample</th>
                      <th className="pb-2 text-right">Out-of-sample</th>
                      <th className="pb-2 text-center">Robusta</th>
                      <th className="pb-2">Parámetros</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <ResultRow key={i} rank={i + 1} r={r} />
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Optimizar sobre el pasado NO garantiza el futuro (el mercado cambia).
            Por eso miramos out-of-sample y conviene re-optimizar cada tanto. El
            próximo paso es que el agente en vivo use la config robusta que elijas.
          </p>
        </>
      )}
    </div>
  );
}

function ResultRow({ rank, r }: { rank: number; r: OptimizerResult }) {
  const inRet = r.inSample.totalReturnPct;
  const outRet = r.outOfSample.totalReturnPct;
  const p = r.params;
  return (
    <tr className="border-t border-border">
      <td className="py-2 font-medium">{rank}</td>
      <td className={`py-2 text-right ${inRet >= 0 ? "text-emerald-500" : "text-red-500"}`}>
        {inRet >= 0 ? "+" : ""}
        {inRet.toFixed(1)}%
        <span className="ml-1 text-xs text-muted-foreground">
          {r.inSample.winRate.toFixed(0)}%ac
        </span>
      </td>
      <td className={`py-2 text-right ${outRet >= 0 ? "text-emerald-500" : "text-red-500"}`}>
        {outRet >= 0 ? "+" : ""}
        {outRet.toFixed(1)}%
        <span className="ml-1 text-xs text-muted-foreground">
          {r.outOfSample.winRate.toFixed(0)}%ac
        </span>
      </td>
      <td className="py-2 text-center">
        {r.robust ? (
          <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
        ) : (
          <AlertTriangle className="mx-auto h-4 w-4 text-amber-500" />
        )}
      </td>
      <td className="py-2 text-xs text-muted-foreground">
        umbral {p.threshold} · SL {p.stopLossPct}% · TP {p.takeProfitPct}%
        {p.trailingStopPct > 0 ? ` · trail ${p.trailingStopPct}%` : ""}
        {p.useRegimeFilter ? " · régimen" : ""}
        {p.useVolumeFilter ? " · volumen" : ""}
      </td>
    </tr>
  );
}
