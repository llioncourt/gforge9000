-- Renumber each character's entries to a gapless 0-based sequence that
-- preserves the order the app already displays them in (kind, sort_order,
-- name), with the row id as a deterministic final tie-breaker.
with ordered as (
  select id,
         row_number() over (
           partition by character_id
           order by kind asc, sort_order asc, name asc, id asc
         ) - 1 as seq
    from public.character_entries
)
update public.character_entries ce
   set sort_order = o.seq
  from ordered o
 where o.id = ce.id
   and ce.sort_order is distinct from o.seq;