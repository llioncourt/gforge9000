-- Canonical status spellings, per kind, exactly as the app declares them.
create temporary table _canonical_status(kind text, status text) on commit drop;
insert into _canonical_status(kind, status) values
    ('NPC','Alive'),('NPC','Dead'),('NPC','Missing'),('NPC','Unknown'),('NPC','Captured'),('NPC','Retired'),
    ('PC','Active'),('PC','Retired'),('PC','Dead'),('PC','Missing'),
    ('FACTION','Active'),('FACTION','Dormant'),('FACTION','Destroyed'),('FACTION','Ascendant'),('FACTION','Fractured'),
    ('LOCATION','Intact'),('LOCATION','Damaged'),('LOCATION','Destroyed'),('LOCATION','Abandoned'),('LOCATION','Hidden'),
    ('ITEM','Available'),('ITEM','Held'),('ITEM','Lost'),('ITEM','Destroyed'),('ITEM','Hidden'),
    ('CREATURE','Extant'),('CREATURE','Rare'),('CREATURE','Extinct'),('CREATURE','Legendary'),
    ('LORE','Draft'),('LORE','Canon'),('LORE','Contested'),
    ('ARC','Planned'),('ARC','Active'),('ARC','Resolved'),('ARC','Abandoned'),
    ('ADVENTURE','Planned'),('ADVENTURE','Active'),('ADVENTURE','Completed'),('ADVENTURE','Shelved'),
    ('CHAPTER','Planned'),('CHAPTER','Active'),('CHAPTER','Completed'),
    ('SCENE','Planned'),('SCENE','Ready'),('SCENE','Played'),('SCENE','Skipped'),
    ('QUEST','RUMORED'),('QUEST','AVAILABLE'),('QUEST','ACTIVE'),('QUEST','COMPLETED'),('QUEST','FAILED'),('QUEST','ABANDONED'),('QUEST','EXPIRED'),
    ('MYSTERY','Open'),('MYSTERY','Partially solved'),('MYSTERY','Solved'),('MYSTERY','Cold'),
    ('CLUE','Undiscovered'),('CLUE','Discovered'),('CLUE','Misread'),
    ('SECRET','Hidden'),('SECRET','Suspected'),('SECRET','Revealed'),
    ('THREAD','Open'),('THREAD','Advancing'),('THREAD','Stalled'),('THREAD','Resolved'),
    ('CLOCK','Ticking'),('CLOCK','Paused'),('CLOCK','Triggered'),
    ('HANDOUT','Draft'),('HANDOUT','Ready'),('HANDOUT','Revealed'),
    ('EVENT','Historical'),('EVENT','Recent'),('EVENT','Upcoming'),('EVENT','Rumored'),
    ('CUSTOM','Active'),('CUSTOM','Archived');

-- Only rows whose stored status differs from the canonical spelling purely by
-- letter case are rewritten. Anything without an unambiguous match is left
-- exactly as it is.
update public.entities e
   set status = c.status
  from _canonical_status c
 where c.kind = e.kind
   and lower(c.status) = lower(e.status)
   and c.status <> e.status;

-- Safety report: statuses that had no canonical match and were left untouched.
do $$
declare
  _row record;
begin
  for _row in
    select e.kind, e.status, count(*) as rows
      from public.entities e
     where not exists (
       select 1 from _canonical_status c
        where c.kind = e.kind and lower(c.status) = lower(e.status)
     )
     group by 1, 2
  loop
    raise notice 'Unmatched entity status left unchanged: kind=% status=% rows=%',
      _row.kind, _row.status, _row.rows;
  end loop;
end;
$$;