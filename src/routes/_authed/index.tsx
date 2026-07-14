import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  fetch24h,
  formatPrice,
  formatPercent,
  formatCompact,
  baseAsset,
  DEFAULT_PAIRS,
  type Ticker24h,
} from "@/lib/market";
import {
  useWatchlist,
  useAddToWatchlist,
  useRemoveFromWatchlist,
} from "@/lib/watchlist";
import { NewsFeed } from "@/components/news-feed";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  ArrowDownRight,
  ArrowUpRight,
  RefreshCw,
  Plus,
  X,
  Star,
  Loader2,
} from "lucide-react";

export const Route = createFileRoute("/_authed/")({
  component: Dashboard,
});

function Dashboard() {
  const watchlist = useWatchlist();
  const add = useAddToWatchlist();
  const remove = useRemoveFromWatchlist();
  const [input, setInput] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const hasWatchlist = (watchlist.data?.length ?? 0) > 0;
  const pairs = hasWatchlist
    ? watchlist.data!.map((w) => w.symbol)
    : DEFAULT_PAIRS;
  // Mapa símbolo -> id de watchlist (para el botón quitar).
  const idBySymbol = new Map(
    (watchlist.data ?? []).map((w) => [w.symbol, w.id]),
  );

  const {
    data: tickers,
    isLoading,
    isError,
    error,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["market", "24h", pairs],
    queryFn: () => fetch24h(pairs),
    refetchInterval: 15_000,
    staleTime: 10_000,
    enabled: pairs.length > 0,
  });

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setAddError(null);
    const value = input.trim();
    if (!value) return;
    try {
      await add.mutateAsync(value);
      setInput("");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "No se pudo agregar");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
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
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      {/* Agregar moneda a la watchlist */}
      <form onSubmit={handleAdd} className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value.toUpperCase())}
            placeholder="Agregar moneda (ej. BTC, SOL, LINK)"
            className="w-64"
          />
          <Button type="submit" disabled={add.isPending || !input.trim()}>
            {add.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Agregar
          </Button>
        </div>
        {addError && <span className="text-sm text-destructive">{addError}</span>}
      </form>

      {!hasWatchlist && !watchlist.isLoading && (
        <div className="flex items-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground">
          <Star className="h-4 w-4" />
          Tu watchlist está vacía — te mostramos monedas populares. Agregá las
          que quieras seguir.
        </div>
      )}

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
          ? pairs.map((p) => <PriceCardSkeleton key={p} />)
          : tickers?.map((t) => (
              <PriceCard
                key={t.symbol}
                ticker={t}
                watchlistId={idBySymbol.get(t.symbol)}
                onRemove={(id) => remove.mutate(id)}
              />
            ))}
      </div>

      {/* Feed general de noticias cripto */}
      <NewsFeed title="Noticias del mercado" />
    </div>
  );
}

function PriceCard({
  ticker,
  watchlistId,
  onRemove,
}: {
  ticker: Ticker24h;
  watchlistId?: string;
  onRemove: (id: string) => void;
}) {
  const up = ticker.priceChangePercent >= 0;
  const base = baseAsset(ticker.symbol);

  return (
    <Card className="group relative overflow-hidden transition-colors hover:border-primary/40">
      {watchlistId && (
        <button
          onClick={(e) => {
            e.preventDefault();
            onRemove(watchlistId);
          }}
          title="Quitar de la watchlist"
          className="absolute right-2 top-2 z-10 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-secondary hover:text-foreground group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      <Link to="/coin/$symbol" params={{ symbol: base }}>
        <CardContent className="flex flex-col gap-3 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary text-xs font-bold">
                {base.slice(0, 3)}
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">{base}</span>
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
      </Link>
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
