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
  portraitUrl,
}: {
  characterName: string;
  playerName: string | null;
  portraitUrl: string | null;
}) {
  return (
    <div className="panel relative min-h-[220px] overflow-hidden p-4">
      {portraitUrl ? (
        <>
          <img
            loading="lazy"
            decoding="async"
            src={portraitUrl}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 h-full w-full object-cover object-top"
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/95 via-background/85 to-background/70" />
        </>
      ) : null}
      <div className="relative flex min-h-[188px] flex-col justify-end">
        <h3 className="font-display text-lg font-semibold">{characterName}</h3>
        {playerName ? <p className="mt-1 text-sm text-muted-foreground">{playerName}</p> : null}
      </div>
    </div>
  );
}