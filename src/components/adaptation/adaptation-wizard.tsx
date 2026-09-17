import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useT } from "@/i18n/hooks";
import { updateAdaptation, type AdaptationProject, type CreativeSettings } from "@/lib/adaptation/api";
import { WIZARD_STEPS, type WizardStep } from "@/lib/adaptation/types";
import { SourceStep, ScopeStep } from "@/components/adaptation/steps/scope-steps";
import { ScanStep } from "@/components/adaptation/steps/scan-step";
import { ReconstructionStep } from "@/components/adaptation/steps/reconstruction-step";
import { TimelineStep } from "@/components/adaptation/steps/timeline-step";
import { CanonStep } from "@/components/adaptation/steps/canon-step";
import { AssetsStep } from "@/components/adaptation/steps/assets-step";
import { ComicStep, MovieStep, NarrativeStep } from "@/components/adaptation/steps/settings-steps";
import { GenerateStep, ValidationStep } from "@/components/adaptation/steps/generate-steps";

export interface StepProps {
  project: AdaptationProject;
  patch: (patch: Partial<AdaptationProject>) => Promise<void>;
  patchCreative: (patch: CreativeSettings) => Promise<void>;
  /** Lets a step send the user straight to the place that fixes an issue. */
  goTo: (step: WizardStep) => void;
}

export function AdaptationWizard({
  project,
  onClose,
}: {
  project: AdaptationProject;
  onClose: () => void;
}) {
  const { t } = useT("adaptation");
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState<AdaptationProject>(project);
  const [step, setStep] = useState<WizardStep>(project.wizard_step ?? "source");

  const save = useMutation({
    mutationFn: (patch: Partial<AdaptationProject>) => updateAdaptation(current.id, patch),
    onSuccess: (next) => {
      setCurrent(next);
      queryClient.invalidateQueries({ queryKey: ["adaptations", next.campaign_id] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const patch = async (value: Partial<AdaptationProject>) => {
    await save.mutateAsync(value);
  };

  const patchCreative = async (value: CreativeSettings) => {
    await save.mutateAsync({
      creative_settings: {
        ...current.creative_settings,
        ...value,
        comic: { ...current.creative_settings?.comic, ...value.comic },
        movie: { ...current.creative_settings?.movie, ...value.movie },
        narrative: { ...current.creative_settings?.narrative, ...value.narrative },
      },
    });
  };

  const index = WIZARD_STEPS.indexOf(step);
  const goto = async (next: WizardStep) => {
    setStep(next);
    await patch({ wizard_step: next });
  };

  const props: StepProps = {
    project: current,
    patch,
    patchCreative,
    goTo: (next) => void goto(next),
  };

  return (
    <div className="space-y-6">
      <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ChevronLeft className="mr-1 h-4 w-4" /> {t("wizard.backToList")}
        </Button>
        <div className="flex-1">
          <h3 className="font-display text-base font-semibold">{current.name}</h3>
          <p className="text-xs text-muted-foreground">
            {t("wizard.stepOf", { current: index + 1, total: WIZARD_STEPS.length })} ·{" "}
            {t("wizard.targetsLabel")}{" "}
            {[
              current.target_comic ? t("wizard.targetComic") : null,
              current.target_movie ? t("wizard.targetMovie") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {t(`panel.status.${current.status}`)}
        </Badge>
      </div>

      <div className="space-y-3">
        <Progress value={((index + 1) / WIZARD_STEPS.length) * 100} />
        <div className="flex flex-wrap gap-2">
          {WIZARD_STEPS.map((value, position) => (
            <Button
              key={value}
              size="sm"
              variant={value === step ? "default" : position < index ? "secondary" : "outline"}
              onClick={() => void goto(value)}
            >
              {t(`wizard.steps.${value}`)}
            </Button>
          ))}
        </div>
      </div>

      <div className="panel p-4">
        {step === "source" ? <SourceStep {...props} /> : null}
        {step === "scope" ? <ScopeStep {...props} /> : null}
        {step === "scan" ? <ScanStep {...props} /> : null}
        {step === "reconstruction" ? <ReconstructionStep {...props} /> : null}
        {step === "timeline" ? <TimelineStep {...props} /> : null}
        {step === "canon" ? <CanonStep {...props} /> : null}
        {step === "assets" ? <AssetsStep {...props} /> : null}
        {step === "narrative" ? <NarrativeStep {...props} /> : null}
        {step === "comic" ? <ComicStep {...props} /> : null}
        {step === "movie" ? <MovieStep {...props} /> : null}
        {step === "validation" ? <ValidationStep {...props} /> : null}
        {step === "generate" ? <GenerateStep {...props} /> : null}
      </div>

      <div className="flex items-center justify-between gap-3">
        <Button
          variant="outline"
          disabled={index === 0}
          onClick={() => void goto(WIZARD_STEPS[Math.max(0, index - 1)]!)}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> {t("wizard.back")}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t("wizard.saveAndClose")}
        </Button>
        <Button
          disabled={index === WIZARD_STEPS.length - 1}
          onClick={() => void goto(WIZARD_STEPS[Math.min(WIZARD_STEPS.length - 1, index + 1)]!)}
        >
          {t("wizard.next")} <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
