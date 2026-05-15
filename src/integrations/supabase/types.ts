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
      analytics_events: {
        Row: {
          created_at: string
          event: string
          id: string
          owner_id: string
          payload: Json
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          owner_id: string
          payload?: Json
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          owner_id?: string
          payload?: Json
        }
        Relationships: []
      }
      api_tokens: {
        Row: {
          created_at: string
          id: string
          label: string
          last_used_at: string | null
          owner_id: string
          token_hash: string
          token_prefix: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          owner_id: string
          token_hash: string
          token_prefix: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string
          last_used_at?: string | null
          owner_id?: string
          token_hash?: string
          token_prefix?: string
        }
        Relationships: []
      }
      collection_links: {
        Row: {
          added_at: string
          collection_id: string
          link_id: string
        }
        Insert: {
          added_at?: string
          collection_id: string
          link_id: string
        }
        Update: {
          added_at?: string
          collection_id?: string
          link_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "collection_links_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "collection_links_link_id_fkey"
            columns: ["link_id"]
            isOneToOne: false
            referencedRelation: "links"
            referencedColumns: ["id"]
          },
        ]
      }
      collections: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          owner_id: string
          share_token: string | null
          slug: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          owner_id: string
          share_token?: string | null
          slug?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string
          share_token?: string | null
          slug?: string | null
        }
        Relationships: []
      }
      links: {
        Row: {
          content_type: string
          created_at: string
          deleted_at: string | null
          domain: string | null
          error_message: string | null
          fetched_at: string | null
          id: string
          normalized_url: string | null
          owner_id: string
          pinned: boolean
          source: string
          status: string
          summary: string | null
          tags: string[]
          title: string | null
          updated_at: string
          url: string
        }
        Insert: {
          content_type?: string
          created_at?: string
          deleted_at?: string | null
          domain?: string | null
          error_message?: string | null
          fetched_at?: string | null
          id?: string
          normalized_url?: string | null
          owner_id: string
          pinned?: boolean
          source?: string
          status?: string
          summary?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          content_type?: string
          created_at?: string
          deleted_at?: string | null
          domain?: string | null
          error_message?: string | null
          fetched_at?: string | null
          id?: string
          normalized_url?: string | null
          owner_id?: string
          pinned?: boolean
          source?: string
          status?: string
          summary?: string | null
          tags?: string[]
          title?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          username?: string | null
        }
        Relationships: []
      }
      rss_feeds: {
        Row: {
          active: boolean
          created_at: string
          domain: string | null
          id: string
          items_imported: number
          last_error: string | null
          last_fetched_at: string | null
          owner_id: string
          site_url: string | null
          title: string | null
          updated_at: string
          url: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          domain?: string | null
          id?: string
          items_imported?: number
          last_error?: string | null
          last_fetched_at?: string | null
          owner_id: string
          site_url?: string | null
          title?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          active?: boolean
          created_at?: string
          domain?: string | null
          id?: string
          items_imported?: number
          last_error?: string | null
          last_fetched_at?: string | null
          owner_id?: string
          site_url?: string | null
          title?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      telegram_bots: {
        Row: {
          active: boolean
          bot_id: number | null
          bot_token: string
          bot_username: string | null
          created_at: string
          default_chat_id: number | null
          id: string
          last_error: string | null
          owner_id: string
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          active?: boolean
          bot_id?: number | null
          bot_token: string
          bot_username?: string | null
          created_at?: string
          default_chat_id?: number | null
          id?: string
          last_error?: string | null
          owner_id: string
          updated_at?: string
          webhook_secret?: string
        }
        Update: {
          active?: boolean
          bot_id?: number | null
          bot_token?: string
          bot_username?: string | null
          created_at?: string
          default_chat_id?: number | null
          id?: string
          last_error?: string | null
          owner_id?: string
          updated_at?: string
          webhook_secret?: string
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
