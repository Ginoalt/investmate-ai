import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BacktestParams } from "@/lib/backtest";

export type AgentConfig = {
  symbol: string;
  params: Partial<BacktestParams>;
  in_sample_return: number | null;
  out_of_sample_return: number | null;
  robust: boolean;
};

// La tabla agent_configs es nueva y aún no está en los tipos generados.
const table = () => (supabase as any).from("agent_configs");

/** Configs guardadas del usuario (una por moneda). */
export function useAgentConfigs() {
  return useQuery({
    queryKey: ["agent_configs"],
    queryFn: async (): Promise<AgentConfig[]> => {
      const { data, error } = await table()
        .select("symbol, params, in_sample_return, out_of_sample_return, robust");
      if (error) {
        if (error.code === "42P01" || /does not exist/i.test(error.message ?? ""))
          return [];
        throw error;
      }
      return (data ?? []) as AgentConfig[];
    },
    retry: false,
  });
}

/** Guarda (upsert) la config óptima elegida para una moneda. */
export function useSaveAgentConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      symbol: string; // par Binance
      params: Partial<BacktestParams>;
      inSample: number;
      outOfSample: number;
      robust: boolean;
    }) => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("Sesión no válida");
      const { error } = await table().upsert(
        {
          user_id: userData.user.id,
          symbol: input.symbol,
          params: input.params,
          in_sample_return: input.inSample,
          out_of_sample_return: input.outOfSample,
          robust: input.robust,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,symbol" },
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["agent_configs"] }),
  });
}
