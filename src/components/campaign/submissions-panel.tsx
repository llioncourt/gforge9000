import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useT } from "@/i18n/hooks";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { CAMPAIGN_VIDEO_TYPES, campaignVideoTypeLabel, type CampaignVideoType } from "@/lib/campaign-intro";
import {
  SUBMISSION_ACCEPT,
  SUBMISSION_KINDS,
  approveSubmission,
  deleteSubmission,
  listSubmissions,
  submissionUrl,
  submitContent,
  validateSubmissionFile,
  type CampaignSubmission,
  type SubmissionKind,
} from "@/lib/campaign-submissions";
import { formatBytes } from "@/lib/assets";

type Member = { user_id: string; display_name: string };

export function SubmissionsPanel({
  campaignId,
  isGm,
  isProducer,
  userId,
  members,
}: {
  campaignId: string;
  isGm: boolean;
  isProducer: boolean;
  userId: string | undefined;
  members: Member[];
}) {
  const { t } = useT("campaigns");
  const { t: tc } = useT("common");
  const { t: tMedia } = useT("media");
  const qc = useQueryClient();
  const key = ["campaign-submissions", campaignId];
  const list = useQuery({ queryKey: key, queryFn: () => listSubmissions(campaignId) });
  const [kind, setKind] = useState<SubmissionKind>("video");
  const [title, setTitle] = useState("");
  const [videoType, setVideoType] = useState<CampaignVideoType>("other");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ id: string; url: string } | null>(null);

  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const send = useMutation({
    mutationFn: () => {
      if (!title.trim()) throw new Error(t("submissions.needTitle"));
      if (!file) throw new Error(t("submissions.drop"));
      return submitContent({ campaignId, kind, title, videoType, file });
    },
    onSuccess: () => {
      setTitle("");
      setFile(null);
      toast.success(t("submissions.sent"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const approve = useMutation({
    mutationFn: async (row: CampaignSubmission) => {
      const { importSoundtrackArchive } = await import("@/components/campaign/soundtrack-panel");
      const tm = tMedia as unknown as (k: string, o?: Record<string, unknown>) => string;
      await approveSubmission(row, (cid, f) => importSoundtrackArchive(cid, f, tm));
    },
    onSuccess: () => {
      toast.success(t("submissions.approved"));
      refresh();
      for (const k of ["campaign-videos", "campaign-sound-fx", "campaign-soundtrack", "assets"])
        qc.invalidateQueries({ queryKey: [k] });
      qc.invalidateQueries();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteSubmission,
    onSuccess: () => {
      toast.success(t("submissions.deleted"));
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const nameOf = (id: string) => members.find((m) => m.user_id === id)?.display_name ?? "—";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("submissions.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {isGm ? t("submissions.gmIntro") : t("submissions.intro")}
        </p>
      </div>

      {isProducer ? (
        <div className="panel space-y-4 p-4">
          <h3 className="font-medium">{t("submissions.send")}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("submissions.kind")}</Label>
              <Select
                value={kind}
                onValueChange={(v) => {
                  setKind(v as SubmissionKind);
                  setFile(null);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SUBMISSION_KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`submissions.kinds.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sub-title">{t("submissions.titleLabel")}</Label>
              <Input id="sub-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            {kind === "video" ? (
              <div className="space-y-2">
                <Label>{t("submissions.videoType")}</Label>
                <Select value={videoType} onValueChange={(v) => setVideoType(v as CampaignVideoType)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPAIGN_VIDEO_TYPES.map((v) => (
                      <SelectItem key={v} value={v}>
                        {campaignVideoTypeLabel(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>
          <FileDropzone
            accept={SUBMISSION_ACCEPT[kind]}
            label={file ? file.name : t("submissions.drop")}
            loading={send.isPending}
            loadingLabel={t("submissions.sending")}
            onFiles={(files) => {
              const f = files[0];
              if (!f) return;
              const err = validateSubmissionFile(kind, f);
              if (err) return toast.error(err);
              setFile(f);
              if (!title.trim()) setTitle(f.name.replace(/\.[^.]+$/, ""));
            }}
          />
          <Button onClick={() => send.mutate()} disabled={send.isPending || !file || !title.trim()}>
            {t("submissions.submit")}
          </Button>
        </div>
      ) : null}

      <div className="panel divide-y divide-border">
        {list.isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-3 p-4">
              <div className="space-y-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-8 w-40" />
            </div>
          ))
        ) : (list.data ?? []).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">{t("submissions.empty")}</p>
        ) : (
          (list.data ?? []).map((row) => (
            <div key={row.id} className="space-y-3 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-medium">{row.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {t(`submissions.kinds.${row.kind}`)} · {formatBytes(row.byte_size)} ·{" "}
                    {t("submissions.by", { name: nameOf(row.submitted_by) })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {row.kind !== "soundtrack" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () =>
                        setPreview(
                          preview?.id === row.id
                            ? null
                            : { id: row.id, url: await submissionUrl(row.storage_path) },
                        )
                      }
                    >
                      <Eye className="mr-1 h-4 w-4" />
                      {t("submissions.preview")}
                    </Button>
                  ) : null}
                  {isGm ? (
                    <Button size="sm" onClick={() => approve.mutate(row)} disabled={approve.isPending}>
                      <Check className="mr-1 h-4 w-4" />
                      {t("submissions.approve")}
                    </Button>
                  ) : null}
                  {isGm || row.submitted_by === userId ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={t("submissions.delete")}
                          disabled={remove.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("submissions.deleteTitle")}</AlertDialogTitle>
                          <AlertDialogDescription>{t("submissions.deleteBody")}</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{tc("actions.cancel")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => remove.mutate(row)}>
                            {t("submissions.delete")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : null}
                </div>
              </div>
              {preview?.id === row.id ? (
                row.kind === "video" ? (
                  <video src={preview.url} controls className="w-full max-w-xl rounded-md" />
                ) : row.kind === "image" ? (
                  <img src={preview.url} alt={row.title} className="max-h-80 rounded-md" />
                ) : (
                  <audio src={preview.url} controls className="w-full max-w-xl" />
                )
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
