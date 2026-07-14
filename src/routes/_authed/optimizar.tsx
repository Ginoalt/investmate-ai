import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { fetchKlines, toBinancePair, baseAsset } from "@/lib/market";
import type { BacktestParams } from "@/lib/backtest";
import { optimize, type OptimizerResult } from "@/lib/optimizer";
import { useAgentConfigs, useSaveAgentConfig } from "@/lib/agent-config";
import { useWatchlist } from "@/lib/watchlist";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Wand2,
  Loader2,
  Info,
  CheckCircle2,
  AlertTriangle,
  Check,
  Bot,
  Sparkles,
} from "lucide-react";

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
  const save = useSaveAgentConfig();
  const configs = useAgentConfigs();

  const pair = toBinancePair(symbol);
  const appliedFor = configs.data?.find((c) => c.symbol === pair) ?? null;

  const watchlist = useWatchlist();
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoLog, setAutoLog] = useState<
    { symbol: string; status: string; ok: boolean }[]
  >([]);

  function saveParams(r: OptimizerResult): Partial<BacktestParams> {
    return {
      threshold: r.params.threshold,
      stopLossPct: r.params.stopLossPct,
      takeProfitPct: r.params.takeProfitPct,
      trailingStopPct: r.params.trailingStopPct,
      useRegimeFilter: r.params.useRegimeFilter,
      useVolumeFilter: r.params.useVolumeFilter,
      volumeFactor: r.params.volumeFactor,
    };
  }

  // El bot se optimiza solo: para cada moneda de la watchlist busca la mejor
  // config robusta y la aplica. El usuario no elige nada.
  async function autoOptimizeAll() {
    const coins = (watchlist.data ?? []).map((w) => w.symbol);
    if (coins.length === 0) {
      setAutoLog([
        {
          symbol: "—",
          status: "Tu watchlist está vacía. Agregá monedas en Mercado.",
          ok: false,
        },
      ]);
      return;
    }
    setAutoRunning(true);
    setAutoLog([]);
    for (const pairSym of coins) {
      const b = baseAsset(pairSym);
      try {
        const candles = await fetchKlines(pairSym, "1d", 365);
        if (candles.length < 120) throw new Error("pocos datos históricos");
        const found = optimize(candles);
        const best = found.find((r) => r.robust) ?? found[0];
        if (!best) throw new Error("sin config válida");
        await save.mutateAsync({
          symbol: pairSym,
          params: saveParams(best),
          inSample: best.inSample.totalReturnPct,
          outOfSample: best.outOfSample.totalReturnPct,
          robust: best.robust,
        });
        setAutoLog((l) => [
          ...l,
          {
            symbol: b,
            status: `aplicada · out-of-sample ${best.outOfSample.totalReturnPct.toFixed(1)}%${best.robust ? " (robusta)" : ""}`,
            ok: true,
          },
        ]);
      } catch (err) {
        setAutoLog((l) => [
          ...l,
          { symbol: b, status: err instanceof Error ? err.message : "error", ok: false },
        ]);
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    setAutoRunning(false);
  }

  function apply(r: OptimizerResult) {
    save.mutate({
      symbol: pair,
      params: {
        threshold: r.params.threshold,
        stopLossPct: r.params.stopLossPct,
        takeProfitPct: r.params.takeProfitPct,
        trailingStopPct: r.params.trailingStopPct,
        useRegimeFilter: r.params.useRegimeFilter,
        useVolumeFilter: r.params.useVolumeFilter,
        volumeFactor: r.params.volumeFactor,
      },
      inSample: r.inSample.totalReturnPct,
      outOfSample: r.outOfSample.totalReturnPct,
      robust: r.robust,
    });
  }

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

      {/* El bot se optimiza solo — la forma "no decido nada" */}
      <Card className="border-primary/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Bot className="h-4 w-4" />
            Que el bot se optimice solo
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Un clic y el bot busca la mejor config <b>robusta</b> para cada
            moneda de tu watchlist y la aplica solo. No elegís nada — el agente
            la usa en su próxima corrida.
          </p>
          <div>
            <Button onClick={autoOptimizeAll} disabled={autoRunning}>
              {autoRunning ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {autoRunning
                ? "Optimizando tu watchlist…"
                : "Auto-optimizar mi bot"}
            </Button>
          </div>
          {autoLog.length > 0 && (
            <div className="flex flex-col divide-y divide-border rounded-md border border-border">
              {autoLog.map((r, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <span className="font-medium">{r.symbol}</span>
                  <span
                    className={`flex items-center gap-1.5 text-xs ${
                      r.ok ? "text-emerald-500" : "text-amber-500"
                    }`}
                  >
                    {r.ok ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <AlertTriangle className="h-3.5 w-3.5" />
                    )}
                    {r.status}
                  </span>
                </div>
              ))}
              {!autoRunning && autoLog.some((r) => r.ok) && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  Listo. El agente usará estas configs en su próxima corrida.
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4" />
            O buscá y elegí a mano
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

          {appliedFor && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm text-emerald-500">
              <Check className="h-4 w-4" />
              El agente ya usa una config para {baseAsset(pair)}: out-of-sample{" "}
              {(appliedFor.out_of_sample_return ?? 0).toFixed(1)}%
              {appliedFor.robust ? " (robusta)" : ""}. Podés reemplazarla abajo.
            </div>
          )}

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
                      <th className="pb-2 text-right">Agente</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.map((r, i) => (
                      <ResultRow
                        key={i}
                        rank={i + 1}
                        r={r}
                        onApply={() => apply(r)}
                        saving={save.isPending}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
              {save.isError && (
                <p className="mt-2 text-sm text-destructive">
                  No se pudo aplicar. ¿La migración de agent_configs está aplicada?
                </p>
              )}
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

function ResultRow({
  rank,
  r,
  onApply,
  saving,
}: {
  rank: number;
  r: OptimizerResult;
  onApply: () => void;
  saving: boolean;
}) {
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
      <td className="py-2 text-right">
        <Button size="sm" variant="outline" onClick={onApply} disabled={saving}>
          Aplicar
        </Button>
      </td>
    </tr>
  );
}
