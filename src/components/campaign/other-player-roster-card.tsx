import { CardPortraitBg } from "@/components/character/card-portrait-bg";

export function shouldUseOtherPlayerRosterCard(input: {
  isGm: boolean;
  isNpc: boolean;
  ownerId: string;
  viewerId: string | null | undefined;
}) {
  return !input.isGm && !input.isNpc && !!input.viewerId && input.ownerId !== input.viewerId;
}

export function OtherPlayerRosterCard({
  characterName,
  playerName,
  portraitPath,
}: {
  characterName: string;
  playerName: string | null;
  portraitPath: string | null;
}) {
  return (
    <div className="panel relative min-h-[220px] overflow-hidden p-4">
      <CardPortraitBg path={portraitPath} />
      <div className="relative flex min-h-[188px] flex-col justify-end">
        <h3 className="font-display text-lg font-semibold">{characterName}</h3>
        {playerName ? <p className="mt-1 text-sm text-muted-foreground">{playerName}</p> : null}
      </div>
    </div>
  );
}