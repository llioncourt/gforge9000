import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import type { EntityRow } from "@/lib/lore";
import {
  cellDistance,
  cellToPixel,
  formatDistance,
  pixelToCell,
  tokenDimensions,
  type MapObjectRow,
  type MapRow,
} from "@/lib/battlemap";
import { MapToken } from "./map-token";
import { cn } from "@/lib/utils";

type CharacterRow = Tables<"characters">;
type Cell = { x: number; y: number };

const HEX_W = Math.sqrt(3) / 2;

function fogCells(map: MapRow): Cell[] {
  const raw = map.fog;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => item as { x?: unknown; y?: unknown })
    .filter((item) => typeof item?.x === "number" && typeof item?.y === "number")
    .map((item) => ({ x: item.x as number, y: item.y as number }));
}

function hexPoints(cx: number, cy: number, size: number) {
  const r = size / 2;
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const angle = (Math.PI / 180) * (60 * i - 90);
    pts.push(`${cx + r * HEX_W * Math.cos(angle) * 1.1547},${cy + r * Math.sin(angle)}`);
  }
  return pts.join(" ");
}

export function BattleGrid({
  map,
  imageUrl,
  objects,
  characters,
  npcs,
  isGm,
  userId,
  show3d,
  tool,
  onMove,
  onSelect,
  selectedId,
  onToggleFog,
}: {
  map: MapRow;
  imageUrl: string | null;
  objects: MapObjectRow[];
  characters: CharacterRow[];
  npcs: EntityRow[];
  isGm: boolean;
  userId: string | null;
  show3d: boolean;
  tool: "move" | "measure" | "fog";
  onMove: (id: string, x: number, y: number) => void;
  onSelect: (id: string | null) => void;
  selectedId: string | null;
  onToggleFog: (cell: Cell) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({
    w: Number(map.image_width) || 1600,
    h: Number(map.image_height) || 1000,
  });
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const [panning, setPanning] = useState<{ x: number; y: number } | null>(null);
  const [measureFrom, setMeasureFrom] = useState<Cell | null>(null);
  const [cursorCell, setCursorCell] = useState<Cell | null>(null);

  const grid = map;
  const fog = useMemo(() => fogCells(map), [map]);
  const toImage = useCallback(
    (clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - pan.x) / zoom,
        y: (clientY - rect.top - pan.y) / zoom,
      };
    },
    [pan.x, pan.y, zoom],
  );

  useEffect(() => {
    function up(event: PointerEvent) {
      if (drag) {
        const p = toImage(event.clientX, event.clientY);
        const cell = pixelToCell(grid, p.x, p.y);
        onMove(drag.id, cell.x, cell.y);
        setDrag(null);
      }
      setPanning(null);
    }
    function move(event: PointerEvent) {
      if (drag) {
        const p = toImage(event.clientX, event.clientY);
        setDrag({ ...drag, x: p.x, y: p.y });
      } else if (panning) {
        setPan({ x: event.clientX - panning.x, y: event.clientY - panning.y });
      }
      if (tool === "measure") {
        const p = toImage(event.clientX, event.clientY);
        setCursorCell(pixelToCell(grid, p.x, p.y));
      }
    }
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [drag, panning, toImage, grid, onMove, tool]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const zoomMap = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
      setZoom((value) => Math.min(4, Math.max(0.15, value * factor)));
    };
    container.addEventListener("wheel", zoomMap, { passive: false });
    return () => container.removeEventListener("wheel", zoomMap);
  }, []);

  const canMove = useCallback(
    (object: MapObjectRow) =>
      isGm ||
      object.owner_user_id === userId ||
      (object.character_id != null &&
        characters.some((c) => c.id === object.character_id && c.owner_id === userId)),
    [characters, isGm, userId],
  );

  const cellPx = Number(map.grid_size) || 50;
  const cols = Math.ceil(size.w / (map.grid_type === "hex" ? cellPx * HEX_W : cellPx)) + 1;
  const rows = Math.ceil(size.h / (map.grid_type === "hex" ? cellPx * 0.75 : cellPx)) + 1;

  const measured = useMemo(() => {
    if (tool !== "measure" || !measureFrom || !cursorCell) return null;
    return formatDistance(grid, cellDistance(grid, measureFrom, cursorCell));
  }, [tool, measureFrom, cursorCell, grid]);

  return (
    <div className="space-y-2">
      <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
        <span>Zoom {(zoom * 100).toFixed(0)}%</span>
        <button
          type="button"
          className="hover:text-foreground underline"
          onClick={() => {
            setZoom(1);
            setPan({ x: 0, y: 0 });
          }}
        >
          Reset view
        </button>
        {tool === "measure" ? (
          <span>{measured ? `Distance: ${measured}` : "Click a starting cell, then move."}</span>
        ) : null}
        {tool === "fog" ? <span>Click cells to hide or reveal them for players.</span> : null}
      </div>

      <div
        ref={containerRef}
        className={cn(
          "bg-muted/20 relative h-[70vh] w-full touch-none overflow-hidden rounded-lg border",
          panning ? "cursor-grabbing" : tool === "move" ? "cursor-grab" : "cursor-crosshair",
        )}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          const p = toImage(event.clientX, event.clientY);
          const cell = pixelToCell(grid, p.x, p.y);
          if (tool === "measure") {
            setMeasureFrom((from) => (from ? null : cell));
            return;
          }
          if (tool === "fog" && isGm) {
            onToggleFog(cell);
            return;
          }
          onSelect(null);
          setPanning({ x: event.clientX - pan.x, y: event.clientY - pan.y });
        }}
      >
        <div
          className="absolute top-0 left-0 origin-top-left"
          style={{
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
            width: size.w,
            height: size.h,
          }}
        >
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={map.name}
              draggable={false}
              className="pointer-events-none block max-w-none select-none"
              onLoad={(event) => {
                const img = event.currentTarget;
                setSize({ w: img.naturalWidth, h: img.naturalHeight });
              }}
            />
          ) : (
            <div
              className="bg-card/40 pointer-events-none"
              style={{ width: size.w, height: size.h }}
            />
          )}

          <svg
            className="pointer-events-none absolute top-0 left-0"
            width={size.w}
            height={size.h}
          >
            {map.grid_type === "square"
              ? [
                  ...Array.from({ length: cols + 1 }).map((_, i) => (
                    <line
                      key={`v${i}`}
                      x1={Number(map.grid_offset_x) + i * cellPx}
                      y1={0}
                      x2={Number(map.grid_offset_x) + i * cellPx}
                      y2={size.h}
                      stroke="currentColor"
                      strokeOpacity={0.25}
                    />
                  )),
                  ...Array.from({ length: rows + 1 }).map((_, i) => (
                    <line
                      key={`h${i}`}
                      x1={0}
                      y1={Number(map.grid_offset_y) + i * cellPx}
                      x2={size.w}
                      y2={Number(map.grid_offset_y) + i * cellPx}
                      stroke="currentColor"
                      strokeOpacity={0.25}
                    />
                  )),
                ]
              : null}
            {map.grid_type === "hex"
              ? Array.from({ length: rows }).flatMap((_, r) =>
                  Array.from({ length: cols }).map((__, c) => {
                    const p = cellToPixel(grid, c, r);
                    return (
                      <polygon
                        key={`hex${c}-${r}`}
                        points={hexPoints(p.x, p.y, cellPx)}
                        fill="none"
                        stroke="currentColor"
                        strokeOpacity={0.22}
                      />
                    );
                  }),
                )
              : null}

            {fog.map((cell) => {
              const p = cellToPixel(grid, cell.x, cell.y);
              return (
                <rect
                  key={`fog${cell.x},${cell.y}`}
                  x={p.x - cellPx / 2}
                  y={p.y - cellPx / 2}
                  width={cellPx}
                  height={cellPx}
                  fill="black"
                  fillOpacity={isGm ? 0.55 : 1}
                />
              );
            })}

            {tool === "measure" && measureFrom && cursorCell
              ? (() => {
                  const a = cellToPixel(grid, measureFrom.x, measureFrom.y);
                  const b = cellToPixel(grid, cursorCell.x, cursorCell.y);
                  return (
                    <g>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke="currentColor"
                        strokeWidth={3}
                        strokeDasharray="8 6"
                      />
                      <circle cx={a.x} cy={a.y} r={5} fill="currentColor" />
                      <circle cx={b.x} cy={b.y} r={5} fill="currentColor" />
                    </g>
                  );
                })()
              : null}
          </svg>

          {objects.map((object) => {
            const character = characters.find((c) => c.id === object.character_id) ?? null;
            const objectData =
              object.data && typeof object.data === "object" && !Array.isArray(object.data)
                ? object.data
                : null;
            const entityId =
              objectData && typeof objectData["entity_id"] === "string"
                ? objectData["entity_id"]
                : null;
            const npc = character
              ? null
              : npcs.find((candidate) => candidate.id === entityId) ??
                npcs.find((candidate) => candidate.name === object.label) ??
                null;
            const dragging = drag?.id === object.id;
            const base = dragging
              ? { x: drag.x, y: drag.y }
              : cellToPixel(grid, Number(object.x), Number(object.y));
            const dimensions = tokenDimensions(grid, Number(object.size));
            const tokenWidth = dimensions.width;
            const tokenHeight = dimensions.height;
            const tokenSize = dimensions.diameter;
            const hiddenForPlayers = object.hidden;
            const movable = canMove(object) && tool === "move";
            return (
              <div
                key={object.id}
                className="absolute flex items-center justify-center"
                style={{
                  left: base.x - tokenWidth / 2,
                  top: base.y - tokenHeight / 2,
                  width: tokenWidth,
                  height: tokenHeight,
                  cursor: movable ? "grab" : "default",
                  zIndex: dragging ? 20 : 10,
                }}
                onPointerDown={(event) => {
                  if (tool !== "move") return;
                  event.stopPropagation();
                  onSelect(object.id);
                  if (!movable) return;
                  const p = toImage(event.clientX, event.clientY);
                  setDrag({ id: object.id, x: p.x, y: p.y });
                }}
              >
                <MapToken
                  object={object}
                  character={character}
                  fallbackImagePath={npc?.image_url ?? null}
                  sizePx={tokenSize}
                  selected={selectedId === object.id}
                  dimmed={hiddenForPlayers}
                  use3d={show3d}
                />
                <div className="pointer-events-none absolute -bottom-5 left-1/2 -translate-x-1/2 rounded bg-background/80 px-1 text-[10px] whitespace-nowrap">
                  {object.label || character?.name || "Token"}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
