-- Von Hand angelegte Leads: keine Eintragung im Sinne von Speed-to-Lead
ALTER TABLE sales_eintragungen DROP CONSTRAINT IF EXISTS sales_eintragungen_ergebnis_check;
ALTER TABLE sales_eintragungen ADD CONSTRAINT sales_eintragungen_ergebnis_check
  CHECK (ergebnis IN ('offen', 'direkt_gebucht', 'nicht_gebucht', 'spaeter_gebucht', 'manuell'));
