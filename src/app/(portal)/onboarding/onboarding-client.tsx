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
  Building2, MapPin, Users, Globe, Target,
  DollarSign, Palette, Phone, User, ChevronRight, ChevronLeft, Check,
  ShieldCheck,
} from 'lucide-react';

const steps = [
  { id: 1, title: 'Unternehmen', icon: Building2 },
  { id: 2, title: 'Recruiting-Ziele', icon: Target },
  { id: 3, title: 'Branding', icon: Palette },
  { id: 4, title: 'Kontakt', icon: Phone },
  { id: 5, title: 'Meta-Zugang', icon: ShieldCheck },
];

const industries = [
  { value: '', label: 'Branche wählen' },
  { value: 'solar', label: 'Solar' },
  { value: 'glasfaser', label: 'Glasfaser' },
  { value: 'strom_gas', label: 'Strom & Gas' },
  { value: 'telekommunikation', label: 'Telekommunikation' },
  { value: 'versicherung', label: 'Versicherung' },
  { value: 'sonstige', label: 'Sonstige' },
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
    company_name: '', industry: '', region: '', employee_count: '', website_url: '',
    hiring_target: '', hiring_timeframe: '', experience_required: '', compensation_model: '',
    logo_url: '',
    team_photos: [] as string[],
    primary_color: '#E0354B', usps: '',
    has_video_shoot: false, reels_per_month: 0,
    contact_name: '', contact_phone: '', preferred_contact_time: '',
    meta_access_steps: {
      business_manager: false,
      partner_added: false,
      ad_account_shared: false,
      pixel_shared: false,
      page_shared: false,
      indeed_forwarding: false,
    },
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSubmit() {
    setLoading(true);
    setError('');

    const res = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        hiring_target: form.hiring_target ? parseInt(form.hiring_target) : null,
        logo_url: form.logo_url || null,
        team_photos: form.team_photos,
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
        description="Erzähle uns von deinem Unternehmen, damit wir alles für dich aufsetzen können."
      />

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div key={s.id} className="flex items-center gap-2">
            <button
              onClick={() => s.id < step && setStep(s.id)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                s.id === step
                  ? 'bg-red-50 border border-red-200 text-red-600'
                  : s.id < step
                  ? 'bg-green-100 text-green-700 cursor-pointer'
                  : 'bg-[var(--surface-inset)] text-[var(--text-tertiary)]'
              }`}
            >
              {s.id < step ? <Check className="w-3.5 h-3.5" /> : <s.icon className="w-3.5 h-3.5" />}
              {s.title}
            </button>
            {i < steps.length - 1 && <div className="w-6 h-px bg-[var(--border-default)]" />}
          </div>
        ))}
      </div>

      <Card padding="lg">
        {/* Step 1: Unternehmen */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Firmenname *</label>
              <Input value={form.company_name} onChange={(e) => update('company_name', e.target.value)} icon={<Building2 className="w-4 h-4" />} placeholder="Dein Unternehmen" />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Branche *</label>
              <Select value={form.industry} onChange={(e) => update('industry', e.target.value)} options={industries} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Region / Standort</label>
              <Input value={form.region} onChange={(e) => update('region', e.target.value)} icon={<MapPin className="w-4 h-4" />} placeholder="z.B. Berlin, NRW, bundesweit" />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Aktuelle Mitarbeiteranzahl</label>
              <Input value={form.employee_count} onChange={(e) => update('employee_count', e.target.value)} icon={<Users className="w-4 h-4" />} placeholder="z.B. 5-10" />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Website</label>
              <Input value={form.website_url} onChange={(e) => update('website_url', e.target.value)} icon={<Globe className="w-4 h-4" />} placeholder="https://..." />
            </div>
          </div>
        )}

        {/* Step 2: Recruiting-Ziele */}
        {step === 2 && (
          <div className="space-y-5">
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Wie viele Mitarbeiter einstellen?</label>
              <Input type="number" value={form.hiring_target} onChange={(e) => update('hiring_target', e.target.value)} icon={<Target className="w-4 h-4" />} placeholder="z.B. 5" />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">In welchem Zeitraum?</label>
              <Select value={form.hiring_timeframe} onChange={(e) => update('hiring_timeframe', e.target.value)} options={[
                { value: '', label: 'Zeitraum wählen' },
                { value: '1_month', label: 'Innerhalb 1 Monat' },
                { value: '3_months', label: 'Innerhalb 3 Monaten' },
                { value: '6_months', label: 'Innerhalb 6 Monaten' },
                { value: 'ongoing', label: 'Laufend' },
              ]} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Erfahrung gewünscht?</label>
              <Select value={form.experience_required} onChange={(e) => update('experience_required', e.target.value)} options={[
                { value: '', label: 'Auswählen' },
                { value: 'experienced', label: 'Nur mit Erfahrung' },
                { value: 'quereinsteiger_ok', label: 'Quereinsteiger willkommen' },
                { value: 'no_preference', label: 'Egal' },
              ]} />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Gehalt / Provisions-Modell</label>
              <Input value={form.compensation_model} onChange={(e) => update('compensation_model', e.target.value)} icon={<DollarSign className="w-4 h-4" />} placeholder="z.B. Fixum + Provision, reines Provisionsmodell" />
            </div>

            <div className="pt-4 border-t border-[var(--border-default)]">
              <p className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">Video & Content</p>
              <label className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border-default)] hover:border-red-200 transition cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={form.has_video_shoot}
                  onChange={(e) => setForm(f => ({ ...f, has_video_shoot: e.target.checked }))}
                  className="w-5 h-5 rounded accent-red-500"
                />
                <div>
                  <p className="text-sm font-medium text-[var(--text-primary)]">Videodreh geplant</p>
                  <p className="text-xs text-[var(--text-tertiary)]">Wir planen einen Recruiting-Videodreh für euch</p>
                </div>
              </label>
              <div>
                <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Reels pro Monat</label>
                <Input
                  type="number"
                  value={form.reels_per_month.toString()}
                  onChange={(e) => setForm(f => ({ ...f, reels_per_month: parseInt(e.target.value) || 0 }))}
                  placeholder="0 = keine Reels"
                />
                <p className="text-xs text-[var(--text-tertiary)] mt-1">Wie viele Reels sollen monatlich erstellt werden? (0 wenn keine)</p>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Branding */}
        {step === 3 && (
          <div className="space-y-5">
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
            <FileUpload
              bucket="onboarding-assets"
              path="team-photos"
              accept="image/png,image/jpeg"
              maxSizeMB={5}
              maxFiles={10}
              value={form.team_photos}
              onChange={(urls) => setForm((f) => ({ ...f, team_photos: urls }))}
              label="Team-Fotos (optional)"
            />
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Primärfarbe</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={form.primary_color}
                  onChange={(e) => update('primary_color', e.target.value)}
                  className="w-11 h-11 rounded-[var(--radius-md)] border border-[var(--border-default)] cursor-pointer"
                />
                <Input value={form.primary_color} onChange={(e) => update('primary_color', e.target.value)} icon={<Palette className="w-4 h-4" />} className="flex-1" />
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Was macht euch besonders? (USPs)</label>
              <textarea
                value={form.usps}
                onChange={(e) => update('usps', e.target.value)}
                placeholder="z.B. Höchste Provisionen der Branche, eigenes Schulungsprogramm, familiäres Team..."
                rows={4}
                className="w-full px-4 py-3 border border-[var(--border-default)] rounded-[var(--radius-md)] text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] bg-white shadow-[var(--shadow-xs)] outline-none resize-none"
              />
            </div>
          </div>
        )}

        {/* Step 4: Kontakt */}
        {step === 4 && (
          <div className="space-y-5">
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Ansprechpartner</label>
              <Input value={form.contact_name} onChange={(e) => update('contact_name', e.target.value)} icon={<User className="w-4 h-4" />} placeholder="Vor- und Nachname" />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Telefon</label>
              <Input value={form.contact_phone} onChange={(e) => update('contact_phone', e.target.value)} icon={<Phone className="w-4 h-4" />} placeholder="+49..." />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Bevorzugte Kontaktzeit</label>
              <Select value={form.preferred_contact_time} onChange={(e) => update('preferred_contact_time', e.target.value)} options={[
                { value: '', label: 'Auswählen' },
                { value: 'morning', label: 'Vormittags (9-12 Uhr)' },
                { value: 'afternoon', label: 'Nachmittags (12-17 Uhr)' },
                { value: 'evening', label: 'Abends (17-20 Uhr)' },
                { value: 'anytime', label: 'Jederzeit' },
              ]} />
            </div>

            {error && (
              <p className="text-[var(--danger-600)] text-[13px] bg-red-50 px-3 py-2 rounded-[var(--radius-sm)]">{error}</p>
            )}
          </div>
        )}

        {/* Step 5: Meta-Zugang */}
        {step === 5 && (
          <div className="space-y-4">
            <div className="p-4 rounded-[var(--radius-md)] bg-blue-50 border border-blue-100">
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
                className="flex items-start gap-3 p-4 rounded-[var(--radius-md)] border border-[var(--border-default)] hover:border-red-200 transition cursor-pointer"
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
                  <p className="font-semibold text-[var(--text-primary)] text-[15px]">{item.title}</p>
                  <p className="text-sm text-[var(--text-secondary)] mt-0.5">{item.desc}</p>
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
                  className="w-5 h-5 rounded accent-red-500"
                />
                <span className="text-sm font-medium text-gray-900">Indeed-Weiterleitung eingerichtet</span>
              </label>
            </div>

            {error && (
              <p className="text-[var(--danger-600)] text-[13px] bg-red-50 px-3 py-2 rounded-[var(--radius-sm)]">{error}</p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex justify-between mt-8 pt-6 border-t border-[var(--border-default)]">
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
