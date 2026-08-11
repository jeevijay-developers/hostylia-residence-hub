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
      agreements: {
        Row: {
          allocation_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          document_id: string | null
          id: string
          property_id: string
          sent_at: string | null
          signature_evidence: Json
          signature_method: string | null
          signed_at: string | null
          signed_by_user_id: string | null
          status: string
          student_id: string
          template_version: string
          tenant_id: string
          updated_at: string
          void_reason: string | null
          voided_at: string | null
        }
        Insert: {
          allocation_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          id?: string
          property_id: string
          sent_at?: string | null
          signature_evidence?: Json
          signature_method?: string | null
          signed_at?: string | null
          signed_by_user_id?: string | null
          status?: string
          student_id: string
          template_version: string
          tenant_id: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Update: {
          allocation_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          document_id?: string | null
          id?: string
          property_id?: string
          sent_at?: string | null
          signature_evidence?: Json
          signature_method?: string | null
          signed_at?: string | null
          signed_by_user_id?: string | null
          status?: string
          student_id?: string
          template_version?: string
          tenant_id?: string
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "agreements_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreements_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreements_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agreements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_agreements_allocation"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "allocations"
            referencedColumns: ["id"]
          },
        ]
      }
      allocations: {
        Row: {
          activated_at: string | null
          actual_end_date: string | null
          agreement_id: string | null
          bed_id: string
          billing_cycle_day: number | null
          block_id: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          deleted_by: string | null
          deposit_snapshot_paise: number
          expected_end_date: string | null
          fee_plan_id: string | null
          floor_id: string
          id: string
          lock_in_until: string | null
          notice_period_days: number
          property_id: string
          rent_snapshot_paise: number
          room_id: string
          start_date: string
          status: string
          student_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          activated_at?: string | null
          actual_end_date?: string | null
          agreement_id?: string | null
          bed_id: string
          billing_cycle_day?: number | null
          block_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deposit_snapshot_paise?: number
          expected_end_date?: string | null
          fee_plan_id?: string | null
          floor_id: string
          id?: string
          lock_in_until?: string | null
          notice_period_days?: number
          property_id: string
          rent_snapshot_paise: number
          room_id: string
          start_date: string
          status?: string
          student_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          activated_at?: string | null
          actual_end_date?: string | null
          agreement_id?: string | null
          bed_id?: string
          billing_cycle_day?: number | null
          block_id?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          deposit_snapshot_paise?: number
          expected_end_date?: string | null
          fee_plan_id?: string | null
          floor_id?: string
          id?: string
          lock_in_until?: string | null
          notice_period_days?: number
          property_id?: string
          rent_snapshot_paise?: number
          room_id?: string
          start_date?: string
          status?: string
          student_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "allocations_agreement_id_fkey"
            columns: ["agreement_id"]
            isOneToOne: false
            referencedRelation: "agreements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "allocations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance: {
        Row: {
          attendance_date: string
          block_id: string | null
          id: string
          marked_at: string
          marked_by: string
          notes: string | null
          property_id: string
          session: string
          source: string
          status: string
          student_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          attendance_date: string
          block_id?: string | null
          id?: string
          marked_at?: string
          marked_by: string
          notes?: string | null
          property_id: string
          session?: string
          source?: string
          status: string
          student_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          attendance_date?: string
          block_id?: string | null
          id?: string
          marked_at?: string
          marked_by?: string
          notes?: string | null
          property_id?: string
          session?: string
          source?: string
          status?: string
          student_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "attendance_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attendance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
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
      beds: {
        Row: {
          block_id: string | null
          code: string
          created_at: string
          currency: string
          deleted_at: string | null
          floor_id: string
          id: string
          maintenance_until: string | null
          notes: string | null
          property_id: string
          rent_override_paise: number | null
          room_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          block_id?: string | null
          code: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          floor_id: string
          id?: string
          maintenance_until?: string | null
          notes?: string | null
          property_id: string
          rent_override_paise?: number | null
          room_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          block_id?: string | null
          code?: string
          created_at?: string
          currency?: string
          deleted_at?: string | null
          floor_id?: string
          id?: string
          maintenance_until?: string | null
          notes?: string | null
          property_id?: string
          rent_override_paise?: number | null
          room_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "beds_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beds_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beds_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beds_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          code: string | null
          created_at: string
          deleted_at: string | null
          display_order: number
          gender_policy: string | null
          id: string
          name: string
          property_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          display_order?: number
          gender_policy?: string | null
          id?: string
          name: string
          property_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          code?: string | null
          created_at?: string
          deleted_at?: string | null
          display_order?: number
          gender_policy?: string | null
          id?: string
          name?: string
          property_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "blocks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_categories: {
        Row: {
          created_at: string
          created_by: string | null
          default_priority: string
          deleted_at: string | null
          deleted_by: string | null
          description: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          property_id: string
          sla_minutes: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          default_priority?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          property_id: string
          sla_minutes: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          default_priority?: string
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          property_id?: string
          sla_minutes?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_categories_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_categories_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      complaint_comments: {
        Row: {
          author_user_id: string
          body: string
          complaint_id: string
          created_at: string
          id: string
          property_id: string
          tenant_id: string
        }
        Insert: {
          author_user_id: string
          body: string
          complaint_id: string
          created_at?: string
          id?: string
          property_id: string
          tenant_id: string
        }
        Update: {
          author_user_id?: string
          body?: string
          complaint_id?: string
          created_at?: string
          id?: string
          property_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaint_comments_complaint_id_fkey"
            columns: ["complaint_id"]
            isOneToOne: false
            referencedRelation: "complaints"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_comments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaint_comments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      complaints: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          bed_id: string | null
          block_id: string | null
          category_id: string
          closed_at: string | null
          complaint_number: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          description: string
          id: string
          priority: string
          property_id: string
          rating: number | null
          rating_comment: string | null
          reopen_until: string | null
          resolution_summary: string | null
          resolved_at: string | null
          resolved_by: string | null
          room_id: string | null
          sla_breached_at: string | null
          sla_due_at: string
          status: string
          student_id: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          bed_id?: string | null
          block_id?: string | null
          category_id: string
          closed_at?: string | null
          complaint_number: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description: string
          id?: string
          priority?: string
          property_id: string
          rating?: number | null
          rating_comment?: string | null
          reopen_until?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string | null
          sla_breached_at?: string | null
          sla_due_at: string
          status?: string
          student_id: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          bed_id?: string | null
          block_id?: string | null
          category_id?: string
          closed_at?: string | null
          complaint_number?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          description?: string
          id?: string
          priority?: string
          property_id?: string
          rating?: number | null
          rating_comment?: string | null
          reopen_until?: string | null
          resolution_summary?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          room_id?: string | null
          sla_breached_at?: string | null
          sla_due_at?: string
          status?: string
          student_id?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "complaints_bed_id_fkey"
            columns: ["bed_id"]
            isOneToOne: false
            referencedRelation: "beds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "complaint_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_participants: {
        Row: {
          conversation_id: string
          id: string
          joined_at: string
          last_read_at: string | null
          left_at: string | null
          participant_role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          left_at?: string | null
          participant_role: Database["public"]["Enums"]["app_role"]
          tenant_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          id?: string
          joined_at?: string
          last_read_at?: string | null
          left_at?: string | null
          participant_role?: Database["public"]["Enums"]["app_role"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_participants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          conversation_type: string
          created_at: string
          created_by: string
          id: string
          property_id: string
          status: string
          student_id: string | null
          subject: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          conversation_type: string
          created_at?: string
          created_by: string
          id?: string
          property_id: string
          status?: string
          student_id?: string | null
          subject?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          conversation_type?: string
          created_at?: string
          created_by?: string
          id?: string
          property_id?: string
          status?: string
          student_id?: string | null
          subject?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      deposit_ledger_entries: {
        Row: {
          allocation_id: string
          amount_paise: number
          created_at: string
          created_by: string | null
          description: string
          direction: string
          entry_type: string
          id: string
          property_id: string
          reference_id: string | null
          reference_type: string | null
          student_id: string
          tenant_id: string
        }
        Insert: {
          allocation_id: string
          amount_paise: number
          created_at?: string
          created_by?: string | null
          description: string
          direction: string
          entry_type: string
          id?: string
          property_id: string
          reference_id?: string | null
          reference_type?: string | null
          student_id: string
          tenant_id: string
        }
        Update: {
          allocation_id?: string
          amount_paise?: number
          created_at?: string
          created_by?: string | null
          description?: string
          direction?: string
          entry_type?: string
          id?: string
          property_id?: string
          reference_id?: string | null
          reference_type?: string | null
          student_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "deposit_ledger_entries_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_ledger_entries_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_ledger_entries_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deposit_ledger_entries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          checksum: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          deleted_by: string | null
          document_type: string
          id: string
          mime_type: string
          original_filename: string
          owner_id: string
          owner_type: string
          property_id: string | null
          rejection_reason: string | null
          size_bytes: number | null
          status: string
          storage_bucket: string
          storage_path: string
          tenant_id: string
          verification_status: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          document_type: string
          id?: string
          mime_type: string
          original_filename: string
          owner_id: string
          owner_type: string
          property_id?: string | null
          rejection_reason?: string | null
          size_bytes?: number | null
          status?: string
          storage_bucket: string
          storage_path: string
          tenant_id: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          checksum?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          document_type?: string
          id?: string
          mime_type?: string
          original_filename?: string
          owner_id?: string
          owner_type?: string
          property_id?: string | null
          rejection_reason?: string | null
          size_bytes?: number | null
          status?: string
          storage_bucket?: string
          storage_path?: string
          tenant_id?: string
          verification_status?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_plan_components: {
        Row: {
          allow_zero_amount: boolean
          amount_paise: number
          component_type: string
          created_at: string
          display_order: number
          fee_plan_id: string
          id: string
          is_active: boolean
          is_refundable: boolean
          is_taxable: boolean
          name: string
          property_id: string
          tax_rate_basis_points: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          allow_zero_amount?: boolean
          amount_paise: number
          component_type: string
          created_at?: string
          display_order?: number
          fee_plan_id: string
          id?: string
          is_active?: boolean
          is_refundable?: boolean
          is_taxable?: boolean
          name: string
          property_id: string
          tax_rate_basis_points?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          allow_zero_amount?: boolean
          amount_paise?: number
          component_type?: string
          created_at?: string
          display_order?: number
          fee_plan_id?: string
          id?: string
          is_active?: boolean
          is_refundable?: boolean
          is_taxable?: boolean
          name?: string
          property_id?: string
          tax_rate_basis_points?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_plan_components_fee_plan_id_fkey"
            columns: ["fee_plan_id"]
            isOneToOne: false
            referencedRelation: "fee_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_plan_components_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_plan_components_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      fee_plans: {
        Row: {
          billing_frequency: string
          code: string
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          deleted_by: string | null
          due_day: number
          effective_from: string
          effective_until: string | null
          grace_period_days: number
          id: string
          late_fee_type: string
          late_fee_value: number
          name: string
          property_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          billing_frequency: string
          code: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          due_day: number
          effective_from: string
          effective_until?: string | null
          grace_period_days?: number
          id?: string
          late_fee_type?: string
          late_fee_value?: number
          name: string
          property_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          billing_frequency?: string
          code?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          due_day?: number
          effective_from?: string
          effective_until?: string | null
          grace_period_days?: number
          id?: string
          late_fee_type?: string
          late_fee_value?: number
          name?: string
          property_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fee_plans_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fee_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_responses: {
        Row: {
          answers: Json
          id: string
          property_id: string
          respondent_user_id: string
          student_id: string | null
          submitted_at: string
          survey_id: string
          tenant_id: string
        }
        Insert: {
          answers: Json
          id?: string
          property_id: string
          respondent_user_id: string
          student_id?: string | null
          submitted_at?: string
          survey_id: string
          tenant_id: string
        }
        Update: {
          answers?: Json
          id?: string
          property_id?: string
          respondent_user_id?: string
          student_id?: string | null
          submitted_at?: string
          survey_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_responses_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_responses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_responses_survey_id_fkey"
            columns: ["survey_id"]
            isOneToOne: false
            referencedRelation: "feedback_surveys"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_responses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback_surveys: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          ends_at: string | null
          id: string
          property_id: string
          questions: Json
          starts_at: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          property_id: string
          questions: Json
          starts_at?: string | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          ends_at?: string | null
          id?: string
          property_id?: string
          questions?: Json
          starts_at?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "feedback_surveys_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feedback_surveys_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      floors: {
        Row: {
          block_id: string | null
          created_at: string
          deleted_at: string | null
          display_order: number
          floor_number: number | null
          id: string
          layout_metadata: Json
          name: string
          property_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          block_id?: string | null
          created_at?: string
          deleted_at?: string | null
          display_order?: number
          floor_number?: number | null
          id?: string
          layout_metadata?: Json
          name: string
          property_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          block_id?: string | null
          created_at?: string
          deleted_at?: string | null
          display_order?: number
          floor_number?: number | null
          id?: string
          layout_metadata?: Json
          name?: string
          property_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "floors_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floors_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "floors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_events: {
        Row: {
          block_id: string | null
          created_at: string
          device_id: string | null
          direction: string
          event_at: string
          gate_pass_id: string | null
          id: string
          idempotency_key: string
          is_late: boolean
          method: string
          notes: string | null
          property_id: string
          recorded_by: string
          student_id: string | null
          tenant_id: string
          visitor_id: string | null
        }
        Insert: {
          block_id?: string | null
          created_at?: string
          device_id?: string | null
          direction: string
          event_at?: string
          gate_pass_id?: string | null
          id?: string
          idempotency_key: string
          is_late?: boolean
          method?: string
          notes?: string | null
          property_id: string
          recorded_by: string
          student_id?: string | null
          tenant_id: string
          visitor_id?: string | null
        }
        Update: {
          block_id?: string | null
          created_at?: string
          device_id?: string | null
          direction?: string
          event_at?: string
          gate_pass_id?: string | null
          id?: string
          idempotency_key?: string
          is_late?: boolean
          method?: string
          notes?: string | null
          property_id?: string
          recorded_by?: string
          student_id?: string | null
          tenant_id?: string
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_events_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_events_gate_pass_id_fkey"
            columns: ["gate_pass_id"]
            isOneToOne: false
            referencedRelation: "gate_passes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_events_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_events_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_events_visitor_id_fkey"
            columns: ["visitor_id"]
            isOneToOne: false
            referencedRelation: "visitors"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_pass_approvals: {
        Row: {
          approver_type: string
          approver_user_id: string
          created_at: string
          decision: string
          gate_pass_id: string
          id: string
          property_id: string
          reason: string | null
          tenant_id: string
        }
        Insert: {
          approver_type: string
          approver_user_id: string
          created_at?: string
          decision: string
          gate_pass_id: string
          id?: string
          property_id: string
          reason?: string | null
          tenant_id: string
        }
        Update: {
          approver_type?: string
          approver_user_id?: string
          created_at?: string
          decision?: string
          gate_pass_id?: string
          id?: string
          property_id?: string
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "gate_pass_approvals_gate_pass_id_fkey"
            columns: ["gate_pass_id"]
            isOneToOne: false
            referencedRelation: "gate_passes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_pass_approvals_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_pass_approvals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      gate_passes: {
        Row: {
          actual_in_at: string | null
          actual_out_at: string | null
          block_id: string | null
          created_at: string
          created_by: string | null
          decision_reason: string | null
          deleted_at: string | null
          destination: string | null
          expected_in_at: string
          id: string
          out_at: string
          parent_approved_at: string | null
          parent_approved_by: string | null
          pass_number: string
          property_id: string
          qr_expires_at: string | null
          qr_token_hash: string | null
          reason: string
          requires_parent_approval: boolean
          status: string
          student_id: string
          tenant_id: string
          updated_at: string
          warden_approved_at: string | null
          warden_approved_by: string | null
        }
        Insert: {
          actual_in_at?: string | null
          actual_out_at?: string | null
          block_id?: string | null
          created_at?: string
          created_by?: string | null
          decision_reason?: string | null
          deleted_at?: string | null
          destination?: string | null
          expected_in_at: string
          id?: string
          out_at: string
          parent_approved_at?: string | null
          parent_approved_by?: string | null
          pass_number: string
          property_id: string
          qr_expires_at?: string | null
          qr_token_hash?: string | null
          reason: string
          requires_parent_approval?: boolean
          status?: string
          student_id: string
          tenant_id: string
          updated_at?: string
          warden_approved_at?: string | null
          warden_approved_by?: string | null
        }
        Update: {
          actual_in_at?: string | null
          actual_out_at?: string | null
          block_id?: string | null
          created_at?: string
          created_by?: string | null
          decision_reason?: string | null
          deleted_at?: string | null
          destination?: string | null
          expected_in_at?: string
          id?: string
          out_at?: string
          parent_approved_at?: string | null
          parent_approved_by?: string | null
          pass_number?: string
          property_id?: string
          qr_expires_at?: string | null
          qr_token_hash?: string | null
          reason?: string
          requires_parent_approval?: boolean
          status?: string
          student_id?: string
          tenant_id?: string
          updated_at?: string
          warden_approved_at?: string | null
          warden_approved_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gate_passes_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_passes_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_passes_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "gate_passes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
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
      invoices: {
        Row: {
          allocation_id: string | null
          balance_paise: number
          billing_period_end: string | null
          billing_period_start: string | null
          buyer_gstin_snapshot: string | null
          created_at: string
          created_by: string | null
          currency: string
          deleted_at: string | null
          deleted_by: string | null
          discount_paise: number
          due_date: string
          fee_plan_id: string | null
          gst_invoice: boolean
          id: string
          invoice_number: string
          issue_date: string
          issued_at: string | null
          late_fee_paise: number
          notes: string | null
          paid_paise: number
          property_id: string
          refunded_paise: number
          seller_gstin_snapshot: string | null
          status: string
          student_id: string
          subtotal_paise: number
          tax_paise: number
          tenant_id: string
          total_paise: number
          updated_at: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          allocation_id?: string | null
          balance_paise: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          buyer_gstin_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_paise?: number
          due_date: string
          fee_plan_id?: string | null
          gst_invoice?: boolean
          id?: string
          invoice_number: string
          issue_date: string
          issued_at?: string | null
          late_fee_paise?: number
          notes?: string | null
          paid_paise?: number
          property_id: string
          refunded_paise?: number
          seller_gstin_snapshot?: string | null
          status?: string
          student_id: string
          subtotal_paise: number
          tax_paise?: number
          tenant_id: string
          total_paise: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          allocation_id?: string | null
          balance_paise?: number
          billing_period_end?: string | null
          billing_period_start?: string | null
          buyer_gstin_snapshot?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          deleted_at?: string | null
          deleted_by?: string | null
          discount_paise?: number
          due_date?: string
          fee_plan_id?: string | null
          gst_invoice?: boolean
          id?: string
          invoice_number?: string
          issue_date?: string
          issued_at?: string | null
          late_fee_paise?: number
          notes?: string | null
          paid_paise?: number
          property_id?: string
          refunded_paise?: number
          seller_gstin_snapshot?: string | null
          status?: string
          student_id?: string
          subtotal_paise?: number
          tax_paise?: number
          tenant_id?: string
          total_paise?: number
          updated_at?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_allocation_id_fkey"
            columns: ["allocation_id"]
            isOneToOne: false
            referencedRelation: "allocations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_fee_plan_id_fkey"
            columns: ["fee_plan_id"]
            isOneToOne: false
            referencedRelation: "fee_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mess_feedback: {
        Row: {
          comment: string | null
          created_at: string
          id: string
          mess_menu_id: string
          property_id: string
          rating: number
          student_id: string
          tenant_id: string
        }
        Insert: {
          comment?: string | null
          created_at?: string
          id?: string
          mess_menu_id: string
          property_id: string
          rating: number
          student_id: string
          tenant_id: string
        }
        Update: {
          comment?: string | null
          created_at?: string
          id?: string
          mess_menu_id?: string
          property_id?: string
          rating?: number
          student_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mess_feedback_mess_menu_id_fkey"
            columns: ["mess_menu_id"]
            isOneToOne: false
            referencedRelation: "mess_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mess_feedback_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mess_feedback_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mess_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mess_headcounts: {
        Row: {
          actual_count: number | null
          created_at: string
          expected_count: number
          id: string
          mess_menu_id: string
          property_id: string
          recorded_at: string | null
          recorded_by: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          actual_count?: number | null
          created_at?: string
          expected_count?: number
          id?: string
          mess_menu_id: string
          property_id: string
          recorded_at?: string | null
          recorded_by?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          actual_count?: number | null
          created_at?: string
          expected_count?: number
          id?: string
          mess_menu_id?: string
          property_id?: string
          recorded_at?: string | null
          recorded_by?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mess_headcounts_mess_menu_id_fkey"
            columns: ["mess_menu_id"]
            isOneToOne: false
            referencedRelation: "mess_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mess_headcounts_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mess_headcounts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mess_menu_items: {
        Row: {
          allergen_notes: string | null
          created_at: string
          description: string | null
          display_order: number
          id: string
          is_vegetarian: boolean | null
          item_name: string
          mess_menu_id: string
          property_id: string
          tenant_id: string
        }
        Insert: {
          allergen_notes?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_vegetarian?: boolean | null
          item_name: string
          mess_menu_id: string
          property_id: string
          tenant_id: string
        }
        Update: {
          allergen_notes?: string | null
          created_at?: string
          description?: string | null
          display_order?: number
          id?: string
          is_vegetarian?: boolean | null
          item_name?: string
          mess_menu_id?: string
          property_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mess_menu_items_mess_menu_id_fkey"
            columns: ["mess_menu_id"]
            isOneToOne: false
            referencedRelation: "mess_menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mess_menu_items_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mess_menu_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      mess_menus: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          meal: string
          menu_date: string
          notes: string | null
          property_id: string
          published_at: string | null
          published_by: string | null
          serve_time: string | null
          status: string
          tenant_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          meal: string
          menu_date: string
          notes?: string | null
          property_id: string
          published_at?: string | null
          published_by?: string | null
          serve_time?: string | null
          status?: string
          tenant_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          meal?: string
          menu_date?: string
          notes?: string | null
          property_id?: string
          published_at?: string | null
          published_by?: string | null
          serve_time?: string | null
          status?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "mess_menus_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mess_menus_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          deleted_at: string | null
          document_id: string | null
          edited_at: string | null
          id: string
          message_type: string
          property_id: string
          sender_user_id: string
          sent_at: string
          tenant_id: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          deleted_at?: string | null
          document_id?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          property_id: string
          sender_user_id: string
          sent_at?: string
          tenant_id: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          deleted_at?: string | null
          document_id?: string | null
          edited_at?: string | null
          id?: string
          message_type?: string
          property_id?: string
          sender_user_id?: string
          sent_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notices: {
        Row: {
          audience_type: string
          body: string
          channels: string[]
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expires_at: string | null
          id: string
          priority: string
          property_id: string
          publish_at: string | null
          published_at: string | null
          published_by: string | null
          status: string
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          audience_type?: string
          body: string
          channels?: string[]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          priority?: string
          property_id: string
          publish_at?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: string
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          audience_type?: string
          body?: string
          channels?: string[]
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expires_at?: string | null
          id?: string
          priority?: string
          property_id?: string
          publish_at?: string | null
          published_at?: string | null
          published_by?: string | null
          status?: string
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_attempts: {
        Row: {
          attempt_number: number
          attempted_at: string
          completed_at: string | null
          error_code: string | null
          error_message: string | null
          id: string
          notification_id: string
          provider: string
          provider_message_ref: string | null
          response_code: string | null
          status: string
        }
        Insert: {
          attempt_number: number
          attempted_at?: string
          completed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          notification_id: string
          provider: string
          provider_message_ref?: string | null
          response_code?: string | null
          status: string
        }
        Update: {
          attempt_number?: number
          attempted_at?: string
          completed_at?: string | null
          error_code?: string | null
          error_message?: string | null
          id?: string
          notification_id?: string
          provider?: string
          provider_message_ref?: string | null
          response_code?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_attempts_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          channel: string
          created_at: string
          delivered_at: string | null
          event_type: string
          id: string
          idempotency_key: string
          locale: string
          payload: Json
          property_id: string | null
          read_at: string | null
          recipient_email: string | null
          recipient_phone: string | null
          recipient_user_id: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          template_key: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          channel: string
          created_at?: string
          delivered_at?: string | null
          event_type: string
          id?: string
          idempotency_key: string
          locale?: string
          payload?: Json
          property_id?: string | null
          read_at?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          template_key: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          channel?: string
          created_at?: string
          delivered_at?: string | null
          event_type?: string
          id?: string
          idempotency_key?: string
          locale?: string
          payload?: Json
          property_id?: string | null
          read_at?: string | null
          recipient_email?: string | null
          recipient_phone?: string | null
          recipient_user_id?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          template_key?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
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
      payment_orders: {
        Row: {
          amount_paise: number
          created_at: string
          created_by_user_id: string
          currency: string
          expires_at: string | null
          id: string
          idempotency_key: string
          invoice_id: string | null
          property_id: string
          provider: string
          provider_order_ref: string
          status: string
          student_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_paise: number
          created_at?: string
          created_by_user_id: string
          currency?: string
          expires_at?: string | null
          id?: string
          idempotency_key: string
          invoice_id?: string | null
          property_id: string
          provider: string
          provider_order_ref: string
          status?: string
          student_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          created_at?: string
          created_by_user_id?: string
          currency?: string
          expires_at?: string | null
          id?: string
          idempotency_key?: string
          invoice_id?: string | null
          property_id?: string
          provider?: string
          provider_order_ref?: string
          status?: string
          student_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_orders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_paise: number
          cheque_date: string | null
          created_at: string
          currency: string
          id: string
          invoice_id: string | null
          metadata: Json
          mode: string
          notes: string | null
          offline_reference: string | null
          paid_at: string | null
          payment_number: string
          payment_order_id: string | null
          property_id: string
          provider: string | null
          provider_order_ref: string | null
          provider_payment_ref: string | null
          recorded_by: string | null
          status: string
          student_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_paise: number
          cheque_date?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          metadata?: Json
          mode: string
          notes?: string | null
          offline_reference?: string | null
          paid_at?: string | null
          payment_number: string
          payment_order_id?: string | null
          property_id: string
          provider?: string | null
          provider_order_ref?: string | null
          provider_payment_ref?: string | null
          recorded_by?: string | null
          status?: string
          student_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          cheque_date?: string | null
          created_at?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          metadata?: Json
          mode?: string
          notes?: string | null
          offline_reference?: string | null
          paid_at?: string | null
          payment_number?: string
          payment_order_id?: string | null
          property_id?: string
          provider?: string | null
          provider_order_ref?: string | null
          provider_payment_ref?: string | null
          recorded_by?: string | null
          status?: string
          student_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_invoice_aging"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_payment_order_id_fkey"
            columns: ["payment_order_id"]
            isOneToOne: false
            referencedRelation: "payment_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_features: {
        Row: {
          configuration: Json
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          limit_value: number | null
          plan_id: string
          updated_at: string
        }
        Insert: {
          configuration?: Json
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          limit_value?: number | null
          plan_id: string
          updated_at?: string
        }
        Update: {
          configuration?: Json
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          limit_value?: number | null
          plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_features_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
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
          address: Json | null
          alternate_phone: string | null
          avatar_path: string | null
          blood_group: string | null
          created_at: string
          date_of_birth: string | null
          email: string | null
          emergency_contact_name: string | null
          emergency_contact_number: string | null
          full_name: string
          gender: string | null
          id: string
          last_active_at: string | null
          locale: string
          phone: string | null
          preferred_name: string | null
          status: string
          updated_at: string
        }
        Insert: {
          address?: Json | null
          alternate_phone?: string | null
          avatar_path?: string | null
          blood_group?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_number?: string | null
          full_name: string
          gender?: string | null
          id: string
          last_active_at?: string | null
          locale?: string
          phone?: string | null
          preferred_name?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          address?: Json | null
          alternate_phone?: string | null
          avatar_path?: string | null
          blood_group?: string | null
          created_at?: string
          date_of_birth?: string | null
          email?: string | null
          emergency_contact_name?: string | null
          emergency_contact_number?: string | null
          full_name?: string
          gender?: string | null
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
      refunds: {
        Row: {
          amount_paise: number
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string
          currency: string
          decision_reason: string | null
          expected_completion_at: string | null
          failure_reason: string | null
          id: string
          initiated_at: string
          initiated_by: string
          mode: string
          payment_id: string
          property_id: string
          provider_refund_ref: string | null
          reason: string
          refund_number: string
          status: string
          student_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount_paise: number
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          decision_reason?: string | null
          expected_completion_at?: string | null
          failure_reason?: string | null
          id?: string
          initiated_at?: string
          initiated_by: string
          mode: string
          payment_id: string
          property_id: string
          provider_refund_ref?: string | null
          reason: string
          refund_number: string
          status?: string
          student_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount_paise?: number
          approved_at?: string | null
          approved_by?: string | null
          completed_at?: string | null
          created_at?: string
          currency?: string
          decision_reason?: string | null
          expected_completion_at?: string | null
          failure_reason?: string | null
          id?: string
          initiated_at?: string
          initiated_by?: string
          mode?: string
          payment_id?: string
          property_id?: string
          provider_refund_ref?: string | null
          reason?: string
          refund_number?: string
          status?: string
          student_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      role_assignments: {
        Row: {
          block_id: string | null
          employee_id: string | null
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
          employee_id?: string | null
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
          employee_id?: string | null
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
      rooms: {
        Row: {
          amenities: Json
          base_rent_paise: number | null
          block_id: string | null
          capacity: number
          created_at: string
          currency: string
          deleted_at: string | null
          floor_id: string
          id: string
          notes: string | null
          property_id: string
          room_number: string
          room_type: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amenities?: Json
          base_rent_paise?: number | null
          block_id?: string | null
          capacity: number
          created_at?: string
          currency?: string
          deleted_at?: string | null
          floor_id: string
          id?: string
          notes?: string | null
          property_id: string
          room_number: string
          room_type?: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amenities?: Json
          base_rent_paise?: number | null
          block_id?: string | null
          capacity?: number
          created_at?: string
          currency?: string
          deleted_at?: string | null
          floor_id?: string
          id?: string
          notes?: string | null
          property_id?: string
          room_number?: string
          room_type?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_floor_id_fkey"
            columns: ["floor_id"]
            isOneToOne: false
            referencedRelation: "floors"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rooms_tenant_id_fkey"
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
            foreignKeyName: "fk_student_guardians_student"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
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
      students: {
        Row: {
          academic_institute: string | null
          academic_year: string | null
          admission_number: string
          course_name: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          deleted_at: string | null
          deleted_by: string | null
          email: string | null
          full_name: string
          gender: string | null
          id: string
          is_minor: boolean
          joined_at: string | null
          metadata: Json
          moved_out_at: string | null
          phone: string | null
          photo_path: string | null
          portal_access_enabled: boolean
          profile_id: string | null
          property_id: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          academic_institute?: string | null
          academic_year?: string | null
          admission_number: string
          course_name?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          full_name: string
          gender?: string | null
          id?: string
          is_minor?: boolean
          joined_at?: string | null
          metadata?: Json
          moved_out_at?: string | null
          phone?: string | null
          photo_path?: string | null
          portal_access_enabled?: boolean
          profile_id?: string | null
          property_id: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          academic_institute?: string | null
          academic_year?: string | null
          admission_number?: string
          course_name?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          deleted_at?: string | null
          deleted_by?: string | null
          email?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          is_minor?: boolean
          joined_at?: string | null
          metadata?: Json
          moved_out_at?: string | null
          phone?: string | null
          photo_path?: string | null
          portal_access_enabled?: boolean
          profile_id?: string | null
          property_id?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "students_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_tenant_id_fkey"
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
      support_sessions: {
        Row: {
          access_mode: string
          consent_recorded: boolean
          created_at: string
          ended_at: string | null
          ended_reason: string | null
          expires_at: string
          id: string
          reason: string
          started_at: string
          super_admin_user_id: string
          support_reference: string | null
          target_user_id: string
          tenant_id: string
        }
        Insert: {
          access_mode: string
          consent_recorded?: boolean
          created_at?: string
          ended_at?: string | null
          ended_reason?: string | null
          expires_at: string
          id?: string
          reason: string
          started_at: string
          super_admin_user_id: string
          support_reference?: string | null
          target_user_id: string
          tenant_id: string
        }
        Update: {
          access_mode?: string
          consent_recorded?: boolean
          created_at?: string
          ended_at?: string | null
          ended_reason?: string | null
          expires_at?: string
          id?: string
          reason?: string
          started_at?: string
          super_admin_user_id?: string
          support_reference?: string | null
          target_user_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_feature_overrides: {
        Row: {
          configuration: Json
          created_at: string
          created_by: string
          enabled: boolean
          expires_at: string | null
          feature_key: string
          id: string
          limit_value: number | null
          reason: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          configuration?: Json
          created_at?: string
          created_by: string
          enabled: boolean
          expires_at?: string | null
          feature_key: string
          id?: string
          limit_value?: number | null
          reason: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          configuration?: Json
          created_at?: string
          created_by?: string
          enabled?: boolean
          expires_at?: string | null
          feature_key?: string
          id?: string
          limit_value?: number | null
          reason?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_feature_overrides_tenant_id_fkey"
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
      visitors: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          checked_in_at: string | null
          checked_out_at: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expected_at: string | null
          host_student_id: string
          id: string
          id_document_id: string | null
          name: string
          phone: string
          photo_document_id: string | null
          property_id: string
          purpose: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_at?: string | null
          host_student_id: string
          id?: string
          id_document_id?: string | null
          name: string
          phone: string
          photo_document_id?: string | null
          property_id: string
          purpose: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          checked_in_at?: string | null
          checked_out_at?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_at?: string | null
          host_student_id?: string
          id?: string
          id_document_id?: string | null
          name?: string
          phone?: string
          photo_document_id?: string | null
          property_id?: string
          purpose?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visitors_host_student_id_fkey"
            columns: ["host_student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitors_id_document_id_fkey"
            columns: ["id_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitors_photo_document_id_fkey"
            columns: ["photo_document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitors_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visitors_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events: {
        Row: {
          error: string | null
          event_id: string
          event_type: string | null
          id: string
          payload: Json
          processed_at: string | null
          provider: string
          received_at: string
          status: string
        }
        Insert: {
          error?: string | null
          event_id: string
          event_type?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider: string
          received_at?: string
          status?: string
        }
        Update: {
          error?: string | null
          event_id?: string
          event_type?: string | null
          id?: string
          payload?: Json
          processed_at?: string | null
          provider?: string
          received_at?: string
          status?: string
        }
        Relationships: []
      }
    }
    Views: {
      v_complaint_sla_summary: {
        Row: {
          assigned_to: string | null
          breached: number | null
          category_id: string | null
          property_id: string | null
          resolved_total: number | null
          resolved_within_sla: number | null
          sla_compliance_pct: number | null
          tenant_id: string | null
          total_complaints: number | null
        }
        Relationships: [
          {
            foreignKeyName: "complaints_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "complaint_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "complaints_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_invoice_aging: {
        Row: {
          aging_bucket: string | null
          balance_paise: number | null
          days_overdue: number | null
          due_date: string | null
          id: string | null
          invoice_number: string | null
          issue_date: string | null
          paid_paise: number | null
          property_id: string | null
          status: string | null
          student_id: string | null
          tenant_id: string | null
          total_paise: number | null
        }
        Insert: {
          aging_bucket?: never
          balance_paise?: number | null
          days_overdue?: never
          due_date?: string | null
          id?: string | null
          invoice_number?: string | null
          issue_date?: string | null
          paid_paise?: number | null
          property_id?: string | null
          status?: string | null
          student_id?: string | null
          tenant_id?: string | null
          total_paise?: number | null
        }
        Update: {
          aging_bucket?: never
          balance_paise?: number | null
          days_overdue?: never
          due_date?: string | null
          id?: string | null
          invoice_number?: string | null
          issue_date?: string | null
          paid_paise?: number | null
          property_id?: string | null
          status?: string | null
          student_id?: string | null
          tenant_id?: string | null
          total_paise?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      v_occupancy_summary: {
        Row: {
          block_id: string | null
          blocked_beds: number | null
          maintenance_beds: number | null
          occupancy_pct: number | null
          occupied_beds: number | null
          property_id: string | null
          tenant_id: string | null
          total_beds: number | null
          vacant_beds: number | null
        }
        Relationships: [
          {
            foreignKeyName: "beds_block_id_fkey"
            columns: ["block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beds_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "beds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      activate_allocation: {
        Args: { p_allocation_id: string }
        Returns: undefined
      }
      advance_allocation_after_signing: {
        Args: { p_agreement_id: string }
        Returns: undefined
      }
      can_access_conversation: {
        Args: { _conversation_id: string; _user_id: string }
        Returns: boolean
      }
      check_rate_limit: {
        Args: {
          p_bucket_key: string
          p_limit: number
          p_window_seconds: number
        }
        Returns: boolean
      }
      complete_move_out: {
        Args: { p_actual_end_date: string; p_allocation_id: string }
        Returns: undefined
      }
      earliest_move_out_date: {
        Args: { p_allocation_id: string }
        Returns: string
      }
      fn_approve_refund: {
        Args: { p_decision: string; p_reason?: string; p_refund_id: string }
        Returns: {
          amount_paise: number
          approved_at: string | null
          approved_by: string | null
          completed_at: string | null
          created_at: string
          currency: string
          decision_reason: string | null
          expected_completion_at: string | null
          failure_reason: string | null
          id: string
          initiated_at: string
          initiated_by: string
          mode: string
          payment_id: string
          property_id: string
          provider_refund_ref: string | null
          reason: string
          refund_number: string
          status: string
          student_id: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "refunds"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_assign_hostel_admin: {
        Args: {
          p_property_id?: string
          p_target_user_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      fn_dispatch_notification: {
        Args: {
          p_channel: string
          p_event_type: string
          p_property_id: string
          p_recipient: Json
          p_reference_id: string
          p_template_key: string
          p_tenant_id: string
          p_variables: Json
        }
        Returns: undefined
      }
      fn_effective_feature: {
        Args: { _feature_key: string; _tenant_id: string }
        Returns: Json
      }
      fn_end_support_session: {
        Args: { _reason: string; _session_id: string }
        Returns: {
          access_mode: string
          consent_recorded: boolean
          created_at: string
          ended_at: string | null
          ended_reason: string | null
          expires_at: string
          id: string
          reason: string
          started_at: string
          super_admin_user_id: string
          support_reference: string | null
          target_user_id: string
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "support_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      fn_enqueue_in_app_notification: {
        Args: {
          p_event_type: string
          p_idempotency_key: string
          p_payload: Json
          p_property_id: string
          p_recipient_user_id: string
          p_template_key: string
          p_tenant_id: string
        }
        Returns: string
      }
      fn_generate_invoices: { Args: never; Returns: number }
      fn_get_platform_metrics: { Args: never; Returns: Json }
      fn_is_acting_as_student_only: {
        Args: { _tenant: string }
        Returns: boolean
      }
      fn_provision_tenant: {
        Args: { p_hostel_name: string }
        Returns: {
          already_existed: boolean
          tenant_id: string
        }[]
      }
      fn_publish_scheduled_notices: { Args: never; Returns: number }
      fn_scan_complaint_sla_breaches: { Args: never; Returns: number }
      fn_seed_default_complaint_categories: {
        Args: { p_property_id: string }
        Returns: undefined
      }
      fn_send_fee_reminders: { Args: never; Returns: number }
      get_user_role: {
        Args: { p_tenant_id: string; p_user_id: string }
        Returns: Database["public"]["Enums"]["app_role"]
      }
      has_any_tenant_role: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      has_tenant_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      is_finance_staff: {
        Args: { _property_id: string; _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_guardian_of_property: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      is_guardian_of_student: {
        Args: { _student_id: string; _user_id: string }
        Returns: boolean
      }
      is_hostel_admin: {
        Args: { _property_id: string; _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      is_own_student: {
        Args: { _student_id: string; _user_id: string }
        Returns: boolean
      }
      is_own_student_property: {
        Args: { _property_id: string; _user_id: string }
        Returns: boolean
      }
      is_owning_student: {
        Args: { _student_id: string; _user_id: string }
        Returns: boolean
      }
      is_paying_parent: {
        Args: { _student_id: string; _user_id: string }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
      is_tenant_member: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      provisional_refund_paise: {
        Args: { p_allocation_id: string }
        Returns: number
      }
      record_manual_payment: {
        Args: {
          p_amount_paise: number
          p_cheque_date?: string
          p_invoice_id: string
          p_mode: string
          p_notes?: string
          p_offline_reference?: string
        }
        Returns: {
          amount_paise: number
          cheque_date: string | null
          created_at: string
          currency: string
          id: string
          invoice_id: string | null
          metadata: Json
          mode: string
          notes: string | null
          offline_reference: string | null
          paid_at: string | null
          payment_number: string
          payment_order_id: string | null
          property_id: string
          provider: string | null
          provider_order_ref: string | null
          provider_payment_ref: string | null
          recorded_by: string | null
          status: string
          student_id: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      warden_can_read_property: {
        Args: { _property_id: string; _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      warden_can_write_scope: {
        Args: {
          _block_id: string
          _property_id: string
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
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
