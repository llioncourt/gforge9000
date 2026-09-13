import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FileDropzone } from "@/components/ui/FileDropzone";
import { UserAvatar } from "@/components/app/user-avatar";
import { getProfile, upsertProfile } from "@/lib/api";
import { removePortrait, uploadAvatar } from "@/lib/portrait";
import { useSession } from "@/hooks/use-session";

const THEME_KEY = "ucf:light-theme";

/** Header account menu: profile editing, theme switch and sign out. */
export function ProfileMenu({ onSignOut }: { onSignOut: () => void }) {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [light, setLight] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => getProfile(user!.id),
    enabled: !!user,
  });

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY) === "1";
    setLight(stored);
    document.documentElement.classList.toggle("dark", !stored);
  }, []);

  function changeTheme(next: boolean) {
    setLight(next);
    window.localStorage.setItem(THEME_KEY, next ? "1" : "0");
    document.documentElement.classList.toggle("dark", !next);
  }

  useEffect(() => {
    if (!data) return;
    setDisplayName(data.display_name ?? "");
    setBio(data.bio ?? "");
  }, [data]);

  const uploadPhoto = useMutation({
    mutationFn: async (file: File) => {
      const path = await uploadAvatar(file);
      await upsertProfile(user!.id, { avatar_url: path });
      return URL.createObjectURL(file);
    },
    onSuccess: (localUrl) => {
      setAvatarPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return localUrl;
      });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["portrait"] });
      toast.success("Photo updated.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removePhoto = useMutation({
    mutationFn: async () => {
      const old = data?.avatar_url;
      await upsertProfile(user!.id, { avatar_url: null });
      if (old) await removePortrait(old).catch(() => undefined);
    },
    onSuccess: () => {
      setAvatarPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      queryClient.invalidateQueries({ queryKey: ["portrait"] });
      toast.success("Photo removed.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const save = useMutation({
    mutationFn: () => upsertProfile(user!.id, { display_name: displayName, bio }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile saved.");
      setOpen(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const name = data?.display_name || user?.email || "Account";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="shrink-0 rounded-full outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring" aria-label="Account menu">
            <UserAvatar name={name} avatarPath={data?.avatar_url} className="size-8" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuLabel className="truncate">
            <span className="block truncate text-sm">{data?.display_name || "Your account"}</span>
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {user?.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setOpen(true)}>
            <UserRound className="mr-2 size-4" /> Profile
          </DropdownMenuItem>
          <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
            <span>Light theme</span>
            <Switch checked={light} onCheckedChange={changeTheme} aria-label="Light theme" />
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onSignOut}>
            <LogOut className="mr-2 size-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-start gap-4">
              {avatarPreview ? (
                <img
                  loading="lazy"
                  decoding="async"
                  src={avatarPreview}
                  alt="Your profile photo"
                  className="size-20 shrink-0 rounded-full border border-border object-cover"
                />
              ) : (
                <UserAvatar
                  name={displayName || user?.email || "?"}
                  avatarPath={data?.avatar_url}
                  className="size-20 text-lg"
                />
              )}
              <div className="flex-1 space-y-2">
                <Label>Profile photo</Label>
                <FileDropzone
                  accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
                  compact
                  loading={uploadPhoto.isPending}
                  loadingLabel="Uploading photo…"
                  label={
                    <span className="text-xs text-muted-foreground">
                      Drop an image here — it is converted to AVIF automatically
                    </span>
                  }
                  onFiles={(files) => files[0] && uploadPhoto.mutate(files[0])}
                />
                {data?.avatar_url ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removePhoto.mutate()}
                    disabled={removePhoto.isPending}
                  >
                    Remove photo
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="menu-display">Display name</Label>
              <Input
                id="menu-display"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="menu-bio">About you</Label>
              <Textarea
                id="menu-bio"
                rows={4}
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input value={user?.email ?? ""} readOnly disabled />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              Save profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
