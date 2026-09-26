import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/i18n/hooks";
import { getVoiceKeyStatus, getVoices, speakCharacter } from "@/lib/tts.functions";

/** Character voice: pick one of your own voices, then hear lines in it. */
export function VoicePanel({
  characterId,
  voiceId,
  onChange,
}: {
  characterId: string;
  voiceId: string | null;
  onChange: (v: { voice_id: string | null; voice_name: string | null }) => void;
}) {
  const { t } = useT("characters");
  const status = useQuery({ queryKey: ["voice-key"], queryFn: useServerFn(getVoiceKeyStatus) });
  const fetchVoices = useServerFn(getVoices);
  const voices = useQuery({
    queryKey: ["voices"],
    queryFn: () => fetchVoices(),
    enabled: status.data?.hasKey === true,
  });
  const speakFn = useServerFn(speakCharacter);
  const [text, setText] = useState("");
  const speak = useMutation({
    mutationFn: () => speakFn({ data: { characterId, text } }),
    onSuccess: (r) => void new Audio(`data:${r.mime};base64,${r.audio_base64}`).play(),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <Label className="flex items-center gap-2">
        <Volume2 className="size-4" /> {t("voice.title")}
      </Label>
      {status.data && !status.data.hasKey ? (
        <p className="text-xs text-muted-foreground">{t("voice.needKey")}</p>
      ) : (
        <>
          <Select
            value={voiceId ?? ""}
            onValueChange={(id) =>
              onChange({ voice_id: id, voice_name: voices.data?.find((v) => v.voice_id === id)?.name ?? null })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder={t("voice.pick")} />
            </SelectTrigger>
            <SelectContent>
              {(voices.data ?? []).map((v) => (
                <SelectItem key={v.voice_id} value={v.voice_id}>
                  {v.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Textarea
            value={text}
            maxLength={2500}
            rows={2}
            placeholder={t("voice.linePlaceholder")}
            onChange={(e) => setText(e.target.value)}
          />
          <Button
            size="sm"
            disabled={!voiceId || !text.trim() || speak.isPending}
            onClick={() => speak.mutate()}
          >
            {speak.isPending && <Loader2 className="mr-1 size-4 animate-spin" />}
            {t("voice.speak")}
          </Button>
        </>
      )}
    </div>
  );
}
