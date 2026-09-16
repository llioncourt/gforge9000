import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";
import {
  readNotificationPermission,
  requestNotificationPermission,
  showSystemNotification,
  type NotificationPermissionState,
} from "@/lib/system-notifications";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Check, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import {
  deleteNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications";

function timeAgo(iso: string) {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** Header bell: live feed of what the GM revealed to this player. */
export function NotificationBell() {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const notifications = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: () => listNotifications(),
    enabled: !!user,
    staleTime: 1000 * 30,
  });

  const [permission, setPermission] = useState<NotificationPermissionState>("unsupported");

  useEffect(() => {
    setPermission(readNotificationPermission());
  }, []);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`notifications:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ["notifications", user.id] });
          if (payload.eventType !== "INSERT") return;
          const row = payload.new as NotificationRow;
          if (row.read_at) return;
          toast(row.title, { description: row.body ?? undefined });
          showSystemNotification({
            title: row.title,
            body: row.body,
            tag: row.id,
            url: row.entity_id ? `/entities/${row.entity_id}` : undefined,
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, queryClient]);

  const enableAlerts = async () => {
    const next = await requestNotificationPermission();
    setPermission(next);
    if (next === "granted") {
      showSystemNotification({
        title: "Alerts enabled",
        body: "You will be notified when the GM reveals something.",
        tag: "alerts-enabled",
      });
    } else if (next === "denied") {
      toast.error("Alerts blocked. Allow notifications for this site in your browser settings.");
    }
  };

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["notifications", user?.id] });

  const toggleRead = useMutation({
    mutationFn: ({ id, read }: { id: string; read: boolean }) => markNotificationRead(id, read),
    onSuccess: invalidate,
  });
  const readAll = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: invalidate });
  const remove = useMutation({ mutationFn: deleteNotification, onSuccess: invalidate });

  const rows = notifications.data ?? [];
  const unread = rows.filter((row) => !row.read_at).length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon" variant="ghost" className="relative shrink-0" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-content-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-medium">Notifications</p>
          {unread > 0 ? (
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-2 text-xs"
              onClick={() => readAll.mutate()}
              disabled={readAll.isPending}
            >
              Mark all read
            </Button>
          ) : null}
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {notifications.isLoading ? (
            <div className="space-y-2 p-3">
              <Skeleton className="h-12 w-full rounded-md" />
              <Skeleton className="h-12 w-full rounded-md" />
            </div>
          ) : rows.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">Nothing new yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((row) => (
                <li
                  key={row.id}
                  className={cn("flex gap-2 p-3", row.read_at ? "opacity-60" : "bg-accent/20")}
                >
                  <div className="min-w-0 flex-1">
                    {row.entity_id ? (
                      <Link
                        to="/entities/$id"
                        params={{ id: row.entity_id }}
                        className="text-sm font-medium hover:underline"
                      >
                        {row.title}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium">{row.title}</p>
                    )}
                    {row.body ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.body}</p>
                    ) : null}
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {timeAgo(row.created_at)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={row.read_at ? "Mark as unread" : "Mark as read"}
                      title={row.read_at ? "Mark as unread" : "Mark as read"}
                      onClick={() => toggleRead.mutate({ id: row.id, read: !row.read_at })}
                    >
                      <Check className="size-4" />
                    </button>
                    <button
                      type="button"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="Delete notification"
                      title="Delete"
                      onClick={() => remove.mutate(row.id)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
