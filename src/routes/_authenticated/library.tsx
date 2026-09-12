import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createLibraryEntry, deleteLibraryEntry, listLibrary } from "@/lib/api";
import { download } from "@/lib/portable";

const KINDS = [
  "advantage",
  "disadvantage",
  "perk",
  "quirk",
  "skill",
  "technique",
  "spell",
  "equipment",
  "language",
  "culture",
  "custom",
] as const;

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({
    meta: [
      { title: "Library — Universal Character Forge" },
      {
        name: "description",
        content:
          "Custom traits, skills and equipment you can reuse across characters and campaigns.",
      },
      { property: "og:title", content: "Library — Universal Character Forge" },
      { property: "og:description", content: "Reusable custom content with source provenance." },
    ],
  }),
  component: LibraryPage,
});

function LibraryPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["library"], queryFn: listLibrary });
  const [search, setSearch] = useState("");
  const [kindFilter, setKindFilter] = useState("all");
  const [open, setOpen] = useState(false);

  const [form, setForm] = useState({
    name: "",
    kind: "advantage",
    category: "",
    points: "0",
    notes: "",
    tags: "",
    sourceLabel: "",
    sourceEdition: "",
    sourcePage: "",
    isPublic: false,
  });

  const create = useMutation({
    mutationFn: () =>
      createLibraryEntry({
        name: form.name,
        kind: form.kind,
        category: form.category || null,
        base_points: Number(form.points) || 0,
        summary: form.notes || null,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        data: {},
        source_label: form.sourceLabel || "User created",
        source_edition: form.sourceEdition || null,
        source_page: form.sourcePage || null,
        source_type: "user",
        visibility: form.isPublic ? "public" : "private",
      } as never),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      toast.success("Library entry created.");
      setOpen(false);
      setForm({ ...form, name: "", notes: "", points: "0", tags: "" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteLibraryEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["library"] });
      toast.success("Entry removed.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = useMemo(
    () =>
      (data ?? []).filter(
        (e) =>
          (kindFilter === "all" || e.kind === kindFilter) &&
          `${e.name} ${e.category ?? ""}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [data, kindFilter, search],
  );

  return (
    <div>
      <PageHeader
        title="Library"
        description="Your own traits, skills and gear — with provenance fields ready for future licensed packs."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() =>
                download("library-export.json", JSON.stringify(data ?? [], null, 2))
              }
            >
              <Download className="mr-2 h-4 w-4" /> Export JSON
            </Button>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" /> New entry
                </Button>
              </DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>New library entry</DialogTitle>
                  <DialogDescription>
                    Enter your own content only. Do not paste text you are not licensed to
                    reproduce.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Name">
                      <Input
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                      />
                    </Field>
                    <Field label="Kind">
                      <Select
                        value={form.kind}
                        onValueChange={(v) => setForm({ ...form, kind: v })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {KINDS.map((k) => (
                            <SelectItem key={k} value={k}>
                              {k}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                    <Field label="Category">
                      <Input
                        value={form.category}
                        onChange={(e) => setForm({ ...form, category: e.target.value })}
                      />
                    </Field>
                    <Field label="Base points">
                      <Input
                        type="number"
                        value={form.points}
                        onChange={(e) => setForm({ ...form, points: e.target.value })}
                      />
                    </Field>
                  </div>
                  <Field label="Notes">
                    <Textarea
                      rows={3}
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    />
                  </Field>
                  <Field label="Tags (comma separated)">
                    <Input
                      value={form.tags}
                      onChange={(e) => setForm({ ...form, tags: e.target.value })}
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="Source label">
                      <Input
                        value={form.sourceLabel}
                        onChange={(e) => setForm({ ...form, sourceLabel: e.target.value })}
                      />
                    </Field>
                    <Field label="Edition">
                      <Input
                        value={form.sourceEdition}
                        onChange={(e) => setForm({ ...form, sourceEdition: e.target.value })}
                      />
                    </Field>
                    <Field label="Page ref">
                      <Input
                        value={form.sourcePage}
                        onChange={(e) => setForm({ ...form, sourcePage: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={() => create.mutate()} disabled={!form.name || create.isPending}>
                    Create entry
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-3">
        <Input
          className="max-w-xs"
          placeholder="Search library…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={kindFilter} onValueChange={setKindFilter}>
          <SelectTrigger className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {k}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-[132px] w-full rounded-lg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="panel p-10 text-center text-sm text-muted-foreground">
          No library entries match.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((e) => {
            return (
              <div key={e.id} className="panel flex flex-col p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-medium">{e.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {e.kind}
                      {e.category ? ` · ${e.category}` : ""}
                    </p>
                  </div>
                  <span className="stat-value text-sm">{e.base_points}</span>
                </div>
                {e.summary ? (
                  <p className="mt-2 line-clamp-3 text-sm text-muted-foreground">{e.summary}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-1">
                  {(e.tags ?? []).map((t) => (
                    <Badge key={t} variant="outline" className="text-[10px]">
                      {t}
                    </Badge>
                  ))}
                </div>
                <div className="mt-auto flex items-center justify-between pt-3 text-[11px] text-muted-foreground">
                  <span>
                    {e.source_label}
                    {e.source_page ? ` · p.${e.source_page}` : ""} · {e.visibility}
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => remove.mutate(e.id)}
                    aria-label={`Delete ${e.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
