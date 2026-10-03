import { Link } from "@tanstack/react-router";
import { PortraitFrame, usePortraitUrl } from "@/components/character/portrait";

/**
 * Roster card as players see it: portrait and name, nothing else. It keeps the
 * exact footprint of the roster card it replaces — same grid cell, same height —
 * so the board doesn't shift shape between roles.
 */
export function RosterPlayerCard({
  campaignId,
  tab,
  character,
}: {
  campaignId: string;
  tab: string;
  character: { id: string; name: string; portrait_path: string | null };
}) {
  const url = usePortraitUrl(character.portrait_path);
  return (
    <Link
      to="/characters/$id"
      params={{ id: character.id }}
      search={{ from: `campaign:${campaignId}:${tab}` }}
      className="panel hover:border-primary/50 flex h-[203px] items-stretch gap-3 overflow-hidden p-4 transition"
    >
      <PortraitFrame url={url} name={character.name} className="h-full w-32 shrink-0" />
      <span className="font-display flex min-w-0 flex-1 items-center text-lg leading-tight font-semibold">
        <span className="line-clamp-4">{character.name}</span>
      </span>
    </Link>
  );
}
