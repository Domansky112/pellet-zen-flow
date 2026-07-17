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
      leads: {
        Row: {
          assigned_to: string | null
          city: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          postal_code: string | null
          priority: number
          product: Database["public"]["Enums"]["product_type"] | null
          quantity: number | null
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          priority?: number
          product?: Database["public"]["Enums"]["product_type"] | null
          quantity?: number | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          postal_code?: string | null
          priority?: number
          product?: Database["public"]["Enums"]["product_type"] | null
          quantity?: number | null
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: []
      }
      stock_events: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          lead_id: string | null
          note: string | null
          product: Database["public"]["Enums"]["product_type"]
          quantity: number
          reference: string | null
          txn_type: Database["public"]["Enums"]["stock_txn_type"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string | null
          note?: string | null
          product: Database["public"]["Enums"]["product_type"]
          quantity: number
          reference?: string | null
          txn_type: Database["public"]["Enums"]["stock_txn_type"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          lead_id?: string | null
          note?: string | null
          product?: Database["public"]["Enums"]["product_type"]
          quantity?: number
          reference?: string | null
          txn_type?: Database["public"]["Enums"]["stock_txn_type"]
        }
        Relationships: [
          {
            foreignKeyName: "stock_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_chats: {
        Row: {
          chat_id: string
          created_at: string
          id: string
          is_whitelisted: boolean
          label: string | null
        }
        Insert: {
          chat_id: string
          created_at?: string
          id?: string
          is_whitelisted?: boolean
          label?: string | null
        }
        Update: {
          chat_id?: string
          created_at?: string
          id?: string
          is_whitelisted?: boolean
          label?: string | null
        }
        Relationships: []
      }
      transport_items: {
        Row: {
          address: string | null
          created_at: string
          id: string
          lead_id: string | null
          product: Database["public"]["Enums"]["product_type"]
          quantity: number
          transport_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          product: Database["public"]["Enums"]["product_type"]
          quantity: number
          transport_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          lead_id?: string | null
          product?: Database["public"]["Enums"]["product_type"]
          quantity?: number
          transport_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_items_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_items_transport_id_fkey"
            columns: ["transport_id"]
            isOneToOne: false
            referencedRelation: "transports"
            referencedColumns: ["id"]
          },
        ]
      }
      transports: {
        Row: {
          capacity_kg: number | null
          city: string | null
          created_at: string
          destination_address: string | null
          driver: string | null
          id: string
          notes: string | null
          postal_code: string | null
          scheduled_date: string
          status: Database["public"]["Enums"]["transport_status"]
          telegram_alert_sent_at: string | null
          telegram_t4_sent_at: string | null
          telegram_t7_sent_at: string | null
          updated_at: string
          vehicle: string | null
          zone: string | null
        }
        Insert: {
          capacity_kg?: number | null
          city?: string | null
          created_at?: string
          destination_address?: string | null
          driver?: string | null
          id?: string
          notes?: string | null
          postal_code?: string | null
          scheduled_date: string
          status?: Database["public"]["Enums"]["transport_status"]
          telegram_alert_sent_at?: string | null
          telegram_t4_sent_at?: string | null
          telegram_t7_sent_at?: string | null
          updated_at?: string
          vehicle?: string | null
          zone?: string | null
        }
        Update: {
          capacity_kg?: number | null
          city?: string | null
          created_at?: string
          destination_address?: string | null
          driver?: string | null
          id?: string
          notes?: string | null
          postal_code?: string | null
          scheduled_date?: string
          status?: Database["public"]["Enums"]["transport_status"]
          telegram_alert_sent_at?: string | null
          telegram_t4_sent_at?: string | null
          telegram_t7_sent_at?: string | null
          updated_at?: string
          vehicle?: string | null
          zone?: string | null
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      stock_balance: {
        Row: {
          physical: number | null
          product: Database["public"]["Enums"]["product_type"] | null
          reserved: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "sales" | "warehouse" | "transport"
      lead_source: "www" | "email" | "telefon" | "b2b" | "inne"
      lead_status: "nowy" | "w_kontakcie" | "oferta" | "wygrany" | "przegrany"
      product_type: "pellet_paleta" | "pellet_bigbag" | "brykiet" | "inne"
      stock_txn_type:
        | "przyjecie"
        | "wydanie"
        | "rezerwacja"
        | "zwolnienie_rez"
        | "korekta"
      transport_status:
        | "planowany"
        | "potwierdzony"
        | "w_trasie"
        | "dostarczony"
        | "anulowany"
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
      app_role: ["admin", "sales", "warehouse", "transport"],
      lead_source: ["www", "email", "telefon", "b2b", "inne"],
      lead_status: ["nowy", "w_kontakcie", "oferta", "wygrany", "przegrany"],
      product_type: ["pellet_paleta", "pellet_bigbag", "brykiet", "inne"],
      stock_txn_type: [
        "przyjecie",
        "wydanie",
        "rezerwacja",
        "zwolnienie_rez",
        "korekta",
      ],
      transport_status: [
        "planowany",
        "potwierdzony",
        "w_trasie",
        "dostarczony",
        "anulowany",
      ],
    },
  },
} as const
