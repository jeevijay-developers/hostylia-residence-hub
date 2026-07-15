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
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          created_at: string
          effective_user_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json
          property_id: string | null
          request_id: string | null
          support_session_id: string | null
          tenant_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          effective_user_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          property_id?: string | null
          request_id?: string | null
          support_session_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          effective_user_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json
          property_id?: string | null
          request_id?: string | null
          support_session_id?: string | null
          tenant_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      guardians: {
        Row: {
          address: Json | null
          created_at: string
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          occupation: string | null
          phone: string
          portal_access_enabled: boolean
          profile_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address?: Json | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          occupation?: string | null
          phone: string
          portal_access_enabled?: boolean
          profile_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: Json | null
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          occupation?: string | null
          phone?: string
          portal_access_enabled?: boolean
          profile_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guardians_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_email: string | null
          billing_phone: string | null
          created_at: string
          deleted_at: string | null
          gstin: string | null
          id: string
          legal_name: string | null
          name: string
          pan_last4: string | null
          registered_address: Json | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          billing_email?: string | null
          billing_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          gstin?: string | null
          id?: string
          legal_name?: string | null
          name: string
          pan_last4?: string | null
          registered_address?: Json | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          billing_email?: string | null
          billing_phone?: string | null
          created_at?: string
          deleted_at?: string | null
          gstin?: string | null
          id?: string
          legal_name?: string | null
          name?: string
          pan_last4?: string | null
          registered_address?: Json | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organizations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing_interval: string
          code: string
          created_at: string
          currency: string
          description: string | null
          id: string
          is_active: boolean
          max_properties: number | null
          max_staff_seats: number | null
          name: string
          price_paise: number
          trial_days: number
          updated_at: string
        }
        Insert: {
          billing_interval?: string
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_properties?: number | null
          max_staff_seats?: number | null
          name: string
          price_paise?: number
          trial_days?: number
          updated_at?: string
        }
        Update: {
          billing_interval?: string
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_properties?: number | null
          max_staff_seats?: number | null
          name?: string
          price_paise?: number
          trial_days?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_role_assignments: {
        Row: {
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          last_active_at: string | null
          locale: string
          phone: string | null
          preferred_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          last_active_at?: string | null
          locale?: string
          phone?: string | null
          preferred_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          last_active_at?: string | null
          locale?: string
          phone?: string | null
          preferred_name?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          address_line_1: string
          address_line_2: string | null
          brand_primary_color: string | null
          brand_secondary_color: string | null
          city: string
          country_code: string
          created_at: string
          deleted_at: string | null
          email: string | null
          gender_policy: string
          id: string
          landmark: string | null
          latitude: number | null
          logo_path: string | null
          longitude: number | null
          name: string
          organization_id: string
          phone: string | null
          postal_code: string
          property_type: string
          settings: Json
          slug: string
          state: string
          status: string
          tenant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address_line_1: string
          address_line_2?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          city: string
          country_code?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          gender_policy?: string
          id?: string
          landmark?: string | null
          latitude?: number | null
          logo_path?: string | null
          longitude?: number | null
          name: string
          organization_id: string
          phone?: string | null
          postal_code: string
          property_type?: string
          settings?: Json
          slug: string
          state: string
          status?: string
          tenant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address_line_1?: string
          address_line_2?: string | null
          brand_primary_color?: string | null
          brand_secondary_color?: string | null
          city?: string
          country_code?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          gender_policy?: string
          id?: string
          landmark?: string | null
          latitude?: number | null
          logo_path?: string | null
          longitude?: number | null
          name?: string
          organization_id?: string
          phone?: string | null
          postal_code?: string
          property_type?: string
          settings?: Json
          slug?: string
          state?: string
          status?: string
          tenant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "properties_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          bucket_key: string
          counter: number
          created_at: string
          expires_at: string
          id: string
          updated_at: string
          window_start: string
        }
        Insert: {
          bucket_key: string
          counter?: number
          created_at?: string
          expires_at: string
          id?: string
          updated_at?: string
          window_start: string
        }
        Update: {
          bucket_key?: string
          counter?: number
          created_at?: string
          expires_at?: string
          id?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      role_assignments: {
        Row: {
          block_id: string | null
          granted_at: string
          granted_by: string | null
          id: string
          is_active: boolean
          notes: string | null
          property_id: string | null
          revoked_at: string | null
          revoked_by: string | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          block_id?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          property_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          block_id?: string | null
          granted_at?: string
          granted_by?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          property_id?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "role_assignments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_assignments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      student_guardians: {
        Row: {
          can_approve_gate_pass: boolean
          can_pay_fees: boolean
          can_view_attendance: boolean
          can_view_complaints: boolean
          can_view_gate_events: boolean
          created_by: string | null
          guardian_id: string
          id: string
          is_emergency_contact: boolean
          is_primary: boolean
          linked_at: string
          portal_access_enabled: boolean
          relationship: string
          student_id: string
          tenant_id: string
          unlinked_at: string | null
        }
        Insert: {
          can_approve_gate_pass?: boolean
          can_pay_fees?: boolean
          can_view_attendance?: boolean
          can_view_complaints?: boolean
          can_view_gate_events?: boolean
          created_by?: string | null
          guardian_id: string
          id?: string
          is_emergency_contact?: boolean
          is_primary?: boolean
          linked_at?: string
          portal_access_enabled?: boolean
          relationship: string
          student_id: string
          tenant_id: string
          unlinked_at?: string | null
        }
        Update: {
          can_approve_gate_pass?: boolean
          can_pay_fees?: boolean
          can_view_attendance?: boolean
          can_view_complaints?: boolean
          can_view_gate_events?: boolean
          created_by?: string | null
          guardian_id?: string
          id?: string
          is_emergency_contact?: boolean
          is_primary?: boolean
          linked_at?: string
          portal_access_enabled?: boolean
          relationship?: string
          student_id?: string
          tenant_id?: string
          unlinked_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_guardians_guardian_id_fkey"
            columns: ["guardian_id"]
            isOneToOne: false
            referencedRelation: "guardians"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_guardians_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string
          provider: string | null
          provider_customer_ref: string | null
          provider_subscription_ref: string | null
          starts_at: string
          status: string
          tenant_id: string
          trial_ends_at: string | null
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id: string
          provider?: string | null
          provider_customer_ref?: string | null
          provider_subscription_ref?: string | null
          starts_at: string
          status?: string
          tenant_id: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string
          provider?: string | null
          provider_customer_ref?: string | null
          provider_subscription_ref?: string | null
          starts_at?: string
          status?: string
          tenant_id?: string
          trial_ends_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_memberships: {
        Row: {
          created_at: string
          id: string
          invited_at: string | null
          invited_by: string | null
          joined_at: string | null
          revoked_at: string | null
          status: string
          tenant_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          revoked_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          revoked_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_memberships_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          cancelled_at: string | null
          created_at: string
          default_currency: string
          default_locale: string
          display_name: string
          id: string
          legal_name: string | null
          onboarding_status: string
          slug: string
          status: string
          suspended_at: string | null
          timezone: string
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          default_currency?: string
          default_locale?: string
          display_name: string
          id?: string
          legal_name?: string | null
          onboarding_status?: string
          slug: string
          status?: string
          suspended_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          default_currency?: string
          default_locale?: string
          display_name?: string
          id?: string
          legal_name?: string | null
          onboarding_status?: string
          slug?: string
          status?: string
          suspended_at?: string | null
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_rate_limit: {
        Args: {
          p_bucket_key: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      get_user_role: {
        Args: { p_tenant_id: string; p_user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
    }
    Enums: {
      app_role:
        | "SUPER_ADMIN"
        | "HOSTEL_ADMIN"
        | "ACCOUNTANT"
        | "WARDEN"
        | "STUDENT"
        | "PARENT"
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
      app_role: [
        "SUPER_ADMIN",
        "HOSTEL_ADMIN",
        "ACCOUNTANT",
        "WARDEN",
        "STUDENT",
        "PARENT",
      ],
    },
  },
} as const
