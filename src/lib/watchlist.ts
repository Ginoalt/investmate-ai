import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { baseAsset, toBinancePair } from "@/lib/market";

export type WatchlistItem = {
  id: string;
  symbol: string; // par Binance, ej. "BTCUSDT"
  display_name: string | null;
};

const KEY = ["watchlist"] as const;

/** Lista la watchlist cripto del usuario (RLS: solo la suya). */
export function useWatchlist() {
  return useQuery({
    queryKey: KEY,
    queryFn: async (): Promise<WatchlistItem[]> => {
      const { data, error } = await supabase
        .from("watchlist")
        .select("id, symbol, display_name")
        .eq("asset_type", "crypto")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Agrega una moneda a la watchlist. Acepta "BTC" o "BTCUSDT". */
export function useAddToWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: string) => {
      const symbol = toBinancePair(input.trim());
      if (!symbol || symbol === "USDT") throw new Error("Símbolo inválido");

      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("Sesión no válida");

      const { error } = await supabase.from("watchlist").insert({
        user_id: userData.user.id,
        symbol,
        asset_type: "crypto",
        display_name: baseAsset(symbol),
      });
      // 23505 = violación de UNIQUE (ya está en la lista): lo tratamos como ok.
      if (error && error.code !== "23505") throw error;
      return symbol;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** Quita una moneda de la watchlist por id. */
export function useRemoveFromWatchlist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("watchlist").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
