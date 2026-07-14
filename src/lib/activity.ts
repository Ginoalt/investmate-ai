import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Snapshot = {
  id: string;
  equity: number;
  cash: number;
  positions_value: number;
  created_at: string;
};

/**
 * Histórico de valor del portafolio (curva de evolución).
 * La tabla `portfolio_snapshots` es nueva y todavía no está en los tipos
 * generados de Supabase, por eso el cast.
 */
export function useSnapshots(limit = 200) {
  return useQuery({
    queryKey: ["snapshots"],
    queryFn: async (): Promise<Snapshot[]> => {
      const { data, error } = await (supabase as any)
        .from("portfolio_snapshots")
        .select("id, equity, cash, positions_value, created_at")
        .order("created_at", { ascending: true })
        .limit(limit);
      // Si la tabla todavía no existe (migración sin aplicar), no rompemos la UI.
      if (error) {
        if (
          error.code === "42P01" || // undefined_table
          /does not exist/i.test(error.message ?? "")
        ) {
          return [];
        }
        throw error;
      }
      return (data ?? []).map((s: Record<string, unknown>) => ({
        id: String(s.id),
        equity: Number(s.equity),
        cash: Number(s.cash),
        positions_value: Number(s.positions_value),
        created_at: String(s.created_at),
      }));
    },
    retry: false,
  });
}
