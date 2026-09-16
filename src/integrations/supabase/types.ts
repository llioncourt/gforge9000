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
      campaign_assets: {
        Row: {
          byte_size: number
          campaign_id: string
          caption: string | null
          created_at: string
          created_by: string
          height: number | null
          id: string
          mime_type: string
          storage_path: string
          tags: string[]
          title: string
          updated_at: string
          visible_to_players: boolean
          width: number | null
        }
        Insert: {
          byte_size?: number
          campaign_id: string
          caption?: string | null
          created_at?: string
          created_by?: string
          height?: number | null
          id?: string
          mime_type?: string
          storage_path: string
          tags?: string[]
          title?: string
          updated_at?: string
          visible_to_players?: boolean
          width?: number | null
        }
        Update: {
          byte_size?: number
          campaign_id?: string
          caption?: string | null
          created_at?: string
          created_by?: string
          height?: number | null
          id?: string
          mime_type?: string
          storage_path?: string
          tags?: string[]
          title?: string
          updated_at?: string
          visible_to_players?: boolean
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_assets_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_intro_views: {
        Row: {
          campaign_id: string
          completed_at: string
          do_not_show_again: boolean
          intro_version: string
          updated_at: string
          user_id: string
        }
        Insert: {
          campaign_id: string
          completed_at?: string
          do_not_show_again?: boolean
          intro_version: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          campaign_id?: string
          completed_at?: string
          do_not_show_again?: boolean
          intro_version?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_intro_views_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
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
      campaign_sound_fx: {
        Row: {
          byte_size: number
          campaign_id: string
          created_at: string
          created_by: string
          file_name: string
          id: string
          mime_type: string
          sort_order: number
          storage_path: string
          title: string
          updated_at: string
        }
        Insert: {
          byte_size: number
          campaign_id: string
          created_at?: string
          created_by?: string
          file_name: string
          id?: string
          mime_type: string
          sort_order?: number
          storage_path: string
          title: string
          updated_at?: string
        }
        Update: {
          byte_size?: number
          campaign_id?: string
          created_at?: string
          created_by?: string
          file_name?: string
          id?: string
          mime_type?: string
          sort_order?: number
          storage_path?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sound_fx_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_sound_fx_state: {
        Row: {
          campaign_id: string
          changed_at: string
          changed_by: string
          effect_id: string | null
          event_id: string
        }
        Insert: {
          campaign_id: string
          changed_at?: string
          changed_by?: string
          effect_id?: string | null
          event_id?: string
        }
        Update: {
          campaign_id?: string
          changed_at?: string
          changed_by?: string
          effect_id?: string | null
          event_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_sound_fx_state_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_sound_fx_state_effect_id_fkey"
            columns: ["effect_id"]
            isOneToOne: false
            referencedRelation: "campaign_sound_fx"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_soundtrack_albums: {
        Row: {
          campaign_id: string
          composer: string | null
          cover_path: string
          created_at: string
          created_by: string
          description: string | null
          id: string
          release_year: number | null
          slug: string
          subtitle: string | null
          title: string
          updated_at: string
        }
        Insert: {
          campaign_id: string
          composer?: string | null
          cover_path: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          release_year?: number | null
          slug: string
          subtitle?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          campaign_id?: string
          composer?: string | null
          cover_path?: string
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          release_year?: number | null
          slug?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_soundtrack_albums_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_soundtrack_state: {
        Row: {
          album_id: string | null
          campaign_id: string
          changed_at: string
          changed_by: string
          is_playing: boolean
          loop_one: boolean
          position_seconds: number
          track_id: string | null
          updated_at: string
        }
        Insert: {
          album_id?: string | null
          campaign_id: string
          changed_at?: string
          changed_by?: string
          is_playing?: boolean
          loop_one?: boolean
          position_seconds?: number
          track_id?: string | null
          updated_at?: string
        }
        Update: {
          album_id?: string | null
          campaign_id?: string
          changed_at?: string
          changed_by?: string
          is_playing?: boolean
          loop_one?: boolean
          position_seconds?: number
          track_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_soundtrack_state_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "campaign_soundtrack_albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_soundtrack_state_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: true
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_soundtrack_state_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "campaign_soundtrack_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_soundtrack_tracks: {
        Row: {
          album_id: string
          byte_size: number
          campaign_id: string
          composer: string | null
          created_at: string
          duration_seconds: number | null
          file_name: string
          id: string
          mime_type: string
          position: number
          storage_path: string
          title: string
          updated_at: string
        }
        Insert: {
          album_id: string
          byte_size: number
          campaign_id: string
          composer?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_name: string
          id?: string
          mime_type: string
          position: number
          storage_path: string
          title: string
          updated_at?: string
        }
        Update: {
          album_id?: string
          byte_size?: number
          campaign_id?: string
          composer?: string | null
          created_at?: string
          duration_seconds?: number | null
          file_name?: string
          id?: string
          mime_type?: string
          position?: number
          storage_path?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_soundtrack_tracks_album_id_fkey"
            columns: ["album_id"]
            isOneToOne: false
            referencedRelation: "campaign_soundtrack_albums"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "campaign_soundtrack_tracks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_videos: {
        Row: {
          byte_size: number
          campaign_id: string
          created_at: string
          created_by: string
          file_name: string
          hls_path: string | null
          id: string
          mime_type: string
          storage_path: string
          thumb_path: string | null
          title: string
          updated_at: string
          version: string
          video_type: string
        }
        Insert: {
          byte_size: number
          campaign_id: string
          created_at?: string
          created_by?: string
          file_name: string
          hls_path?: string | null
          id?: string
          mime_type?: string
          storage_path: string
          thumb_path?: string | null
          title: string
          updated_at?: string
          version?: string
          video_type?: string
        }
        Update: {
          byte_size?: number
          campaign_id?: string
          created_at?: string
          created_by?: string
          file_name?: string
          hls_path?: string | null
          id?: string
          mime_type?: string
          storage_path?: string
          thumb_path?: string | null
          title?: string
          updated_at?: string
          version?: string
          video_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "campaign_intros_campaign_id_fkey"
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
          model_path: string | null
          model_transform: Json
          move_delta: number
          name: string
          notes: string | null
          owner_id: string
          packs: string[]
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
          model_path?: string | null
          model_transform?: Json
          move_delta?: number
          name?: string
          notes?: string | null
          owner_id?: string
          packs?: string[]
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
          model_path?: string | null
          model_transform?: Json
          move_delta?: number
          name?: string
          notes?: string | null
          owner_id?: string
          packs?: string[]
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
      entities: {
        Row: {
          aliases: string[]
          archived_at: string | null
          campaign_id: string
          canon_locked: boolean
          character_id: string | null
          created_at: string
          created_by: string
          data: Json
          description: string | null
          gm_notes: string | null
          id: string
          image_url: string | null
          kind: string
          name: string
          owner_user_id: string | null
          parent_id: string | null
          player_description: string | null
          sort_order: number
          status: string
          summary: string | null
          tags: string[]
          updated_at: string
          visibility: string
        }
        Insert: {
          aliases?: string[]
          archived_at?: string | null
          campaign_id: string
          canon_locked?: boolean
          character_id?: string | null
          created_at?: string
          created_by?: string
          data?: Json
          description?: string | null
          gm_notes?: string | null
          id?: string
          image_url?: string | null
          kind: string
          name: string
          owner_user_id?: string | null
          parent_id?: string | null
          player_description?: string | null
          sort_order?: number
          status?: string
          summary?: string | null
          tags?: string[]
          updated_at?: string
          visibility?: string
        }
        Update: {
          aliases?: string[]
          archived_at?: string | null
          campaign_id?: string
          canon_locked?: boolean
          character_id?: string | null
          created_at?: string
          created_by?: string
          data?: Json
          description?: string | null
          gm_notes?: string | null
          id?: string
          image_url?: string | null
          kind?: string
          name?: string
          owner_user_id?: string | null
          parent_id?: string | null
          player_description?: string | null
          sort_order?: number
          status?: string
          summary?: string | null
          tags?: string[]
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "entities_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entities_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entities_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_relationships: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string
          description: string | null
          end_label: string | null
          gm_description: string | null
          id: string
          is_current: boolean
          rel_type: string
          source_id: string
          start_label: string | null
          strength: number | null
          target_id: string
          updated_at: string
          visibility: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string
          description?: string | null
          end_label?: string | null
          gm_description?: string | null
          id?: string
          is_current?: boolean
          rel_type: string
          source_id: string
          start_label?: string | null
          strength?: number | null
          target_id: string
          updated_at?: string
          visibility?: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string
          description?: string | null
          end_label?: string | null
          gm_description?: string | null
          id?: string
          is_current?: boolean
          rel_type?: string
          source_id?: string
          start_label?: string | null
          strength?: number | null
          target_id?: string
          updated_at?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "entity_relationships_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relationships_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_relationships_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      entity_revisions: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string
          entity_id: string
          id: string
          label: string | null
          snapshot: Json
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string
          entity_id: string
          id?: string
          label?: string | null
          snapshot: Json
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string
          entity_id?: string
          id?: string
          label?: string | null
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "entity_revisions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "entity_revisions_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_grants: {
        Row: {
          campaign_id: string
          created_at: string
          entity_id: string
          granted_by: string
          id: string
          note: string | null
          user_id: string
        }
        Insert: {
          campaign_id: string
          created_at?: string
          entity_id: string
          granted_by?: string
          id?: string
          note?: string | null
          user_id: string
        }
        Update: {
          campaign_id?: string
          created_at?: string
          entity_id?: string
          granted_by?: string
          id?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_grants_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_grants_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
            referencedColumns: ["id"]
          },
        ]
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
      map_objects: {
        Row: {
          campaign_id: string
          character_id: string | null
          color: string | null
          created_at: string
          created_by: string
          data: Json
          hidden: boolean
          id: string
          image_url: string | null
          kind: string
          label: string
          map_id: string
          owner_user_id: string | null
          rotation: number
          size: number
          updated_at: string
          x: number
          y: number
        }
        Insert: {
          campaign_id: string
          character_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string
          data?: Json
          hidden?: boolean
          id?: string
          image_url?: string | null
          kind?: string
          label?: string
          map_id: string
          owner_user_id?: string | null
          rotation?: number
          size?: number
          updated_at?: string
          x?: number
          y?: number
        }
        Update: {
          campaign_id?: string
          character_id?: string | null
          color?: string | null
          created_at?: string
          created_by?: string
          data?: Json
          hidden?: boolean
          id?: string
          image_url?: string | null
          kind?: string
          label?: string
          map_id?: string
          owner_user_id?: string | null
          rotation?: number
          size?: number
          updated_at?: string
          x?: number
          y?: number
        }
        Relationships: [
          {
            foreignKeyName: "map_objects_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_objects_character_id_fkey"
            columns: ["character_id"]
            isOneToOne: false
            referencedRelation: "characters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "map_objects_map_id_fkey"
            columns: ["map_id"]
            isOneToOne: false
            referencedRelation: "maps"
            referencedColumns: ["id"]
          },
        ]
      }
      maps: {
        Row: {
          campaign_id: string
          created_at: string
          created_by: string
          data: Json
          fog: Json
          grid_offset_x: number
          grid_offset_y: number
          grid_size: number
          grid_type: string
          id: string
          image_height: number | null
          image_path: string | null
          image_width: number | null
          is_active: boolean
          name: string
          unit_name: string
          unit_per_cell: number
          updated_at: string
          visible_to_players: boolean
        }
        Insert: {
          campaign_id: string
          created_at?: string
          created_by?: string
          data?: Json
          fog?: Json
          grid_offset_x?: number
          grid_offset_y?: number
          grid_size?: number
          grid_type?: string
          id?: string
          image_height?: number | null
          image_path?: string | null
          image_width?: number | null
          is_active?: boolean
          name?: string
          unit_name?: string
          unit_per_cell?: number
          updated_at?: string
          visible_to_players?: boolean
        }
        Update: {
          campaign_id?: string
          created_at?: string
          created_by?: string
          data?: Json
          fog?: Json
          grid_offset_x?: number
          grid_offset_y?: number
          grid_size?: number
          grid_type?: string
          id?: string
          image_height?: number | null
          image_path?: string | null
          image_width?: number | null
          is_active?: boolean
          name?: string
          unit_name?: string
          unit_per_cell?: number
          updated_at?: string
          visible_to_players?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "maps_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          campaign_id: string | null
          created_at: string
          created_by: string
          entity_id: string | null
          id: string
          kind: string
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body?: string | null
          campaign_id?: string | null
          created_at?: string
          created_by: string
          entity_id?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string | null
          campaign_id?: string | null
          created_at?: string
          created_by?: string
          entity_id?: string | null
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_entity_id_fkey"
            columns: ["entity_id"]
            isOneToOne: false
            referencedRelation: "entities"
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
          preferences: Json
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id: string
          preferences?: Json
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          display_name?: string
          id?: string
          preferences?: Json
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
      remove_character_from_campaign: {
        Args: { _character: string }
        Returns: undefined
      }
      transfer_campaign_gm: {
        Args: { _campaign: string; _new_gm: string }
        Returns: undefined
      }
      transfer_character_owner: {
        Args: { _character: string; _new_owner: string }
        Returns: undefined
      }
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
