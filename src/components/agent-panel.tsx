import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { useDecisions, useAnalyze, type Decision } from "@/lib/agent";
import { formatPrice } from "@/lib/market";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Bot, Sparkles, TrendingUp, TrendingDown, Minus } from "lucide-react";

const ACTION: Record<
  string,
  { label: string; className: string; Icon: typeof TrendingUp }
> = {
  buy: {
    label: "Comprar",
    className: "bg-emerald-500/10 text-emerald-500",
    Icon: TrendingUp,
  },
  sell: {
    label: "Vender",
    className: "bg-red-500/10 text-red-500",
    Icon: TrendingDown,
  },
  hold: {
    label: "Mantener",
    className: "bg-secondary text-muted-foreground",
    Icon: Minus,
  },
};

export function AgentPanel({ symbol }: { symbol: string }) {
  const decisions = useDecisions(symbol, 8);
  const analyze = useAnalyze();
  const latest = decisions.data?.[0];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bot className="h-4 w-4" />
          Agente super trader
        </CardTitle>
        <Button
          size="sm"
          onClick={() => analyze.mutate(symbol)}
          disabled={analyze.isPending}
        >
          <Sparkles
            className={`h-4 w-4 ${analyze.isPending ? "animate-pulse" : ""}`}
          />
          {analyze.isPending ? "Analizando…" : "Analizar ahora"}
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {analyze.isError && (
          <p className="text-sm text-destructive">
            No se pudo ejecutar el agente. ¿La edge function está desplegada?
          </p>
        )}

        {decisions.isLoading ? (
          <Skeleton className="h-28 w-full" />
        ) : !latest ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            El agente todavía no analizó {symbol.toUpperCase()}. Apretá
            "Analizar ahora" para ver su decisión y razonamiento.
          </div>
        ) : (
          <DecisionCard decision={latest} highlight />
        )}

        {decisions.data && decisions.data.length > 1 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              Historial
            </span>
            {decisions.data.slice(1).map((d) => (
              <DecisionRow key={d.id} decision={d} />
            ))}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          El agente decide por reglas (flujo de órdenes + técnico + noticias) y
          la IA redacta la explicación. Es simulado y educativo, no es asesoría
          financiera.
        </p>
      </CardContent>
    </Card>
  );
}

function DecisionCard({
  decision,
  highlight,
}: {
  decision: Decision;
  highlight?: boolean;
}) {
  const a = ACTION[decision.action] ?? ACTION.hold;
  const when = safeWhen(decision.created_at);
  return (
    <div
      className={`flex flex-col gap-3 rounded-lg border p-4 ${
        highlight ? "border-primary/40 bg-secondary/30" : "border-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold ${a.className}`}
        >
          <a.Icon className="h-4 w-4" />
          {a.label}
        </span>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">Confianza</div>
          <div className="text-sm font-semibold">
            {(decision.confidence * 100).toFixed(0)}%
          </div>
        </div>
      </div>
      <p className="text-sm leading-relaxed">{decision.rationale}</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {decision.indicators?.trend && (
          <span>Tendencia: {decision.indicators.trend}</span>
        )}
        {decision.indicators?.rsi != null && (
          <span>RSI: {decision.indicators.rsi.toFixed(0)}</span>
        )}
        {decision.indicators?.imbalance != null && (
          <span>Libro: {(decision.indicators.imbalance * 100).toFixed(0)}%</span>
        )}
        {decision.indicators?.cvd != null && (
          <span>CVD: {decision.indicators.cvd.toFixed(2)}</span>
        )}
        <span>· {formatPrice(decision.price_at_decision)}</span>
        {when && <span>· {when}</span>}
      </div>
    </div>
  );
}

function DecisionRow({ decision }: { decision: Decision }) {
  const a = ACTION[decision.action] ?? ACTION.hold;
  const when = safeWhen(decision.created_at);
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
      <span className={`flex items-center gap-1 font-medium ${a.className.split(" ")[1]}`}>
        <a.Icon className="h-3.5 w-3.5" />
        {a.label}
      </span>
      <span className="text-xs text-muted-foreground">
        {(decision.confidence * 100).toFixed(0)}% · {formatPrice(decision.price_at_decision)}
        {when ? ` · ${when}` : ""}
      </span>
    </div>
  );
}

function safeWhen(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), { addSuffix: true, locale: es });
  } catch {
    return "";
  }
}
