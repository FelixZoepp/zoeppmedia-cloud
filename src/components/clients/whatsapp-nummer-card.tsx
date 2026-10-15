'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, PhoneCall, RefreshCw, Search, ShoppingCart, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Badge, Button, Card, Input, Modal } from '@/components/ui';
import { codeEmpfangOffen, nummerAnzeigen } from '@/lib/twilio/nummer';

type Ton = 'success' | 'warning' | 'danger' | 'neutral';

interface Eintrag {
  twilio_subaccount_sid: string | null;
  phone_number_sid: string | null;
  nummer_e164: string | null;
  status: 'unterkonto' | 'gekauft';
  code_empfang_bis: string | null;
  gekauft_am: string | null;
}

interface Code {
  id: string;
  art: 'anruf' | 'sms';
  text: string | null;
  code: string | null;
  created_at: string;
}

interface Daten {
  twilio: boolean;
  schema: boolean;
  freigabe: boolean;
  kunde: { name: string; outbound_phone: string | null; plz: string | null; ort: string | null };
  vorschlag: { vorwahl: string; ort: string; quelle: 'telefon' | 'plz' | 'standard' };
  eintrag: Eintrag | null;
  bundles: Array<{ sid: string; friendly_name: string; status: string; anzeige: { label: string; ton: Ton; kaufbar: boolean } }>;
  adressen: Array<{ sid: string; customer_name: string; street: string; postal_code: string; city: string }>;
  twilioFehler: string | null;
  codes: Code[];
}

interface Suche {
  vorwahl: string;
  ort: string | null;
  preis: string | null;
  nummern: Array<{ nummer: string; anzeige: string; ort: string | null; sms: boolean }>;
}

const QUELLE = { telefon: 'aus der Telefonnummer des Kunden', plz: 'aus der PLZ des Firmensitzes', standard: 'Standard, weil keine Vorwahl bekannt ist' } as const;
const KONSOLE_BUNDLES = 'https://console.twilio.com/us1/develop/phone-numbers/regulatory-compliance/bundles';

