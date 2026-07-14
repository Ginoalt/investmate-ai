import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetch24h, toBinancePair, baseAsset } from "@/lib/market";

export type Portfolio = {
  id: string;
  cash_balance: number;
  initial_balance: number;
  is_paused: boolean;
};

export type Position = {
  id: string;
  symbol: string; // par Binance
  quantity: number;
  avg_price: number;
};

export type Trade = {
  id: string;
  symbol: string;
  side: "buy" | "sell";
  quantity: number;
  price: number;
  total_value: number;
  pnl: number | null;
  executed_at: string;
};

export type RiskSettings = {
  stop_loss_pct: number;
  max_daily_loss_pct: number;
  max_position_pct: number;
  min_confidence: number;
  agent_interval_minutes: number;
};

// ---------- lecturas ----------

export function usePortfolio() {
  return useQuery({
    queryKey: ["portfolio"],
    queryFn: async (): Promise<Portfolio | null> => {
      const { data, error } = await supabase
        .from("portfolios")
        .select("id, cash_balance, initial_balance, is_paused")
        .maybeSingle();
      if (error) throw error;
      return data
        ? {
            ...data,
            cash_balance: Number(data.cash_balance),
            initial_balance: Number(data.initial_balance),
          }
        : null;
    },
  });
}

export function usePositions() {
  return useQuery({
    queryKey: ["positions"],
    queryFn: async (): Promise<Position[]> => {
      const { data, error } = await supabase
        .from("positions")
        .select("id, symbol, quantity, avg_price")
        .gt("quantity", 0)
        .order("symbol");
      if (error) throw error;
      return (data ?? []).map((p) => ({
        ...p,
        quantity: Number(p.quantity),
        avg_price: Number(p.avg_price),
      }));
    },
  });
}

export function useTrades(limit = 30) {
  return useQuery({
    queryKey: ["trades"],
    queryFn: async (): Promise<Trade[]> => {
      const { data, error } = await supabase
        .from("trades")
        .select("id, symbol, side, quantity, price, total_value, pnl, executed_at")
        .order("executed_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as Trade[];
    },
  });
}

export function useRiskSettings() {
  return useQuery({
    queryKey: ["risk_settings"],
    queryFn: async (): Promise<RiskSettings | null> => {
      const { data, error } = await supabase
        .from("risk_settings")
        .select(
          "stop_loss_pct, max_daily_loss_pct, max_position_pct, min_confidence, agent_interval_minutes",
        )
        .maybeSingle();
      if (error) throw error;
      return (data as RiskSettings) ?? null;
    },
  });
}

// ---------- helpers de escritura ----------

async function loadPortfolio(): Promise<Portfolio> {
  const { data, error } = await supabase
    .from("portfolios")
    .select("id, cash_balance, initial_balance, is_paused")
    .single();
  if (error) throw error;
  return {
    ...data,
    cash_balance: Number(data.cash_balance),
    initial_balance: Number(data.initial_balance),
  };
}

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Sesión no válida");
  return data.user.id;
}

// ---------- mutaciones ----------

/** Compra simulada: gasta `usd` de caja en `symbol` al precio `price`. */
export function useBuy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      symbol,
      usd,
      price,
    }: {
      symbol: string;
      usd: number;
      price: number;
    }) => {
      const pair = toBinancePair(symbol);
      const portfolio = await loadPortfolio();
      if (usd <= 0) throw new Error("Monto inválido");
      if (usd > portfolio.cash_balance)
        throw new Error("No tenés suficiente caja");
      const userId = await currentUserId();
      const qty = usd / price;

      // Upsert de la posición (precio promedio ponderado).
      const { data: existing } = await supabase
        .from("positions")
        .select("id, quantity, avg_price")
        .eq("portfolio_id", portfolio.id)
        .eq("symbol", pair)
        .maybeSingle();

      if (existing) {
        const oldQty = Number(existing.quantity);
        const oldAvg = Number(existing.avg_price);
        const newQty = oldQty + qty;
        const newAvg = (oldQty * oldAvg + qty * price) / newQty;
        const { error } = await supabase
          .from("positions")
          .update({ quantity: newQty, avg_price: newAvg, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("positions").insert({
          portfolio_id: portfolio.id,
          user_id: userId,
          symbol: pair,
          asset_type: "crypto",
          quantity: qty,
          avg_price: price,
        });
        if (error) throw error;
      }

      await supabase
        .from("portfolios")
        .update({ cash_balance: portfolio.cash_balance - usd })
        .eq("id", portfolio.id);

      await supabase.from("trades").insert({
        portfolio_id: portfolio.id,
        user_id: userId,
        symbol: pair,
        asset_type: "crypto",
        side: "buy",
        quantity: qty,
        price,
        total_value: usd,
      });
    },
    onSuccess: () =>
      qc.invalidateQueries({
        predicate: (q) =>
          ["portfolio", "positions", "trades"].includes(
            q.queryKey[0] as string,
          ),
      }),
  });
}

