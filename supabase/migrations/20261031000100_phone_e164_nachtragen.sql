-- Bewerber ohne phone_e164 (v. a. Indeed-Export, Perspective) waren für die Dublettenprüfung unsichtbar.
-- Nummer wie normalizePhoneE164 (src/lib/phone.ts) umwandeln und nachtragen – nur, wenn im Mandanten
-- noch kein anderer Bewerber diese Nummer hat (Unique-Index uq_candidates_agency_phone_e164); bei
-- mehreren Treffern bekommt der älteste die Nummer.
create or replace function pg_temp.e164(roh text) returns text language plpgsql as $$
declare s text := regexp_replace(coalesce(roh, ''), '[^0-9+]', '', 'g');
begin
  if s = '' then return null; end if;
  if s like '00%' then s := '+' || substr(s, 3); end if;
  if s !~ '^\+' and s ~ '^49[1-9][0-9]{8,11}$' then s := '+' || s; end if;
  if s !~ '^\+' and s ~ '^490[0-9]{9,11}$' then s := '+49' || substr(s, 4); end if;
  if s like '+490%' then s := '+49' || substr(s, 5); end if;
  if s !~ '^\+' then
    if s like '0%' then s := '+49' || substr(s, 2);
    elsif length(s) >= 7 then s := '+49' || s;
    else return null; end if;
  end if;
  if substr(s, 2) !~ '^[0-9]{7,15}$' then return null; end if;
  return s;
end $$;

with kandidat as (
  select id, agency_id, pg_temp.e164(phone) as nr, created_at
  from candidates
  where phone_e164 is null and phone is not null and deleted_at is null
), erster as (
  select distinct on (agency_id, nr) id, agency_id, nr
  from kandidat
  where nr is not null
  order by agency_id, nr, created_at
)
update candidates c
set phone_e164 = e.nr
from erster e
where c.id = e.id
  and not exists (
    select 1 from candidates x
    where x.agency_id = e.agency_id and x.phone_e164 = e.nr and x.deleted_at is null
  );
