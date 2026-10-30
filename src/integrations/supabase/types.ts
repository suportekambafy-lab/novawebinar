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
      ab_test_assignments: {
        Row: {
          ab_test_id: string
          assigned_at: string
          country_code: string | null
          device: string | null
          email: string | null
          id: string
          organization_id: string
          participant_id: string | null
          referrer: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          utm_term: string | null
          variant_id: string
          visitor_id: string
        }
        Insert: {
          ab_test_id: string
          assigned_at?: string
          country_code?: string | null
          device?: string | null
          email?: string | null
          id?: string
          organization_id: string
          participant_id?: string | null
          referrer?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          variant_id: string
          visitor_id: string
        }
        Update: {
          ab_test_id?: string
          assigned_at?: string
          country_code?: string | null
          device?: string | null
          email?: string | null
          id?: string
          organization_id?: string
          participant_id?: string | null
          referrer?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          utm_term?: string | null
          variant_id?: string
          visitor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ab_test_assignments_ab_test_id_fkey"
            columns: ["ab_test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ['id']
          },
          {
            foreignKeyName: "ab_test_assignments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ['id']
          },
          {
            foreignKeyName: "ab_test_assignments_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ['id']
          },
          {
            foreignKeyName: "ab_test_assignments_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ab_test_variants"
            referencedColumns: ['id']
          },
        ]
      }
      ab_test_events: {
        Row: {
          ab_test_id: string
          assignment_id: string | null
          created_at: string
          currency: string | null
          event_data: Json | null
          event_type: string
          id: number
          idempotency_key: string | null
          organization_id: string
          participant_id: string | null
          revenue: number | null
          variant_id: string
          visitor_id: string | null
          webinar_id: string | null
        }
        Insert: {
          ab_test_id: string
          assignment_id?: string | null
          created_at?: string
          currency?: string | null
          event_data?: Json | null
          event_type: string
          id?: number
          idempotency_key?: string | null
          organization_id: string
          participant_id?: string | null
          revenue?: number | null
          variant_id: string
          visitor_id?: string | null
          webinar_id?: string | null
        }
        Update: {
          ab_test_id?: string
          assignment_id?: string | null
          created_at?: string
          currency?: string | null
          event_data?: Json | null
          event_type?: string
          id?: number
          idempotency_key?: string | null
          organization_id?: string
          participant_id?: string | null
          revenue?: number | null
          variant_id?: string
          visitor_id?: string | null
          webinar_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_test_events_ab_test_id_fkey"
            columns: ["ab_test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ['id']
          },
          {
            foreignKeyName: "ab_test_events_assignment_id_fkey"
            columns: ["assignment_id"]
            isOneToOne: false
            referencedRelation: "ab_test_assignments"
            referencedColumns: ['id']
          },
          {
            foreignKeyName: "ab_test_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ['id']
          },
          {
            foreignKeyName: "ab_test_events_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ['id']
          },
          {
            foreignKeyName: "ab_test_events_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "ab_test_variants"
            referencedColumns: ['id']
          },
          {
            foreignKeyName: "ab_test_events_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ['id']
          },
        ]
      }
      ab_test_history: {
        Row: {
          ab_test_id: string
          action: string
          actor_id: string | null
          created_at: string
          details: Json | null
          id: string
          organization_id: string
        }
        Insert: {
          ab_test_id: string
          action: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          organization_id: string
        }
        Update: {
          ab_test_id?: string
          action?: string
          actor_id?: string | null
          created_at?: string
          details?: Json | null
          id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ab_test_history_ab_test_id_fkey"
            columns: ["ab_test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ['id']
          },
          {
            foreignKeyName: "ab_test_history_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ['id']
          },
        ]
      }
      ab_test_variants: {
        Row: {
          ab_test_id: string
          config: Json | null
          created_at: string
          id: string
          label: string
          name: string | null
          organization_id: string
          position: number
          traffic_percentage: number
          webinar_id: string | null
        }
        Insert: {
          ab_test_id: string
          config?: Json | null
          created_at?: string
          id?: string
          label: string
          name?: string | null
          organization_id: string
          position?: number
          traffic_percentage?: number
          webinar_id?: string | null
        }
        Update: {
          ab_test_id?: string
          config?: Json | null
          created_at?: string
          id?: string
          label?: string
          name?: string | null
          organization_id?: string
          position?: number
          traffic_percentage?: number
          webinar_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_test_variants_ab_test_id_fkey"
            columns: ["ab_test_id"]
            isOneToOne: false
            referencedRelation: "ab_tests"
            referencedColumns: ['id']
          },
          {
            foreignKeyName: "ab_test_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ['id']
          },
          {
            foreignKeyName: "ab_test_variants_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ['id']
          },
        ]
      }
      ab_tests: {
        Row: {
          applied_variant_id: string | null
          assignment_mode: string | null
          auto_optimize: boolean | null
          auto_optimize_after_days: number
          auto_winner: boolean | null
          confidence_threshold: number | null
          created_at: string
          created_by: string | null
          ended_at: string | null
          id: string
          minimum_conversions: number | null
          minimum_duration_days: number | null
          minimum_visitors: number | null
          name: string
          objective: string
          optimized_at: string | null
          organization_id: string
          parent_test_id: string | null
          product_name: string | null
          slug: string
          started_at: string | null
          status: string
          type: string
          updated_at: string
          version: number | null
        }
        Insert: {
          applied_variant_id?: string | null
          assignment_mode?: string | null
          auto_optimize?: boolean | null
          auto_optimize_after_days?: number
          auto_winner?: boolean | null
          confidence_threshold?: number | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          minimum_conversions?: number | null
          minimum_duration_days?: number | null
          minimum_visitors?: number | null
          name: string
          objective?: string
          optimized_at?: string | null
          organization_id: string
          parent_test_id?: string | null
          product_name?: string | null
          slug: string
          started_at?: string | null
          status?: string
          type?: string
          updated_at?: string
          version?: number | null
        }
        Update: {
          applied_variant_id?: string | null
          assignment_mode?: string | null
          auto_optimize?: boolean | null
          auto_optimize_after_days?: number
          auto_winner?: boolean | null
          confidence_threshold?: number | null
          created_at?: string
          created_by?: string | null
          ended_at?: string | null
          id?: string
          minimum_conversions?: number | null
          minimum_duration_days?: number | null
          minimum_visitors?: number | null
          name?: string
          objective?: string
          optimized_at?: string | null
          organization_id?: string
          parent_test_id?: string | null
          product_name?: string | null
          slug?: string
          started_at?: string | null
          status?: string
          type?: string
          updated_at?: string
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ab_tests_applied_variant_id_fkey"
            columns: ["applied_variant_id"]
            isOneToOne: false
            referencedRelation: "ab_test_variants"
            referencedColumns: ['id']
          },
          {
            foreignKeyName: "ab_tests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ['id']
          },
        ]
      }
      activity_events: {
        Row: {
          actor_kind: string
          actor_user_id: string | null
          case_id: string | null
          contact_id: string | null
          conversation_id: string | null
          data: Json
          id: number
          name: string
          occurred_at: string
          organization_id: string
          webinar_id: string | null
          dedupe_key: string | null
        }
        Insert: {
          actor_kind: string
          actor_user_id?: string | null
          case_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          data?: Json
          id?: number
          name: string
          occurred_at?: string
          organization_id: string
          webinar_id?: string | null
          dedupe_key?: string | null
        }
        Update: {
          actor_kind?: string
          actor_user_id?: string | null
          case_id?: string | null
          contact_id?: string | null
          conversation_id?: string | null
          data?: Json
          id?: number
          name?: string
          occurred_at?: string
          organization_id?: string
          webinar_id?: string | null
          dedupe_key?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activity_events_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "support_cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_contact_fk"
            columns: ["contact_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "activity_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "private_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activity_events_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_faqs: {
        Row: {
          agent_id: string
          answer: string
          approved: boolean
          created_at: string
          id: string
          organization_id: string
          position: number
          question: string
          source: string
          updated_at: string
          visibility: string
        }
        Insert: {
          agent_id: string
          answer?: string
          approved?: boolean
          created_at?: string
          id?: string
          organization_id: string
          position?: number
          question: string
          source?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          agent_id?: string
          answer?: string
          approved?: boolean
          created_at?: string
          id?: string
          organization_id?: string
          position?: number
          question?: string
          source?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_faqs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_faqs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_knowledge: {
        Row: {
          agent_id: string
          approved: boolean
          created_at: string
          field: string
          id: string
          label: string
          organization_id: string
          position: number
          presented_after_ms: number | null
          section: string
          source: string
          updated_at: string
          value: string
          visibility: string
        }
        Insert: {
          agent_id: string
          approved?: boolean
          created_at?: string
          field: string
          id?: string
          label: string
          organization_id: string
          position?: number
          presented_after_ms?: number | null
          section: string
          source?: string
          updated_at?: string
          value?: string
          visibility?: string
        }
        Update: {
          agent_id?: string
          approved?: boolean
          created_at?: string
          field?: string
          id?: string
          label?: string
          organization_id?: string
          position?: number
          presented_after_ms?: number | null
          section?: string
          source?: string
          updated_at?: string
          value?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_knowledge_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_knowledge_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_messages: {
        Row: {
          agent_id: string | null
          answer: string
          classification: string
          confidence: number
          conversation_id: string | null
          created_at: string
          decision: string
          escalation_reason: string | null
          feedback: string | null
          final_answer: string | null
          human_edit: string | null
          id: string
          inbound_text: string
          is_simulation: boolean
          latency_ms: number
          model: string
          organization_id: string
          participant_id: string | null
          reason: string
          session_ms: number
          sources: Json
          status: string
          updated_at: string
          webinar_id: string
        }
        Insert: {
          agent_id?: string | null
          answer?: string
          classification?: string
          confidence?: number
          conversation_id?: string | null
          created_at?: string
          decision?: string
          escalation_reason?: string | null
          feedback?: string | null
          final_answer?: string | null
          human_edit?: string | null
          id?: string
          inbound_text?: string
          is_simulation?: boolean
          latency_ms?: number
          model?: string
          organization_id: string
          participant_id?: string | null
          reason?: string
          session_ms?: number
          sources?: Json
          status?: string
          updated_at?: string
          webinar_id: string
        }
        Update: {
          agent_id?: string | null
          answer?: string
          classification?: string
          confidence?: number
          conversation_id?: string | null
          created_at?: string
          decision?: string
          escalation_reason?: string | null
          feedback?: string | null
          final_answer?: string | null
          human_edit?: string | null
          id?: string
          inbound_text?: string
          is_simulation?: boolean
          latency_ms?: number
          model?: string
          organization_id?: string
          participant_id?: string | null
          reason?: string
          session_ms?: number
          sources?: Json
          status?: string
          updated_at?: string
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_messages_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "private_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_messages_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_messages_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agent_objections: {
        Row: {
          agent_id: string
          allowed_cta: string
          approved: boolean
          created_at: string
          escalate_when: string
          id: string
          key_points: string
          never_say: string
          objection: string
          organization_id: string
          position: number
          response: string
          source: string
          updated_at: string
        }
        Insert: {
          agent_id: string
          allowed_cta?: string
          approved?: boolean
          created_at?: string
          escalate_when?: string
          id?: string
          key_points?: string
          never_say?: string
          objection: string
          organization_id: string
          position?: number
          response?: string
          source?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string
          allowed_cta?: string
          approved?: boolean
          created_at?: string
          escalate_when?: string
          id?: string
          key_points?: string
          never_say?: string
          objection?: string
          organization_id?: string
          position?: number
          response?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agent_objections_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "ai_agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agent_objections_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_agents: {
        Row: {
          agent_name: string
          avatar_url: string | null
          confidence_threshold: number
          created_at: string
          enabled: boolean
          escalation: Json
          id: string
          intro: string
          mode: string
          never_say: string
          organization_id: string
          permissions: Json
          personality: Json
          response_speed: string
          show_typing: boolean
          updated_at: string
          use_webinar_transcript: boolean
          webinar_id: string
        }
        Insert: {
          agent_name?: string
          avatar_url?: string | null
          confidence_threshold?: number
          created_at?: string
          enabled?: boolean
          escalation?: Json
          id?: string
          intro?: string
          mode?: string
          never_say?: string
          organization_id: string
          permissions?: Json
          personality?: Json
          response_speed?: string
          show_typing?: boolean
          updated_at?: string
          use_webinar_transcript?: boolean
          webinar_id: string
        }
        Update: {
          agent_name?: string
          avatar_url?: string | null
          confidence_threshold?: number
          created_at?: string
          enabled?: boolean
          escalation?: Json
          id?: string
          intro?: string
          mode?: string
          never_say?: string
          organization_id?: string
          permissions?: Json
          personality?: Json
          response_speed?: string
          show_typing?: boolean
          updated_at?: string
          use_webinar_transcript?: boolean
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_agents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_agents_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: true
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      analytics_events: {
        Row: {
          event_name: string
          id: number
          is_real: boolean
          occurred_at: string
          organization_id: string
          participant_id: string | null
          properties: Json
          video_second: number | null
          webinar_id: string
        }
        Insert: {
          event_name: string
          id?: never
          is_real?: boolean
          occurred_at?: string
          organization_id: string
          participant_id?: string | null
          properties?: Json
          video_second?: number | null
          webinar_id: string
        }
        Update: {
          event_name?: string
          id?: never
          is_real?: boolean
          occurred_at?: string
          organization_id?: string
          participant_id?: string | null
          properties?: Json
          video_second?: number | null
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "analytics_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "analytics_events_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_calls: {
        Row: {
          attempt: number
          cost_micros: number | null
          created_at: string
          error_code: string | null
          fallback: boolean
          id: number
          input_tokens: number
          is_test: boolean
          latency_ms: number
          model: string
          organization_id: string | null
          outcome: string
          output_tokens: number
          pricing_status: string
          provider: string
          task: string
        }
        Insert: {
          attempt?: number
          cost_micros?: number | null
          created_at?: string
          error_code?: string | null
          fallback?: boolean
          input_tokens?: number
          is_test?: boolean
          latency_ms?: number
          model: string
          organization_id?: string | null
          outcome: string
          output_tokens?: number
          pricing_status?: string
          provider: string
          task: string
        }
        Update: {
          attempt?: number
          cost_micros?: number | null
          created_at?: string
          error_code?: string | null
          fallback?: boolean
          input_tokens?: number
          is_test?: boolean
          latency_ms?: number
          model?: string
          organization_id?: string | null
          outcome?: string
          output_tokens?: number
          pricing_status?: string
          provider?: string
          task?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_calls_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audience_configuration: {
        Row: {
          format: string | null
          created_at: string
          curve: Json
          id: string
          mode: string
          organization_id: string
          updated_at: string
          webinar_id: string
        }
        Insert: {
          format?: string | null
          created_at?: string
          curve?: Json
          id?: string
          mode?: string
          organization_id: string
          updated_at?: string
          webinar_id: string
        }
        Update: {
          format?: string | null
          created_at?: string
          curve?: Json
          id?: string
          mode?: string
          organization_id?: string
          updated_at?: string
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audience_configuration_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audience_configuration_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: true
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          cursor: string | null
          guards: Json
          steps_log: Json
          attempts: number
          automation_id: string
          contact_id: string
          created_at: string
          error: string | null
          event_id: number
          facts: Json
          finished_at: string | null
          id: string
          locked_until: string | null
          occurrence_key: string
          organization_id: string
          result: Json | null
          scheduled_for: string
          started_at: string | null
          status: string
          updated_at: string
          webinar_id: string | null
          webinar_session_id: string | null
        }
        Insert: {
          cursor?: string | null
          guards?: Json
          steps_log?: Json
          attempts?: number
          automation_id: string
          contact_id: string
          created_at?: string
          error?: string | null
          event_id: number
          facts?: Json
          finished_at?: string | null
          id?: string
          locked_until?: string | null
          occurrence_key: string
          organization_id: string
          result?: Json | null
          scheduled_for: string
          started_at?: string | null
          status?: string
          updated_at?: string
          webinar_id?: string | null
          webinar_session_id?: string | null
        }
        Update: {
          cursor?: string | null
          guards?: Json
          steps_log?: Json
          attempts?: number
          automation_id?: string
          contact_id?: string
          created_at?: string
          error?: string | null
          event_id?: number
          facts?: Json
          finished_at?: string | null
          id?: string
          locked_until?: string | null
          occurrence_key?: string
          organization_id?: string
          result?: Json | null
          scheduled_for?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          webinar_id?: string | null
          webinar_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_automation_fk"
            columns: ["automation_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "automations"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "automation_runs_contact_fk"
            columns: ["contact_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "automation_runs_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "activity_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_runs_webinar_session_id_fkey"
            columns: ["webinar_session_id"]
            isOneToOne: false
            referencedRelation: "webinar_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_workflows: {
        Row: {
          archived_at: string | null
          canvas: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          updated_at: string
          webinar_id: string | null
        }
        Insert: {
          archived_at?: string | null
          canvas?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          updated_at?: string
          webinar_id?: string | null
        }
        Update: {
          archived_at?: string | null
          canvas?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          updated_at?: string
          webinar_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automation_workflows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_workflows_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      automations: {
        Row: {
          steps: Json | null
          workflow_id: string | null
          action: string
          active: boolean
          archived_at: string | null
          conditions: Json
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          trigger_event: string
          updated_at: string
          wait_minutes: number
          webinar_id: string | null
        }
        Insert: {
          steps?: Json | null
          workflow_id?: string | null
          action?: string
          active?: boolean
          archived_at?: string | null
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          trigger_event?: string
          updated_at?: string
          wait_minutes?: number
          webinar_id?: string | null
        }
        Update: {
          steps?: Json | null
          workflow_id?: string | null
          action?: string
          active?: boolean
          archived_at?: string | null
          conditions?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          trigger_event?: string
          updated_at?: string
          wait_minutes?: number
          webinar_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "automations_workflow_fk"
            columns: ["workflow_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "automation_workflows"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "automations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automations_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      registration_forms: {
        Row: {
          active: boolean
          allowed_origins: string[]
          ask_phone: boolean
          consent_text: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string
          page_name: string | null
          page_url: string | null
          redirect_url: string | null
          require_phone: boolean
          success_message: string | null
          updated_at: string
          webinar_id: string
        }
        Insert: {
          active?: boolean
          allowed_origins?: string[]
          ask_phone?: boolean
          consent_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id: string
          page_name?: string | null
          page_url?: string | null
          redirect_url?: string | null
          require_phone?: boolean
          success_message?: string | null
          updated_at?: string
          webinar_id: string
        }
        Update: {
          active?: boolean
          allowed_origins?: string[]
          ask_phone?: boolean
          consent_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string
          page_name?: string | null
          page_url?: string | null
          redirect_url?: string | null
          require_phone?: boolean
          success_message?: string | null
          updated_at?: string
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_forms_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registration_forms_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      background_jobs: {
        Row: {
          attempts: number
          created_at: string
          created_by: string
          error: string
          id: string
          kind: string
          locked_until: string | null
          note: string
          organization_id: string
          payload: Json
          progress: number
          result: Json | null
          stage: number
          state: Json
          status: string
          updated_at: string
          webinar_id: string
          webinar_title: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          created_by: string
          error?: string
          id?: string
          kind: string
          locked_until?: string | null
          note?: string
          organization_id: string
          payload?: Json
          progress?: number
          result?: Json | null
          stage?: number
          state?: Json
          status?: string
          updated_at?: string
          webinar_id: string
          webinar_title?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          created_by?: string
          error?: string
          id?: string
          kind?: string
          locked_until?: string | null
          note?: string
          organization_id?: string
          payload?: Json
          progress?: number
          result?: Json | null
          stage?: number
          state?: Json
          status?: string
          updated_at?: string
          webinar_id?: string
          webinar_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "background_jobs_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_events: {
        Row: {
          buyer_email: string | null
          event_type: string
          external_order_id: string | null
          external_product_id: string | null
          id: string
          organization_id: string | null
          provider: string
          reason: string
          received_at: string
          status: string
        }
        Insert: {
          buyer_email?: string | null
          event_type?: string
          external_order_id?: string | null
          external_product_id?: string | null
          id?: string
          organization_id?: string | null
          provider: string
          reason?: string
          received_at?: string
          status: string
        }
        Update: {
          buyer_email?: string | null
          event_type?: string
          external_order_id?: string | null
          external_product_id?: string | null
          id?: string
          organization_id?: string | null
          provider?: string
          reason?: string
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      billing_products: {
        Row: {
          active: boolean
          checkout_url: string
          created_at: string
          external_product_id: string
          id: string
          label: string
          provider: string
          usd_amount: number
        }
        Insert: {
          active?: boolean
          checkout_url: string
          created_at?: string
          external_product_id: string
          id?: string
          label: string
          provider?: string
          usd_amount: number
        }
        Update: {
          active?: boolean
          checkout_url?: string
          created_at?: string
          external_product_id?: string
          id?: string
          label?: string
          provider?: string
          usd_amount?: number
        }
        Relationships: []
      }
      contact_list_members: {
        Row: {
          added_at: string
          contact_id: string
          list_id: string
          organization_id: string
        }
        Insert: {
          added_at?: string
          contact_id: string
          list_id: string
          organization_id: string
        }
        Update: {
          added_at?: string
          contact_id?: string
          list_id?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "contact_list_members_contact_id_organization_id_fkey"
            columns: ["contact_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "contact_list_members_list_id_organization_id_fkey"
            columns: ["list_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contact_lists"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      contact_lists: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          organization_id: string
          rules: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          organization_id: string
          rules?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          organization_id?: string
          rules?: Json | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          first_campaign: string | null
          first_source: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          organization_id: string
          phone: string | null
          source: string
          updated_at: string
        }
        Insert: {
          first_campaign?: string | null
          first_source?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          organization_id: string
          phone?: string | null
          source?: string
          updated_at?: string
        }
        Update: {
          first_campaign?: string | null
          first_source?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          organization_id?: string
          phone?: string | null
          source?: string
          updated_at?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          action: string
          amount_micros: number
          created_at: string
          description: string
          id: string
          kind: string
          meta: Json
          organization_id: string
          period: string | null
          ref: string | null
          units: number | null
        }
        Insert: {
          action?: string
          amount_micros: number
          created_at?: string
          description?: string
          id?: string
          kind: string
          meta?: Json
          organization_id: string
          period?: string | null
          ref?: string | null
          units?: number | null
        }
        Update: {
          action?: string
          amount_micros?: number
          created_at?: string
          description?: string
          id?: string
          kind?: string
          meta?: Json
          organization_id?: string
          period?: string | null
          ref?: string | null
          units?: number | null
        }
        Relationships: []
      }
      cta_events: {
        Row: {
          video_second: number | null
          event_type: string
          id: string
          occurred_at: string
          organization_id: string
          participant_id: string | null
          webinar_id: string
        }
        Insert: {
          video_second?: number | null
          event_type: string
          id?: string
          occurred_at?: string
          organization_id: string
          participant_id?: string | null
          webinar_id: string
        }
        Update: {
          video_second?: number | null
          event_type?: string
          id?: string
          occurred_at?: string
          organization_id?: string
          participant_id?: string | null
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cta_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cta_events_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cta_events_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_events: {
        Row: {
          amount_value: number | null
          buyer_email: string | null
          currency: string | null
          event_type: string
          id: string
          integration_id: string | null
          organization_id: string
          payload: string | null
          product_name: string | null
          provider: string
          purchase_id: string | null
          reason: string
          received_at: string
          status: string
        }
        Insert: {
          amount_value?: number | null
          buyer_email?: string | null
          currency?: string | null
          event_type?: string
          id?: string
          integration_id?: string | null
          organization_id: string
          payload?: string | null
          product_name?: string | null
          provider: string
          purchase_id?: string | null
          reason?: string
          received_at?: string
          status: string
        }
        Update: {
          amount_value?: number | null
          buyer_email?: string | null
          currency?: string | null
          event_type?: string
          id?: string
          integration_id?: string | null
          organization_id?: string
          payload?: string | null
          product_name?: string | null
          provider?: string
          purchase_id?: string | null
          reason?: string
          received_at?: string
          status?: string
        }
        Relationships: []
      }
      intelligence_settings: {
        Row: {
          description: string
          key: string
          updated_at: string
          value: number
        }
        Insert: {
          description: string
          key: string
          updated_at?: string
          value: number
        }
        Update: {
          description?: string
          key?: string
          updated_at?: string
          value?: number
        }
        Relationships: []
      }
      integrations: {
        Row: {
          created_at: string
          enabled: boolean
          endpoint_key: string
          has_secret: boolean
          id: string
          last_event_at: string | null
          organization_id: string
          provider: string
          secret: string
          settings: Json
          updated_at: string
          webinar_id: string | null
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          endpoint_key?: string
          id?: string
          last_event_at?: string | null
          organization_id: string
          provider: string
          secret?: string
          settings?: Json
          updated_at?: string
          webinar_id?: string | null
        }
        Update: {
          created_at?: string
          enabled?: boolean
          endpoint_key?: string
          id?: string
          last_event_at?: string | null
          organization_id?: string
          provider?: string
          secret?: string
          settings?: Json
          updated_at?: string
          webinar_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runner_config: {
        Row: {
          id: boolean
          token: string
          updated_at: string
        }
        Insert: {
          id?: boolean
          token: string
          updated_at?: string
        }
        Update: {
          id?: boolean
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["workspace_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["workspace_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          ai_monthly_cap_micros: number | null
          ai_paused: boolean
          created_at: string
          created_by: string
          id: string
          is_test: boolean
          name: string
          plan: string
          public_base_url: string | null
          slug: string
          subdomain: string | null
        }
        Insert: {
          ai_monthly_cap_micros?: number | null
          ai_paused?: boolean
          created_at?: string
          created_by: string
          id?: string
          is_test?: boolean
          name: string
          plan?: string
          public_base_url?: string | null
          slug: string
          subdomain?: string | null
        }
        Update: {
          ai_monthly_cap_micros?: number | null
          ai_paused?: boolean
          created_at?: string
          created_by?: string
          id?: string
          is_test?: boolean
          name?: string
          plan?: string
          public_base_url?: string | null
          slug?: string
          subdomain?: string | null
        }
        Relationships: []
      }
      participants: {
        Row: {
          answers: Json
          utm_term: string | null
          consent_at: string | null
          form_id: string | null
          registration_source: string | null
          submission_id: string | null
          referrer: string | null
          utm_campaign: string | null
          utm_content: string | null
          utm_medium: string | null
          utm_source: string | null
          city: string | null
          contact_id: string | null
          country: string | null
          country_code: string | null
          cta_clicked: boolean
          device: string | null
          email: string | null
          id: string
          joined_at: string
          name: string
          organization_id: string
          participant_token_hash: string | null
          phone: string | null
          status: string
          viewing_mode: string
          watched_seconds: number
          entry_seconds: number | null
          actual_watch_seconds: number | null
          last_progress_at: string | null
          webinar_id: string
          webinar_session_id: string | null
          first_progress_at: string | null
        }
        Insert: {
          answers?: Json
          utm_term?: string | null
          consent_at?: string | null
          form_id?: string | null
          registration_source?: string | null
          submission_id?: string | null
          referrer?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          city?: string | null
          contact_id?: string | null
          country?: string | null
          country_code?: string | null
          cta_clicked?: boolean
          device?: string | null
          email?: string | null
          id?: string
          joined_at?: string
          name: string
          organization_id: string
          participant_token_hash?: string | null
          phone?: string | null
          status?: string
          viewing_mode?: string
          watched_seconds?: number
          entry_seconds?: number | null
          actual_watch_seconds?: number | null
          last_progress_at?: string | null
          webinar_id: string
          webinar_session_id?: string | null
          first_progress_at?: string | null
        }
        Update: {
          answers?: Json
          utm_term?: string | null
          consent_at?: string | null
          form_id?: string | null
          registration_source?: string | null
          submission_id?: string | null
          referrer?: string | null
          utm_campaign?: string | null
          utm_content?: string | null
          utm_medium?: string | null
          utm_source?: string | null
          city?: string | null
          contact_id?: string | null
          country?: string | null
          country_code?: string | null
          cta_clicked?: boolean
          device?: string | null
          email?: string | null
          id?: string
          joined_at?: string
          name?: string
          organization_id?: string
          participant_token_hash?: string | null
          phone?: string | null
          status?: string
          viewing_mode?: string
          watched_seconds?: number
          entry_seconds?: number | null
          actual_watch_seconds?: number | null
          last_progress_at?: string | null
          webinar_id?: string
          webinar_session_id?: string | null
          first_progress_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participants_contact_fk"
            columns: ["contact_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "participants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "participants_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      private_conversations: {
        Row: {
          ai_paused: boolean
          channel: string
          last_message_preview: string
          last_sender_kind: string | null
          assigned_to: string | null
          created_at: string
          escalation_reason: string | null
          id: string
          last_message_at: string
          needs_human: boolean
          organization_id: string
          participant_id: string
          status: Database["public"]["Enums"]["conversation_status"]
          webinar_id: string
        }
        Insert: {
          ai_paused?: boolean
          channel?: string
          last_message_preview?: string
          last_sender_kind?: string | null
          assigned_to?: string | null
          created_at?: string
          escalation_reason?: string | null
          id?: string
          last_message_at?: string
          needs_human?: boolean
          organization_id: string
          participant_id: string
          status?: Database["public"]["Enums"]["conversation_status"]
          webinar_id: string
        }
        Update: {
          ai_paused?: boolean
          channel?: string
          last_message_preview?: string
          last_sender_kind?: string | null
          assigned_to?: string | null
          created_at?: string
          escalation_reason?: string | null
          id?: string
          last_message_at?: string
          needs_human?: boolean
          organization_id?: string
          participant_id?: string
          status?: Database["public"]["Enums"]["conversation_status"]
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "private_conversations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_conversations_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_conversations_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      private_messages: {
        Row: {
          video_second: number | null
          agent_message_id: string | null
          body: string
          conversation_id: string
          created_at: string
          id: string
          organization_id: string
          participant_id: string | null
          sender_kind: string
          sender_user_id: string | null
        }
        Insert: {
          video_second?: number | null
          agent_message_id?: string | null
          body: string
          conversation_id: string
          created_at?: string
          id?: string
          organization_id: string
          participant_id?: string | null
          sender_kind: string
          sender_user_id?: string | null
        }
        Update: {
          video_second?: number | null
          agent_message_id?: string | null
          body?: string
          conversation_id?: string
          created_at?: string
          id?: string
          organization_id?: string
          participant_id?: string | null
          sender_kind?: string
          sender_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "private_messages_agent_message_id_fkey"
            columns: ["agent_message_id"]
            isOneToOne: false
            referencedRelation: "ai_agent_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "private_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_messages_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "private_messages_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          locale: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          locale?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          locale?: string
          updated_at?: string
        }
        Relationships: []
      }
      real_purchase_events: {
        Row: {
          amount: string
          amount_value: number | null
          buyer_email: string | null
          buyer_name: string
          contact_id: string | null
          created_at: string
          currency: string | null
          external_id: string | null
          id: string
          organization_id: string
          product_name: string
          provider: string
          source: string
          status: string
          webinar_id: string | null
          product_id: string | null
          approved_at: string | null
          status_at: string
        }
        Insert: {
          amount?: string
          amount_value?: number | null
          buyer_email?: string | null
          buyer_name: string
          contact_id?: string | null
          created_at?: string
          currency?: string | null
          external_id?: string | null
          id?: string
          organization_id: string
          product_name?: string
          provider?: string
          source?: string
          status?: string
          webinar_id?: string | null
          product_id?: string | null
          approved_at?: string | null
          status_at?: string
        }
        Update: {
          amount?: string
          amount_value?: number | null
          buyer_email?: string | null
          buyer_name?: string
          contact_id?: string | null
          created_at?: string
          currency?: string | null
          external_id?: string | null
          id?: string
          organization_id?: string
          product_name?: string
          provider?: string
          source?: string
          status?: string
          webinar_id?: string | null
          product_id?: string | null
          approved_at?: string | null
          status_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "real_purchase_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "real_purchase_events_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_links: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          primary_webinar_id: string
          secondary_webinar_id: string | null
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          primary_webinar_id: string
          secondary_webinar_id?: string | null
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          primary_webinar_id?: string
          secondary_webinar_id?: string | null
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "smart_links_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_links_primary_webinar_id_fkey"
            columns: ["primary_webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_links_secondary_webinar_id_fkey"
            columns: ["secondary_webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      smart_link_visits: {
        Row: {
          created_at: string
          id: number
          known_by: string
          organization_id: string
          returning_visitor: boolean
          smart_link_id: string
          visitor_id: string
          webinar_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          known_by?: string
          organization_id: string
          returning_visitor?: boolean
          smart_link_id: string
          visitor_id: string
          webinar_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          known_by?: string
          organization_id?: string
          returning_visitor?: boolean
          smart_link_id?: string
          visitor_id?: string
          webinar_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "smart_link_visits_smart_link_id_fkey"
            columns: ["smart_link_id"]
            isOneToOne: false
            referencedRelation: "smart_links"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_link_visits_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smart_link_visits_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_comments: {
        Row: {
          block_id: string | null
          block_type: string | null
          dependency: string | null
          interaction_type: string | null
          manually_edited: boolean
          profile_id: string | null
          slot_id: string | null
          window_end_ms: number | null
          window_start_ms: number | null
          ai_intent: string | null
          ai_persona: string | null
          ai_thread: string | null
          author_name: string
          avatar_url: string | null
          causality_confidence: number | null
          comment_type: string
          created_at: string
          generation_reason: string | null
          id: string
          message: string
          offset_ms: number | null
          offset_seconds: number
          organization_id: string
          reaction_latency_ms: number | null
          temporal_relation: string | null
          transcript_version_id: string | null
          trigger_end_ms: number | null
          trigger_id: string | null
          trigger_start_ms: number | null
          trigger_type: string | null
          validation_action: string | null
          validation_rule: string | null
          webinar_id: string
        }
        Insert: {
          block_id?: string | null
          block_type?: string | null
          dependency?: string | null
          interaction_type?: string | null
          manually_edited?: boolean
          profile_id?: string | null
          slot_id?: string | null
          window_end_ms?: number | null
          window_start_ms?: number | null
          ai_intent?: string | null
          ai_persona?: string | null
          ai_thread?: string | null
          author_name: string
          avatar_url?: string | null
          causality_confidence?: number | null
          comment_type?: string
          created_at?: string
          generation_reason?: string | null
          id?: string
          message: string
          offset_ms?: number | null
          offset_seconds: number
          organization_id: string
          reaction_latency_ms?: number | null
          temporal_relation?: string | null
          transcript_version_id?: string | null
          trigger_end_ms?: number | null
          trigger_id?: string | null
          trigger_start_ms?: number | null
          trigger_type?: string | null
          validation_action?: string | null
          validation_rule?: string | null
          webinar_id: string
        }
        Update: {
          block_id?: string | null
          block_type?: string | null
          dependency?: string | null
          interaction_type?: string | null
          manually_edited?: boolean
          profile_id?: string | null
          slot_id?: string | null
          window_end_ms?: number | null
          window_start_ms?: number | null
          ai_intent?: string | null
          ai_persona?: string | null
          ai_thread?: string | null
          author_name?: string
          avatar_url?: string | null
          causality_confidence?: number | null
          comment_type?: string
          created_at?: string
          generation_reason?: string | null
          id?: string
          message?: string
          offset_ms?: number | null
          offset_seconds?: number
          organization_id?: string
          reaction_latency_ms?: number | null
          temporal_relation?: string | null
          transcript_version_id?: string | null
          trigger_end_ms?: number | null
          trigger_id?: string | null
          trigger_start_ms?: number | null
          trigger_type?: string | null
          validation_action?: string | null
          validation_rule?: string | null
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_comments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_comments_transcript_version_id_fkey"
            columns: ["transcript_version_id"]
            isOneToOne: false
            referencedRelation: "webinar_transcript_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_comments_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      simulated_purchase_events: {
        Row: {
          buyer_name: string
          created_at: string
          id: string
          message: string
          offset_seconds: number
          organization_id: string
          product_name: string
          webinar_id: string
        }
        Insert: {
          buyer_name: string
          created_at?: string
          id?: string
          message?: string
          offset_seconds?: number
          organization_id: string
          product_name?: string
          webinar_id: string
        }
        Update: {
          buyer_name?: string
          created_at?: string
          id?: string
          message?: string
          offset_seconds?: number
          organization_id?: string
          product_name?: string
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "simulated_purchase_events_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "simulated_purchase_events_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      support_cases: {
        Row: {
          assigned_staff_id: string | null
          call_required: boolean
          category: string
          closed_at: string | null
          confidence: number | null
          contact_id: string | null
          conversation_id: string | null
          created_at: string
          department_id: string | null
          first_response_at: string | null
          human_intervention_required: boolean
          id: string
          intent: string
          last_activity_at: string
          number: number
          organization_id: string
          participant_id: string | null
          priority: string
          purchase_intent: boolean
          reason_for_escalation: string
          recommended_action: string
          required_skills: string[]
          resolution: string
          resolved_at: string | null
          routing_reason: string
          sentiment: string | null
          sla_breached_at: string | null
          sla_deadline: string | null
          sla_minutes: number
          sla_warned_at: string | null
          source_channel: string
          stalled_at: string | null
          status: string
          summary: string
          updated_at: string
          webinar_id: string | null
        }
        Insert: {
          assigned_staff_id?: string | null
          call_required?: boolean
          category?: string
          closed_at?: string | null
          confidence?: number | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          department_id?: string | null
          first_response_at?: string | null
          human_intervention_required?: boolean
          id?: string
          intent?: string
          last_activity_at?: string
          number: number
          organization_id: string
          participant_id?: string | null
          priority?: string
          purchase_intent?: boolean
          reason_for_escalation?: string
          recommended_action?: string
          required_skills?: string[]
          resolution?: string
          resolved_at?: string | null
          routing_reason?: string
          sentiment?: string | null
          sla_breached_at?: string | null
          sla_deadline?: string | null
          sla_minutes?: number
          sla_warned_at?: string | null
          source_channel?: string
          stalled_at?: string | null
          status?: string
          summary?: string
          updated_at?: string
          webinar_id?: string | null
        }
        Update: {
          assigned_staff_id?: string | null
          call_required?: boolean
          category?: string
          closed_at?: string | null
          confidence?: number | null
          contact_id?: string | null
          conversation_id?: string | null
          created_at?: string
          department_id?: string | null
          first_response_at?: string | null
          human_intervention_required?: boolean
          id?: string
          intent?: string
          last_activity_at?: string
          number?: number
          organization_id?: string
          participant_id?: string | null
          priority?: string
          purchase_intent?: boolean
          reason_for_escalation?: string
          recommended_action?: string
          required_skills?: string[]
          resolution?: string
          resolved_at?: string | null
          routing_reason?: string
          sentiment?: string | null
          sla_breached_at?: string | null
          sla_deadline?: string | null
          sla_minutes?: number
          sla_warned_at?: string | null
          source_channel?: string
          stalled_at?: string | null
          status?: string
          summary?: string
          updated_at?: string
          webinar_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_cases_contact_fk"
            columns: ["contact_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "support_cases_contact_fk"
            columns: ["contact_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "contact_summaries"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "support_cases_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "private_conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_cases_department_fk"
            columns: ["department_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "support_departments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "support_cases_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_cases_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_cases_staff_fk"
            columns: ["assigned_staff_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "support_staff"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "support_cases_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      support_departments: {
        Row: {
          active: boolean
          created_at: string
          id: string
          is_fallback: boolean
          name: string
          organization_id: string
          position: number
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          is_fallback?: boolean
          name: string
          organization_id: string
          position?: number
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          is_fallback?: boolean
          name?: string
          organization_id?: string
          position?: number
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_departments_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_routing_rules: {
        Row: {
          always_human: boolean
          call_required: boolean
          department_id: string | null
          id: string
          intent: string
          organization_id: string
          priority: string
          required_skills: string[]
          sla_minutes: number
          updated_at: string
        }
        Insert: {
          always_human?: boolean
          call_required?: boolean
          department_id?: string | null
          id?: string
          intent: string
          organization_id: string
          priority?: string
          required_skills?: string[]
          sla_minutes?: number
          updated_at?: string
        }
        Update: {
          always_human?: boolean
          call_required?: boolean
          department_id?: string | null
          id?: string
          intent?: string
          organization_id?: string
          priority?: string
          required_skills?: string[]
          sla_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_routing_rules_department_fk"
            columns: ["department_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "support_departments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "support_routing_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_skills: {
        Row: {
          created_at: string
          id: string
          name: string
          organization_id: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          organization_id: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_skills_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      support_staff: {
        Row: {
          active: boolean
          capacity: number
          channels: string[]
          created_at: string
          department_id: string | null
          email: string
          id: string
          invited_at: string | null
          is_supervisor: boolean
          job_title: string
          last_assigned_at: string | null
          last_seen_at: string | null
          name: string
          organization_id: string
          phone: string | null
          skills: string[]
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          active?: boolean
          capacity?: number
          channels?: string[]
          created_at?: string
          department_id?: string | null
          email: string
          id?: string
          invited_at?: string | null
          is_supervisor?: boolean
          job_title?: string
          last_assigned_at?: string | null
          last_seen_at?: string | null
          name: string
          organization_id: string
          phone?: string | null
          skills?: string[]
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          active?: boolean
          capacity?: number
          channels?: string[]
          created_at?: string
          department_id?: string | null
          email?: string
          id?: string
          invited_at?: string | null
          is_supervisor?: boolean
          job_title?: string
          last_assigned_at?: string | null
          last_seen_at?: string | null
          name?: string
          organization_id?: string
          phone?: string | null
          skills?: string[]
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "support_staff_department_fk"
            columns: ["department_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "support_departments"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "support_staff_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      social_proof_settings: {
        Row: {
          animation: string
          created_at: string
          display_seconds: number
          enabled: boolean
          end_seconds: number | null
          max_interval_seconds: number
          min_interval_seconds: number
          notification_color: string
          organization_id: string
          position: string
          product_name: string
          sound_enabled: boolean
          start_delay_seconds: number
          start_mode: string
          start_seconds: number | null
          templates: Json
          updated_at: string
          webhook_secret: string
          webinar_id: string
        }
        Insert: {
          animation?: string
          created_at?: string
          display_seconds?: number
          enabled?: boolean
          end_seconds?: number | null
          max_interval_seconds?: number
          min_interval_seconds?: number
          notification_color?: string
          organization_id: string
          position?: string
          product_name?: string
          sound_enabled?: boolean
          start_delay_seconds?: number
          start_mode?: string
          start_seconds?: number | null
          templates?: Json
          updated_at?: string
          webhook_secret?: string
          webinar_id: string
        }
        Update: {
          animation?: string
          created_at?: string
          display_seconds?: number
          enabled?: boolean
          end_seconds?: number | null
          max_interval_seconds?: number
          min_interval_seconds?: number
          notification_color?: string
          organization_id?: string
          position?: string
          product_name?: string
          sound_enabled?: boolean
          start_delay_seconds?: number
          start_mode?: string
          start_seconds?: number | null
          templates?: Json
          updated_at?: string
          webhook_secret?: string
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "social_proof_settings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_proof_settings_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: true
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      video_sources: {
        Row: {
          created_at: string
          duration_seconds: number
          id: string
          name: string
          organization_id: string
          provider: Database["public"]["Enums"]["video_provider"]
          source_url: string | null
          status: string
          storage_path: string | null
          thumbnail_url: string | null
        }
        Insert: {
          created_at?: string
          duration_seconds?: number
          id?: string
          name: string
          organization_id: string
          provider: Database["public"]["Enums"]["video_provider"]
          source_url?: string | null
          status?: string
          storage_path?: string | null
          thumbnail_url?: string | null
        }
        Update: {
          created_at?: string
          duration_seconds?: number
          id?: string
          name?: string
          organization_id?: string
          provider?: Database["public"]["Enums"]["video_provider"]
          source_url?: string | null
          status?: string
          storage_path?: string | null
          thumbnail_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "video_sources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      viewer_sessions: {
        Row: {
          ended_at: string | null
          id: string
          is_real: boolean
          mode: string
          organization_id: string
          participant_id: string | null
          started_at: string
          watched_seconds: number
          webinar_id: string
          webinar_session_id: string | null
        }
        Insert: {
          ended_at?: string | null
          id?: string
          is_real?: boolean
          mode?: string
          organization_id: string
          participant_id?: string | null
          started_at?: string
          watched_seconds?: number
          webinar_id: string
          webinar_session_id?: string | null
        }
        Update: {
          ended_at?: string | null
          id?: string
          is_real?: boolean
          mode?: string
          organization_id?: string
          participant_id?: string | null
          started_at?: string
          watched_seconds?: number
          webinar_id?: string
          webinar_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "viewer_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viewer_sessions_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viewer_sessions_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "viewer_sessions_webinar_session_id_fkey"
            columns: ["webinar_session_id"]
            isOneToOne: false
            referencedRelation: "webinar_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_analysis: {
        Row: {
          audience_state: Json
          created_at: string
          duration_seconds: number
          insights: Json
          moments: Json
          objective: string
          organization_id: string
          personas: Json
          prompts: Json
          rescue: Json
          score: Json
          segments: Json
          updated_at: string
          version: number
          webinar_id: string
        }
        Insert: {
          audience_state?: Json
          created_at?: string
          duration_seconds?: number
          insights?: Json
          moments?: Json
          objective?: string
          organization_id: string
          personas?: Json
          prompts?: Json
          rescue?: Json
          score?: Json
          segments?: Json
          updated_at?: string
          version?: number
          webinar_id: string
        }
        Update: {
          audience_state?: Json
          created_at?: string
          duration_seconds?: number
          insights?: Json
          moments?: Json
          objective?: string
          organization_id?: string
          personas?: Json
          prompts?: Json
          rescue?: Json
          score?: Json
          segments?: Json
          updated_at?: string
          version?: number
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_analysis_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webinar_analysis_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: true
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_prediction_snapshots: {
        Row: {
          created_at: string
          id: string
          observed: Json
          organization_id: string
          predicted: Json
          webinar_id: string
          webinar_session_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          observed?: Json
          organization_id: string
          predicted?: Json
          webinar_id: string
          webinar_session_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          observed?: Json
          organization_id?: string
          predicted?: Json
          webinar_id?: string
          webinar_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webinar_prediction_snapshots_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webinar_prediction_snapshots_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webinar_prediction_snapshots_webinar_session_id_fkey"
            columns: ["webinar_session_id"]
            isOneToOne: false
            referencedRelation: "webinar_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_sessions: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          organization_id: string
          starts_at: string
          state: Database["public"]["Enums"]["webinar_status"]
          webinar_id: string
          ended_at: string | null
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          organization_id: string
          starts_at: string
          state?: Database["public"]["Enums"]["webinar_status"]
          webinar_id: string
          ended_at?: string | null
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          organization_id?: string
          starts_at?: string
          state?: Database["public"]["Enums"]["webinar_status"]
          webinar_id?: string
          ended_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "webinar_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webinar_sessions_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_transcript_versions: {
        Row: {
          blocks: Json
          created_at: string
          duration_seconds: number
          error: string | null
          events: Json
          id: string
          media_source: string | null
          media_time_offset_ms: number
          moments: Json
          organization_id: string
          provider: string
          provider_job_id: string | null
          provider_model: string
          raw_text: string
          report: Json | null
          sentences: Json
          status: string
          timestamp_precision: string
          updated_at: string
          video_fingerprint: string
          video_source_id: string | null
          webinar_id: string
          words: Json
        }
        Insert: {
          blocks?: Json
          created_at?: string
          duration_seconds?: number
          error?: string | null
          events?: Json
          id?: string
          media_source?: string | null
          media_time_offset_ms?: number
          moments?: Json
          organization_id: string
          provider: string
          provider_job_id?: string | null
          provider_model?: string
          raw_text?: string
          report?: Json | null
          sentences?: Json
          status?: string
          timestamp_precision: string
          updated_at?: string
          video_fingerprint?: string
          video_source_id?: string | null
          webinar_id: string
          words?: Json
        }
        Update: {
          blocks?: Json
          created_at?: string
          duration_seconds?: number
          error?: string | null
          events?: Json
          id?: string
          media_source?: string | null
          media_time_offset_ms?: number
          moments?: Json
          organization_id?: string
          provider?: string
          provider_job_id?: string | null
          provider_model?: string
          raw_text?: string
          report?: Json | null
          sentences?: Json
          status?: string
          timestamp_precision?: string
          updated_at?: string
          video_fingerprint?: string
          video_source_id?: string | null
          webinar_id?: string
          words?: Json
        }
        Relationships: [
          {
            foreignKeyName: "webinar_transcript_versions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webinar_transcript_versions_video_source_id_fkey"
            columns: ["video_source_id"]
            isOneToOne: false
            referencedRelation: "video_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webinar_transcript_versions_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: false
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      webinar_transcripts: {
        Row: {
          created_at: string
          duration_seconds: number
          organization_id: string
          segments: Json
          updated_at: string
          video_fingerprint: string
          video_source_id: string | null
          webinar_id: string
        }
        Insert: {
          created_at?: string
          duration_seconds?: number
          organization_id: string
          segments?: Json
          updated_at?: string
          video_fingerprint?: string
          video_source_id?: string | null
          webinar_id: string
        }
        Update: {
          created_at?: string
          duration_seconds?: number
          organization_id?: string
          segments?: Json
          updated_at?: string
          video_fingerprint?: string
          video_source_id?: string | null
          webinar_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinar_transcripts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webinar_transcripts_video_source_id_fkey"
            columns: ["video_source_id"]
            isOneToOne: false
            referencedRelation: "video_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webinar_transcripts_webinar_id_fkey"
            columns: ["webinar_id"]
            isOneToOne: true
            referencedRelation: "webinars"
            referencedColumns: ["id"]
          },
        ]
      }
      webinars: {
        Row: {
          chat_settings: Json
          entry_button_color: string
          entry_card_color: string
          entry_fields: Json
          extra_offers: Json
          host_verified: boolean
          jit_skip_night: boolean
          offer_countdown_end: string
          offer_deadline: string | null
          offer_utm: boolean
          recurrence_days: number[]
          recurrence_times: string[]
          room_theme_system: boolean
          sales_show_real: boolean
          sales_where: string
          chat_pin_message: string
          chat_pin_title: string
          cover_url: string | null
          created_at: string
          created_by: string
          cta_color: string
          cta_countdown_seconds: number
          cta_end_seconds: number | null
          cta_image_url: string
          cta_price_now: string
          cta_price_original: string
          cta_start_seconds: number | null
          cta_text: string | null
          cta_url: string | null
          description: string
          duration_seconds: number
          easy_access: boolean
          host_avatar_url: string
          host_name: string
          host_role: string
          id: string
          internal_name: string
          jit_interval_minutes: number
          language: string
          offer_pin_message: string
          offer_pin_title: string
          organization_id: string
          pitch_seconds: number | null
          prelive_appearance: Json
          prelive_enabled: boolean
          prelive_message: string
          prelive_seconds: number
          prelive_sound: boolean
          prelive_template: string
          public_title: string
          recurrence_enabled: boolean
          recurrence_end_time: string
          recurrence_pattern: string
          recurrence_start_time: string
          recurrence_weekday: number
          registration_badge_text: string
          registration_button_text: string
          registration_collect_phone: boolean
          registration_cover_url: string | null
          registration_headline: string
          registration_progress_enabled: boolean
          registration_progress_value: number
          registration_require_phone: boolean
          registration_scarcity_note: string
          registration_subtitle: string
          replay_enabled: boolean
          room_theme: string
          schedule_mode: string
          scheduled_at: string | null
          session_end_time: string | null
          share_description: string
          share_image_url: string | null
          share_title: string
          slug: string
          status: Database["public"]["Enums"]["webinar_status"]
          sync_video_with_start: boolean
          timezone: string
          updated_at: string
          video_source_id: string | null
          waiting_room_enabled: boolean
          webhook_enabled: boolean
          webhook_url: string
        }
        Insert: {
          chat_settings?: Json
          entry_button_color?: string
          entry_card_color?: string
          entry_fields?: Json
          extra_offers?: Json
          host_verified?: boolean
          jit_skip_night?: boolean
          offer_countdown_end?: string
          offer_deadline?: string | null
          offer_utm?: boolean
          recurrence_days?: number[]
          recurrence_times?: string[]
          room_theme_system?: boolean
          sales_show_real?: boolean
          sales_where?: string
          chat_pin_message?: string
          chat_pin_title?: string
          cover_url?: string | null
          created_at?: string
          created_by: string
          cta_color?: string
          cta_countdown_seconds?: number
          cta_end_seconds?: number | null
          cta_image_url?: string
          cta_price_now?: string
          cta_price_original?: string
          cta_start_seconds?: number | null
          cta_text?: string | null
          cta_url?: string | null
          description?: string
          duration_seconds?: number
          easy_access?: boolean
          host_avatar_url?: string
          host_name?: string
          host_role?: string
          id?: string
          internal_name: string
          jit_interval_minutes?: number
          language?: string
          offer_pin_message?: string
          offer_pin_title?: string
          organization_id: string
          pitch_seconds?: number | null
          prelive_appearance?: Json
          prelive_enabled?: boolean
          prelive_message?: string
          prelive_seconds?: number
          prelive_sound?: boolean
          prelive_template?: string
          public_title: string
          recurrence_enabled?: boolean
          recurrence_end_time?: string
          recurrence_pattern?: string
          recurrence_start_time?: string
          recurrence_weekday?: number
          registration_badge_text?: string
          registration_button_text?: string
          registration_collect_phone?: boolean
          registration_cover_url?: string | null
          registration_headline?: string
          registration_progress_enabled?: boolean
          registration_progress_value?: number
          registration_require_phone?: boolean
          registration_scarcity_note?: string
          registration_subtitle?: string
          replay_enabled?: boolean
          room_theme?: string
          schedule_mode?: string
          scheduled_at?: string | null
          session_end_time?: string | null
          share_description?: string
          share_image_url?: string | null
          share_title?: string
          slug: string
          status?: Database["public"]["Enums"]["webinar_status"]
          sync_video_with_start?: boolean
          timezone?: string
          updated_at?: string
          video_source_id?: string | null
          waiting_room_enabled?: boolean
          webhook_enabled?: boolean
          webhook_url?: string
        }
        Update: {
          chat_settings?: Json
          entry_button_color?: string
          entry_card_color?: string
          entry_fields?: Json
          extra_offers?: Json
          host_verified?: boolean
          jit_skip_night?: boolean
          offer_countdown_end?: string
          offer_deadline?: string | null
          offer_utm?: boolean
          recurrence_days?: number[]
          recurrence_times?: string[]
          room_theme_system?: boolean
          sales_show_real?: boolean
          sales_where?: string
          chat_pin_message?: string
          chat_pin_title?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string
          cta_color?: string
          cta_countdown_seconds?: number
          cta_end_seconds?: number | null
          cta_image_url?: string
          cta_price_now?: string
          cta_price_original?: string
          cta_start_seconds?: number | null
          cta_text?: string | null
          cta_url?: string | null
          description?: string
          duration_seconds?: number
          easy_access?: boolean
          host_avatar_url?: string
          host_name?: string
          host_role?: string
          id?: string
          internal_name?: string
          jit_interval_minutes?: number
          language?: string
          offer_pin_message?: string
          offer_pin_title?: string
          organization_id?: string
          pitch_seconds?: number | null
          prelive_appearance?: Json
          prelive_enabled?: boolean
          prelive_message?: string
          prelive_seconds?: number
          prelive_sound?: boolean
          prelive_template?: string
          public_title?: string
          recurrence_enabled?: boolean
          recurrence_end_time?: string
          recurrence_pattern?: string
          recurrence_start_time?: string
          recurrence_weekday?: number
          registration_badge_text?: string
          registration_button_text?: string
          registration_collect_phone?: boolean
          registration_cover_url?: string | null
          registration_headline?: string
          registration_progress_enabled?: boolean
          registration_progress_value?: number
          registration_require_phone?: boolean
          registration_scarcity_note?: string
          registration_subtitle?: string
          replay_enabled?: boolean
          room_theme?: string
          schedule_mode?: string
          scheduled_at?: string | null
          session_end_time?: string | null
          share_description?: string
          share_image_url?: string | null
          share_title?: string
          slug?: string
          status?: Database["public"]["Enums"]["webinar_status"]
          sync_video_with_start?: boolean
          timezone?: string
          updated_at?: string
          video_source_id?: string | null
          waiting_room_enabled?: boolean
          webhook_enabled?: boolean
          webhook_url?: string
        }
        Relationships: [
          {
            foreignKeyName: "webinars_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webinars_video_source_id_fkey"
            columns: ["video_source_id"]
            isOneToOne: false
            referencedRelation: "video_sources"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      contact_summaries: {
        Row: {
          checkout_abandoned: boolean | null
          checkout_started: boolean | null
          clicked_offer: boolean | null
          // 0089: só existem com a migração aplicada.
          country?: string | null
          country_code?: string | null
          country_from?: string | null
          created_at: string | null
          email: string | null
          events_attended: number | null
          events_registered: number | null
          first_campaign: string | null
          first_seen_at: string | null
          first_source: string | null
          id: string | null
          last_seen_at: string | null
          list_ids: string[] | null
          messages: number | null
          name: string | null
          organization_id: string | null
          payment_failed: boolean | null
          phone: string | null
          purchases: number | null
          reached_offer: boolean | null
          source: string | null
          stage: string | null
          watched_seconds: number | null
          webinar_ids: string[] | null
        }
        Relationships: []
      }
      event_log: {
        Row: {
          contact_id: string | null
          data: Json | null
          name: string | null
          occurred_at: string | null
          organization_id: string | null
          participant_id: string | null
          session_id: string | null
          source: string | null
          source_id: string | null
          video_second: number | null
          webinar_id: string | null
        }
        Relationships: []
      }
      participant_facts: {
        Row: {
          actual_watch_seconds: number | null
          attended: boolean | null
          checkout_abandoned: boolean | null
          checkout_started: boolean | null
          clicked: boolean | null
          city: string | null
          contact_id: string | null
          country: string | null
          cta_clicked: boolean | null
          device: string | null
          duration_seconds: number | null
          email: string | null
          entry_seconds: number | null
          joined_at: string | null
          last_progress_at: string | null
          name: string | null
          offer_start_seconds: number | null
          organization_id: string | null
          payment_failed: boolean | null
          participant_id: string | null
          peak_seconds: number | null
          person_id: string | null
          phone: string | null
          purchased: boolean | null
          reached_offer: boolean | null
          reached_pitch: boolean | null
          refunded: boolean | null
          saw_offer: boolean | null
          viewing_mode: string | null
          watch_measured: boolean | null
          watch_ratio: number | null
          watch_span_seconds: number | null
          webinar_id: string | null
          webinar_title: string | null
          webinar_session_id: string | null
          first_progress_at: string | null
        }
        Relationships: []
      }
      support_staff_load: {
        Row: {
          open_cases: number | null
          organization_id: string | null
          staff_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      ab_assign: {
        Args: {
          p_country: string
          p_device: string
          p_org: string
          p_referrer: string
          p_test: string
          p_utm_campaign: string
          p_utm_content: string
          p_utm_medium: string
          p_utm_source: string
          p_utm_term: string
          p_variant: string
          p_visitor: string
          p_webinar: string
        }
        Returns: Json
      }
      ab_parse_amount: {
        Args: { p: string }
        Returns: number
      }
      ab_test_metrics: {
        Args: { p_test: string }
        Returns: Json
      }
      auth_user_id_for_email: {
        Args: { _email: string }
        Returns: string
      }
      ensure_support_setup: {
        Args: { _organization_id: string }
        Returns: Json
      }
      intelligence_setting: {
        Args: { _key: string }
        Returns: number
      }
      is_support_only: {
        Args: { _organization_id: string }
        Returns: boolean
      }
      open_support_case: {
        Args: { _p: Json }
        Returns: Json
      }
      support_case_action: {
        Args: { _action: string; _actor_user_id: string; _case_id: string; _payload?: Json }
        Returns: Json
      }
      support_case_inbound: {
        Args: { _conversation_id: string }
        Returns: string
      }
      support_log_conversation_event: {
        Args: { _actor_kind: string; _conversation_id: string; _data: Json; _name: string }
        Returns: undefined
      }
      support_presence: {
        Args: { _organization_id: string; _status?: string }
        Returns: string
      }
      support_seed_defaults: {
        Args: { _organization_id: string }
        Returns: undefined
      }
      support_staff_for_user: {
        Args: { _organization_id: string; _user_id: string }
        Returns: Database["public"]["Tables"]["support_staff"]["Row"] | null
      }
      sweep_webinar_sessions: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      support_sla_sweep: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      credit_state: {
        Args: { _organization_id: string }
        Returns: Json
      }
      apply_credit_topup: {
        Args: { _amount_micros: number; _description: string; _meta: Json; _organization_id: string; _ref: string }
        Returns: boolean
      }
      organization_for_billing_email: {
        Args: { _email: string }
        Returns: string
      }
      record_participant_progress: {
        Args: { _entry?: number; _participant_id: string; _played?: number; _position: number }
        Returns: undefined
      }
      open_webinar_session: {
        Args: { _ends_at?: string; _starts_at: string; _webinar_id: string }
        Returns: string
      }
      automation_dispatch: {
        Args: { _automation_id?: string; _event_id: number }
        Returns: number
      }
      automation_runs_tick: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      claim_automation_runs: {
        Args: { _limit?: number }
        Returns: Database["public"]["Tables"]["automation_runs"]["Row"][]
      }
      advance_automation_run: {
        Args: {
          _cursor: string | null
          _error: string | null
          _guards: Json | null
          _log: Json | null
          _result: Json | null
          _run_id: string
          _scheduled_for: string | null
          _status: string
        }
        Returns: string
      }
      automation_contact_facts: {
        Args: { _contact_id: string; _webinar_id: string | null }
        Returns: Json
      }
      automation_session_facts: {
        Args: { _session_id: string }
        Returns: { contact_id: string; facts: Json }[]
      }
      automation_apply_recent: {
        Args: { _automation_id: string; _days?: number }
        Returns: number
      }
      finish_automation_run: {
        Args: { _error: string | null; _ok: boolean; _result: Json; _run_id: string; _transient: boolean }
        Returns: string
      }
      purchase_attribution: {
        Args: { _at?: string; _contact_id: string; _product_id: string }
        Returns: { evidence: string; webinar_id: string }[]
      }
      record_credit_usage: {
        Args: {
          _action: string
          _amount_micros: number
          _description: string
          _meta: Json
          _organization_id: string
          _ref: string | null
          _units: number
        }
        Returns: number
      }
      contact_country_breakdown: {
        Args: { _list_id?: string; _organization_id: string; _webinar_id?: string }
        Returns: Json
      }
      contact_source_breakdown: {
        Args: { _list_id?: string; _organization_id: string; _webinar_id?: string }
        Returns: Json
      }
      contact_stage_counts: {
        Args: { _list_id?: string; _organization_id: string; _webinar_id?: string }
        Returns: Json
      }
      contact_list_member_ids: { Args: { _list_id: string }; Returns: string[] }
      contact_segments: {
        Args: { _contact_ids: string[] }
        Returns: { contact_id: string; list_id: string }[]
      }
      contacts_in_list: {
        Args: { _list_id: string }
        Returns: Database["public"]["Views"]["contact_summaries"]["Row"][]
        SetofOptions: {
          from: "*"
          to: "contact_summaries"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      segment_facts: {
        Args: { _contact_id: string; _webinar_id: string }
        Returns: Json
      }
      import_contacts: {
        Args: { _list_id: string | null; _organization_id: string; _rows: Json }
        Returns: number
      }
      upsert_contact: {
        Args: {
          _email: string
          _name: string
          _organization_id: string
          _phone: string
          _source: string
        }
        Returns: string
      }
      has_organization_role: {
        Args: {
          _organization_id: string
          _roles: Database["public"]["Enums"]["workspace_role"][]
          _user_id?: string
        }
        Returns: boolean
      }
      is_organization_member: {
        Args: { _organization_id: string; _user_id?: string }
        Returns: boolean
      }
    }
    Enums: {
      conversation_status: "waiting" | "active" | "resolved"
      video_provider: "upload" | "bunny" | "panda" | "vimeo" | "hls"
      webinar_status: "draft" | "scheduled" | "live" | "replay" | "finished"
      workspace_role: "owner" | "admin" | "member" | "support"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      conversation_status: ["waiting", "active", "resolved"],
      video_provider: ["upload", "bunny", "panda", "vimeo", "hls"],
      webinar_status: ["draft", "scheduled", "live", "replay", "finished"],
      workspace_role: ["owner", "admin", "member", "support"],
    },
  },
} as const
