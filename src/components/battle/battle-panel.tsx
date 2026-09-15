import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crosshair, Eye, EyeOff, Hand, Map as MapIcon, Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { FileDropzone } from "@/components/ui/FileDropzone";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { listCampaignCharacters } from "@/lib/api";
import { listEntities } from "@/lib/lore";
import {
  createMap,
  createMapObject,
  deleteMap,
  deleteMapObject,
  listMapObjects,
  listMaps,
  mapImageUrl,
  updateMap,
  updateMapObject,
  uploadMapImage,
  type MapRow,
} from "@/lib/battlemap";
import { BattleGrid } from "./battle-grid";

type Cell = { x: number; y: number };

export function BattlePanel({ campaignId, isGm, focusMapId }: { campaignId: string; isGm: boolean; focusMapId?: string | null }) {
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [mapId, setMapId] = useState<string | null>(null);
  useEffect(() => { if (focusMapId) setMapId(focusMapId); }, [focusMapId]);
  const [tool, setTool] = useState<"move" | "measure" | "fog">("move");
  const [show3d, setShow3d] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const maps = useQuery({
    queryKey: ["maps", campaignId],
    queryFn: () => listMaps(campaignId),
  });

  const characters = useQuery({
    queryKey: ["campaign-characters", campaignId],
    queryFn: () => listCampaignCharacters(campaignId),
  });

  const npcs = useQuery({
    queryKey: ["lore-entities", campaignId],
    queryFn: () => listEntities(campaignId),
    select: (rows) => rows.filter((row) => row.kind === "NPC"),
  });

  const current: MapRow | null = useMemo(() => {
    const list = maps.data ?? [];
    return list.find((m) => m.id === mapId) ?? list.find((m) => m.is_active) ?? list[0] ?? null;
  }, [maps.data, mapId]);

  const objects = useQuery({
    queryKey: ["map-objects", current?.id],
    queryFn: () => listMapObjects(current!.id),
    enabled: Boolean(current?.id),
  });

  const image = useQuery({
    queryKey: ["map-image", current?.image_path],
    queryFn: () => mapImageUrl(current?.image_path),
    enabled: Boolean(current?.image_path),
    staleTime: 1000 * 60 * 30,
  });

  /* Realtime: everyone at the table sees moves and map changes immediately. */
  useEffect(() => {
    if (!current?.id) return;
    const channel = supabase
      .channel(`battle-${current.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "map_objects", filter: `map_id=eq.${current.id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["map-objects", current.id] });
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "maps", filter: `id=eq.${current.id}` },
        () => {
          void queryClient.invalidateQueries({ queryKey: ["maps", campaignId] });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [current?.id, campaignId, queryClient]);

  const invalidateMaps = () => queryClient.invalidateQueries({ queryKey: ["maps", campaignId] });
  const invalidateObjects = () =>
    queryClient.invalidateQueries({ queryKey: ["map-objects", current?.id] });

  const addMap = useMutation({
    mutationFn: () =>
      createMap({
        campaign_id: campaignId,
        name: `Map ${(maps.data?.length ?? 0) + 1}`,
        is_active: (maps.data?.length ?? 0) === 0,
        grid_type: "hex",
      }),
    onSuccess: async (row) => {
      setMapId(row.id);
      await invalidateMaps();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const patchMap = useMutation({
    mutationFn: (patch: Parameters<typeof updateMap>[1]) => updateMap(current!.id, patch),
    onSuccess: invalidateMaps,
    onError: (error: Error) => toast.error(error.message),
  });

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const path = await uploadMapImage(campaignId, file);
      return updateMap(current!.id, { image_path: path });
    },
    onSuccess: async () => {
      toast.success("Map image updated");
      await queryClient.invalidateQueries({ queryKey: ["map-image"] });
      await invalidateMaps();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const removeMap = useMutation({
    mutationFn: () => deleteMap(current!.id),
    onSuccess: async () => {
      setMapId(null);
      setConfirmDelete(false);
      await invalidateMaps();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const addToken = useMutation({
    mutationFn: (input: {
      characterId: string | null;
      entityId?: string | null;
      label: string;
      imagePath?: string | null;
    }) =>
      createMapObject({
        campaign_id: campaignId,
        map_id: current!.id,
        character_id: input.characterId,
        owner_user_id:
          characters.data?.find((c) => c.id === input.characterId)?.owner_id ?? user?.id ?? null,
        label: input.label,
        image_url: input.imagePath ?? null,
        data: input.entityId ? { entity_id: input.entityId } : {},
        x: 0,
        y: 0,
      }),
    onSuccess: invalidateObjects,
    onError: (error: Error) => toast.error(error.message),
  });

  const moveToken = useMutation({
    mutationFn: (input: { id: string; x: number; y: number }) =>
      updateMapObject(input.id, { x: input.x, y: input.y }),
    onMutate: async (input) => {
      const key = ["map-objects", current?.id];
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData(key);
      queryClient.setQueryData(key, (old: unknown) =>
        Array.isArray(old)
          ? old.map((o) => (o.id === input.id ? { ...o, x: input.x, y: input.y } : o))
          : old,
      );
      return { previous, key };
    },
    onError: (error: Error, _input, context) => {
      if (context) queryClient.setQueryData(context.key, context.previous);
      toast.error(error.message);
    },
    onSettled: invalidateObjects,
  });

  const patchToken = useMutation({
    mutationFn: (input: { id: string; patch: Parameters<typeof updateMapObject>[1] }) =>
      updateMapObject(input.id, input.patch),
    onSuccess: invalidateObjects,
    onError: (error: Error) => toast.error(error.message),
  });

  const removeToken = useMutation({
    mutationFn: (id: string) => deleteMapObject(id),
    onSuccess: async () => {
      setSelectedId(null);
      await invalidateObjects();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function toggleFog(cell: Cell) {
    if (!current || !isGm) return;
    const raw = Array.isArray(current.fog) ? (current.fog as Cell[]) : [];
    const key = `${cell.x},${cell.y}`;
    const next = raw.some((c) => `${c.x},${c.y}` === key)
      ? raw.filter((c) => `${c.x},${c.y}` !== key)
      : [...raw, { x: cell.x, y: cell.y }];
    patchMap.mutate({ fog: next });
  }

  const selected = (objects.data ?? []).find((o) => o.id === selectedId) ?? null;

  /* Tokens already on the grid leave the picker; NPC tokens match by label. */
  const placedCharacterIds = new Set(
    (objects.data ?? []).map((o) => o.character_id).filter(Boolean),
  );
  const placedLabels = new Set(
    (objects.data ?? []).filter((o) => !o.character_id).map((o) => o.label),
  );
  const availableCharacters = (characters.data ?? []).filter((c) => !placedCharacterIds.has(c.id));
  const availableNpcs = (npcs.data ?? []).filter((n) => !placedLabels.has(n.name));

  function addTokenFromPicker(value: string) {
    if (value === "marker") {
      addToken.mutate({ characterId: null, label: "Marker" });
      return;
    }
    if (value.startsWith("char:")) {
      const id = value.slice(5);
      const character = (characters.data ?? []).find((c) => c.id === id);
      if (character) addToken.mutate({ characterId: character.id, label: character.name });
      return;
    }
    if (value.startsWith("npc:")) {
      const id = value.slice(4);
      const npc = (npcs.data ?? []).find((n) => n.id === id);
      if (npc) {
        addToken.mutate({
          characterId: null,
          entityId: npc.id,
          label: npc.name,
          imagePath: npc.image_url,
        });
      }
    }
  }

  if (maps.isLoading) {
    return <Skeleton className="h-[70vh] w-full" />;
  }

  if (!current) {
    return (
      <div className="space-y-4 rounded-lg border p-8 text-center">
        <MapIcon className="text-muted-foreground mx-auto size-8" />
        <p className="text-muted-foreground text-sm">
          {isGm
            ? "No battle map yet. Create one and drop in a background image."
            : "The GM has not shared a battle map yet."}
        </p>
        {isGm ? (
          <Button onClick={() => addMap.mutate()} disabled={addMap.isPending}>
            <Plus className="mr-2 size-4" /> New map
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-56">
          <Label className="text-xs">Map</Label>
          <Select value={current.id} onValueChange={setMapId}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(maps.data ?? []).map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-1">
          <Button
            size="sm"
            variant={tool === "move" ? "default" : "outline"}
            onClick={() => setTool("move")}
          >
            <Hand className="mr-1 size-4" /> Move
          </Button>
          <Button
            size="sm"
            variant={tool === "measure" ? "default" : "outline"}
            onClick={() => setTool("measure")}
          >
            <Crosshair className="mr-1 size-4" /> Measure
          </Button>
          {isGm ? (
            <Button
              size="sm"
              variant={tool === "fog" ? "default" : "outline"}
              onClick={() => setTool("fog")}
            >
              <EyeOff className="mr-1 size-4" /> Fog
            </Button>
          ) : null}
        </div>

        <div className="flex items-center gap-2">
          <Switch id="show3d" checked={show3d} onCheckedChange={setShow3d} />
          <Label htmlFor="show3d" className="text-xs">
            3D tokens
          </Label>
        </div>

        {isGm ? (
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2">
              <Switch
                id="visible"
                checked={current.visible_to_players}
                onCheckedChange={(checked) => patchMap.mutate({ visible_to_players: checked })}
              />
              <Label htmlFor="visible" className="text-xs">
                <Eye className="mr-1 inline size-3.5" /> Players can see
              </Label>
            </div>
            <Button size="sm" variant="outline" onClick={() => addMap.mutate()}>
              <Plus className="mr-1 size-4" /> New map
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="mr-1 size-4" /> Delete map
            </Button>
          </div>
        ) : null}
      </div>

      {isGm ? (
        <div className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="space-y-1">
            <Label className="text-xs">Name</Label>
            <Input
              defaultValue={current.name}
              onBlur={(event) => {
                if (event.target.value !== current.name) patchMap.mutate({ name: event.target.value });
              }}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Grid</Label>
            <Select
              value={current.grid_type}
              onValueChange={(value) => patchMap.mutate({ grid_type: value })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="square">Square</SelectItem>
                <SelectItem value="hex">Hex</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Cell size (px)</Label>
            <Input
              type="number"
              defaultValue={Number(current.grid_size)}
              onBlur={(event) => patchMap.mutate({ grid_size: Number(event.target.value) || 50 })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Offset X / Y</Label>
            <div className="flex gap-1">
              <Input
                type="number"
                defaultValue={Number(current.grid_offset_x)}
                onBlur={(event) =>
                  patchMap.mutate({ grid_offset_x: Number(event.target.value) || 0 })
                }
              />
              <Input
                type="number"
                defaultValue={Number(current.grid_offset_y)}
                onBlur={(event) =>
                  patchMap.mutate({ grid_offset_y: Number(event.target.value) || 0 })
                }
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Distance per cell</Label>
            <Input
              type="number"
              step="0.1"
              defaultValue={Number(current.unit_per_cell)}
              onBlur={(event) => patchMap.mutate({ unit_per_cell: Number(event.target.value) || 1 })}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unit</Label>
            <Input
              defaultValue={current.unit_name}
              onBlur={(event) => patchMap.mutate({ unit_name: event.target.value || "yd" })}
            />
          </div>
        </div>
      ) : null}

      {isGm ? (
        <FileDropzone
          compact
          accept="image/*"
          label={
            <span className="flex items-center gap-2 text-sm">
              <Upload className="size-4" />
              {upload.isPending ? "Uploading…" : "Drop a map image here (PNG, JPEG, WebP, AVIF)"}
            </span>
          }
          onFiles={(files) => files[0] && upload.mutate(files[0])}
        />
      ) : null}

      {isGm ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
          <div className="w-72 space-y-1">
            <Label className="text-xs">Add token</Label>
            <Select value="" onValueChange={addTokenFromPicker}>
              <SelectTrigger>
                <SelectValue placeholder="Pick a character, NPC or marker" />
              </SelectTrigger>
              <SelectContent>
                {availableCharacters.map((c) => (
                  <SelectItem key={c.id} value={`char:${c.id}`}>
                    {c.name}
                  </SelectItem>
                ))}
                {availableNpcs.map((n) => (
                  <SelectItem key={n.id} value={`npc:${n.id}`}>
                    {n.name} (NPC)
                  </SelectItem>
                ))}
                <SelectItem value="marker">Blank marker</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {availableCharacters.length === 0 && availableNpcs.length === 0 ? (
            <p className="text-muted-foreground pb-2 text-xs">
              Every character and NPC is already on the grid.
            </p>
          ) : null}
        </div>
      ) : null}

      <BattleGrid
        map={current}
        imageUrl={image.data ?? null}
        objects={objects.data ?? []}
        characters={characters.data ?? []}
        npcs={npcs.data ?? []}
        isGm={isGm}
        userId={user?.id ?? null}
        show3d={show3d}
        tool={tool}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onMove={(id, x, y) => moveToken.mutate({ id, x, y })}
        onToggleFog={toggleFog}
      />


      {selected ? (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
          <div className="space-y-1">
            <Label className="text-xs">Label</Label>
            <Input
              key={selected.id}
              defaultValue={selected.label}
              disabled={!isGm}
              onBlur={(event) =>
                patchToken.mutate({ id: selected.id, patch: { label: event.target.value } })
              }
            />
          </div>
          <div className="w-28 space-y-1">
            <Label className="text-xs">Size (cells)</Label>
            <Input
              key={`${selected.id}-size`}
              type="number"
              step="0.5"
              min="0.5"
              defaultValue={Number(selected.size)}
              disabled={!isGm}
              onBlur={(event) =>
                patchToken.mutate({
                  id: selected.id,
                  patch: { size: Number(event.target.value) || 1 },
                })
              }
            />
          </div>
          {isGm ? (
            <>
              <div className="flex items-center gap-2 pb-2">
                <Switch
                  id="token-hidden"
                  checked={selected.hidden}
                  onCheckedChange={(checked) =>
                    patchToken.mutate({ id: selected.id, patch: { hidden: checked } })
                  }
                />
                <Label htmlFor="token-hidden" className="text-xs">
                  Hidden from players
                </Label>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="mb-1"
                onClick={() => removeToken.mutate(selected.id)}
              >
                <Trash2 className="mr-1 size-4" /> Remove token
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this map?</AlertDialogTitle>
            <AlertDialogDescription>
              The map and every token on it will be removed for the whole table.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeMap.mutate()}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
