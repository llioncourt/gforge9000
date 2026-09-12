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
      campaign_members: {
        Row: {
          campaign_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          campaign_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_members_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_notes: {
        Row: {
          author_id: string
          body: string | null
          campaign_id: string
          created_at: string
          gm_only: boolean
          id: string
          kind: string
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string
          body?: string | null
          campaign_id: string
          created_at?: string
          gm_only?: boolean
          id?: string
          kind?: string
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string | null
          campaign_id?: string
          created_at?: string
          gm_only?: boolean
          id?: string
          kind?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_notes_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaigns: {
        Row: {
          created_at: string
          description: string | null
          gm_id: string
          id: string
          invite_code: string
          name: string
          settings: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          gm_id?: string
          id?: string
          invite_code?: string
          name: string
          settings?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          gm_id?: string
          id?: string
          invite_code?: string
          name?: string
          settings?: Json
          updated_at?: string
        }
        Relationships: []
      }
      character_entries: {
        Row: {
          category: string | null
          character_id: string
          created_at: string
          data: Json
          id: string
          kind: string
          levels: number
          name: string
          notes: string | null
          points: number
          sort_order: number
          source: Json
          updated_at: string
        }
        Insert: {
          category?: string | null
          character_id: string
          created_at?: string
          data?: Json
          id?: string
          kind: string
          levels?: number
          name: string
          notes?: string | null
          points?: number
          sort_order?: number
          source?: Json
          updated_at?: string
        }
        Update: {
          category?: string | null
          character_id?: string
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          levels?: number
          name?: string
          notes?: string | null
          points?: number
          sort_order?: number
          source?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_entries_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      character_versions: {
        Row: {
          character_id: string
          created_at: string
          created_by: string
          id: string
          label: string | null
          snapshot: Json
        }
        Insert: {
          character_id: string
          created_at?: string
          created_by?: string
          id?: string
          label?: string | null
          snapshot: Json
        }
        Update: {
          character_id?: string
          created_at?: string
          created_by?: string
          id?: string
          label?: string | null
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "character_versions_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      character_weapon_state: {
        Row: {
          character_entry_id: string
          character_id: string
          created_at: string
          current_shots: number
          id: string
          mode_key: string
          updated_at: string
        }
        Insert: {
          character_entry_id: string
          character_id: string
          created_at?: string
          current_shots?: number
          id?: string
          mode_key: string
          updated_at?: string
        }
        Update: {
          character_entry_id?: string
          character_id?: string
          created_at?: string
          current_shots?: number
          id?: string
          mode_key?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "character_weapon_state_character_entry_id_fkey"
            columns: ["character_entry_id"]
            isOneToOne: false
            referencedRelation: "character_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "character_weapon_state_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          appearance: Json
          approved: boolean
          campaign_id: string | null
          concept: string | null
          conditions: string[]
          created_at: string
          current_fp: number | null
          current_hp: number | null
          dx: number
          fp_delta: number
          gm_notes: string | null
          hp_delta: number
          ht: number
          id: string
          iq: number
          is_npc: boolean
          is_template: boolean
          move_delta: number
          name: string
          notes: string | null
          owner_id: string
          per_delta: number
          player_name: string | null
          point_budget: number
          portrait_path: string | null
          speed_delta: number
          st: number
          status: number
          tech_level: number
          updated_at: string
          wealth: string
          will_delta: number
        }
        Insert: {
          appearance?: Json
          approved?: boolean
          campaign_id?: string | null
          concept?: string | null
          conditions?: string[]
          created_at?: string
          current_fp?: number | null
          current_hp?: number | null
          dx?: number
          fp_delta?: number
          gm_notes?: string | null
          hp_delta?: number
          ht?: number
          id?: string
          iq?: number
          is_npc?: boolean
          is_template?: boolean
          move_delta?: number
          name?: string
          notes?: string | null
          owner_id?: string
          per_delta?: number
          player_name?: string | null
          point_budget?: number
          portrait_path?: string | null
          speed_delta?: number
          st?: number
          status?: number
          tech_level?: number
          updated_at?: string
          wealth?: string
          will_delta?: number
        }
        Update: {
          appearance?: Json
          approved?: boolean
          campaign_id?: string | null
          concept?: string | null
          conditions?: string[]
          created_at?: string
          current_fp?: number | null
          current_hp?: number | null
          dx?: number
          fp_delta?: number
          gm_notes?: string | null
          hp_delta?: number
          ht?: number
          id?: string
          iq?: number
          is_npc?: boolean
          is_template?: boolean
          move_delta?: number
          name?: string
          notes?: string | null
          owner_id?: string
          per_delta?: number
          player_name?: string | null
          point_budget?: number
          portrait_path?: string | null
          speed_delta?: number
          st?: number
          status?: number
          tech_level?: number
          updated_at?: string
          wealth?: string
          will_delta?: number
        }
        Relationships: [
          {
            foreignKeyName: "characters_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      content_packs: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          owner_id: string
          source_edition: string | null
          source_label: string
          source_type: string
          updated_at: string
          visibility: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          owner_id?: string
          source_edition?: string | null
          source_label?: string
          source_type?: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          owner_id?: string
          source_edition?: string | null
          source_label?: string
          source_type?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: []
      }
      library_entries: {
        Row: {
          base_points: number
          campaign_id: string | null
          category: string | null
          cost_per_level: number
          created_at: string
          data: Json
          id: string
          kind: string
          max_levels: number | null
          name: string
          owner_id: string
          pack: string | null
          source_edition: string | null
          source_label: string
          source_page: string | null
          source_type: string
          summary: string | null
          tags: string[]
          updated_at: string
          visibility: string
        }
        Insert: {
          base_points?: number
          campaign_id?: string | null
          category?: string | null
          cost_per_level?: number
          created_at?: string
          data?: Json
          id?: string
          kind: string
          max_levels?: number | null
          name: string
          owner_id?: string
          pack?: string | null
          source_edition?: string | null
          source_label?: string
          source_page?: string | null
          source_type?: string
          summary?: string | null
          tags?: string[]
          updated_at?: string
          visibility?: string
        }
        Update: {
          base_points?: number
          campaign_id?: string | null
          category?: string | null
          cost_per_level?: number
          created_at?: string
          data?: Json
          id?: string
          kind?: string
          max_levels?: number | null
          name?: string
          owner_id?: string
          pack?: string | null
          source_edition?: string | null
          source_label?: string
          source_page?: string | null
          source_type?: string
          summary?: string | null
          tags?: string[]
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "library_entries_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          display_name: string
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      roll_history: {
        Row: {
          campaign_id: string | null
          character_id: string | null
          created_at: string
          dice: number[]
          expression: string
          id: string
          label: string
          margin: number | null
          outcome: string | null
          target: number | null
          total: number
          user_id: string
        }
        Insert: {
          campaign_id?: string | null
          character_id?: string | null
          created_at?: string
          dice?: number[]
          expression: string
          id?: string
          label: string
          margin?: number | null
          outcome?: string | null
          target?: number | null
          total: number
          user_id?: string
        }
        Update: {
          campaign_id?: string | null
          character_id?: string | null
          created_at?: string
          dice?: number[]
          expression?: string
          id?: string
          label?: string
          margin?: number | null
          outcome?: string | null
          target?: number | null
          total?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "roll_history_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "roll_history_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      join_campaign: { Args: { _code: string }; Returns: string }
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
    Enums: {},
  },
} as const
