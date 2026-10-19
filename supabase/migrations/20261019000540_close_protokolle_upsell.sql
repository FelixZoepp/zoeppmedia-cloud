-- Gesprächsprotokoll (Upsell) speichern können
alter table close_protokolle drop constraint if exists close_protokolle_typ_check;
alter table close_protokolle add constraint close_protokolle_typ_check check (typ = any (array['terminierung','setting','closing','follow_up','upsell']));
