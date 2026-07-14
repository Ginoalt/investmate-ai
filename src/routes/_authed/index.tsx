import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  fetch24h,
  formatPrice,
  formatPercent,
  formatCompact,
  baseAsset,
  DEFAULT_PAIRS,
  type Ticker24h,
} from "@/lib/market";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowDownRight, ArrowUpRight, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authed/")({
  component: Dashboard,
});

function Dashboard() {
  const {
    data: tickers,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["market", "24h", DEFAULT_PAIRS],
    queryFn: () => fetch24h(DEFAULT_PAIRS),
    refetchInterval: 15_000, // refresco automático cada 15s
    staleTime: 10_000,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mercado</h1>
          <p className="text-sm text-muted-foreground">
            Precios cripto en vivo (Binance) · actualiza cada 15s
          </p>
        </div>
        <button
          onClick={() => refetch()}
          className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <RefreshCw
            className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
          />
          Actualizar
        </button>
      </div>

      {isError && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">
            No se pudieron cargar los precios:{" "}
            {error instanceof Error ? error.message : "error desconocido"}
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading
          ? DEFAULT_PAIRS.map((p) => <PriceCardSkeleton key={p} />)
          : tickers?.map((t) => <PriceCard key={t.symbol} ticker={t} />)}
      </div>
    </div>
  );
}

function PriceCard({ ticker }: { ticker: Ticker24h }) {
  const up = ticker.priceChangePercent >= 0;
  return (
    <Card className="overflow-hidden">
      <CardContent className="flex flex-col gap-3 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold">
              {baseAsset(ticker.symbol).slice(0, 3)}
            </span>
            <div className="flex flex-col">
              <span className="text-sm font-semibold">
                {baseAsset(ticker.symbol)}
              </span>
              <span className="text-xs text-muted-foreground">/ USDT</span>
            </div>
          </div>
          <span
            className={`flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-medium ${
              up
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-red-500/10 text-red-500"
            }`}
          >
            {up ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {formatPercent(ticker.priceChangePercent)}
          </span>
        </div>

        <div className="text-2xl font-bold tracking-tight">
          {formatPrice(ticker.lastPrice)}
        </div>

        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Vol 24h: ${formatCompact(ticker.quoteVolume)}</span>
          <span>
            {formatPrice(ticker.lowPrice)} – {formatPrice(ticker.highPrice)}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function PriceCardSkeleton() {
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-12" />
              <Skeleton className="h-3 w-10" />
            </div>
          </div>
          <Skeleton className="h-5 w-14 rounded-md" />
        </div>
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-3 w-full" />
      </CardContent>
    </Card>
  );
}
