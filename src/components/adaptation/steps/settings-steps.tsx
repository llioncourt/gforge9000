import { Switch } from "@/components/ui/switch";
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
  const set = (patch: Record<string, unknown>) =>
    void patchCreative({ narrative: { ...narrative, ...patch } });

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
  const set = (patch: Record<string, unknown>) =>
    void patchCreative({ comic: { ...comic, ...patch } });

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
  const set = (patch: Record<string, unknown>) =>
    void patchCreative({ movie: { ...movie, ...patch } });

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

export function BookNarrativeStep({ project, patchCreative }: StepProps) {
  const { t } = useT("adaptation");
  const book = project.creative_settings?.book_narrative ?? {};
  const set = (patch: Record<string, unknown>) =>
    void patchCreative({ book_narrative: { ...book, ...patch } });
  const mode = book.length_mode ?? "auto";

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h4 className="font-display text-base font-semibold">{t("bookNarrative.title")}</h4>
        <p className="text-sm text-muted-foreground">{t("bookNarrative.description")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="book-title">{t("bookNarrative.titleLabel")}</Label>
          <Input
            id="book-title"
            defaultValue={book.title ?? ""}
            placeholder={project.name}
            onBlur={(event) => set({ title: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="book-subtitle">{t("bookNarrative.subtitleLabel")}</Label>
          <Input
            id="book-subtitle"
            defaultValue={book.subtitle ?? ""}
            onBlur={(event) => set({ subtitle: event.target.value || null })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="book-language">{t("bookNarrative.languageLabel")}</Label>
          <Input
            id="book-language"
            defaultValue={book.language ?? ""}
            placeholder="en"
            onBlur={(event) => set({ language: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("bookNarrative.lengthLabel")}</Label>
          <Select value={mode} onValueChange={(value) => set({ length_mode: value })}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["auto", "short_story", "novella", "novel"] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`bookNarrative.lengths.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{t("bookNarrative.lengthHint")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="book-chapters">{t("bookNarrative.chapterTargetLabel")}</Label>
          <Input
            id="book-chapters"
            type="number"
            min={1}
            defaultValue={book.chapter_target ?? ""}
            onBlur={(event) =>
              set({ chapter_target: event.target.value ? Number(event.target.value) : null })
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="book-words">{t("bookNarrative.wordTargetLabel")}</Label>
          <Input
            id="book-words"
            type="number"
            min={1}
            defaultValue={book.word_target ?? ""}
            onBlur={(event) =>
              set({ word_target: event.target.value ? Number(event.target.value) : null })
            }
          />
          <p className="text-xs text-muted-foreground">{t("bookNarrative.targetsHint")}</p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("bookNarrative.canonNote")}</p>
    </div>
  );
}

export function AdventureModuleStep({ project, patchCreative }: StepProps) {
  const { t } = useT("adaptation");
  const module = project.creative_settings?.adventure_module ?? {};
  const set = (patch: Record<string, unknown>) =>
    void patchCreative({
      adventure_module: {
        ...module,
        game_system: "gurps_4e",
        adaptation_level: "complete_module",
        ...patch,
      },
    });
  const num = (value: string) => (value ? Number(value) : null);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h4 className="font-display text-base font-semibold">{t("adventureModule.title")}</h4>
        <p className="text-sm text-muted-foreground">{t("adventureModule.description")}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="module-title">{t("adventureModule.titleLabel")}</Label>
          <Input
            id="module-title"
            defaultValue={module.title ?? ""}
            placeholder={project.name}
            onBlur={(event) => set({ title: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="module-subtitle">{t("adventureModule.subtitleLabel")}</Label>
          <Input
            id="module-subtitle"
            defaultValue={module.subtitle ?? ""}
            onBlur={(event) => set({ subtitle: event.target.value || null })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="module-language">{t("adventureModule.languageLabel")}</Label>
          <Input
            id="module-language"
            defaultValue={module.language ?? ""}
            placeholder="en"
            onBlur={(event) => set({ language: event.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("adventureModule.systemLabel")}</Label>
          <Input value={t("adventureModule.systemValue")} disabled readOnly />
        </div>
        <div className="space-y-2">
          <Label htmlFor="module-players-min">{t("adventureModule.playersMinLabel")}</Label>
          <Input
            id="module-players-min"
            type="number"
            min={1}
            defaultValue={module.players_min ?? 3}
            onBlur={(event) => set({ players_min: Number(event.target.value) || 1 })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="module-players-max">{t("adventureModule.playersMaxLabel")}</Label>
          <Input
            id="module-players-max"
            type="number"
            min={1}
            defaultValue={module.players_max ?? 5}
            onBlur={(event) => set({ players_max: Number(event.target.value) || 1 })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="module-points">{t("adventureModule.pointsLabel")}</Label>
          <Input
            id="module-points"
            type="number"
            defaultValue={module.starting_points ?? 150}
            onBlur={(event) => set({ starting_points: num(event.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="module-tl">{t("adventureModule.techLevelLabel")}</Label>
          <Input
            id="module-tl"
            type="number"
            min={0}
            max={12}
            defaultValue={module.tech_level ?? ""}
            onBlur={(event) => set({ tech_level: num(event.target.value) })}
          />
        </div>
        <div className="space-y-2">
          <Label>{t("adventureModule.branchingLabel")}</Label>
          <Select
            value={module.branching ?? "standard"}
            onValueChange={(value) => set({ branching: value })}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(["light", "standard", "rich"] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`adventureModule.branchings.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-center justify-between gap-3 rounded-lg border p-3">
          <Label htmlFor="module-stats" className="font-normal">
            {t("adventureModule.statBlocksLabel")}
          </Label>
          <Switch
            id="module-stats"
            checked={module.include_stat_blocks ?? true}
            onCheckedChange={(checked) => set({ include_stat_blocks: checked })}
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("adventureModule.canonNote")}</p>
    </div>
  );
}
