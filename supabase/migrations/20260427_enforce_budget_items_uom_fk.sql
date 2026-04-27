-- Ensure budget item UoM values stay in sync with Settings UoM codes.
alter table public.budget_items
drop constraint if exists budget_items_uom_fkey;

update public.budget_items
set uom = upper(trim(uom))
where uom <> upper(trim(uom));

with missing_units as (
  select distinct upper(trim(bi.uom)) as code
  from public.budget_items bi
  left join public.units_of_measure uom on uom.code = upper(trim(bi.uom))
  where uom.code is null
    and trim(bi.uom) <> ''
)
insert into public.units_of_measure (code, label, sort_order, is_active)
select code, code || ' (' || code || ')', 1000 + row_number() over (order by code), true
from missing_units;

alter table public.budget_items
add constraint budget_items_uom_fkey
foreign key (uom)
references public.units_of_measure (code)
on update cascade
on delete restrict;
