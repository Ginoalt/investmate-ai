import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useTrades, type Trade } from "@/lib/portfolio";
import { formatPrice, baseAsset } from "@/lib/market";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUpRight, ArrowDownRight } from "lucide-react";

function when(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es });
  } catch {
    return "";
  }
}

export function LiveTrades() {
  const trades = useTrades(40);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-70" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          Operaciones en vivo
        </CardTitle>
        <span className="text-xs text-muted-foreground">actualiza cada 15s</span>
      </CardHeader>
      <CardContent>
        {trades.isLoading ? (
          <div className="flex flex-col gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full rounded-lg" />
            ))}
          </div>
        ) : (trades.data?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center gap-1 py-10 text-center">
            <span className="text-sm text-muted-foreground">
              El bot todavía no operó.
            </span>
            <span className="text-xs text-muted-foreground">
              Cuando compre o venda una moneda, aparece acá al instante.
            </span>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {trades.data!.map((t) => (
              <TradeRow key={t.id} t={t} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function TradeRow({ t }: { t: Trade }) {
  const buy = t.side === "buy";
  const base = baseAsset(t.symbol);
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 transition-colors hover:border-primary/40">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary text-[11px] font-bold">
        {base.slice(0, 3)}
      </span>
      <div className="flex min-w-0 flex-col">
        <div className="flex items-center gap-2">
          <span
            className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
              buy
                ? "bg-emerald-500/10 text-emerald-500"
                : "bg-red-500/10 text-red-500"
            }`}
          >
            {buy ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            {buy ? "Compró" : "Vendió"}
          </span>
          <span className="text-sm font-semibold">{base}</span>
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {t.quantity.toPrecision(3)} @ {formatPrice(t.price)} · {when(t.executed_at)}
        </span>
      </div>
      <div className="ml-auto shrink-0 text-right">
        <div className="text-sm font-semibold">{formatPrice(t.total_value)}</div>
        {t.pnl != null && (
          <div
            className={`text-xs font-medium ${
              t.pnl >= 0 ? "text-emerald-500" : "text-red-500"
            }`}
          >
            {t.pnl >= 0 ? "+" : ""}
            {formatPrice(t.pnl)}
          </div>
        )}
      </div>
    </div>
  );
}
