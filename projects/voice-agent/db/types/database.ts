// AUTO-GENERATED. Do not edit by hand.
// Regenerate after schema changes:
//   mcp__claude_ai_Supabase__generate_typescript_types(project_id='<supabase-project-id>')
// Then overwrite this file with the result.
//
// Source: Supabase project 'voice_agent' (id: <supabase-project-id>, region: eu-west-1).

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
      appointments: {
        Row: {
          address: string
          call_id: string | null
          created_at: string
          customer_id: string
          end_time: string
          gcal_event_id: string
          id: string
          notes: string | null
          rescheduled_from_id: string | null
          service_type: string
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          address: string
          call_id?: string | null
          created_at?: string
          customer_id: string
          end_time: string
          gcal_event_id: string
          id?: string
          notes?: string | null
          rescheduled_from_id?: string | null
          service_type: string
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          address?: string
          call_id?: string | null
          created_at?: string
          customer_id?: string
          end_time?: string
          gcal_event_id?: string
          id?: string
          notes?: string | null
          rescheduled_from_id?: string | null
          service_type?: string
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_call_id_fkey"
            columns: ["call_id"]
            isOneToOne: false
            referencedRelation: "calls"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_rescheduled_from_id_fkey"
            columns: ["rescheduled_from_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
        ]
      }
      calls: {
        Row: {
          assistant_id: string | null
          call_category: string | null
          cost_breakdown: Json | null
          cost_total_usd: number | null
          created_at: string
          customer_id: string | null
          customer_sentiment: string | null
          direction: string | null
          duration_sec: number | null
          end_reason: string | null
          ended_at: string | null
          id: string
          latency_avg_ms: number | null
          latency_p95_ms: number | null
          outcome: string | null
          phone_number: string | null
          recording_archived_at: string | null
          recording_duration_sec: number | null
          recording_size_bytes: number | null
          recording_storage_path: string | null
          recording_url: string | null
          started_at: string
          status: string | null
          success_evaluation: boolean | null
          summary: string | null
          tags: string[]
          tool_calls_count: number
          tool_calls_summary: Json
          transcript_lang_detected: string | null
          transcript_messages: Json | null
          transcript_text: string | null
          transcript_text_tsv: unknown
          updated_at: string
          vapi_call_id: string
          vapi_metadata: Json | null
        }
        Insert: {
          assistant_id?: string | null
          call_category?: string | null
          cost_breakdown?: Json | null
          cost_total_usd?: number | null
          created_at?: string
          customer_id?: string | null
          customer_sentiment?: string | null
          direction?: string | null
          duration_sec?: number | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          latency_avg_ms?: number | null
          latency_p95_ms?: number | null
          outcome?: string | null
          phone_number?: string | null
          recording_archived_at?: string | null
          recording_duration_sec?: number | null
          recording_size_bytes?: number | null
          recording_storage_path?: string | null
          recording_url?: string | null
          started_at: string
          status?: string | null
          success_evaluation?: boolean | null
          summary?: string | null
          tags?: string[]
          tool_calls_count?: number
          tool_calls_summary?: Json
          transcript_lang_detected?: string | null
          transcript_messages?: Json | null
          transcript_text?: string | null
          transcript_text_tsv?: unknown
          updated_at?: string
          vapi_call_id: string
          vapi_metadata?: Json | null
        }
        Update: {
          assistant_id?: string | null
          call_category?: string | null
          cost_breakdown?: Json | null
          cost_total_usd?: number | null
          created_at?: string
          customer_id?: string | null
          customer_sentiment?: string | null
          direction?: string | null
          duration_sec?: number | null
          end_reason?: string | null
          ended_at?: string | null
          id?: string
          latency_avg_ms?: number | null
          latency_p95_ms?: number | null
          outcome?: string | null
          phone_number?: string | null
          recording_archived_at?: string | null
          recording_duration_sec?: number | null
          recording_size_bytes?: number | null
          recording_storage_path?: string | null
          recording_url?: string | null
          started_at?: string
          status?: string | null
          success_evaluation?: boolean | null
          summary?: string | null
          tags?: string[]
          tool_calls_count?: number
          tool_calls_summary?: Json
          transcript_lang_detected?: string | null
          transcript_messages?: Json | null
          transcript_text?: string | null
          transcript_text_tsv?: unknown
          updated_at?: string
          vapi_call_id?: string
          vapi_metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "calls_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          consent_marketing: boolean | null
          consent_recording: boolean | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          language: string | null
          notes: string | null
          phone_number: string | null
          updated_at: string
          vapi_customer_number: string | null
        }
        Insert: {
          consent_marketing?: boolean | null
          consent_recording?: boolean | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          language?: string | null
          notes?: string | null
          phone_number?: string | null
          updated_at?: string
          vapi_customer_number?: string | null
        }
        Update: {
          consent_marketing?: boolean | null
          consent_recording?: boolean | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          language?: string | null
          notes?: string | null
          phone_number?: string | null
          updated_at?: string
          vapi_customer_number?: string | null
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
      [_ in never]: never
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
    Enums: {},
  },
} as const
