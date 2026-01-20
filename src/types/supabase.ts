/**
 * Supabase Database Types
 *
 * This file contains TypeScript types for your Supabase database schema.
 *
 * To regenerate these types:
 * 1. Install Supabase CLI: npm install -g supabase
 * 2. Run: supabase gen types typescript --project-id hoxwpjxfcrborwufydxl > src/types/supabase.ts
 *
 * Or use the Supabase Dashboard:
 * 1. Go to https://supabase.com/dashboard/project/hoxwpjxfcrborwufydxl/api
 * 2. Scroll to "Generating Types"
 * 3. Copy the generated TypeScript code
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          avatar_url: string | null
          date_of_birth: string | null
          deletion_requested_at: string | null
          deleted_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          avatar_url?: string | null
          date_of_birth?: string | null
          deletion_requested_at?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          avatar_url?: string | null
          date_of_birth?: string | null
          deletion_requested_at?: string | null
          deleted_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey"
            columns: ["id"]
            referencedRelation: "users"
            referencedColumns: ["id"]
          }
        ]
      }
      deletion_audit_log: {
        Row: {
          id: string
          user_id_hash: string
          requested_at: string
          completed_at: string | null
          status: Database['public']['Enums']['deletion_status']
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id_hash: string
          requested_at?: string
          completed_at?: string | null
          status?: Database['public']['Enums']['deletion_status']
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id_hash?: string
          requested_at?: string
          completed_at?: string | null
          status?: Database['public']['Enums']['deletion_status']
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      hash_user_id: {
        Args: {
          user_id: string
        }
        Returns: string
      }
      request_account_deletion: {
        Args: {
          target_user_id: string
        }
        Returns: string
      }
      complete_account_deletion: {
        Args: {
          target_user_id: string
          audit_log_id: string
        }
        Returns: boolean
      }
      fail_account_deletion: {
        Args: {
          audit_log_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      deletion_status: 'pending' | 'completed' | 'failed'
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

// Helper types for easier usage
export type Profile = Database['public']['Tables']['profiles']['Row']
export type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
export type ProfileUpdate = Database['public']['Tables']['profiles']['Update']

export type DeletionAuditLog = Database['public']['Tables']['deletion_audit_log']['Row']
export type DeletionAuditLogInsert = Database['public']['Tables']['deletion_audit_log']['Insert']
export type DeletionAuditLogUpdate = Database['public']['Tables']['deletion_audit_log']['Update']
export type DeletionStatus = Database['public']['Enums']['deletion_status']
