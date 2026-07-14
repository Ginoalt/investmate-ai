export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      decisions: {
        Row: {
          action: Database["public"]["Enums"]["decision_action"]
          asset_type: Database["public"]["Enums"]["asset_type"]
          confidence: number
          created_at: string
          executed: boolean
          id: string
          indicators: Json | null
          outcome: number | null
          price_at_decision: number
          rationale: string
          sentiment: Json | null
          symbol: string
          user_id: string
        }
        Insert: {
          action: Database["public"]["Enums"]["decision_action"]
          asset_type: Database["public"]["Enums"]["asset_type"]
          confidence: number
          created_at?: string
          executed?: boolean
          id?: string
          indicators?: Json | null
          outcome?: number | null
          price_at_decision: number
          rationale: string
          sentiment?: Json | null
          symbol: string
          user_id: string
        }
        Update: {
          action?: Database["public"]["Enums"]["decision_action"]
          asset_type?: Database["public"]["Enums"]["asset_type"]
          confidence?: number
          created_at?: string
          executed?: boolean
          id?: string
          indicators?: Json | null
          outcome?: number | null
          price_at_decision?: number
          rationale?: string
          sentiment?: Json | null
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
      news: {
        Row: {
          created_at: string
          headline: string
          id: string
          published_at: string
          sentiment: Database["public"]["Enums"]["news_sentiment"] | null
          sentiment_score: number | null
          source: string | null
          summary: string | null
          symbol: string
          url: string
        }
        Insert: {
          created_at?: string
          headline: string
          id?: string
          published_at: string
          sentiment?: Database["public"]["Enums"]["news_sentiment"] | null
          sentiment_score?: number | null
          source?: string | null
          summary?: string | null
          symbol: string
          url: string
        }
        Update: {
          created_at?: string
          headline?: string
          id?: string
          published_at?: string
          sentiment?: Database["public"]["Enums"]["news_sentiment"] | null
          sentiment_score?: number | null
          source?: string | null
          summary?: string | null
          symbol?: string
          url?: string
        }
        Relationships: []
      }
      portfolios: {
        Row: {
          cash_balance: number
          created_at: string
          id: string
          initial_balance: number
          is_paused: boolean
          user_id: string
        }
        Insert: {
          cash_balance?: number
          created_at?: string
          id?: string
          initial_balance?: number
          is_paused?: boolean
          user_id: string
        }
        Update: {
          cash_balance?: number
          created_at?: string
          id?: string
          initial_balance?: number
          is_paused?: boolean
          user_id?: string
        }
        Relationships: []
      }
      positions: {
        Row: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          avg_price: number
          id: string
          portfolio_id: string
          quantity: number
          symbol: string
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          avg_price?: number
          id?: string
          portfolio_id: string
          quantity?: number
          symbol: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_type?: Database["public"]["Enums"]["asset_type"]
          avg_price?: number
          id?: string
          portfolio_id?: string
          quantity?: number
          symbol?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "positions_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
        }
        Relationships: []
      }
      risk_settings: {
        Row: {
          agent_interval_minutes: number
          max_daily_loss_pct: number
          max_position_pct: number
          min_confidence: number
          stop_loss_pct: number
          updated_at: string
          user_id: string
        }
        Insert: {
          agent_interval_minutes?: number
          max_daily_loss_pct?: number
          max_position_pct?: number
          min_confidence?: number
          stop_loss_pct?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          agent_interval_minutes?: number
          max_daily_loss_pct?: number
          max_position_pct?: number
          min_confidence?: number
          stop_loss_pct?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          decision_id: string | null
          executed_at: string
          id: string
          pnl: number | null
          portfolio_id: string
          price: number
          quantity: number
          side: Database["public"]["Enums"]["trade_side"]
          symbol: string
          total_value: number
          user_id: string
        }
        Insert: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          decision_id?: string | null
          executed_at?: string
          id?: string
          pnl?: number | null
          portfolio_id: string
          price: number
          quantity: number
          side: Database["public"]["Enums"]["trade_side"]
          symbol: string
          total_value: number
          user_id: string
        }
        Update: {
          asset_type?: Database["public"]["Enums"]["asset_type"]
          decision_id?: string | null
          executed_at?: string
          id?: string
          pnl?: number | null
          portfolio_id?: string
          price?: number
          quantity?: number
          side?: Database["public"]["Enums"]["trade_side"]
          symbol?: string
          total_value?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trades_portfolio_id_fkey"
            columns: ["portfolio_id"]
            isOneToOne: false
            referencedRelation: "portfolios"
            referencedColumns: ["id"]
          },
        ]
      }
      watchlist: {
        Row: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at: string
          display_name: string | null
          id: string
          symbol: string
          user_id: string
        }
        Insert: {
          asset_type: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          display_name?: string | null
          id?: string
          symbol: string
          user_id: string
        }
        Update: {
          asset_type?: Database["public"]["Enums"]["asset_type"]
          created_at?: string
          display_name?: string | null
          id?: string
          symbol?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      asset_type: "crypto" | "stock"
      decision_action: "buy" | "sell" | "hold"
      news_sentiment: "positive" | "neutral" | "negative"
      trade_side: "buy" | "sell"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      asset_type: ["crypto", "stock"],
      decision_action: ["buy", "sell", "hold"],
      news_sentiment: ["positive", "neutral", "negative"],
      trade_side: ["buy", "sell"],
    },
  },
} as const
