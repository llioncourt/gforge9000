import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/app/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { addEntry, createCharacter, deleteCharacter, listCharacters } from "@/lib/api";
import { parsePortable } from "@/lib/portable";
import { FileDropzone } from "@/components/ui/FileDropzone";

export const Route = createFileRoute("/_authenticated/characters/")({
  head: () => ({
    meta: [
      { title: "Characters — Universal Character Forge" },
      {
        name: "description",
        content: "All your player characters and NPCs with point budgets and tech levels.",
      },
      { property: "og:title", content: "Characters — Universal Character Forge" },
      { property: "og:description", content: "Browse, import and create characters." },
    ],
  }),
  component: CharactersPage,
});

function CharactersPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const { data, isLoading } = useQuery({ queryKey: ["characters"], queryFn: listCharacters });

  const create = useMutation({
    mutationFn: () => createCharacter({ name: "Untitled character" }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      navigate({ to: "/characters/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteCharacter(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      toast.success("Character deleted.");
      setPendingDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const importJson = useMutation({
    mutationFn: async (file: File) => {
      const parsed = parsePortable(await file.text());
      const { id: _ignored, ...character } = parsed.character;
      const row = await createCharacter(character);
      for (const entry of parsed.entries) {
        const { id: _entryId, character_id: _cid, ...rest } = entry;
        await addEntry({ ...rest, character_id: row.id, data: rest.data ?? {} } as never);
      }
      return row;
    },
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["characters"] });
      toast.success("Character imported.");
      navigate({ to: "/characters/$id", params: { id: row.id } });
    },
    onError: (e: Error) => toast.error(`Import failed: ${e.message}`),
  });

  const rows = (data ?? []).filter((c) =>
    `${c.name} ${c.concept ?? ""}`.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div>
      <PageHeader
        title="Characters"
        description="Player characters, NPCs and templates you own."
        actions={
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            <Plus className="mr-2 h-4 w-4" /> New character
          </Button>
        }
      />

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_320px]">
        <Input
          placeholder="Filter by name or concept…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <FileDropzone
          accept="application/json,.json"
          compact
          label={
            <span className="flex items-center gap-2 text-sm">
              <Upload className="h-4 w-4" /> Drop a Forge JSON export to import
            </span>
          }
          onFiles={(files) => files[0] && importJson.mutate(files[0])}
        />
      </div>

      <div className="panel overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead className="hidden sm:table-cell">Concept</TableHead>
              <TableHead className="w-20 text-right">Budget</TableHead>
              <TableHead className="hidden w-16 text-right md:table-cell">TL</TableHead>
              <TableHead className="w-24">Status</TableHead>
              <TableHead className="w-12" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              [0, 1, 2, 3].map((i) => (
                <TableRow key={i}>
                  <TableCell colSpan={6}>
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                </TableRow>
              ))
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  No characters yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">
                    <Link to="/characters/$id" params={{ id: c.id }} className="hover:underline">
                      {c.name}
                    </Link>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground sm:table-cell">
                    {c.concept || "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">{c.point_budget}</TableCell>
                  <TableCell className="hidden text-right font-mono md:table-cell">
                    {c.tech_level}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.approved ? "default" : "outline"}>
                      {c.is_npc ? "NPC" : c.approved ? "Approved" : "Draft"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => setPendingDelete({ id: c.id, name: c.name })}
                      aria-label={`Delete ${c.name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <AlertDialog open={pendingDelete !== null} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {pendingDelete?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the character, its entries and its version history. This cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => pendingDelete && remove.mutate(pendingDelete.id)}>
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
