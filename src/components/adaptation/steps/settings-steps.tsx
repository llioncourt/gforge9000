import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/i18n/hooks";
import type { StepProps } from "@/components/adaptation/adaptation-wizard";

export function NarrativeStep({ project, patchCreative }: StepProps) {
  const { t } = useT("adaptation");
  const narrative = project.creative_settings?.narrative ?? {};
  const set = (patch: Record<string, unknown>) => void patchCreative({ narrative: { ...narrative, ...patch } });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h4 className="font-display text-base font-semibold">{t("narrative.title")}</h4>
        <p className="text-sm text-muted-foreground">{t("narrative.description")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="narrative-tone">{t("narrative.toneLabel")}</Label>
          <Input
            id="narrative-tone"
            defaultValue={narrative.tone ?? ""}
            placeholder={t("narrative.tonePlaceholder")}
            onBlur={(event) => set({ tone: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="narrative-pov">{t("narrative.povLabel")}</Label>
          <Input
            id="narrative-pov"
            defaultValue={narrative.pov ?? ""}
            placeholder={t("narrative.povPlaceholder")}
            onBlur={(event) => set({ pov: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="narrative-audience">{t("narrative.audienceLabel")}</Label>
          <Input
            id="narrative-audience"
            defaultValue={narrative.audience ?? ""}
            placeholder={t("narrative.audiencePlaceholder")}
            onBlur={(event) => set({ audience: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="narrative-max-scenes">{t("narrative.maxScenesLabel")}</Label>
          <Input
            id="narrative-max-scenes"
            type="number"
            defaultValue={narrative.max_scenes ?? ""}
            onBlur={(event) =>
              set({ max_scenes: event.target.value ? Number(event.target.value) : undefined })
            }
          />
          <p className="text-xs text-muted-foreground">{t("narrative.maxScenesHint")}</p>
        </div>
      </div>
    </div>
  );
}

export function ComicStep({ project, patchCreative }: StepProps) {
  const { t } = useT("adaptation");
  const comic = project.creative_settings?.comic ?? {};
  const set = (patch: Record<string, unknown>) => void patchCreative({ comic: { ...comic, ...patch } });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h4 className="font-display text-base font-semibold">{t("comic.title")}</h4>
        <p className="text-sm text-muted-foreground">{t("comic.description")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="comic-series">{t("comic.seriesTitleLabel")}</Label>
          <Input
            id="comic-series"
            defaultValue={comic.series_title ?? ""}
            onBlur={(event) => set({ series_title: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="comic-subtitle">{t("comic.seriesSubtitleLabel")}</Label>
          <Input
            id="comic-subtitle"
            defaultValue={comic.series_subtitle ?? ""}
            onBlur={(event) => set({ series_subtitle: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="comic-issue-number">{t("comic.issueNumberLabel")}</Label>
          <Input
            id="comic-issue-number"
            type="number"
            defaultValue={comic.issue_number ?? 1}
            onBlur={(event) => set({ issue_number: Number(event.target.value) || 1 })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="comic-issue-title">{t("comic.issueTitleLabel")}</Label>
          <Input
            id="comic-issue-title"
            defaultValue={comic.issue_title ?? ""}
            onBlur={(event) => set({ issue_title: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="comic-pages">{t("comic.pageTargetLabel")}</Label>
          <Input
            id="comic-pages"
            type="number"
            defaultValue={comic.page_target ?? ""}
            onBlur={(event) =>
              set({ page_target: event.target.value ? Number(event.target.value) : null })
            }
          />
          <p className="text-xs text-muted-foreground">{t("comic.pageTargetHint")}</p>
        </div>
        <div className="space-y-2">
          <Label>{t("comic.densityLabel")}</Label>
          <Select
            value={comic.density ?? "standard"}
            onValueChange={(value) => set({ density: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["sparse", "standard", "dense"] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`comic.densities.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="comic-genre">{t("comic.genreLabel")}</Label>
          <Input
            id="comic-genre"
            defaultValue={(comic.genre ?? []).join(", ")}
            onBlur={(event) =>
              set({
                genre: event.target.value
                  .split(",")
                  .map((value) => value.trim())
                  .filter(Boolean),
              })
            }
          />
          <p className="text-xs text-muted-foreground">{t("comic.genreHint")}</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="comic-art">{t("comic.artDirectionLabel")}</Label>
        <Textarea
          id="comic-art"
          rows={4}
          defaultValue={comic.art_direction ?? ""}
          placeholder={t("comic.artDirectionPlaceholder")}
          onBlur={(event) => set({ art_direction: event.target.value })}
        />
      </div>
    </div>
  );
}

export function MovieStep({ project, patchCreative }: StepProps) {
  const { t } = useT("adaptation");
  const movie = project.creative_settings?.movie ?? {};
  const set = (patch: Record<string, unknown>) => void patchCreative({ movie: { ...movie, ...patch } });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h4 className="font-display text-base font-semibold">{t("movie.title")}</h4>
        <p className="text-sm text-muted-foreground">{t("movie.description")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="movie-title">{t("movie.titleLabel")}</Label>
          <Input
            id="movie-title"
            defaultValue={movie.title ?? ""}
            onBlur={(event) => set({ title: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="movie-runtime">{t("movie.runtimeLabel")}</Label>
          <Input
            id="movie-runtime"
            type="number"
            defaultValue={movie.runtime_target_minutes ?? ""}
            onBlur={(event) =>
              set({
                runtime_target_minutes: event.target.value ? Number(event.target.value) : null,
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="movie-aspect">{t("movie.aspectRatioLabel")}</Label>
          <Input
            id="movie-aspect"
            defaultValue={movie.aspect_ratio ?? "16:9"}
            onBlur={(event) => set({ aspect_ratio: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="movie-language">{t("movie.languageLabel")}</Label>
          <Input
            id="movie-language"
            defaultValue={movie.language ?? ""}
            onBlur={(event) => set({ language: event.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="movie-logline">{t("movie.loglineLabel")}</Label>
        <Textarea
          id="movie-logline"
          rows={3}
          defaultValue={movie.logline ?? ""}
          onBlur={(event) => set({ logline: event.target.value })}
        />
      </div>
    </div>
  );
}
