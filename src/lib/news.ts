import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type NewsItem = {
  id: string;
  symbol: string;
  headline: string;
  url: string;
  source: string | null;
  published_at: string;
  sentiment: "positive" | "neutral" | "negative" | null;
  summary: string | null;
};

/**
 * Lee las noticias de la tabla `news`. Si se pasa `symbol`, trae las de esa
 * moneda + las generales ("CRYPTO"). Sin symbol, trae todo el feed.
 */
export function useNews(symbol?: string) {
  return useQuery({
    queryKey: ["news", symbol ?? "all"],
    queryFn: async (): Promise<NewsItem[]> => {
      let query = supabase
        .from("news")
        .select("id, symbol, headline, url, source, published_at, sentiment, summary")
        .order("published_at", { ascending: false })
        .limit(30);

      if (symbol) {
        query = query.in("symbol", [symbol.toUpperCase(), "CRYPTO"]);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as NewsItem[];
    },
  });
}

/** Dispara la edge function que trae noticias frescas de los feeds RSS. */
export function useRefreshNews() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("fetch-news");
      if (error) throw error;
      return data as { fetched: number; inserted: number };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["news"] }),
  });
}
