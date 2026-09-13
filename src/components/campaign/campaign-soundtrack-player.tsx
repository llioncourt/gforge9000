import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pause, Play, SkipBack, SkipForward, Volume2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getCharacter, getCampaign } from "@/lib/api";
import { getEntity } from "@/lib/lore";
import { formatSoundtrackTime } from "@/lib/campaign-soundtrack-pack";
import { listCampaignSoundtracks, setCampaignSoundtrackState, soundtrackSignedUrl, type SoundtrackAlbum, type SoundtrackTrack } from "@/lib/campaign-soundtrack";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";

type Player = { campaignId:string|null; albums:SoundtrackAlbum[]; tracks:SoundtrackTrack[]; activeTrack:SoundtrackTrack|null; activeAlbum:SoundtrackAlbum|null; isPlaying:boolean; currentTime:number; duration:number; volume:number; isGm:boolean; setVolume:(n:number)=>void; playTrack:(a:SoundtrackAlbum,t:SoundtrackTrack)=>Promise<void>; toggle:()=>Promise<void>; seek:(n:number)=>Promise<void>; next:()=>Promise<void>; previous:()=>Promise<void>; stop:()=>Promise<void> };
const Context = createContext<Player|null>(null);

async function scope(path:string) {
  const campaign=/^\/campaigns\/([0-9a-f-]{36})/i.exec(path)?.[1]; if(campaign) return campaign;
  const entity=/^\/entities\/([0-9a-f-]{36})/i.exec(path)?.[1]; if(entity) return (await getEntity(entity)).campaign_id;
  const character=/^\/characters\/([0-9a-f-]{36})/i.exec(path)?.[1]; if(character) return (await getCharacter(character)).campaign_id;
  return null;
}
export function CampaignSoundtrackProvider({pathname,children}:{pathname:string;children:ReactNode}) {
  const qc=useQueryClient(), audio=useRef<HTMLAudioElement|null>(null);
  const [campaignId,setCampaignId]=useState<string|null>(null), [url,setUrl]=useState<string|null>(null), [time,setTime]=useState(0), [duration,setDuration]=useState(0), [playing,setPlaying]=useState(false), [volume,setVolumeState]=useState(.85), [userId,setUserId]=useState<string|null>(null);
  useEffect(()=>{let live=true; void scope(pathname).then(id=>{if(live)setCampaignId(id)}).catch(()=>{if(live)setCampaignId(null)}); return()=>{live=false}},[pathname]);
  useEffect(()=>{void supabase.auth.getUser().then(({data})=>setUserId(data.user?.id??null))},[]);
  const data=useQuery({queryKey:["campaign-soundtrack",campaignId],queryFn:()=>listCampaignSoundtracks(campaignId??""),enabled:!!campaignId});
  const campaign=useQuery({queryKey:["campaign",campaignId],queryFn:()=>getCampaign(campaignId??""),enabled:!!campaignId});
  const albums=data.data?.albums??[], tracks=data.data?.tracks??[], state=data.data?.state??null;
  const activeTrack=tracks.find(t=>t.id===state?.track_id)??null, activeAlbum=albums.find(a=>a.id===state?.album_id)??null, isGm=!!userId&&campaign.data?.gm_id===userId;
  useEffect(()=>{if(!campaignId)return; const ch=supabase.channel(`soundtrack:${campaignId}`).on("postgres_changes",{event:"*",schema:"public",table:"campaign_soundtrack_state",filter:`campaign_id=eq.${campaignId}`},()=>void qc.invalidateQueries({queryKey:["campaign-soundtrack",campaignId]})).subscribe(); return()=>{void supabase.removeChannel(ch)}},[campaignId,qc]);
  useEffect(()=>{let live=true;if(!activeTrack){setUrl(null);return}void soundtrackSignedUrl(activeTrack.storage_path).then(v=>{if(live)setUrl(v)});return()=>{live=false}},[activeTrack?.id,activeTrack?.storage_path]);
  useEffect(()=>{const el=new Audio();el.preload="metadata";el.volume=volume;audio.current=el;const tick=()=>setTime(el.currentTime),meta=()=>setDuration(Number.isFinite(el.duration)?el.duration:0),p=()=>setPlaying(true),q=()=>setPlaying(false);el.addEventListener("timeupdate",tick);el.addEventListener("loadedmetadata",meta);el.addEventListener("play",p);el.addEventListener("pause",q);return()=>{el.pause();el.removeAttribute("src");el.load();audio.current=null}},[]);
  useEffect(()=>{const el=audio.current;if(!el)return;if(!campaignId||!activeTrack||!url||!state){el.pause();el.removeAttribute("src");el.load();setTime(0);setPlaying(false);return}if(el.src!==url)el.src=url;const target=Number(state.position_seconds)+(state.is_playing?Math.max(0,(Date.now()-new Date(state.changed_at).getTime())/1000):0);if(Math.abs(el.currentTime-target)>1.5)el.currentTime=target;if(state.is_playing)void el.play().catch(()=>setPlaying(false));else el.pause()},[campaignId,activeTrack?.id,url,state?.changed_at,state?.is_playing,state?.position_seconds]);
  const write=useCallback(async(t:SoundtrackTrack|null,a:SoundtrackAlbum|null,p:boolean,s:number)=>{if(!campaignId||!isGm)return;await setCampaignSoundtrackState({campaignId,albumId:a?.id??null,trackId:t?.id??null,isPlaying:p,positionSeconds:s});await qc.invalidateQueries({queryKey:["campaign-soundtrack",campaignId]})},[campaignId,isGm,qc]);
  const ordered=useMemo(()=>tracks.filter(t=>t.album_id===activeAlbum?.id).sort((a,b)=>a.position-b.position),[tracks,activeAlbum?.id]);
  const move=useCallback(async(d:number)=>{if(!activeTrack||!activeAlbum||!ordered.length)return;const i=ordered.findIndex(t=>t.id===activeTrack.id),t=ordered[(i+d+ordered.length)%ordered.length];if(t)await write(t,activeAlbum,true,0)},[activeTrack,activeAlbum,ordered,write]);
  const value=useMemo<Player>(()=>({campaignId,albums,tracks,activeTrack,activeAlbum,isPlaying:playing,currentTime:time,duration,volume,isGm,setVolume:n=>{const v=Math.max(0,Math.min(1,n));setVolumeState(v);if(audio.current)audio.current.volume=v},playTrack:(a,t)=>write(t,a,true,0),toggle:async()=>{if(activeTrack&&activeAlbum)await write(activeTrack,activeAlbum,!playing,audio.current?.currentTime??time)},seek:async n=>{if(activeTrack&&activeAlbum)await write(activeTrack,activeAlbum,playing,n)},next:()=>move(1),previous:()=>move(-1),stop:()=>write(null,null,false,0)}),[campaignId,albums,tracks,activeTrack,activeAlbum,playing,time,duration,volume,isGm,write,move]);
  return <Context.Provider value={value}>{children}<Mini/></Context.Provider>;
}
export function useCampaignSoundtrack(){const v=useContext(Context);if(!v)throw new Error("Campaign soundtrack provider is missing");return v}
function Mini(){const p=useCampaignSoundtrack();if(!p.campaignId||!p.activeTrack||!p.activeAlbum)return null;return <div className="no-print fixed inset-x-3 bottom-3 z-50 lg:left-auto lg:right-6 lg:w-[430px]"><div className="rounded-md border border-border bg-card/95 p-3 shadow-xl backdrop-blur"><div className="flex items-center gap-2"><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{p.activeTrack.title}</p><p className="truncate text-xs text-muted-foreground">{p.activeAlbum.title}</p></div><Button size="icon" variant="ghost" disabled={!p.isGm} onClick={()=>void p.previous()} aria-label="Previous track"><SkipBack className="h-4 w-4"/></Button><Button size="icon" variant="outline" disabled={!p.isGm} onClick={()=>void p.toggle()} aria-label={p.isPlaying?"Pause":"Play"}>{p.isPlaying?<Pause className="h-4 w-4"/>:<Play className="h-4 w-4"/>}</Button><Button size="icon" variant="ghost" disabled={!p.isGm} onClick={()=>void p.next()} aria-label="Next track"><SkipForward className="h-4 w-4"/></Button>{p.isGm?<Button size="icon" variant="ghost" onClick={()=>void p.stop()} aria-label="Stop soundtrack"><X className="h-4 w-4"/></Button>:null}</div><div className="mt-3 flex items-center gap-2"><span className="w-9 text-xs tabular-nums text-muted-foreground">{formatSoundtrackTime(p.currentTime)}</span><Slider value={[Math.min(p.currentTime,p.duration||0)]} max={Math.max(p.duration,1)} step={1} disabled={!p.isGm} onValueCommit={([v])=>void p.seek(v??0)}/><span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{formatSoundtrackTime(p.duration)}</span></div><div className="mt-2 flex items-center gap-2"><Volume2 className="h-3.5 w-3.5 text-muted-foreground"/><Slider className="max-w-28" value={[p.volume]} max={1} step={.01} onValueChange={([v])=>p.setVolume(v??0)}/>{!p.isGm?<span className="ml-auto text-[11px] text-muted-foreground">Controlled by GM</span>:null}</div></div></div>}
