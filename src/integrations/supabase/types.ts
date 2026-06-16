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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          alert_notes: string | null
          allocated_stock: number
          available_stock: number
          boxes_per_pallet: number | null
          category: string
          created_at: string
          created_by: string | null
          critical_level: number
          date_received: string | null
          id: string
          last_updated: string
          location: string
          name: string
          notes: string | null
          quantity_on_hand: number
          reorder_level: number
          reorder_quantity: number
          sku: string
          source: string | null
          supplier: string | null
          unit: string
        }
        Insert: {
          alert_notes?: string | null
          allocated_stock?: number
          available_stock?: number
          boxes_per_pallet?: number | null
          category?: string
          created_at?: string
          created_by?: string | null
          critical_level?: number
          date_received?: string | null
          id?: string
          last_updated?: string
          location?: string
          name: string
          notes?: string | null
          quantity_on_hand?: number
          reorder_level?: number
          reorder_quantity?: number
          sku: string
          source?: string | null
          supplier?: string | null
          unit?: string
        }
        Update: {
          alert_notes?: string | null
          allocated_stock?: number
          available_stock?: number
          boxes_per_pallet?: number | null
          category?: string
          created_at?: string
          created_by?: string | null
          critical_level?: number
          date_received?: string | null
          id?: string
          last_updated?: string
          location?: string
          name?: string
          notes?: string | null
          quantity_on_hand?: number
          reorder_level?: number
          reorder_quantity?: number
          sku?: string
          source?: string | null
          supplier?: string | null
          unit?: string
        }
        Relationships: []
      }
      production_jobs: {
        Row: {
          assembly_approved_at: string | null
          assembly_approved_by: string | null
          created_at: string
          created_by: string | null
          customer: string
          data: Json
          id: string
          imported_from_unleashed_at: string | null
          line: string
          operator: string
          product: string
          scheduled_end: string | null
          scheduled_start: string | null
          sku: string
          status: string
          unleashed_assembly_id: string | null
          unleashed_assembly_number: string | null
          unleashed_sales_order_id: string | null
          unleashed_sales_order_number: string | null
          updated_at: string
        }
        Insert: {
          assembly_approved_at?: string | null
          assembly_approved_by?: string | null
          created_at?: string
          created_by?: string | null
          customer?: string
          data?: Json
          id?: string
          imported_from_unleashed_at?: string | null
          line?: string
          operator?: string
          product?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          sku?: string
          status?: string
          unleashed_assembly_id?: string | null
          unleashed_assembly_number?: string | null
          unleashed_sales_order_id?: string | null
          unleashed_sales_order_number?: string | null
          updated_at?: string
        }
        Update: {
          assembly_approved_at?: string | null
          assembly_approved_by?: string | null
          created_at?: string
          created_by?: string | null
          customer?: string
          data?: Json
          id?: string
          imported_from_unleashed_at?: string | null
          line?: string
          operator?: string
          product?: string
          scheduled_end?: string | null
          scheduled_start?: string | null
          sku?: string
          status?: string
          unleashed_assembly_id?: string | null
          unleashed_assembly_number?: string | null
          unleashed_sales_order_id?: string | null
          unleashed_sales_order_number?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id: string
          name?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      shipped_pallets: {
        Row: {
          created_at: string
          id: string
          job_id: string
          notes: string | null
          pallet_number: number
          shipped_at: string
          shipped_by: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          job_id: string
          notes?: string | null
          pallet_number: number
          shipped_at?: string
          shipped_by?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string
          notes?: string | null
          pallet_number?: number
          shipped_at?: string
          shipped_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shipped_pallets_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "production_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_adjustments: {
        Row: {
          adjustment_date: string
          adjustment_type: string
          created_at: string
          id: string
          inventory_item_id: string
          new_quantity: number
          notes: string | null
          previous_quantity: number
          quantity_change: number
          reason: string
          user_id: string | null
          user_name: string
        }
        Insert: {
          adjustment_date?: string
          adjustment_type: string
          created_at?: string
          id?: string
          inventory_item_id: string
          new_quantity: number
          notes?: string | null
          previous_quantity: number
          quantity_change: number
          reason?: string
          user_id?: string | null
          user_name?: string
        }
        Update: {
          adjustment_date?: string
          adjustment_type?: string
          created_at?: string
          id?: string
          inventory_item_id?: string
          new_quantity?: number
          notes?: string | null
          previous_quantity?: number
          quantity_change?: number
          reason?: string
          user_id?: string | null
          user_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_adjustments_inventory_item_id_fkey"
            columns: ["inventory_item_id"]
            isOneToOne: false
            referencedRelation: "inventory_items"
            referencedColumns: ["id"]
          },
        ]
      }
      unleashed_sync_log: {
        Row: {
          created_at: string
          id: string
          job_id: string | null
          message: string | null
          outcome: string
          sales_order_id: string | null
          sales_order_number: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          job_id?: string | null
          message?: string | null
          outcome: string
          sales_order_id?: string | null
          sales_order_number?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          job_id?: string | null
          message?: string | null
          outcome?: string
          sales_order_id?: string | null
          sales_order_number?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unleashed_sync_log_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "production_jobs"
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      app_role: "admin" | "manager" | "operator" | "viewer"
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
      app_role: ["admin", "manager", "operator", "viewer"],
    },
  },
} as const
