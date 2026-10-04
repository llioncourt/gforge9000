import { useState } from "react";
import { ChevronDown, Menu } from "lucide-react";
import {
  Boxes,
  BookOpen,
  Dices,
  Film,
  Grid3X3,
  Inbox,
  History,
  Library as LibraryIcon,
  ListTree,
  NotebookPen,
  Scroll,
  Settings2,
  Sparkles,
  Swords,
  Users,
  UserSquare2,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n/hooks";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

type IconType = typeof Boxes;

export type CampaignNavItem = {
  value: string;
  label: string;
  icon: IconType;
};

export type CampaignNavGroup = {
  id: string;
  label: string;
  icon: IconType;
  items: CampaignNavItem[];
};

function buildCampaignNavGroups(opts: {
  t: (k: string) => string;
  adaptLabel: string;
  isGm: boolean;
  isProducer?: boolean;
}): { groups: CampaignNavGroup[]; standalone: CampaignNavItem[] } {
  const { t, adaptLabel, isGm, isProducer = false } = opts;

  const settingsItems: CampaignNavItem[] = [
    { value: "rules", label: t("tabs.rules"), icon: Settings2 },
  ];
  if (isGm || isProducer)
    settingsItems.push({ value: "submissions", label: t("tabs.submissions"), icon: Inbox });

  const storyItems: CampaignNavItem[] = [
    { value: "story", label: t("tabs.story"), icon: Scroll },
    { value: "reveals", label: t("tabs.reveals"), icon: Sparkles },
    { value: "notes", label: t("tabs.notes"), icon: NotebookPen },
  ];
  if (isGm) storyItems.push({ value: "adapt", label: adaptLabel, icon: Wand2 });

  const groups: CampaignNavGroup[] = [
    {
      id: "cast",
      label: t("nav.cast"),
      icon: Users,
      items: [
        { value: "roster", label: t("tabs.roster"), icon: UserSquare2 },
        { value: "members", label: t("tabs.members"), icon: Users },
      ],
    },
    {
      id: "play",
      label: t("nav.play"),
      icon: Dices,
      items: [
        { value: "battle", label: t("tabs.battle"), icon: Grid3X3 },
        { value: "rolls", label: t("tabs.rolls"), icon: Dices },
        { value: "sessions", label: t("tabs.sessions"), icon: Swords },
      ],
    },
    {
      id: "world",
      label: t("nav.world"),
      icon: Boxes,
      items: [
        { value: "lore", label: t("tabs.lore"), icon: BookOpen },
        { value: "timeline", label: t("tabs.timeline"), icon: History },
        { value: "graph", label: t("tabs.graph"), icon: ListTree },
        { value: "library", label: t("tabs.library"), icon: LibraryIcon },
      ],
    },
    {
      id: "story",
      label: t("nav.story"),
      icon: Scroll,
      items: storyItems,
    },

    {
      id: "settings",
      label: t("nav.settings"),
      icon: Settings2,
      items: settingsItems,
    },
  ];

  const standalone: CampaignNavItem[] = [{ value: "media", label: t("tabs.media"), icon: Film }];

  return { groups, standalone };
}

const triggerBase =
  "relative inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors duration-200 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring " +
  "after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:origin-left after:scale-x-0 after:rounded-full after:bg-primary after:transition-transform after:duration-300 hover:after:scale-x-100";

export function CampaignNav({
  value,
  onChange,
  isGm,
  isProducer = false,
  adaptLabel,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  isGm: boolean;
  isProducer?: boolean;
  adaptLabel: string;
  className?: string;
}) {
  const { t } = useT("campaigns");
  const [sheetOpen, setSheetOpen] = useState(false);
  const { groups, standalone } = buildCampaignNavGroups({
    t: t as unknown as (k: string) => string,
    adaptLabel,
    isGm,
    isProducer,
  });

  const select = (next: string) => {
    onChange(next);
    setSheetOpen(false);
  };

  return (
    <div className={cn("w-full", className)}>
      {/* Desktop */}
      <nav className="hidden items-center gap-1 border-b border-border/60 pb-1 md:flex">
        {groups.map((group) => {
          const activeChild = group.items.find((i) => i.value === value);
          const GroupIcon = group.icon;
          return (
            <DropdownMenu key={group.id}>
              <DropdownMenuTrigger
                className={cn(
                  triggerBase,
                  "data-[state=open]:text-foreground data-[state=open]:bg-accent/40",
                  activeChild && "text-foreground after:scale-x-100 bg-accent/40",
                )}
              >
                <GroupIcon className="h-4 w-4" />
                <span>{group.label}</span>
                {activeChild ? (
                  <span className="text-muted-foreground">
                    <span className="mx-1">·</span>
                    {activeChild.label}
                  </span>
                ) : null}
                <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-data-[state=open]:rotate-180" />
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                sideOffset={8}
                className="min-w-56 origin-[var(--radix-dropdown-menu-content-transform-origin)]"
              >
                {group.items.map((item, index) => {
                  const Icon = item.icon;
                  const active = value === item.value;
                  return (
                    <DropdownMenuItem
                      key={item.value}
                      onSelect={() => select(item.value)}
                      style={{
                        animation: `nav-item-in 220ms ease-out both`,
                        animationDelay: `${index * 35}ms`,
                      }}
                      className={cn(
                        "cursor-pointer gap-2",
                        active && "bg-accent text-accent-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4 opacity-80" />
                      <span>{item.label}</span>
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          );
        })}

        {standalone.map((item) => {
          const active = value === item.value;
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              onClick={() => select(item.value)}
              className={cn(
                triggerBase,
                active && "text-foreground after:scale-x-100 bg-accent/40",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* Mobile */}
      <div className="md:hidden">
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full justify-start gap-2">
              <Menu className="h-4 w-4" />
              <span className="truncate">
                {currentLabel(value, groups, standalone) ?? t("nav.menu")}
              </span>
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[85vw] max-w-sm overflow-y-auto">
            <SheetHeader>
              <SheetTitle>{t("nav.menu")}</SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-5">
              {groups.map((group) => (
                <div key={group.id} className="space-y-1">
                  <p className="px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </p>
                  {group.items.map((item) => (
                    <MobileItem
                      key={item.value}
                      item={item}
                      active={value === item.value}
                      onSelect={select}
                    />
                  ))}
                </div>
              ))}
              <div className="space-y-1">
                {standalone.map((item) => (
                  <MobileItem
                    key={item.value}
                    item={item}
                    active={value === item.value}
                    onSelect={select}
                  />
                ))}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}

function MobileItem({
  item,
  active,
  onSelect,
}: {
  item: CampaignNavItem;
  active: boolean;
  onSelect: (v: string) => void;
}) {
  const Icon = item.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(item.value)}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
        active ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-accent/50",
      )}
    >
      <Icon className="h-4 w-4 opacity-80" />
      {item.label}
    </button>
  );
}

function currentLabel(
  value: string,
  groups: CampaignNavGroup[],
  standalone: CampaignNavItem[],
): string | null {
  const solo = standalone.find((i) => i.value === value);
  if (solo) return solo.label;
  for (const g of groups) {
    const item = g.items.find((i) => i.value === value);
    if (item) return `${g.label} · ${item.label}`;
  }
  return null;
}
