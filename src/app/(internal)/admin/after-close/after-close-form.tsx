'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Rocket, CheckCircle2, ExternalLink, AlertTriangle, Check } from 'lucide-react';
import { BAUSTEINE, PAKET_VORLAGEN, paketVorlage, type Baustein } from '@/lib/fulfillment/pakete';

interface FormData {
  // Kunde
  firma: string;
  rechtsform: string;
  anschrift: string;
  ansprechpartner: string;
  telefon: string;
  email: string;
  rechnungsmail: string;
  ust_id: string;
  // Vertrag
  paket: string;
  bausteine: Baustein[];
  setup_betrag: string;
  mrr: string;
  laufzeit_monate: string;
  werbebudget: string;
  start_datum: string;
  // Leistung
  branche: string;
  produkt: string;
  regionen: string;
  gesuchte_rolle: string;
  anzahl_starter: string;
  // Zusagen
  zusagen_closer: string;
  sonderfaelle: string;
}

interface SuccessResult {
  agency: { id: string; name: string };
  invite_url: string | null;
}

const initialForm: FormData = {
  firma: '',
  rechtsform: '',
  anschrift: '',
  ansprechpartner: '',
  telefon: '',
  email: '',
  rechnungsmail: '',
  ust_id: '',
  paket: 'starter',
  bausteine: ['indeed', 'meta'],
  setup_betrag: '',
  mrr: '',
  laufzeit_monate: '12',
  werbebudget: '',
  start_datum: new Date().toISOString().slice(0, 10),
  branche: '',
  produkt: '',
  regionen: '',
  gesuchte_rolle: '',
  anzahl_starter: '',
  zusagen_closer: '',
  sonderfaelle: '',
};

const paketOptions = PAKET_VORLAGEN.map((p) => ({
  value: p.key,
  label: p.retainer ? `${p.name} · ${p.retainer.toLocaleString('de-DE')} €/Monat` : p.name,
}));

const branchenOptions = [
  { value: '', label: 'Bitte wählen...' },
  { value: 'solar', label: 'Solar' },
  { value: 'glasfaser', label: 'Glasfaser' },
  { value: 'strom_gas', label: 'Strom & Gas' },
  { value: 'telko', label: 'Telko' },
  { value: 'versicherung', label: 'Versicherung' },
];

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-base font-bold text-gray-900 mb-4 pb-2 border-b border-gray-100">
      {children}
    </h3>
  );
}

function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-sm font-semibold text-gray-900 mb-1">
      {children}
      {required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}

