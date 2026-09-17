import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Box,
  Camera,
  Expand,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DEFAULT_MODEL_TRANSFORM,
  DEFAULT_VIEWER_SETTINGS,
  type BackdropMode,
  type CameraView,
  type LightingPreset,
  type MaterialMode,
  type ModelInfo,
  type ViewerApi,
  type ViewerSettings,
  type ModelTransform,
  modelUrl,
  removeModel,
  uploadModel,
  validateModelFile,
} from "@/lib/model3d";
import { useT } from "@/i18n/hooks";

const ModelViewer = lazy(() => import("@/components/character/model-viewer"));

export function useModelUrl(path: string | null | undefined) {
  const query = useQuery({
    queryKey: ["model3d", path ?? "none"],
    queryFn: () => modelUrl(path),
    enabled: !!path,
    staleTime: 1000 * 60 * 30,
  });
  return path ? (query.data ?? null) : null;
}

function ViewerFallback() {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">{label}</span>
        <span className="text-[11px] tabular-nums text-muted-foreground">
          {format ? format(value) : value}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v[0] ?? value)}
        aria-label={label}
      />
    </div>
  );
}

const VIEW_IDS: CameraView[] = ["front", "back", "left", "right", "top", "iso"];

/** Large, interactive viewer: orbit, pan, zoom, shading, lighting, animation and capture. */
export function ModelStageDialog({
  url,
  name,
  open,
  onOpenChange,
  transform = DEFAULT_MODEL_TRANSFORM,
  onTransformChange,
}: {
  url: string;
  name?: string | undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  transform?: ModelTransform;
  onTransformChange?: ((t: ModelTransform) => void) | undefined;
}) {
  const { t } = useT("characters");
  const [settings, setSettings] = useState<ViewerSettings>(DEFAULT_VIEWER_SETTINGS);
  const [info, setInfo] = useState<ModelInfo | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const apiRef = useRef<ViewerApi | null>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  const set = useCallback(
    <K extends keyof ViewerSettings>(key: K, value: ViewerSettings[K]) =>
      setSettings((s) => ({ ...s, [key]: value })),
    [],
  );

  const onApi = useCallback((api: ViewerApi) => {
    apiRef.current = api;
  }, []);
  const onInfo = useCallback((i: ModelInfo) => setInfo(i), []);

  useEffect(() => {
    const handler = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => toast.error(t("sheet.model.fullscreenUnavailable")));
  };

  const capture = () => {
    const data = apiRef.current?.screenshot();
    if (!data) {
      toast.error(t("sheet.model.captureUnavailable"));
      return;
    }
    const a = document.createElement("a");
    a.href = data;
    a.download = `${(name ?? "model").replace(/[^\w-]+/g, "_")}.png`;
    a.click();
    toast.success(t("sheet.model.snapshotSaved"));
  };

  const wrap = (deg: number) => ((deg % 360) + 360) % 360;
  const nudge = (axis: "rx" | "ry" | "rz", by: number) =>
    onTransformChange?.({ ...transform, [axis]: wrap(transform[axis] + by) });

  const dims = useMemo(() => {
    if (!info) return null;
    const f = (n: number) => n.toFixed(2);
    return `${f(info.size.x)} × ${f(info.size.y)} × ${f(info.size.z)}`;
  }, [info]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl p-0">
        <DialogHeader className="px-5 pb-2 pt-4">
          <DialogTitle className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            {name ? t("sheet.model.stageTitleNamed", { name }) : t("sheet.model.stageTitle")}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-0 border-t border-border md:grid-cols-[1fr_17rem]">
          <div
            ref={stageRef}
            className="relative h-[60vh] w-full overflow-hidden bg-muted/20 md:h-[72vh]"
          >
            {open ? (
              <Suspense fallback={<ViewerFallback />}>
                <ModelViewer
                  url={url}
                  stage
                  transform={transform}
                  settings={settings}
                  onInfo={onInfo}
                  onApi={onApi}
                />
              </Suspense>
            ) : null}

            <div className="pointer-events-auto absolute left-3 top-3 flex flex-wrap gap-1 rounded-lg border border-border bg-background/85 p-1 backdrop-blur">
              {VIEW_IDS.map((id) => (
                <Button
                  key={id}
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => apiRef.current?.setView(id)}
                >
                  {t(`sheet.model.views.${id}`)}
                </Button>
              ))}
            </div>

            <div className="absolute bottom-3 left-1/2 flex -translate-x-1/2 flex-wrap items-center justify-center gap-1 rounded-full border border-border bg-background/85 px-2 py-1 backdrop-blur">
              <Button
                size="sm"
                variant={settings.autoRotate ? "secondary" : "ghost"}
                onClick={() => set("autoRotate", !settings.autoRotate)}
              >
                <RotateCw className="mr-1 h-3.5 w-3.5" /> {t("sheet.model.turntable")}
              </Button>
              <Button size="sm" variant="ghost" onClick={capture}>
                <Camera className="mr-1 h-3.5 w-3.5" /> {t("sheet.model.snapshot")}
              </Button>
              <Button size="sm" variant="ghost" onClick={toggleFullscreen}>
                {fullscreen ? (
                  <Minimize2 className="mr-1 h-3.5 w-3.5" />
                ) : (
                  <Maximize2 className="mr-1 h-3.5 w-3.5" />
                )}
                {fullscreen ? t("sheet.model.exit") : t("sheet.model.fullscreen")}
              </Button>
              <span className="hidden px-2 text-[11px] text-muted-foreground sm:inline">
                {t("sheet.model.controlsHint")}
              </span>
            </div>
          </div>

          <div className="border-t border-border md:border-l md:border-t-0">
            <Tabs defaultValue="display">
              <TabsList className="m-2 grid w-[calc(100%-1rem)] grid-cols-3">
                <TabsTrigger value="display" className="text-[11px]">
                  {t("sheet.model.tabs.look")}
                </TabsTrigger>
                <TabsTrigger value="scene" className="text-[11px]">
                  {t("sheet.model.tabs.scene")}
                </TabsTrigger>
                <TabsTrigger value="model" className="text-[11px]">
                  {t("sheet.model.tabs.model")}
                </TabsTrigger>
              </TabsList>

              <ScrollArea className="h-[52vh] md:h-[64vh]">
                <TabsContent value="display" className="space-y-4 px-4 pb-6 pt-1">
                  <Row label={t("sheet.model.shading")}>
                    <Select
                      value={settings.materialMode}
                      onValueChange={(v) => set("materialMode", v as MaterialMode)}
                    >
                      <SelectTrigger className="h-8 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="original">{t("sheet.model.shadingOptions.original")}</SelectItem>
                        <SelectItem value="clay">{t("sheet.model.shadingOptions.clay")}</SelectItem>
                        <SelectItem value="normal">{t("sheet.model.shadingOptions.normal")}</SelectItem>
                        <SelectItem value="xray">{t("sheet.model.shadingOptions.xray")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Row>
                  <Row label={t("sheet.model.wireframe")}>
                    <Switch
                      checked={settings.wireframe}
                      onCheckedChange={(v) => set("wireframe", v)}
                      aria-label={t("sheet.model.wireframe")}
                    />
                  </Row>
                  <Row label={t("sheet.model.lighting")}>
                    <Select
                      value={settings.lighting}
                      onValueChange={(v) => set("lighting", v as LightingPreset)}
                    >
                      <SelectTrigger className="h-8 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="studio">{t("sheet.model.lightingOptions.studio")}</SelectItem>
                        <SelectItem value="dramatic">{t("sheet.model.lightingOptions.dramatic")}</SelectItem>
                        <SelectItem value="noir">{t("sheet.model.lightingOptions.noir")}</SelectItem>
                        <SelectItem value="sunset">{t("sheet.model.lightingOptions.sunset")}</SelectItem>
                        <SelectItem value="flat">{t("sheet.model.lightingOptions.flat")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Row>
                  <Row label={t("sheet.model.backdrop")}>
                    <Select
                      value={settings.backdrop}
                      onValueChange={(v) => set("backdrop", v as BackdropMode)}
                    >
                      <SelectTrigger className="h-8 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="graphite">{t("sheet.model.backdropOptions.graphite")}</SelectItem>
                        <SelectItem value="ink">{t("sheet.model.backdropOptions.ink")}</SelectItem>
                        <SelectItem value="paper">{t("sheet.model.backdropOptions.paper")}</SelectItem>
                        <SelectItem value="void">{t("sheet.model.backdropOptions.void")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </Row>
                  <SliderRow
                    label={t("sheet.model.exposure")}
                    value={settings.exposure}
                    min={0.2}
                    max={2.5}
                    step={0.05}
                    format={(v) => v.toFixed(2)}
                    onChange={(v) => set("exposure", v)}
                  />
                  <SliderRow
                    label={t("sheet.model.lightPower")}
                    value={settings.lightIntensity}
                    min={0.1}
                    max={3}
                    step={0.05}
                    format={(v) => `${v.toFixed(2)}×`}
                    onChange={(v) => set("lightIntensity", v)}
                  />
                </TabsContent>

                <TabsContent value="scene" className="space-y-4 px-4 pb-6 pt-1">
                  <Row label={t("sheet.model.grid")}>
                    <Switch
                      checked={settings.grid}
                      onCheckedChange={(v) => set("grid", v)}
                      aria-label={t("sheet.model.grid")}
                    />
                  </Row>
                  <Row label={t("sheet.model.groundShadow")}>
                    <Switch
                      checked={settings.shadows}
                      onCheckedChange={(v) => set("shadows", v)}
                      aria-label={t("sheet.model.groundShadow")}
                    />
                  </Row>
                  <Row label={t("sheet.model.axes")}>
                    <Switch
                      checked={settings.axes}
                      onCheckedChange={(v) => set("axes", v)}
                      aria-label={t("sheet.model.axes")}
                    />
                  </Row>
                  <Row label={t("sheet.model.boundingBox")}>
                    <Switch
                      checked={settings.boundingBox}
                      onCheckedChange={(v) => set("boundingBox", v)}
                      aria-label={t("sheet.model.boundingBox")}
                    />
                  </Row>
                  <Separator />
                  <SliderRow
                    label={t("sheet.model.turntableSpeed")}
                    value={settings.autoRotateSpeed}
                    min={0.2}
                    max={6}
                    step={0.1}
                    format={(v) => `${v.toFixed(1)}×`}
                    onChange={(v) => set("autoRotateSpeed", v)}
                  />
                  <SliderRow
                    label={t("sheet.model.fov")}
                    value={settings.fov}
                    min={20}
                    max={80}
                    step={1}
                    format={(v) => `${v}°`}
                    onChange={(v) => set("fov", v)}
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    className="w-full"
                    onClick={() => setSettings(DEFAULT_VIEWER_SETTINGS)}
                  >
                    {t("sheet.model.resetViewSettings")}
                  </Button>
                </TabsContent>

                <TabsContent value="model" className="space-y-4 px-4 pb-6 pt-1">
                  {onTransformChange ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {t("sheet.model.fixOrientation")}
                      </p>
                      {(
                        [
                          ["rx", "tilt"],
                          ["ry", "turn"],
                          ["rz", "roll"],
                        ] as const
                      ).map(([axis, labelKey]) => (
                        <div key={axis} className="flex items-center gap-1">
                          <span className="w-10 text-[11px] text-muted-foreground">
                            {t(`sheet.model.axisLabels.${labelKey}`)}
                          </span>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={t("sheet.model.rotateMinus90Aria", { axis: t(`sheet.model.axisLabels.${labelKey}`) })}
                            onClick={() => nudge(axis, -90)}
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            aria-label={t("sheet.model.rotatePlus90Aria", { axis: t(`sheet.model.axisLabels.${labelKey}`) })}
                            onClick={() => nudge(axis, 90)}
                          >
                            <RotateCw className="h-3.5 w-3.5" />
                          </Button>
                          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
                            {transform[axis]}°
                          </span>
                        </div>
                      ))}
                      <SliderRow
                        label={t("sheet.model.modelScale")}
                        value={transform.scale}
                        min={0.25}
                        max={4}
                        step={0.05}
                        format={(v) => `${v.toFixed(2)}×`}
                        onChange={(v) =>
                          onTransformChange({ ...transform, scale: Number(v.toFixed(2)) })
                        }
                      />
                      <Button
                        size="sm"
                        variant="ghost"
                        className="w-full"
                        onClick={() => onTransformChange(DEFAULT_MODEL_TRANSFORM)}
                      >
                        {t("sheet.model.resetOrientation")}
                      </Button>
                      <Separator />
                    </div>
                  ) : null}

                  {info && info.animations.length ? (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {t("sheet.model.animation")}
                      </p>
                      <Select
                        value={settings.animation ?? "none"}
                        onValueChange={(v) => set("animation", v === "none" ? null : v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t("sheet.model.none")}</SelectItem>
                          {info.animations.map((a) => (
                            <SelectItem key={a} value={a}>
                              {a}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={settings.animationPlaying ? "secondary" : "ghost"}
                          onClick={() => set("animationPlaying", !settings.animationPlaying)}
                          disabled={!settings.animation}
                        >
                          {settings.animationPlaying ? (
                            <Pause className="mr-1 h-3.5 w-3.5" />
                          ) : (
                            <Play className="mr-1 h-3.5 w-3.5" />
                          )}
                          {settings.animationPlaying ? t("sheet.model.pause") : t("sheet.model.play")}
                        </Button>
                      </div>
                      <SliderRow
                        label={t("sheet.model.speed")}
                        value={settings.animationSpeed}
                        min={0.1}
                        max={3}
                        step={0.1}
                        format={(v) => `${v.toFixed(1)}×`}
                        onChange={(v) => set("animationSpeed", v)}
                      />
                      <Separator />
                    </div>
                  ) : null}

                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                      {t("sheet.model.stats")}
                    </p>
                    {info ? (
                      <dl className="space-y-1 text-[11px] text-muted-foreground">
                        <Row label={t("sheet.model.meshes")}>
                          <span className="tabular-nums">{info.meshes}</span>
                        </Row>
                        <Row label={t("sheet.model.triangles")}>
                          <span className="tabular-nums">{info.triangles.toLocaleString()}</span>
                        </Row>
                        <Row label={t("sheet.model.vertices")}>
                          <span className="tabular-nums">{info.vertices.toLocaleString()}</span>
                        </Row>
                        <Row label={t("sheet.model.materials")}>
                          <span className="tabular-nums">{info.materials}</span>
                        </Row>
                        <Row label={t("sheet.model.clips")}>
                          <span className="tabular-nums">{info.animations.length}</span>
                        </Row>
                        <Row label={t("sheet.model.bounds")}>
                          <span className="tabular-nums">{dims}</span>
                        </Row>
                      </dl>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">{t("sheet.model.loadingModel")}</p>
                    )}
                  </div>
                </TabsContent>
              </ScrollArea>
            </Tabs>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function ModelPanel({
  characterId,
  name,
  path,
  readOnly = false,
  onChange,
  transform = DEFAULT_MODEL_TRANSFORM,
  onTransformChange,
}: {
  characterId: string;
  name?: string | undefined;
  path: string | null;
  readOnly?: boolean;
  onChange: (path: string | null) => void;
  transform?: ModelTransform;
  onTransformChange?: ((t: ModelTransform) => void) | undefined;
}) {
  const { t } = useT("characters");
  const { t: tc } = useT("common");
  const signed = useModelUrl(path);
  const [mounted, setMounted] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  const upload = useMutation({
    mutationFn: async (file: File) => {
      const invalid = validateModelFile(file);
      if (invalid) throw new Error(invalid);
      const next = await uploadModel(characterId, file);
      if (path) await removeModel(path).catch(() => undefined);
      return next;
    },
    onSuccess: (next) => {
      onChange(next);
      toast.success(t("sheet.model.updated"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const clear = useMutation({
    mutationFn: async () => {
      if (path) await removeModel(path).catch(() => undefined);
    },
    onSuccess: () => {
      onChange(null);
      toast.success(t("sheet.model.removed"));
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      <div className="group relative aspect-square w-full overflow-hidden rounded-md border border-border bg-muted/30">
        {signed && mounted ? (
          <>
            <Suspense fallback={<ViewerFallback />}>
              <ModelViewer url={signed} transform={transform} />
            </Suspense>
            <button
              type="button"
              aria-label={t("sheet.model.openViewerAria")}
              onClick={() => setStageOpen(true)}
              className="absolute inset-0 flex items-end justify-end p-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="no-print flex items-center gap-1 rounded-full border border-border bg-background/80 px-2 py-1 text-[11px] text-muted-foreground opacity-0 backdrop-blur transition group-hover:opacity-100">
                <Expand className="h-3 w-3" /> {t("sheet.model.expand")}
              </span>
            </button>
          </>
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
            <Box className="h-8 w-8 opacity-50" aria-hidden="true" />
            <span className="text-xs">{t("sheet.model.noModel")}</span>
          </div>
        )}
      </div>

      {signed ? (
        <ModelStageDialog
          url={signed}
          name={name}
          open={stageOpen}
          onOpenChange={setStageOpen}
          transform={transform}
          onTransformChange={readOnly ? undefined : onTransformChange}
        />
      ) : null}

      {readOnly ? null : (
        <div className="no-print space-y-2">
          <FileDropzone
            accept=".glb,model/gltf-binary"
            compact
            label={t("sheet.model.uploadLabel")}
            hint={t("sheet.model.uploadHint")}
            onFiles={(files) => {
              const file = files[0];
              if (file) upload.mutate(file);
            }}
          />
          <div className="flex gap-2">
            {upload.isPending ? (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> {tc("states.uploading")}
              </span>
            ) : (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Box className="h-3.5 w-3.5" /> {t("sheet.model.visibleToCampaign")}
              </span>
            )}
            {path ? (
              <Button
                size="sm"
                variant="ghost"
                className="ml-auto"
                onClick={() => clear.mutate()}
                disabled={clear.isPending}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" /> {tc("actions.remove")}
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
