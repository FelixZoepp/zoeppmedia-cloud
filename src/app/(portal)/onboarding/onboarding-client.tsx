'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import { FileUpload } from '@/components/file-upload';
import {
  Briefcase, MapPin, Palette, Phone, User, ChevronRight, ChevronLeft, Check,
  ShieldCheck, DollarSign, Building2, Sparkles,
} from 'lucide-react';

const steps = [
  { id: 1, title: 'Stelle & Produkt', icon: Briefcase },
  { id: 2, title: 'Vergütung & Karriere', icon: DollarSign },
  { id: 3, title: 'Unternehmen & Extras', icon: Sparkles },
  { id: 4, title: 'Kontakt', icon: Phone },
  { id: 5, title: 'Meta & Indeed Zugang', icon: ShieldCheck },
];

const productOptions = [
  { value: '', label: 'Produkt/Branche wählen' },
  { value: 'pv', label: 'Photovoltaik (PV)' },
  { value: 'glasfaser', label: 'Glasfaser' },
  { value: 'strom_gas', label: 'Strom & Gas' },
  { value: 'telko', label: 'Telekommunikation' },
  { value: 'versicherung', label: 'Versicherung' },
];

const taskTypeOptions = [
  { value: '', label: 'Aufgabe wählen' },
  { value: 'leads_only', label: 'Nur Leads erfassen' },
  { value: 'contract_close', label: 'Vertragsabschluss' },
];

const compensationOptions = [
  { value: '', label: 'Vergütungsmodell wählen' },
  { value: 'pure_commission', label: 'Reine Provision' },
  { value: 'commission_guarantee', label: 'Provision + Garantiegehalt' },
  { value: 'fixed_commission', label: 'Fixum + Provision' },
];

const employmentTypeOptions = [
  { value: '', label: 'Anstellungsart wählen' },
  { value: 'self_employed', label: 'Selbstständig (§84 HGB)' },
  { value: 'employed', label: 'Angestellt' },
];

const careerLevelOptions = [
  { value: 'vertriebler', label: 'Vertriebler' },
  { value: 'ausbilder', label: 'Ausbilder' },
  { value: 'teamleiter', label: 'Teamleiter' },
  { value: 'standortleiter', label: 'Standortleiter' },
];

const companyCarFromOptions = [
  { value: '', label: 'Firmenwagen ab Stufe wählen' },
  { value: 'vertriebler', label: 'Ab Vertriebler' },
  { value: 'ausbilder', label: 'Ab Ausbilder' },
  { value: 'teamleiter', label: 'Ab Teamleiter' },
  { value: 'standortleiter', label: 'Ab Standortleiter' },
  { value: 'nein', label: 'Kein Firmenwagen' },
];

const trainingTypeOptions = [
  { value: '', label: 'Ausbildungsart wählen' },
  { value: 'one_on_one', label: '1:1 Einarbeitung' },
  { value: 'video_course', label: 'Videokurs' },
  { value: 'mentor', label: 'Mentor-Programm' },
  { value: 'learning_by_doing', label: 'Learning by doing' },
];

const toneOptions = [
  { value: 'du', label: 'Du (informell)' },
  { value: 'sie', label: 'Sie (formell)' },
];

const extrasOptions = [
  { value: 'gutscheine', label: 'Gutscheine' },
  { value: 'events', label: 'Events' },
  { value: 'coachings', label: 'Coachings' },
  { value: 'ausruestung', label: 'Ausrüstung' },
  { value: 'tankkarte', label: 'Tankkarte' },
];

interface OnboardingClientProps {
  agencyId: string | null;
}