export function AfterCloseForm() {
  const [form, setForm] = useState<FormData>(initialForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<SuccessResult | null>(null);

  function update(field: keyof FormData) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };
  }

  /** Paket wählen → Leistungen, Preis und Laufzeit vorbelegen (danach frei anpassbar) */
  function waehlePaket(key: string) {
    const v = paketVorlage(key);
    setForm((prev) => ({
      ...prev,
      paket: key,
      ...(v && {
        bausteine: v.bausteine,
        mrr: v.retainer ? String(v.retainer) : prev.mrr,
        setup_betrag: v.setup ? String(v.setup) : '',
        laufzeit_monate: String(v.laufzeit),
      }),
    }));
  }

  function toggleBaustein(b: Baustein) {
    setForm((prev) => ({
      ...prev,
      bausteine: prev.bausteine.includes(b) ? prev.bausteine.filter((x) => x !== b) : [...prev.bausteine, b],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    const payload = {
      firma: form.firma.trim(),
      rechtsform: form.rechtsform.trim() || undefined,
      anschrift: form.anschrift.trim() || undefined,
      ansprechpartner: form.ansprechpartner.trim(),
      telefon: form.telefon.trim(),
      email: form.email.trim(),
      rechnungsmail: form.rechnungsmail.trim() || undefined,
      ust_id: form.ust_id.trim() || undefined,
      paket: form.paket,
      bausteine: form.bausteine,
      setup_betrag: form.setup_betrag ? parseFloat(form.setup_betrag) : undefined,
      mrr: form.mrr ? parseFloat(form.mrr) : undefined,
      laufzeit_monate: form.laufzeit_monate ? parseInt(form.laufzeit_monate, 10) : undefined,
      werbebudget: form.werbebudget ? parseFloat(form.werbebudget) : undefined,
      start_datum: form.start_datum || undefined,
      branche: form.branche || undefined,
      produkt: form.produkt.trim() || undefined,
      regionen: form.regionen.trim()
        ? form.regionen.split(',').map((r) => r.trim()).filter(Boolean)
        : undefined,
      gesuchte_rolle: form.gesuchte_rolle.trim() || undefined,
      anzahl_starter: form.anzahl_starter ? parseInt(form.anzahl_starter, 10) : undefined,
      zusagen_closer: form.zusagen_closer.trim(),
      sonderfaelle: form.sonderfaelle.trim() || undefined,
    };

    try {
      const res = await fetch('/api/admin/after-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Fehler beim Anlegen.');
        setSubmitting(false);
        return;
      }

      setResult(data as SuccessResult);
    } catch {
      setError('Netzwerkfehler. Bitte erneut versuchen.');
    }

    setSubmitting(false);
  }

  // --- Success State ---
  if (result) {
    return (
      <div className="max-w-3xl">
        <PageHeader
          label="AFTER-CLOSE"
          title="Kunde erfolgreich angelegt"
        />

        <Card padding="lg" className="space-y-6">
          <div className="flex items-center gap-3 text-green-700">
            <CheckCircle2 className="w-8 h-8" />
            <div>
              <p className="text-lg font-bold">{result.agency.name}</p>
              <p className="text-sm text-gray-500">Projekt-Setup abgeschlossen</p>
            </div>
          </div>

          <div className="rounded-lg bg-gray-50 p-4 text-sm text-gray-700">
            Der Kunde steht jetzt in der Phase „Zahlungsabwicklung“ – alle Schritte nach gebuchten Leistungen sind angelegt.{' '}
            <a href={`/clients/${result.agency.id}`} className="font-semibold text-red-700 underline underline-offset-2">
              Zur Kundenseite
            </a>
          </div>

          {result.invite_url && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-blue-900 mb-1">Einladungslink</p>
              <p className="text-sm text-blue-700 break-all font-mono">{result.invite_url}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <a href={`/clients/${result.agency.id}`}>
              <Button size="md">
                <ExternalLink className="w-4 h-4" />
                Zum Kundenprofil
              </Button>
            </a>
            <Button
              variant="secondary"
              size="md"
              onClick={() => {
                setResult(null);
                setForm(initialForm);
              }}
            >
              Weiteren Kunden anlegen
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // --- Form ---
  return (
    <div className="max-w-3xl">
      <PageHeader
        label="AFTER-CLOSE"
        title="Neuen Kunden anlegen"
        description="Alle Infos aus dem Close-Call eintragen. Das System erstellt automatisch das Projekt, alle Aufgaben und Zugänge."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Section 1: Kundendaten */}
        <Card padding="md">
          <SectionTitle>Kundendaten</SectionTitle>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Firma</FieldLabel>
                <Input
                  value={form.firma}
                  onChange={update('firma')}
                  placeholder="z.B. SolarMax GmbH"
                  required
                />
              </div>
              <div>
                <FieldLabel>Rechtsform</FieldLabel>
                <Input
                  value={form.rechtsform}
                  onChange={update('rechtsform')}
                  placeholder="z.B. GmbH, UG, AG"
                />
              </div>
            </div>

            <div>
              <FieldLabel>Anschrift</FieldLabel>
              <Input
                value={form.anschrift}
                onChange={update('anschrift')}
                placeholder="Straße, PLZ Ort"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Ansprechpartner</FieldLabel>
                <Input
                  value={form.ansprechpartner}
                  onChange={update('ansprechpartner')}
                  placeholder="Vor- und Nachname"
                  required
                />
              </div>
              <div>
                <FieldLabel required>Telefon</FieldLabel>
                <Input
                  type="tel"
                  value={form.telefon}
                  onChange={update('telefon')}
                  placeholder="+49 ..."
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>E-Mail</FieldLabel>
                <Input
                  type="email"
                  value={form.email}
                  onChange={update('email')}
                  placeholder="kontakt@firma.de"
                  required
                />
              </div>
              <div>
                <FieldLabel>Rechnungsmail</FieldLabel>
                <Input
                  type="email"
                  value={form.rechnungsmail}
                  onChange={update('rechnungsmail')}
                  placeholder="buchhaltung@firma.de"
                />
              </div>
            </div>

            <div className="w-1/2">
              <FieldLabel>USt-ID</FieldLabel>
              <Input
                value={form.ust_id}
                onChange={update('ust_id')}
                placeholder="DE123456789"
              />
            </div>
          </div>
        </Card>

        {/* Section 2: Vertrag */}
        <Card padding="md">
          <SectionTitle>Vertrag</SectionTitle>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel required>Paket</FieldLabel>
                <Select
                  value={form.paket}
                  onChange={(e) => waehlePaket(e.target.value)}
                  options={paketOptions}
                />
              </div>
              <div>
                <FieldLabel>Setup-Betrag</FieldLabel>
                <Input
                  type="number"
                  value={form.setup_betrag}
                  onChange={update('setup_betrag')}
                  placeholder="z.B. 2500"
                />
              </div>
            </div>

            <div>
              <FieldLabel required>Was wir liefern</FieldLabel>
              <p className="text-xs text-gray-500 mb-2">
                Bestimmt die Schritte im Fulfillment. Cloud-Zugang und Masterclass mit Skripten sind immer dabei.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {BAUSTEINE.map((b) => {
                  const an = form.bausteine.includes(b.key);
                  return (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => toggleBaustein(b.key)}
                      aria-pressed={an}
                      className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition-colors ${
                        an ? 'border-red-700 bg-red-50' : 'border-gray-200 bg-white hover:border-gray-300'
                      }`}
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                          an ? 'border-red-700 bg-red-700 text-white' : 'border-gray-300 bg-white'
                        }`}
                      >
                        {an && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span>
                        <span className="block text-sm font-semibold text-gray-900">{b.label}</span>
                        <span className="block text-xs text-gray-500">{b.hinweis}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <FieldLabel>Retainer (MRR)</FieldLabel>
                <Input
                  type="number"
                  value={form.mrr}
                  onChange={update('mrr')}
                  placeholder="z.B. 1500"
                />
              </div>
              <div>
                <FieldLabel>Laufzeit (Monate)</FieldLabel>
                <Input
                  type="number"
                  value={form.laufzeit_monate}
                  onChange={update('laufzeit_monate')}
                  placeholder="12"
                />
              </div>
              <div>
                <FieldLabel>Werbebudget</FieldLabel>
                <Input
                  type="number"
                  value={form.werbebudget}
                  onChange={update('werbebudget')}
                  placeholder="z.B. 1000"
                />
              </div>
            </div>

            <div className="w-1/2">
              <FieldLabel>Startdatum</FieldLabel>
              <Input
                type="date"
                value={form.start_datum}
                onChange={update('start_datum')}
              />
            </div>
          </div>
        </Card>

        {/* Section 3: Leistung */}
        <Card padding="md">
          <SectionTitle>Leistung</SectionTitle>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Branche</FieldLabel>
                <Select
                  value={form.branche}
                  onChange={update('branche')}
                  options={branchenOptions}
                />
              </div>
              <div>
                <FieldLabel>Produkt</FieldLabel>
                <Input
                  value={form.produkt}
                  onChange={update('produkt')}
                  placeholder="z.B. D2D Solar"
                />
              </div>
            </div>

            <div>
              <FieldLabel>Regionen</FieldLabel>
              <Input
                value={form.regionen}
                onChange={update('regionen')}
                placeholder="Kommagetrennt, z.B. NRW, Bayern, Hessen"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <FieldLabel>Gesuchte Rolle</FieldLabel>
                <Input
                  value={form.gesuchte_rolle}
                  onChange={update('gesuchte_rolle')}
                  placeholder="z.B. Sales-Berater, Teamleiter"
                />
              </div>
              <div>
                <FieldLabel>Anzahl Starter</FieldLabel>
                <Input
                  type="number"
                  value={form.anzahl_starter}
                  onChange={update('anzahl_starter')}
                  placeholder="z.B. 5"
                />
              </div>
            </div>
          </div>
        </Card>

        {/* Section 4: Zusagen & Sonderfälle */}
        <Card padding="md">
          <SectionTitle>Zusagen &amp; Sonderfälle</SectionTitle>
          <div className="space-y-4">
            <div>
              <FieldLabel required>Zusagen aus dem Call</FieldLabel>
              <p className="text-xs text-gray-500 mb-1.5">
                Alles, was du dem Kunden versprochen hast. Das Team braucht das, um zu liefern.
              </p>
              <textarea
                value={form.zusagen_closer}
                onChange={update('zusagen_closer')}
                required
                rows={4}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 resize-y"
                placeholder="z.B. Erste Bewerber innerhalb von 5 Tagen, 2 qualifizierte Kandidaten pro Woche..."
              />
            </div>

            <div>
              <FieldLabel>Sonderfälle</FieldLabel>
              <p className="text-xs text-gray-500 mb-1.5">
                Abweichende Garantie, Sonderpreis, besondere Absprachen etc.
              </p>
              <textarea
                value={form.sonderfaelle}
                onChange={update('sonderfaelle')}
                rows={3}
                className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 shadow-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 resize-y"
                placeholder="z.B. 30 Tage Geld-zurück, erster Monat 50% Rabatt..."
              />
            </div>
          </div>
        </Card>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg p-4">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Submit */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Badge tone="softAccent">{paketVorlage(form.paket)?.name ?? form.paket}</Badge>
            {form.firma && (
              <span className="text-sm text-gray-500">{form.firma}</span>
            )}
          </div>
          <Button type="submit" size="lg" disabled={submitting || form.bausteine.length === 0} glow>
            <Rocket className="w-5 h-5" />
            {submitting ? 'Wird angelegt...' : 'Kunde anlegen & Projekt starten'}
          </Button>
        </div>
      </form>
    </div>
  );
}
