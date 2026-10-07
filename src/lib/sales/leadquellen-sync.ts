/** Fehlende Leadquellen in Close nachtragen (Funnel-Leads aus UTM) und Leads ohne Quelle auflisten */

import { ladeLeadsMitQuellen, setzeCloseLeadquelle } from './close';
import { automatischeLeadquelle } from './leadquelle';

export interface LeadquellenStand {
  gesamt: number;
  gesetzt: Array<{ id: string; name: string; quelle: string }>;
  /** Von Hand angelegt, Quelle fehlt – muss jemand eintragen */
  ohneQuelle: Array<{ id: string; name: string; erstellt: string }>;
}

export async function trageLeadquellenNach(opts: { ab?: Date; schreiben?: boolean } = {}): Promise<LeadquellenStand> {
  const leads = await ladeLeadsMitQuellen(opts.ab);
  const stand: LeadquellenStand = { gesamt: leads.length, gesetzt: [], ohneQuelle: [] };
  for (const l of leads) {
    if (l.felder.leadquelle) continue;
    const auto = automatischeLeadquelle(l.felder);
    if (!auto) {
      stand.ohneQuelle.push({ id: l.id, name: l.name, erstellt: l.erstellt });
      continue;
    }
    if (opts.schreiben !== false) await setzeCloseLeadquelle(l.id, auto);
    stand.gesetzt.push({ id: l.id, name: l.name, quelle: auto });
  }
  stand.ohneQuelle.sort((a, b) => b.erstellt.localeCompare(a.erstellt));
  return stand;
}