/** WhatsApp-Nummer für den Kunden besorgen: Twilio-Unterkonto → Unterlagen → Nummer kaufen → Meta-Code abfangen (nur Admins) */
export function WhatsappNummerCard({ agencyId }: { agencyId: string }) {
  const [d, setD] = useState<Daten | null>(null);
  const [keinZugriff, setKeinZugriff] = useState(false);
  const [vorwahl, setVorwahl] = useState('');
  const [suche, setSuche] = useState<Suche | null>(null);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [bundleSid, setBundleSid] = useState('');
  const [addressSid, setAddressSid] = useState('');
  const [kaufOffen, setKaufOffen] = useState(false);
  const [bestaetigt, setBestaetigt] = useState(false);
  const [arbeitet, setArbeitet] = useState<string | null>(null);

  const url = `/api/admin/agencies/${agencyId}/whatsapp-nummer`;

  const laden = useCallback(async () => {
    const res = await fetch(url, { cache: 'no-store' });
    if (res.status === 403) return void setKeinZugriff(true);
    if (!res.ok) return;
    const data = (await res.json()) as Daten;
    setD(data);
    setVorwahl((v) => v || `0${data.vorschlag.vorwahl}`);
    setBundleSid((b) => b || data.bundles.find((x) => x.anzeige.kaufbar)?.sid || '');
    setAddressSid((a) => a || data.adressen[0]?.sid || '');
  }, [url]);

  useEffect(() => {
    const t = setTimeout(laden, 0);
    return () => clearTimeout(t);
  }, [laden]);

  // Codes alle 4 Sekunden nachladen, solange das Code-Fenster offen ist und die Karte angezeigt wird
  const fensterBis = d?.eintrag?.code_empfang_bis ?? null;
  const fensterOffen = codeEmpfangOffen(fensterBis);
  useEffect(() => {
    if (!fensterOffen) return;
    const t = setInterval(async () => {
      const res = await fetch(`${url}?nur=codes`, { cache: 'no-store' }).catch(() => null);
      if (!res?.ok) return;
      const x = (await res.json()) as { codes: Code[]; code_empfang_bis: string | null };
      setD((alt) => (alt ? { ...alt, codes: x.codes, eintrag: alt.eintrag ? { ...alt.eintrag, code_empfang_bis: x.code_empfang_bis } : alt.eintrag } : alt));
    }, 4000);
    return () => clearInterval(t);
  }, [fensterOffen, url]);

  async function aktion(name: string, extra: Record<string, unknown> = {}) {
    setArbeitet(name);
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: name, ...extra }) });
    const data = await res.json().catch(() => ({}));
    setArbeitet(null);
    if (!res.ok) {
      toast.error(data.error ?? 'Hat nicht geklappt');
      return null;
    }
    return data;
  }

  async function suchen() {
    const r = (await aktion('suchen', { vorwahl })) as Suche | null;
    if (!r) return;
    setSuche(r);
    setAuswahl(r.nummern[0]?.nummer ?? null);
    if (!r.nummern.length) toast.warning(`Keine freie Nummer mit Vorwahl 0${r.vorwahl} gefunden`);
  }

  async function unterkonto() {
    if (!confirm(`Twilio-Unterkonto für „${d?.kunde.name}“ anlegen? (kostenlos)`)) return;
    if (await aktion('unterkonto')) {
      toast.success('Unterkonto angelegt');
      void laden();
    }
  }

  async function kaufen() {
    const nr = suche?.nummern.find((n) => n.nummer === auswahl);
    if (!nr) return;
    const r = await aktion('kaufen', { nummer: nr.nummer, sms: nr.sms, bundle_sid: bundleSid, address_sid: addressSid, bestaetigt });
    if (!r) return;
    toast.success(`Nummer ${nummerAnzeigen(nr.nummer)} gekauft`);
    setKaufOffen(false);
    setBestaetigt(false);
    setSuche(null);
    void laden();
  }

  async function aufCodeWarten() {
    const r = (await aktion('code_empfang')) as { code_empfang_bis: string } | null;
    if (r) setD((alt) => (alt?.eintrag ? { ...alt, eintrag: { ...alt.eintrag, code_empfang_bis: r.code_empfang_bis } } : alt));
  }

  async function alsAbsender() {
    const nr = d?.eintrag?.nummer_e164;
    if (!nr || !confirm(`${nummerAnzeigen(nr)} als Absendernummer für „${d?.kunde.name}“ übernehmen?${d?.kunde.outbound_phone ? ` Bisher: ${d.kunde.outbound_phone}` : ''}`)) return;
    if (await aktion('absender')) {
      toast.success('Absendernummer übernommen');
      void laden();
    }
  }

  if (keinZugriff) return null;

  const e = d?.eintrag ?? null;
  const sub = e?.twilio_subaccount_sid ?? null;
  const gekauft = !!e?.phone_number_sid;
  const bereit = !!d && d.twilio && d.schema && d.freigabe;
  const kaufbareBundles = d?.bundles.filter((b) => b.anzeige.kaufbar) ?? [];
  const kaufMoeglich = bereit && !!sub && !gekauft && !!auswahl && !!bundleSid && !!addressSid;
  const gewaehlt = suche?.nummern.find((n) => n.nummer === auswahl) ?? null;
  const letzterCode = d?.codes.find((c) => c.code) ?? null;

  return (
    <Card className="mb-6">
      <h2 className="flex items-center gap-2 text-[19px] font-medium tracking-[-0.02em]">
        <PhoneCall className="h-5 w-5 text-red-800" /> WhatsApp-Nummer besorgen
        <Badge tone="outline">nur Admins</Badge>
      </h2>
      <p className="mt-1 text-[13.5px] text-gray-600">
        Eigene, noch nicht bei WhatsApp aktive Festnetznummer für diesen Kunden über ein Twilio-Unterkonto – danach im Portal des Kunden unter Einstellungen → WhatsApp verbinden.
      </p>

      {!d ? (
        <p className="mt-3 text-[13.5px] text-gray-500">Lädt …</p>
      ) : (
        <div className="mt-3 space-y-4 text-[13.5px]">
          {!d.twilio && <Hinweis>Twilio ist noch nicht eingerichtet – TWILIO_ACCOUNT_SID und TWILIO_AUTH_TOKEN fehlen in Vercel.</Hinweis>}
          {!d.schema && <Hinweis>Datenbank-Änderung fehlt noch (Migration 20261015000460_whatsapp_nummern.sql).</Hinweis>}
          {!d.freigabe && (
            <Hinweis>
              Noch nicht freigegeben: Unterkonto anlegen, Nummer kaufen und Code-Empfang sind gesperrt, bis „WhatsApp-Nummer für Kunden besorgen“ unter Freigaben eingeschaltet ist. Der Testlauf (freie Nummern suchen, ohne Kauf) geht schon.
            </Hinweis>
          )}
          {d.twilioFehler && <Hinweis>{d.twilioFehler}</Hinweis>}

          {/* 1. Unterkonto */}
          <Schritt nr={1} titel="Twilio-Unterkonto" fertig={!!sub}>
            {sub ? (
              <span className="text-gray-600">
                Angelegt: <code className="text-xs">{sub}</code>
              </span>
            ) : (
              <Button size="sm" variant="secondary" onClick={unterkonto} disabled={!bereit || !!arbeitet}>
                <UserPlus /> Unterkonto anlegen
              </Button>
            )}
          </Schritt>

          {/* 2. Unterlagen */}
          <Schritt nr={2} titel="Unterlagen (Regulatory Bundle)" fertig={kaufbareBundles.length > 0 && d.adressen.length > 0}>
            {!sub ? (
              <span className="text-gray-500">Erst nach dem Unterkonto.</span>
            ) : (
              <div className="space-y-2">
                {d.bundles.length === 0 ? (
                  <p className="text-amber-700">Noch keine Unterlagen für deutsche Ortsnetznummern im Unterkonto.</p>
                ) : (
                  <ul className="space-y-1">
                    {d.bundles.map((b) => (
                      <li key={b.sid} className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate">{b.friendly_name}</span>
                        <Badge tone={b.anzeige.ton}>{b.anzeige.label}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-gray-600">
                  Adressen im Unterkonto:{' '}
                  {d.adressen.length ? d.adressen.map((a) => `${a.street}, ${a.postal_code} ${a.city}`).join(' · ') : <span className="text-amber-700">keine</span>}
                </p>
                <ol className="list-decimal space-y-0.5 pl-5 text-gray-600">
                  <li>In der Twilio-Konsole oben links ins Unterkonto „Zoepp Cloud – {d.kunde.name}“ wechseln.</li>
                  <li>Phone Numbers → Regulatory Compliance → Bundles → „Create“: Deutschland, Local, Business.</li>
                  <li>
                    Firmendaten, Firmensitz und Handelsregisterauszug eintragen (Karte „Firmensitz & Handelsregister“). Die Adresse muss im Ortsnetz der gewählten Vorwahl liegen.
                  </li>
                  <li>Einreichen – Twilio prüft meist 1–3 Werktage. Danach hier „Stand neu laden“.</li>
                </ol>
                <div className="flex flex-wrap gap-2">
                  <a href={KONSOLE_BUNDLES} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-red-800 underline">
                    Twilio-Konsole öffnen <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                  <Button size="sm" variant="ghost" onClick={() => void laden()}>
                    <RefreshCw /> Stand neu laden
                  </Button>
                </div>
              </div>
            )}
          </Schritt>

          {/* 3. Nummer suchen + kaufen */}
          <Schritt nr={3} titel="Nummer suchen und kaufen" fertig={gekauft}>
            {gekauft ? (
              <span>
                Gekauft: <strong>{nummerAnzeigen(e?.nummer_e164)}</strong>
                {e?.gekauft_am && <span className="text-gray-500"> am {new Date(e.gekauft_am).toLocaleDateString('de-DE')}</span>}
              </span>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Input className="!w-28" value={vorwahl} onChange={(ev) => setVorwahl(ev.target.value)} aria-label="Ortsvorwahl" />
                  <Button size="sm" variant="secondary" onClick={suchen} disabled={!d.twilio || !!arbeitet}>
                    <Search /> Testlauf: freie Nummern suchen
                  </Button>
                </div>
                <p className="text-[12.5px] text-gray-500">
                  Vorschlag 0{d.vorschlag.vorwahl} ({d.vorschlag.ort}) – {QUELLE[d.vorschlag.quelle]}. Die Suche kauft nichts.
                </p>
                {suche && suche.nummern.length > 0 && (
                  <ul className="space-y-1">
                    {suche.nummern.map((n) => (
                      <li key={n.nummer}>
                        <label className="flex cursor-pointer items-center gap-2">
                          <input type="radio" name={`nummer-${agencyId}`} checked={auswahl === n.nummer} onChange={() => setAuswahl(n.nummer)} />
                          <span className="font-medium">{nummerAnzeigen(n.nummer)}</span>
                          {n.ort && <span className="text-gray-500">{n.ort}</span>}
                          {!n.sms && <Badge tone="neutral">nur Anrufe</Badge>}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                {suche?.preis && <p className="text-[12.5px] text-gray-500">Laut Twilio: {suche.preis} je Nummer.</p>}
                {suche && suche.nummern.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <select value={bundleSid} onChange={(ev) => setBundleSid(ev.target.value)} className="h-9 rounded-[12px] bg-card px-3 text-[13.5px] shadow-[inset_0_0_0_1.5px_var(--hair)]" aria-label="Unterlagen">
                      <option value="">Unterlagen wählen …</option>
                      {kaufbareBundles.map((b) => (
                        <option key={b.sid} value={b.sid}>{b.friendly_name}</option>
                      ))}
                    </select>
                    <select value={addressSid} onChange={(ev) => setAddressSid(ev.target.value)} className="h-9 rounded-[12px] bg-card px-3 text-[13.5px] shadow-[inset_0_0_0_1.5px_var(--hair)]" aria-label="Adresse">
                      <option value="">Adresse wählen …</option>
                      {d.adressen.map((a) => (
                        <option key={a.sid} value={a.sid}>{`${a.street}, ${a.city}`}</option>
                      ))}
                    </select>
                    <Button size="sm" onClick={() => setKaufOffen(true)} disabled={!kaufMoeglich || !!arbeitet}>
                      <ShoppingCart /> Nummer kaufen …
                    </Button>
                  </div>
                )}
              </div>
            )}
          </Schritt>

          {/* 4. Code abfangen */}
          <Schritt nr={4} titel="Bestätigungscode von Meta" fertig={!!letzterCode}>
            {!gekauft ? (
              <span className="text-gray-500">Erst nach dem Kauf.</span>
            ) : (
              <div className="space-y-2">
                <p className="text-gray-600">
                  Im Portal des Kunden unter Einstellungen → WhatsApp „Mit WhatsApp verbinden“, die Nummer {nummerAnzeigen(e?.nummer_e164)} eingeben und als Bestätigung „Anruf“ wählen. Vorher hier auf „Auf Code warten“ klicken.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="secondary" onClick={aufCodeWarten} disabled={!bereit || !!arbeitet}>
                    <PhoneCall /> {fensterOffen ? 'Fenster verlängern' : 'Auf Code warten (15 Min.)'}
                  </Button>
                  {fensterOffen && fensterBis && <Badge tone="warning">wartet bis {new Date(fensterBis).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</Badge>}
                </div>
                {letzterCode && (
                  <div className="rounded-[12px] bg-panel px-4 py-3">
                    <div className="text-[12px] text-gray-500">
                      Letzter Code ({letzterCode.art === 'anruf' ? 'Anruf' : 'SMS'}, {new Date(letzterCode.created_at).toLocaleTimeString('de-DE')})
                    </div>
                    <div className="font-mono text-[28px] tracking-[0.2em]">{letzterCode.code}</div>
                  </div>
                )}
                {d.codes.length > 0 && (
                  <details className="text-[12.5px] text-gray-500">
                    <summary className="cursor-pointer">Eingänge der letzten Stunde ({d.codes.length})</summary>
                    <ul className="mt-1 space-y-1">
                      {d.codes.map((c) => (
                        <li key={c.id}>
                          {new Date(c.created_at).toLocaleTimeString('de-DE')} · {c.art === 'anruf' ? 'Anruf' : 'SMS'}: {c.text ?? '–'}
                          {c.code ? ` → ${c.code}` : ' (kein Code erkannt)'}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            )}
          </Schritt>

          {/* 5. Absendernummer */}
          <Schritt nr={5} titel="Als Absendernummer übernehmen" fertig={gekauft && d.kunde.outbound_phone === e?.nummer_e164}>
            {!gekauft ? (
              <span className="text-gray-500">Erst nach dem Kauf.</span>
            ) : d.kunde.outbound_phone === e?.nummer_e164 ? (
              <span className="text-gray-600">Ist die Absendernummer des Kunden.</span>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-gray-600">Bisher: {d.kunde.outbound_phone || 'keine'}</span>
                <Button size="sm" variant="secondary" onClick={alsAbsender} disabled={!bereit || !!arbeitet}>
                  Als Absendernummer übernehmen
                </Button>
              </div>
            )}
          </Schritt>
        </div>
      )}

      <Modal open={kaufOffen} onClose={() => { setKaufOffen(false); setBestaetigt(false); }} title="Nummer kostenpflichtig kaufen?">
        <div className="space-y-3 text-[14px]">
          <p>
            <strong>{nummerAnzeigen(gewaehlt?.nummer)}</strong> für <strong>{d?.kunde.name}</strong> im Twilio-Unterkonto kaufen.
          </p>
          <p className="rounded-[12px] bg-amber-50 px-3 py-2 text-amber-800">
            Die Nummer kostet jeden Monat{suche?.preis ? ` (laut Twilio ${suche.preis})` : ''}, dazu Gesprächs- und SMS-Gebühren – so lange, bis sie in Twilio wieder freigegeben wird.
          </p>
          <label className="flex cursor-pointer items-start gap-2">
            <input type="checkbox" className="mt-1" checked={bestaetigt} onChange={(ev) => setBestaetigt(ev.target.checked)} />
            <span>Ich bestätige den kostenpflichtigen Kauf dieser Nummer.</span>
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setKaufOffen(false); setBestaetigt(false); }}>
              Abbrechen
            </Button>
            <Button onClick={kaufen} disabled={!bestaetigt || !!arbeitet}>
              <ShoppingCart /> Jetzt kostenpflichtig kaufen
            </Button>
          </div>
        </div>
      </Modal>
    </Card>
  );
}

function Hinweis({ children }: { children: React.ReactNode }) {
  return <p className="rounded-[12px] bg-amber-50 px-3 py-2 text-amber-800">{children}</p>;
}

function Schritt({ nr, titel, fertig, children }: { nr: number; titel: string; fertig: boolean; children: React.ReactNode }) {
  return (
    <section className="grid grid-cols-[28px_1fr] gap-x-3">
      <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[13px] font-medium ${fertig ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'}`}>{fertig ? '✓' : nr}</span>
      <div>
        <h3 className="mb-1 font-medium">{titel}</h3>
        {children}
      </div>
    </section>
  );
}
