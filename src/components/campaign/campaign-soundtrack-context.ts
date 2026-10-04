/**
 * Shared campaign soundtrack state: the context, its shape and the hooks that
 * read it. The provider and the mini player live in
 * `campaign-soundtrack-player.tsx`.
 */
import { createContext, useContext } from "react";
import type { SoundtrackAlbum, SoundtrackTrack } from "@/lib/campaign-soundtrack";

export type Player = {
  campaignId: string | null;
  albums: SoundtrackAlbum[];
  tracks: SoundtrackTrack[];
  activeTrack: SoundtrackTrack | null;
  activeAlbum: SoundtrackAlbum | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  loopOne: boolean;
  isGm: boolean;
  setVolume: (n: number) => void;
  setLoopOne: (value: boolean) => Promise<void>;
  playTrack: (a: SoundtrackAlbum, t: SoundtrackTrack) => Promise<void>;
  toggle: () => Promise<void>;
  seek: (n: number) => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  stop: () => Promise<void>;
  /** A GM-commanded video takes over: the soundtrack pauses and later resumes. */
  setVideoActive: (active: boolean) => void;
};
export const CampaignSoundtrackContext = createContext<Player | null>(null);

export function useCampaignSoundtrack() {
  const v = useContext(CampaignSoundtrackContext);
  if (!v) throw new Error("Campaign soundtrack provider is missing");
  return v;
}

/** Same context, but tolerant of screens rendered outside the player provider. */
export function useCampaignSoundtrackOptional() {
  return useContext(CampaignSoundtrackContext);
}
