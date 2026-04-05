export type Json =
  | string
  | number
  | boolean
  | null
  | {
      [key: string]: Json | undefined
    }
  | Json[]

export interface Database {
  public: {
    Tables: {
      event_color_groups: {
        Row: {
          id: string
          user_id: string
          title_key: string
          canonical_title: string
          color: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title_key: string
          canonical_title: string
          color: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title_key?: string
          canonical_title?: string
          color?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'event_color_groups_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
      }
      events: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string | null
          starts_at: string
          ends_at: string
          all_day: boolean
          color: string
          is_running: boolean
          recurrence_freq: string | null
          recurrence_interval: number
          recurrence_until: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          description?: string | null
          starts_at: string
          ends_at: string
          all_day?: boolean
          color?: string
          is_running?: boolean
          recurrence_freq?: string | null
          recurrence_interval?: number
          recurrence_until?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          description?: string | null
          starts_at?: string
          ends_at?: string
          all_day?: boolean
          color?: string
          is_running?: boolean
          recurrence_freq?: string | null
          recurrence_interval?: number
          recurrence_until?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'events_user_id_fkey'
            columns: ['user_id']
            isOneToOne: false
            referencedRelation: 'users'
            referencedColumns: ['id']
          },
        ]
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
