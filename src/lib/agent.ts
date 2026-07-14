import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Decision = {
  id: string;
  symbol: string;
  action: "buy" | "sell" | "hold";
  confidence: number;
  rationale: string;
  indicators: {
    rsi?: number | null;
    trend?: string;
    imbalance?: number;
    cvd?: number;
    macd?: number;
    fib?: number;
    boll?: number;
  } | null;
  sentiment: { newsScore?: number } | null;
  price_at_decision: number;
  created_at: string;
};

/** Últimas decisiones del agente para una moneda (o todas). */
export function useDecisions(symbol?: string, limit = 10) {
  return useQuery({
    queryKey: ["decisions", symbol ?? "all"],
    queryFn: async (): Promise<Decision[]> => {
      let query = supabase
        .from("decisions")
        .select(
          "id, symbol, action, confidence, rationale, indicators, sentiment, price_at_decision, created_at",
        )
        .order("created_at", { ascending: false })
        .limit(limit);
      if (symbol) query = query.eq("symbol", symbol.toUpperCase());
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Decision[];
    },
  });
}

/** Dispara el agente para analizar una moneda ahora (modo manual). */
export function useAnalyze() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (symbol: string) => {
      const { data, error } = await supabase.functions.invoke("run-agent", {
        body: { symbol },
      });
      if (error) throw error;
      return data as { analyzed: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["decisions"] }),
  });
}