/** Venta simulada: vende `quantity` (o toda la posición) al precio `price`. */
export function useSell() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      symbol,
      price,
      quantity,
    }: {
      symbol: string;
      price: number;
      quantity?: number;
    }) => {
      const pair = toBinancePair(symbol);
      const portfolio = await loadPortfolio();
      const { data: pos } = await supabase
        .from("positions")
        .select("id, quantity, avg_price")
        .eq("portfolio_id", portfolio.id)
        .eq("symbol", pair)
        .maybeSingle();
      if (!pos || Number(pos.quantity) <= 0)
        throw new Error("No tenés posición en " + baseAsset(pair));

      const holdQty = Number(pos.quantity);
      const avg = Number(pos.avg_price);
      const sellQty = Math.min(quantity ?? holdQty, holdQty);
      const proceeds = sellQty * price;
      const pnl = (price - avg) * sellQty;
      const userId = await currentUserId();

      const remaining = holdQty - sellQty;
      if (remaining <= 1e-12) {
        await supabase.from("positions").delete().eq("id", pos.id);
      } else {
        await supabase
          .from("positions")
          .update({ quantity: remaining, updated_at: new Date().toISOString() })
          .eq("id", pos.id);
      }

      await supabase
        .from("portfolios")
        .update({ cash_balance: portfolio.cash_balance + proceeds })
        .eq("id", portfolio.id);

      await supabase.from("trades").insert({
        portfolio_id: portfolio.id,
        user_id: userId,
        symbol: pair,
        asset_type: "crypto",
        side: "sell",
        quantity: sellQty,
        price,
        total_value: proceeds,
        pnl,
      });
    },
    onSuccess: () =>
      qc.invalidateQueries({
        predicate: (q) =>
          ["portfolio", "positions", "trades"].includes(
            q.queryKey[0] as string,
          ),
      }),
  });
}

export function useUpdateRiskSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<RiskSettings>) => {
      const userId = await currentUserId();
      const { error } = await supabase
        .from("risk_settings")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["risk_settings"] }),
  });
}

/** Pausar/reanudar el agente. */
export function useSetPaused() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (paused: boolean) => {
      const portfolio = await loadPortfolio();
      const { error } = await supabase
        .from("portfolios")
        .update({ is_paused: paused })
        .eq("id", portfolio.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["portfolio"] }),
  });
}

/** Botón de pánico: liquida todas las posiciones a precio de mercado y pausa. */
export function usePanic() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const portfolio = await loadPortfolio();
      const { data: positions } = await supabase
        .from("positions")
        .select("id, symbol, quantity, avg_price")
        .eq("portfolio_id", portfolio.id)
        .gt("quantity", 0);

      const list = positions ?? [];
      let cash = portfolio.cash_balance;

      if (list.length > 0) {
        const prices = await fetch24h(list.map((p) => p.symbol));
        const priceBy = new Map(prices.map((t) => [t.symbol, t.lastPrice]));
        const userId = await currentUserId();

        for (const p of list) {
          const price = priceBy.get(p.symbol);
          if (!price) continue;
          const qty = Number(p.quantity);
          const proceeds = qty * price;
          const pnl = (price - Number(p.avg_price)) * qty;
          cash += proceeds;
          await supabase.from("trades").insert({
            portfolio_id: portfolio.id,
            user_id: userId,
            symbol: p.symbol,
            asset_type: "crypto",
            side: "sell",
            quantity: qty,
            price,
            total_value: proceeds,
            pnl,
          });
          await supabase.from("positions").delete().eq("id", p.id);
        }
      }

      await supabase
        .from("portfolios")
        .update({ cash_balance: cash, is_paused: true })
        .eq("id", portfolio.id);
    },
    onSuccess: () =>
      qc.invalidateQueries({
        predicate: (q) =>
          ["portfolio", "positions", "trades"].includes(
            q.queryKey[0] as string,
          ),
      }),
  });
}
