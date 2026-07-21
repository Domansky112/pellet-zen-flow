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
      external_carriers: {
        Row: {
          base_rate_per_km: number | null
          company_name: string
          contact_person: string | null
          created_at: string
          email: string | null
          id: string
          nip: string | null
          notes: string | null
          phone: string | null
          status: string
          updated_at: string
        }
        Insert: {
          base_rate_per_km?: number | null
          company_name: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nip?: string | null
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          base_rate_per_km?: number | null
          company_name?: string
          contact_person?: string | null
          created_at?: string
          email?: string | null
          id?: string
          nip?: string | null
          notes?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      fleet_drivers: {
        Row: {
          created_at: string
          email: string | null
          first_name: string
          id: string
          last_name: string
          notes: string | null
          phone: string | null
          status: string
          trailer_id: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name: string
          id?: string
          last_name: string
          notes?: string | null
          phone?: string | null
          status?: string
          trailer_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string
          id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          trailer_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fleet_drivers_trailer_id_fkey"
            columns: ["trailer_id"]
            isOneToOne: false
            referencedRelation: "fleet_trailers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fleet_drivers_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "fleet_vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_trailers: {
        Row: {
          capacity_tons: number | null
          created_at: string
          id: string
          notes: string | null
          registration: string
          status: string
          trailer_type: string | null
          updated_at: string
        }
        Insert: {
          capacity_tons?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          registration: string
          status?: string
          trailer_type?: string | null
          updated_at?: string
        }
        Update: {
          capacity_tons?: number | null
          created_at?: string
          id?: string
          notes?: string | null
          registration?: string
          status?: string
          trailer_type?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      fleet_vehicles: {
        Row: {
          brand: string | null
          capacity_tons: number | null
          created_at: string
          id: string
          model: string | null
          notes: string | null
          registration: string
          status: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          capacity_tons?: number | null
          created_at?: string
          id?: string
          model?: string | null
          notes?: string | null
          registration: string
          status?: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          capacity_tons?: number | null
          created_at?: string
          id?: string
          model?: string | null
          notes?: string | null
          registration?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      fuel_prices: {
        Row: {
          created_at: string
          created_by: string | null
          fetched_at: string
          fuel_type: string
          id: string
          note: string | null
          price_per_liter: number
          source: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fetched_at?: string
          fuel_type?: string
          id?: string
          note?: string | null
          price_per_liter: number
          source?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fetched_at?: string
          fuel_type?: string
          id?: string
          note?: string | null
          price_per_liter?: number
          source?: string
        }
        Relationships: []
      }
      lead_notes: {
        Row: {
          author_id: string | null
          body: string
          created_at: string
          edited: boolean
          id: string
          lead_id: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body: string
          created_at?: string
          edited?: boolean
          id?: string
          lead_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          created_at?: string
          edited?: boolean
          id?: string
          lead_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_notes_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          city: string | null
          created_at: string
          deleted_at: string | null
          deleted_by: string | null
          deleted_reason: string | null
          delivered_at: string | null
          email: string | null
          first_name: string | null
          id: string
          invoice_address: string | null
          invoice_company: string | null
          invoice_nip: string | null
          last_name: string | null
          name: string
          notes: string | null
          phone: string | null
          pooling_enabled: boolean
          pooling_km_from_base: number | null
          pooling_lat: number | null
          pooling_lng: number | null
          pooling_status: string
          pooling_wait_until: string | null
          postal_code: string | null
          priority: number
          product: Database["public"]["Enums"]["product_type"] | null
          quantity: number | null
          reservation_status: string
          source: Database["public"]["Enums"]["lead_source"]
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          delivered_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          invoice_address?: string | null
          invoice_company?: string | null
          invoice_nip?: string | null
          last_name?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          pooling_enabled?: boolean
          pooling_km_from_base?: number | null
          pooling_lat?: number | null
          pooling_lng?: number | null
          pooling_status?: string
          pooling_wait_until?: string | null
          postal_code?: string | null
          priority?: number
          product?: Database["public"]["Enums"]["product_type"] | null
          quantity?: number | null
          reservation_status?: string
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          city?: string | null
          created_at?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deleted_reason?: string | null
          delivered_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          invoice_address?: string | null
          invoice_company?: string | null
          invoice_nip?: string | null
          last_name?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          pooling_enabled?: boolean
          pooling_km_from_base?: number | null
          pooling_lat?: number | null
          pooling_lng?: number | null
          pooling_status?: string
          pooling_wait_until?: string | null
          postal_code?: string | null
          priority?: number
          product?: Database["public"]["Enums"]["product_type"] | null
          quantity?: number | null
          reservation_status?: string
          source?: Database["public"]["Enums"]["lead_source"]
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: []
      }
      offer_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          name: string
          product: string | null
          subject: string | null
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          name: string
          product?: string | null
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          name?: string
          product?: string | null
          subject?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      product_definitions: {
        Row: {
          active: boolean
          code: string
          created_at: string
          id: string
          label: string
          notes: string | null
          packaging: string | null
          unit_weight_kg: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          code: string
          created_at?: string
          id?: string
          label: string
          notes?: string | null
          packaging?: string | null
          unit_weight_kg?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          code?: string
          created_at?: string
          id?: string
          label?: string
          notes?: string | null
          packaging?: string | null
          unit_weight_kg?: number | null
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
      system_settings: {
        Row: {
          description: string | null
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          description?: string | null
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          description?: string | null
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
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
      transport_pool_items: {
        Row: {
          created_at: string
          detour_km: number | null
          id: string
          lead_id: string
          pool_id: string
          share_cost: number | null
          stop_order: number | null
          tons: number
        }
        Insert: {
          created_at?: string
          detour_km?: number | null
          id?: string
          lead_id: string
          pool_id: string
          share_cost?: number | null
          stop_order?: number | null
          tons: number
        }
        Update: {
          created_at?: string
          detour_km?: number | null
          id?: string
          lead_id?: string
          pool_id?: string
          share_cost?: number | null
          stop_order?: number | null
          tons?: number
        }
        Relationships: [
          {
            foreignKeyName: "transport_pool_items_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transport_pool_items_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "transport_pools"
            referencedColumns: ["id"]
          },
        ]
      }
      transport_pools: {
        Row: {
          capacity_tons: number
          cost_per_ton: number | null
          created_at: string
          created_by: string | null
          estimated_cost: number | null
          estimated_km: number | null
          id: string
          name: string
          notes: string | null
          route_from: string
          route_to: string
          status: string
          total_tons: number
          transport_id: string | null
          updated_at: string
        }
        Insert: {
          capacity_tons?: number
          cost_per_ton?: number | null
          created_at?: string
          created_by?: string | null
          estimated_cost?: number | null
          estimated_km?: number | null
          id?: string
          name: string
          notes?: string | null
          route_from?: string
          route_to: string
          status?: string
          total_tons?: number
          transport_id?: string | null
          updated_at?: string
        }
        Update: {
          capacity_tons?: number
          cost_per_ton?: number | null
          created_at?: string
          created_by?: string | null
          estimated_cost?: number | null
          estimated_km?: number | null
          id?: string
          name?: string
          notes?: string | null
          route_from?: string
          route_to?: string
          status?: string
          total_tons?: number
          transport_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "transport_pools_transport_id_fkey"
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
          pool_id: string | null
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
          pool_id?: string | null
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
          pool_id?: string | null
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
        Relationships: [
          {
            foreignKeyName: "transports_pool_id_fkey"
            columns: ["pool_id"]
            isOneToOne: false
            referencedRelation: "transport_pools"
            referencedColumns: ["id"]
          },
        ]
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
      warehouses: {
        Row: {
          address_line: string | null
          city: string | null
          country: string | null
          created_at: string
          id: string
          is_default: boolean
          name: string
          notes: string | null
          postal_code: string | null
          updated_at: string
        }
        Insert: {
          address_line?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          notes?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Update: {
          address_line?: string | null
          city?: string | null
          country?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          notes?: string | null
          postal_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      stock_balance: {
        Row: {
          available: number | null
          physical: number | null
          product: Database["public"]["Enums"]["product_type"] | null
          reserved: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      cancel_lead: {
        Args: { _lead_id: string; _reason?: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      release_reservation_as_wydanie: {
        Args: { _lead_id: string }
        Returns: undefined
      }
      reserve_stock_for_lead: { Args: { _lead_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "sales" | "warehouse" | "transport" | "logistyk"
      lead_source: "www" | "email" | "telefon" | "b2b" | "inne"
      lead_status: "nowy" | "w_kontakcie" | "oferta" | "wygrany" | "przegrany"
      product_type: "pellet_paleta" | "pellet_bigbag" | "inne"
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
      app_role: ["admin", "sales", "warehouse", "transport", "logistyk"],
      lead_source: ["www", "email", "telefon", "b2b", "inne"],
      lead_status: ["nowy", "w_kontakcie", "oferta", "wygrany", "przegrany"],
      product_type: ["pellet_paleta", "pellet_bigbag", "inne"],
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
