import { useQuery } from "@tanstack/react-query";
import {
  fetchBookPressure,
  fetchTradeFlow,
  fetchDerivatives,
  computePressure,
  formatFunding,
} from "@/lib/orderflow";
import { formatPrice, formatCompact } from "@/lib/market";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Activity, TrendingUp, TrendingDown, Waves, Info } from "lucide-react";

const TONE_CLASS: Record<string, string> = {
  bull: "text-emerald-500",
  "soft-bull": "text-emerald-400",
  neutral: "text-muted-foreground",
  "soft-bear": "text-red-400",
  bear: "text-red-500",
};

export function OrderFlowPanel({ pair }: { pair: string }) {
  const q = useQuery({
    queryKey: ["orderflow", pair],
    queryFn: async () => {
      const [book, flow, deriv] = await Promise.all([
        fetchBookPressure(pair),
        fetchTradeFlow(pair),
        fetchDerivatives(pair).catch(() => ({
          fundingRate: 0,
          openInterest: 0,
          oiChangePct: null,
        })),
      ]);
      return { book, flow, deriv, pressure: computePressure(book, flow, deriv) };
    },
    refetchInterval: 12_000,
    staleTime: 8_000,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Waves className="h-4 w-4" />
          Flujo de órdenes y ballenas
        </CardTitle>
        <span className="text-xs text-muted-foreground">actualiza cada 12s</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {q.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : q.isError || !q.data ? (
          <p className="py-6 text-center text-sm text-destructive">
            No se pudo cargar el flujo de órdenes.
          </p>
        ) : (
          <>
            {/* Presión compuesta */}
            <div className="flex flex-col items-center gap-1 rounded-lg border border-border bg-secondary/30 py-4">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Presión del mercado
              </span>
              <div
                className={`flex items-center gap-2 text-2xl font-bold capitalize ${
                  TONE_CLASS[q.data.pressure.tone]
                }`}
              >
                {q.data.pressure.score >= 0 ? (
                  <TrendingUp className="h-6 w-6" />
                ) : (
                  <TrendingDown className="h-6 w-6" />
                )}
                {q.data.pressure.label}
              </div>
              <PressureBar score={q.data.pressure.score} />
            </div>

            {/* Order book imbalance */}
            <SplitBar
              title="Libro de órdenes (±1%)"
              leftLabel="Compra"
              rightLabel="Venta"
              leftValue={q.data.book.bidVolume}
              rightValue={q.data.book.askVolume}
              hint={`Desbalance ${(q.data.book.imbalance * 100).toFixed(0)}%`}
            />

            {/* CVD / agresión */}
            <SplitBar
              title="Agresión de trades (CVD)"
              leftLabel="Market-buy"
              rightLabel="Market-sell"
              leftValue={q.data.flow.takerBuyVolume}
              rightValue={q.data.flow.takerSellVolume}
              hint={`${(q.data.flow.buyRatio * 100).toFixed(0)}% compra · ${q.data.flow.trades} trades`}
              money
            />

            {/* Paredes (soporte/resistencia) */}
            <div className="grid grid-cols-2 gap-3">
              <WallBox
                kind="Soporte (pared de compra)"
                price={q.data.book.topBidWall?.price}
                qty={q.data.book.topBidWall?.qty}
                tone="text-emerald-500"
              />
              <WallBox
                kind="Resistencia (pared de venta)"
                price={q.data.book.topAskWall?.price}
                qty={q.data.book.topAskWall?.qty}
                tone="text-red-500"
              />
            </div>

            {/* Derivados */}
            <div className="grid grid-cols-3 gap-3">
              <Stat
                label="Funding"
                value={formatFunding(q.data.deriv.fundingRate)}
                tone={
                  q.data.deriv.fundingRate > 0
                    ? "text-emerald-500"
                    : q.data.deriv.fundingRate < 0
                      ? "text-red-500"
                      : undefined
                }
              />
              <Stat
                label="Open Interest"
                value={formatCompact(q.data.deriv.openInterest)}
              />
              <Stat
                label="OI 24h"
                value={
                  q.data.deriv.oiChangePct != null
                    ? `${q.data.deriv.oiChangePct > 0 ? "+" : ""}${q.data.deriv.oiChangePct.toFixed(1)}%`
                    : "—"
                }
                tone={
                  (q.data.deriv.oiChangePct ?? 0) > 0
                    ? "text-emerald-500"
                    : (q.data.deriv.oiChangePct ?? 0) < 0
                      ? "text-red-500"
                      : undefined
                }
              />
            </div>

            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Las ballenas manipulan (spoofing, icebergs, OTC). Es una señal
              fuerte, no una certeza. Combinar siempre con gestión de riesgo.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PressureBar({ score }: { score: number }) {
  // score -1..1 -> posición 0..100
  const pos = ((score + 1) / 2) * 100;
  return (
    <div className="relative mt-1 h-2 w-56 max-w-full rounded-full bg-gradient-to-r from-red-500/60 via-muted to-emerald-500/60">
      <div
        className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background bg-foreground"
        style={{ left: `${pos}%` }}
      />
    </div>
  );
}

function SplitBar({
  title,
  leftLabel,
  rightLabel,
  leftValue,
  rightValue,
  hint,
  money,
}: {
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftValue: number;
  rightValue: number;
  hint?: string;
  money?: boolean;
}) {
  const total = leftValue + rightValue;
  const leftPct = total > 0 ? (leftValue / total) * 100 : 50;
  const fmt = (v: number) =>
    money ? `$${formatCompact(v)}` : formatCompact(v);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1 font-medium">
          <Activity className="h-3.5 w-3.5" />
          {title}
        </span>
        {hint && <span className="text-muted-foreground">{hint}</span>}
      </div>
      <div className="flex h-3 overflow-hidden rounded-full">
        <div
          className="bg-emerald-500/70"
          style={{ width: `${leftPct}%` }}
          title={`${leftLabel}: ${fmt(leftValue)}`}
        />
        <div
          className="bg-red-500/70"
          style={{ width: `${100 - leftPct}%` }}
          title={`${rightLabel}: ${fmt(rightValue)}`}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="text-emerald-500">
          {leftLabel} {fmt(leftValue)}
        </span>
        <span className="text-red-500">
          {rightLabel} {fmt(rightValue)}
        </span>
      </div>
    </div>
  );
}

function WallBox({
  kind,
  price,
  qty,
  tone,
}: {
  kind: string;
  price?: number;
  qty?: number;
  tone: string;
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-xs text-muted-foreground">{kind}</div>
      <div className={`text-sm font-semibold ${tone}`}>
        {price != null ? formatPrice(price) : "—"}
      </div>
      <div className="text-xs text-muted-foreground">
        {qty != null ? `${formatCompact(qty)} u.` : ""}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-border px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold ${tone ?? ""}`}>{value}</div>
    </div>
  );
}
