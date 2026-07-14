import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { LiveTrades } from "@/components/live-trades";
import {
  usePortfolio,
  usePositions,
  useTrades,
  useRiskSettings,
  useUpdateRiskSettings,
  useBuy,
  useSell,
  usePanic,
  useSetPaused,
  type RiskSettings,
} from "@/lib/portfolio";
import { useDecisions } from "@/lib/agent";
import {
  fetch24h,
  formatPrice,
  formatPercent,
  baseAsset,
  toBinancePair,
} from "@/lib/market";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ShieldAlert,
  Play,
  Pause,
  Target,
} from "lucide-react";

export const Route = createFileRoute("/_authed/portfolio")({
  component: PortfolioPage,
});

function PortfolioPage() {
  const portfolio = usePortfolio();
  const positions = usePositions();
  const trades = useTrades();

  // precios en vivo de las monedas en posición
  const posSymbols = positions.data?.map((p) => p.symbol) ?? [];
  const prices = useQuery({
    queryKey: ["market", "24h", "positions", posSymbols],
    queryFn: () => fetch24h(posSymbols),
    enabled: posSymbols.length > 0,
    refetchInterval: 15_000,
  });
  const priceBy = useMemo(
    () => new Map((prices.data ?? []).map((t) => [t.symbol, t.lastPrice])),
    [prices.data],
  );

  const positionsValue = (positions.data ?? []).reduce((sum, p) => {
    const price = priceBy.get(p.symbol) ?? p.avg_price;
    return sum + p.quantity * price;
  }, 0);
  const cash = portfolio.data?.cash_balance ?? 0;
  const equity = cash + positionsValue;
  const initial = portfolio.data?.initial_balance ?? 100;
  const totalPnl = equity - initial;
  const totalPnlPct = initial > 0 ? (totalPnl / initial) * 100 : 0;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Portafolio</h1>
        <p className="text-sm text-muted-foreground">
          Simulado — sin dinero real. El agente y vos operan sobre este saldo.
        </p>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="Valor total"
          value={formatPrice(equity)}
          icon={Wallet}
          loading={portfolio.isLoading}
        />
        <StatCard label="Caja" value={formatPrice(cash)} loading={portfolio.isLoading} />
        <StatCard
          label="En posiciones"
          value={formatPrice(positionsValue)}
          loading={positions.isLoading}
        />
        <StatCard
          label="Ganancia/Pérdida"
          value={`${totalPnl >= 0 ? "+" : ""}${formatPrice(totalPnl)}`}
          hint={formatPercent(totalPnlPct)}
          tone={totalPnl >= 0 ? "up" : "down"}
          loading={portfolio.isLoading}
        />
      </div>

      <AgentAccuracy />

      {/* Posiciones */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Posiciones</CardTitle>
        </CardHeader>
        <CardContent>
          {positions.isLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : (positions.data?.length ?? 0) === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No tenés posiciones abiertas. Comprá abajo o dejá que el agente
              opere.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted-foreground">
                    <th className="pb-2">Moneda</th>
                    <th className="pb-2 text-right">Cantidad</th>
                    <th className="pb-2 text-right">Precio prom.</th>
                    <th className="pb-2 text-right">Precio actual</th>
                    <th className="pb-2 text-right">Valor</th>
                    <th className="pb-2 text-right">P&L</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {positions.data!.map((p) => {
                    const price = priceBy.get(p.symbol) ?? p.avg_price;
                    const value = p.quantity * price;
                    const pnl = (price - p.avg_price) * p.quantity;
                    const up = pnl >= 0;
                    return (
                      <PositionRow
                        key={p.id}
                        symbol={p.symbol}
                        quantity={p.quantity}
                        avg={p.avg_price}
                        price={price}
                        value={value}
                        pnl={pnl}
                        up={up}
                      />
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <ManualTrade cash={cash} />
        <RiskPanel isPaused={portfolio.data?.is_paused ?? false} />
      </div>

      {/* Feed en vivo de lo que opera el bot */}
      <LiveTrades />
    </div>
  );
}

function PositionRow({
  symbol,
  quantity,
  avg,
  price,
  value,
  pnl,
  up,
}: {
  symbol: string;
  quantity: number;
  avg: number;
  price: number;
  value: number;
  pnl: number;
  up: boolean;
}) {
  const sell = useSell();
  return (
    <tr className="border-t border-border">
      <td className="py-2 font-medium">{baseAsset(symbol)}</td>
      <td className="py-2 text-right">{quantity.toPrecision(4)}</td>
      <td className="py-2 text-right">{formatPrice(avg)}</td>
      <td className="py-2 text-right">{formatPrice(price)}</td>
      <td className="py-2 text-right">{formatPrice(value)}</td>
      <td
        className={`py-2 text-right ${up ? "text-emerald-500" : "text-red-500"}`}
      >
        {pnl >= 0 ? "+" : ""}
        {formatPrice(pnl)}
      </td>
      <td className="py-2 text-right">
        <Button
          size="sm"
          variant="outline"
          disabled={sell.isPending}
          onClick={() => sell.mutate({ symbol, price })}
        >
          Vender
        </Button>
      </td>
    </tr>
  );
}

function ManualTrade({ cash }: { cash: number }) {
  const buy = useBuy();
  const [symbol, setSymbol] = useState("");
  const [usd, setUsd] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleBuy(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const amount = Number(usd);
    if (!symbol.trim() || !amount || amount <= 0) {
      setError("Completá moneda y monto");
      return;
    }
    try {
      const [ticker] = await fetch24h([toBinancePair(symbol)]);
      if (!ticker) throw new Error("Moneda no encontrada en Binance");
      await buy.mutateAsync({ symbol, usd: amount, price: ticker.lastPrice });
      setUsd("");
      setSymbol("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo comprar");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Comprar (simulado)</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleBuy} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="buy-symbol">Moneda</Label>
            <Input
              id="buy-symbol"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              placeholder="BTC"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="buy-usd">Monto (USD) · disponible {formatPrice(cash)}</Label>
            <Input
              id="buy-usd"
              type="number"
              value={usd}
              onChange={(e) => setUsd(e.target.value)}
              placeholder="25"
              min={0}
              step="0.01"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={buy.isPending}>
            {buy.isPending ? "Comprando…" : "Comprar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

function RiskPanel({ isPaused }: { isPaused: boolean }) {
  const settings = useRiskSettings();
  const update = useUpdateRiskSettings();
  const panic = usePanic();
  const setPaused = useSetPaused();
  const [draft, setDraft] = useState<Partial<RiskSettings>>({});

  const val = (k: keyof RiskSettings) =>
    draft[k] ?? settings.data?.[k] ?? 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">Guardarraíles</CardTitle>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            isPaused
              ? "bg-amber-500/10 text-amber-500"
              : "bg-emerald-500/10 text-emerald-500"
          }`}
        >
          Agente {isPaused ? "pausado" : "activo"}
        </span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {settings.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <>
            <RiskField
              label="Stop-loss (%)"
              value={val("stop_loss_pct")}
              onChange={(v) => setDraft((d) => ({ ...d, stop_loss_pct: v }))}
            />
            <RiskField
              label="Pérdida máxima diaria (%)"
              value={val("max_daily_loss_pct")}
              onChange={(v) => setDraft((d) => ({ ...d, max_daily_loss_pct: v }))}
            />
            <RiskField
              label="Tamaño máx. por posición (%)"
              value={val("max_position_pct")}
              onChange={(v) => setDraft((d) => ({ ...d, max_position_pct: v }))}
            />
            <RiskField
              label="Confianza mínima del agente (0-1)"
              value={val("min_confidence")}
              step={0.05}
              onChange={(v) => setDraft((d) => ({ ...d, min_confidence: v }))}
            />
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                size="sm"
                onClick={() => update.mutate(draft)}
                disabled={update.isPending || Object.keys(draft).length === 0}
              >
                Guardar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setPaused.mutate(!isPaused)}
                disabled={setPaused.isPending}
              >
                {isPaused ? (
                  <>
                    <Play className="h-4 w-4" /> Reanudar agente
                  </>
                ) : (
                  <>
                    <Pause className="h-4 w-4" /> Pausar agente
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => {
                  if (
                    confirm(
                      "¿Liquidar TODAS las posiciones a precio de mercado y pausar el agente?",
                    )
                  )
                    panic.mutate();
                }}
                disabled={panic.isPending}
              >
                <ShieldAlert className="h-4 w-4" />
                Botón de pánico
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function RiskField({
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
    <div className="flex items-center justify-between gap-3">
      <Label className="text-sm text-muted-foreground">{label}</Label>
      <Input
        type="number"
        className="w-24"
        value={value}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/** Panel "¿el agente acierta?": compara cada decisión vieja con el precio actual. */
function AgentAccuracy() {
  const decisions = useDecisions(undefined, 100);
  const symbols = useMemo(
    () =>
      Array.from(
        new Set(
          (decisions.data ?? [])
            .filter((d) => d.action !== "hold")
            .map((d) => toBinancePair(d.symbol)),
        ),
      ),
    [decisions.data],
  );
  const prices = useQuery({
    queryKey: ["market", "24h", "acc", symbols],
    queryFn: () => fetch24h(symbols),
    enabled: symbols.length > 0,
  });
  const priceBy = new Map((prices.data ?? []).map((t) => [t.symbol, t.lastPrice]));

  const evaluated = (decisions.data ?? [])
    .filter((d) => d.action !== "hold")
    .map((d) => {
      const cur = priceBy.get(toBinancePair(d.symbol));
      if (!cur) return null;
      const hit =
        d.action === "buy"
          ? cur > d.price_at_decision
          : cur < d.price_at_decision;
      return hit;
    })
    .filter((x): x is boolean => x !== null);

  const total = evaluated.length;
  const hits = evaluated.filter(Boolean).length;
  const rate = total > 0 ? (hits / total) * 100 : 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4" />
          ¿El agente acierta?
        </CardTitle>
        <span className="text-xs text-muted-foreground">
          decisiones de compra/venta vs precio actual
        </span>
      </CardHeader>
      <CardContent>
        {decisions.isLoading ? (
          <Skeleton className="h-16 w-full" />
        ) : total === 0 ? (
          <p className="text-sm text-muted-foreground">
            Todavía no hay decisiones de compra/venta para evaluar. Dejá correr
            el agente y volvé más tarde.
          </p>
        ) : (
          <div className="flex items-center gap-6">
            <div>
              <div className="text-3xl font-bold">
                {rate.toFixed(0)}%
                {rate >= 50 ? (
                  <TrendingUp className="ml-2 inline h-5 w-5 text-emerald-500" />
                ) : (
                  <TrendingDown className="ml-2 inline h-5 w-5 text-red-500" />
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {hits} de {total} decisiones acertadas
              </div>
            </div>
            <p className="max-w-md text-xs text-muted-foreground">
              Medida cruda: una decisión "acierta" si tras sugerir comprar el
              precio subió (o bajó tras sugerir vender). No considera cuándo se
              cerró. Sirve para ver si el agente tiene un edge antes de arriesgar
              plata real.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({
  label,
  value,
  hint,
  tone,
  icon: Icon,
  loading,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down";
  icon?: typeof Wallet;
  loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4">
        <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
          {Icon && <Icon className="h-3.5 w-3.5" />}
          {label}
        </div>
        {loading ? (
          <Skeleton className="mt-2 h-7 w-24" />
        ) : (
          <div
            className={`mt-1 text-xl font-bold ${
              tone === "up"
                ? "text-emerald-500"
                : tone === "down"
                  ? "text-red-500"
                  : ""
            }`}
          >
            {value}
          </div>
        )}
        {hint && !loading && (
          <div
            className={`text-xs ${
              tone === "up"
                ? "text-emerald-500"
                : tone === "down"
                  ? "text-red-500"
                  : "text-muted-foreground"
            }`}
          >
            {hint}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
