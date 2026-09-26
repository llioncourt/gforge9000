import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/hooks";
import { getVoiceKeyStatus, removeVoiceKey, saveVoiceKey } from "@/lib/tts.functions";

/** Each person's own ElevenLabs key, so voices spend their credits. */
export function VoiceKeySection() {
  const { t } = useT("settings");
  const qc = useQueryClient();
  const status = useQuery({ queryKey: ["voice-key"], queryFn: useServerFn(getVoiceKeyStatus) });
  const saveFn = useServerFn(saveVoiceKey);
  const removeFn = useServerFn(removeVoiceKey);
  const [key, setKey] = useState("");
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["voice-key"] });
    void qc.invalidateQueries({ queryKey: ["voices"] });
  };
  const save = useMutation({
    mutationFn: () => saveFn({ data: { apiKey: key } }),
    onSuccess: () => {
      setKey("");
      toast.success(t("voice.saved"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({ mutationFn: () => removeFn(), onSuccess: refresh });
  return (
    <div className="space-y-2 rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold">{t("voice.title")}</h3>
      <p className="text-xs text-muted-foreground">{t("voice.description")}</p>
      {status.data?.hasKey ? (
        <div className="flex items-center justify-between">
          <span className="text-xs text-primary">{t("voice.connected")}</span>
          <Button size="sm" variant="outline" onClick={() => remove.mutate()} disabled={remove.isPending}>
            {t("voice.remove")}
          </Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Input type="password" value={key} placeholder={t("voice.placeholder")} onChange={(e) => setKey(e.target.value)} />
          <Button size="sm" onClick={() => save.mutate()} disabled={key.trim().length < 10 || save.isPending}>
            {t("voice.save")}
          </Button>
        </div>
      )}
    </div>
  );
}