export function OnboardingClient({ agencyId }: OnboardingClientProps) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    // Step 1 — Stelle & Produkt
    company_name: '',
    job_title: '',
    regions: '',
    radius_km: '',
    product: '',
    task_type: '',
    // Step 2 — Vergütung & Karriere
    compensation: '',
    commission_per_unit: '',
    monthly_earning_from: '',
    monthly_earning_to: '',
    employment_type: '',
    career_levels: [] as string[],
    company_car_from: '',
    training_type: '',
    // Step 3 — Unternehmen & Extras
    client_nameable: false,
    client_name: '',
    extras: [] as string[],
    experience_needed: false,
    drivers_license_needed: false,
    start_date: '',
    tone: 'du',
    logo_url: '',
    primary_color: '#E0354B',
    // Step 4 — Kontakt
    contact_name: '',
    contact_phone: '',
    preferred_contact_time: '',
    // Step 5 — Meta & Indeed
    meta_access_steps: {
      business_manager: false,
      partner_added: false,
      ad_account_shared: false,
      pixel_shared: false,
      page_shared: false,
      indeed_forwarding: false,
    },
  });

  function update(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  function toggleArrayItem(field: 'career_levels' | 'extras', value: string) {
    setForm((prev) => {
      const current = prev[field];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [field]: next };
    });
  }

  async function handleSubmit() {
    setLoading(true);
    setError('');

    const regionsArray = form.regions
      .split(',')
      .map((r) => r.trim())
      .filter(Boolean);

    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_name: form.company_name || null,
        job_title: form.job_title || null,
        regions: regionsArray.length > 0 ? regionsArray : null,
        radius_km: form.radius_km ? parseInt(form.radius_km) : null,
        product: form.product || null,
        task_type: form.task_type || null,
        compensation: form.compensation || null,
        commission_per_unit: form.commission_per_unit || null,
        monthly_earning_from: form.monthly_earning_from ? parseInt(form.monthly_earning_from) : null,
        monthly_earning_to: form.monthly_earning_to ? parseInt(form.monthly_earning_to) : null,
        employment_type: form.employment_type || null,
        career_levels: form.career_levels.length > 0 ? form.career_levels : null,
        company_car_from: form.company_car_from || null,
        training_type: form.training_type || null,
        client_nameable: form.client_nameable,
        client_name: form.client_nameable ? (form.client_name || null) : null,
        extras: form.extras.length > 0 ? form.extras : null,
        experience_needed: form.experience_needed,
        drivers_license_needed: form.drivers_license_needed,
        start_date: form.start_date || null,
        tone: form.tone,
        logo_url: form.logo_url || null,
        primary_color: form.primary_color || null,
        contact_name: form.contact_name || null,
        contact_phone: form.contact_phone || null,
        preferred_contact_time: form.preferred_contact_time || null,
        meta_access_steps: form.meta_access_steps,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Fehler beim Speichern');
      setLoading(false);
      return;
    }

    router.push('/dashboard');
    router.refresh();
  }

  const indeedEmail = `bewerber+${agencyId}@zoeppmedia.de`;

  return (
    <div className="max-w-2xl mx-auto">
      <PageHeader
        label="ONBOARDING"
        title="Onboarding"
        description="Erzähle uns von deiner Stelle, damit wir Anzeigen, Skripte und Funnel für dich erstellen können."
      />

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 flex-wrap">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <button
              onClick={() => s.id < step && setStep(s.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                s.id === step
                  ? 'bg-red-50 border border-red-200 text-red-700'
                  : s.id < step
                  ? 'bg-green-100 text-green-700 cursor-pointer'
                  : 'bg-gray-100 text-gray-400'
              }`}
            >
              {s.id < step ? <Check className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />}
              {s.title}
            </button>
            {i < steps.length - 1 && <div className="w-6 h-px bg-gray-200" />}
          </div>
        ))}
      </div>

      <Card padding="lg">
        {/* Step 1: Stelle & Produkt */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Firmenname *</label>
              <Input value={form.company_name} onChange={(e) => update('company_name', e.target.value)} icon={<Building2 className="w-4 h-4" />} placeholder="Dein Unternehmen" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Stellenbezeichnung *</label>
              <Input value={form.job_title} onChange={(e) => update('job_title', e.target.value)} icon={<Briefcase className="w-4 h-4" />} placeholder="z.B. Vertriebsmitarbeiter Glasfaser" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Regionen (kommagetrennt)</label>
              <Input value={form.regions} onChange={(e) => update('regions', e.target.value)} icon={<MapPin className="w-4 h-4" />} placeholder="z.B. NRW, Hessen, Bayern" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Radius (km)</label>
              <Input type="number" value={form.radius_km} onChange={(e) => update('radius_km', e.target.value)} placeholder="z.B. 50" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Produkt / Branche *</label>
              <Select value={form.product} onChange={(e) => update('product', e.target.value)} options={productOptions} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Aufgabe *</label>
              <Select value={form.task_type} onChange={(e) => update('task_type', e.target.value)} options={taskTypeOptions} />
            </div>
          </div>
        )}

        {/* Step 2: Vergütung & Karriere */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Vergütungsmodell *</label>
              <Select value={form.compensation} onChange={(e) => update('compensation', e.target.value)} options={compensationOptions} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Provision je Einheit</label>
              <Input value={form.commission_per_unit} onChange={(e) => update('commission_per_unit', e.target.value)} icon={<DollarSign className="w-4 h-4" />} placeholder="z.B. 350€ pro Vertrag" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Monatsverdienst von (€)</label>
                <Input type="number" value={form.monthly_earning_from} onChange={(e) => update('monthly_earning_from', e.target.value)} placeholder="z.B. 3000" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Monatsverdienst bis (€)</label>
                <Input type="number" value={form.monthly_earning_to} onChange={(e) => update('monthly_earning_to', e.target.value)} placeholder="z.B. 8000" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Anstellungsart *</label>
              <Select value={form.employment_type} onChange={(e) => update('employment_type', e.target.value)} options={employmentTypeOptions} />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Aufstiegsstufen</label>
              <div className="grid grid-cols-2 gap-2">
                {careerLevelOptions.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 hover:border-red-200 transition cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.career_levels.includes(opt.value)}
                      onChange={() => toggleArrayItem('career_levels', opt.value)}
                      className="w-4 h-4 rounded accent-red-600"
                    />
                    <span className="text-sm text-gray-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Firmenwagen ab Stufe</label>
              <Select value={form.company_car_from} onChange={(e) => update('company_car_from', e.target.value)} options={companyCarFromOptions} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Ausbildung / Einarbeitung</label>
              <Select value={form.training_type} onChange={(e) => update('training_type', e.target.value)} options={trainingTypeOptions} />
            </div>
          </div>
        )}

        {/* Step 3: Unternehmen & Extras */}
        {step === 3 && (
          <div className="space-y-5">
            <div>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-red-200 transition cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.client_nameable}
                  onChange={(e) => update('client_nameable', e.target.checked)}
                  className="w-5 h-5 rounded accent-red-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Auftraggeber nennbar?</p>
                  <p className="text-xs text-gray-400">Darf der Kunde in Anzeigen genannt werden?</p>
                </div>
              </label>
              {form.client_nameable && (
                <div className="mt-3">
                  <Input value={form.client_name} onChange={(e) => update('client_name', e.target.value)} placeholder="Name des Auftraggebers" />
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-2">Extras / Benefits</label>
              <div className="grid grid-cols-2 gap-2">
                {extrasOptions.map((opt) => (
                  <label key={opt.value} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-200 hover:border-red-200 transition cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.extras.includes(opt.value)}
                      onChange={() => toggleArrayItem('extras', opt.value)}
                      className="w-4 h-4 rounded accent-red-600"
                    />
                    <span className="text-sm text-gray-700">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-red-200 transition cursor-pointer">
              <input
                type="checkbox"
                checked={form.experience_needed}
                onChange={(e) => update('experience_needed', e.target.checked)}
                className="w-5 h-5 rounded accent-red-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Vorwissen nötig?</p>
                <p className="text-xs text-gray-400">Muss der Bewerber Vertriebserfahrung mitbringen?</p>
              </div>
            </label>

            <label className="flex items-center gap-3 p-3 rounded-xl border border-gray-200 hover:border-red-200 transition cursor-pointer">
              <input
                type="checkbox"
                checked={form.drivers_license_needed}
                onChange={(e) => update('drivers_license_needed', e.target.checked)}
                className="w-5 h-5 rounded accent-red-600"
              />
              <div>
                <p className="text-sm font-medium text-gray-900">Führerschein / eigenes KFZ Pflicht?</p>
                <p className="text-xs text-gray-400">Muss der Bewerber mobil sein?</p>
              </div>
            </label>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Startdatum</label>
              <Input value={form.start_date} onChange={(e) => update('start_date', e.target.value)} placeholder="z.B. Ab sofort, 01.09.2026" />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Ansprache in Texten</label>
              <Select value={form.tone} onChange={(e) => update('tone', e.target.value)} options={toneOptions} />
            </div>

            <div className="pt-4 border-t border-gray-200">
              <p className="text-xs font-semibold text-gray-900 mb-3">Branding</p>
              <FileUpload
                bucket="onboarding-assets"
                path="logos"
                accept="image/png,image/jpeg,image/svg+xml"
                maxSizeMB={5}
                maxFiles={1}
                value={form.logo_url ? [form.logo_url] : []}
                onChange={(urls) => setForm((f) => ({ ...f, logo_url: urls[0] || '' }))}
                label="Logo hochladen"
              />
              <div className="mt-4">
                <label className="block text-xs font-medium text-gray-600 mb-1.5">Primärfarbe</label>
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={form.primary_color}
                    onChange={(e) => update('primary_color', e.target.value)}
                    className="w-11 h-11 rounded-xl border border-gray-200 cursor-pointer"
                  />
                  <Input value={form.primary_color} onChange={(e) => update('primary_color', e.target.value)} icon={<Palette className="w-4 h-4" />} className="flex-1" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 4: Kontakt */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Ansprechpartner</label>
              <Input value={form.contact_name} onChange={(e) => update('contact_name', e.target.value)} icon={<User className="w-4 h-4" />} placeholder="Vor- und Nachname" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Telefon</label>
              <Input value={form.contact_phone} onChange={(e) => update('contact_phone', e.target.value)} icon={<Phone className="w-4 h-4" />} placeholder="+49..." />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Bevorzugte Kontaktzeit</label>
              <Select value={form.preferred_contact_time} onChange={(e) => update('preferred_contact_time', e.target.value)} options={[
                { value: '', label: 'Auswählen' },
                { value: 'morning', label: 'Vormittags (9-12 Uhr)' },
                { value: 'afternoon', label: 'Nachmittags (12-17 Uhr)' },
                { value: 'evening', label: 'Abends (17-20 Uhr)' },
                { value: 'anytime', label: 'Jederzeit' },
              ]} />
            </div>

            {error && (
              <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
          </div>
        )}

        {/* Step 5: Meta & Indeed Zugang */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-100">
              <p className="text-sm text-blue-800 font-medium">
                Damit wir Anzeigen in deinem Namen schalten können, brauchen wir Zugang zu deinem Meta Business Manager.
                Folge den Schritten unten — dauert ca. 5 Minuten.
              </p>
            </div>

            {[
              {
                key: 'business_manager',
                title: '1. Business Manager öffnen',
                desc: 'Gehe zu business.facebook.com und logge dich ein.',
              },
              {
                key: 'partner_added',
                title: '2. Partner hinzufügen',
                desc: 'Unter Einstellungen → Geschäftspartner → "Hinzufügen" klicken. Unsere Business-ID: XXXXXXXXXX',
              },
              {
                key: 'ad_account_shared',
                title: '3. Werbekonto freigeben',
                desc: 'Wähle dein Werbekonto aus und gib uns die Berechtigung "Anzeigen verwalten".',
              },
              {
                key: 'pixel_shared',
                title: '4. Pixel teilen (falls vorhanden)',
                desc: 'Falls du einen Meta Pixel hast, teile ihn ebenfalls mit uns.',
              },
              {
                key: 'page_shared',
                title: '5. Facebook-Seite freigeben',
                desc: 'Damit wir Anzeigen im Namen deiner Seite schalten können.',
              },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 hover:border-red-200 transition cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={form.meta_access_steps[item.key as keyof typeof form.meta_access_steps]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      meta_access_steps: { ...f.meta_access_steps, [item.key]: e.target.checked },
                    }))
                  }
                  className="mt-0.5 w-5 h-5 rounded accent-red-500 shrink-0"
                />
                <div>
                  <p className="font-semibold text-gray-900 text-sm">{item.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{item.desc}</p>
                </div>
              </label>
            ))}

            {/* Indeed Integration */}
            <div className="mt-8 pt-6 border-t border-gray-200">
              <h3 className="text-base font-semibold text-gray-900 mb-2">Indeed-Bewerbungen automatisch importieren</h3>
              <p className="text-sm text-gray-500 mb-4">
                Damit neue Indeed-Bewerbungen automatisch in deiner Cloud erscheinen, leite die Email-Benachrichtigungen weiter.
              </p>

              <div className="p-4 rounded-xl bg-blue-50 border border-blue-100 mb-4">
                <p className="text-sm text-blue-800 font-medium mb-2">Deine Indeed-Weiterleitungsadresse:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-white rounded-lg text-sm font-mono border border-blue-200 select-all">
                    {indeedEmail}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => navigator.clipboard.writeText(indeedEmail)}
                  >
                    Kopieren
                  </Button>
                </div>
              </div>

              <ol className="space-y-2 text-sm text-gray-600">
                <li className="flex gap-2"><span className="font-semibold text-gray-900">1.</span> Öffne Indeed → Konto → Benachrichtigungen</li>
                <li className="flex gap-2"><span className="font-semibold text-gray-900">2.</span> Aktiviere Email-Weiterleitung für neue Bewerbungen</li>
                <li className="flex gap-2"><span className="font-semibold text-gray-900">3.</span> Trage die obige Adresse als Weiterleitungsziel ein</li>
              </ol>

              <label className="flex items-center gap-3 mt-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.meta_access_steps.indeed_forwarding}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      meta_access_steps: { ...f.meta_access_steps, indeed_forwarding: e.target.checked },
                    }))
                  }
                  className="w-5 h-5 rounded accent-red-600"
                />
                <span className="text-sm font-medium text-gray-900">Indeed-Weiterleitung eingerichtet</span>
              </label>
            </div>

            {error && (
              <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{error}</p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t border-gray-200">
          {step > 1 ? (
            <Button variant="ghost" onClick={() => setStep(step - 1)}>
              <ChevronLeft className="w-4 h-4" /> Zurück
            </Button>
          ) : <div />}

          {step < 5 ? (
            <Button onClick={() => setStep(step + 1)}>
              Weiter <ChevronRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading} glow>
              {loading ? 'Wird gespeichert...' : 'Onboarding abschließen'}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
