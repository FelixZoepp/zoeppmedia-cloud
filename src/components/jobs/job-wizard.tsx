'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import { Check, Lock, Copy, ExternalLink, ArrowLeft, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

const STEPS = [
  { key: 'stammdaten', label: 'Stammdaten', active: true },
  { key: 'quellen', label: 'Quellen', active: true },
  { key: 'zusammenfassung', label: 'Zusammenfassung', active: true },
  { key: 'botfragen', label: 'Bot-Fragen', active: false, hint: 'Folgt in Phase 3' },
  { key: 'automationen', label: 'Automationen', active: false, hint: 'Folgt in Phase 4' },
];

const EMPLOYMENT_TYPES = [
  { value: '', label: 'Bitte waehlen' },
  { value: 'Vollzeit', label: 'Vollzeit' },
  { value: 'Teilzeit', label: 'Teilzeit' },
  { value: 'Minijob', label: 'Minijob' },
  { value: 'Freelance', label: 'Freelance / Selbststaendig' },
  { value: 'Praktikum', label: 'Praktikum' },
];

const INDEED_MODES = [
  { value: 'off', label: 'Deaktiviert' },
  { value: 'redirect', label: 'Weiterleitung (Bewerber zum eigenen Formular)' },
  { value: 'apply', label: 'Indeed Apply (Direkt-Bewerbung)' },
];

interface FormData {
  title: string;
  description: string;
  location: string;
  postal_code: string;
  employment_type: string;
  salary_range: string;
  indeed_mode: string;
}

export function JobWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [createdJob, setCreatedJob] = useState<{ id: string; slug: string; agency_slug?: string } | null>(null);

  const [form, setForm] = useState<FormData>({
    title: '',
    description: '',
    location: '',
    postal_code: '',
    employment_type: '',
    salary_range: '',
    indeed_mode: 'off',
  });

  function updateField(field: keyof FormData, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreate() {
    if (!form.title.trim()) {
      toast.error('Bitte einen Titel eingeben.');
      return;
    }
    // Guard against double creation
    if (createdJob) {
      setStep(1);
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description || null,
          location: form.location || null,
          postal_code: form.postal_code || null,
          employment_type: form.employment_type || null,
          salary_range: form.salary_range || null,
          indeed_mode: form.indeed_mode,
          status: 'draft',
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || 'Fehler beim Anlegen');
      }
      const job = await res.json();
      setCreatedJob(job);
      setStep(1); // Gehe zu Quellen
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Fehler beim Anlegen');
    } finally {
      setSaving(false);
    }
  }

  async function handleActivate() {
    if (!createdJob) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${createdJob.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'active', indeed_mode: form.indeed_mode }),
      });
      if (!res.ok) throw new Error('Fehler beim Aktivieren');
      toast.success('Stelle aktiviert!');
      router.push(`/jobs/${createdJob.id}`);
    } catch {
      toast.error('Fehler beim Aktivieren');
    } finally {
      setSaving(false);
    }
  }

  function handleSaveAsDraft() {
    if (createdJob) {
      toast.success('Stelle als Entwurf gespeichert.');
      router.push(`/jobs/${createdJob.id}`);
    }
  }

  const formLink = createdJob
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/apply/${createdJob.agency_slug || 'org'}/${createdJob.slug}`
    : null;

  return (
    <div>
      <PageHeader label="NEUE STELLE" title="Stelle anlegen" />

      {/* Schritt-Indikator */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto">
        {STEPS.map((s, i) => {
          const isCurrent = i === step;
          const isDone = i < step;
          const isDisabled = !s.active;
          return (
            <div key={s.key} className="flex items-center gap-2">
              {i > 0 && <div className="w-8 h-px bg-gray-200" />}
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap ${
                  isDisabled
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : isCurrent
                    ? 'bg-red-50 text-red-600 border border-red-200'
                    : isDone
                    ? 'bg-green-50 text-green-600'
                    : 'bg-gray-50 text-gray-500'
                }`}
              >
                {isDisabled ? (
                  <Lock className="w-3.5 h-3.5" />
                ) : isDone ? (
                  <Check className="w-3.5 h-3.5" />
                ) : (
                  <span className="w-5 h-5 rounded-full border-2 border-current flex items-center justify-center text-xs">
                    {i + 1}
                  </span>
                )}
                {s.label}
                {isDisabled && s.hint && (
                  <span className="text-xs text-gray-400 ml-1">({s.hint})</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Schritt 1: Stammdaten */}
      {step === 0 && (
        <Card className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Titel *</label>
            <Input
              value={form.title}
              onChange={(e) => updateField('title', e.target.value)}
              placeholder="z.B. Vertriebsmitarbeiter (D2D)"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
            <textarea
              value={form.description}
              onChange={(e) => updateField('description', e.target.value)}
              placeholder="Stellenbeschreibung (Freitext)..."
              rows={6}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none resize-y"
            />
            <p className="text-xs text-gray-400 mt-1">Mehrzeiliger Freitext, kein Rich-Text.</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Standort</label>
              <Input
                value={form.location}
                onChange={(e) => updateField('location', e.target.value)}
                placeholder="z.B. Berlin"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PLZ</label>
              <Input
                value={form.postal_code}
                onChange={(e) => updateField('postal_code', e.target.value)}
                placeholder="z.B. 10115"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Anstellungsart</label>
              <Select
                value={form.employment_type}
                onChange={(e) => updateField('employment_type', e.target.value)}
                options={EMPLOYMENT_TYPES}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Gehaltsspanne</label>
              <Input
                value={form.salary_range}
                onChange={(e) => updateField('salary_range', e.target.value)}
                placeholder="z.B. 3.000-5.000 EUR"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <Button variant="ghost" onClick={() => router.push('/jobs')}>
              Abbrechen
            </Button>
            <Button onClick={handleCreate} disabled={saving || !form.title.trim()}>
              {saving ? 'Wird angelegt...' : 'Weiter'}
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </Card>
      )}

      {/* Schritt 2: Quellen */}
      {step === 1 && (
        <Card className="p-6 space-y-5">
          <h3 className="font-semibold text-gray-900">Bewerbungsquellen</h3>

          {/* Formular-Link */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm font-medium text-gray-700 mb-2">Oeffentliches Bewerbungsformular</p>
            {formLink && (
              <div className="flex items-center gap-2">
                <code className="flex-1 text-xs bg-white border border-gray-200 rounded px-3 py-2 truncate">
                  {formLink}
                </code>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(formLink);
                    toast.success('Link kopiert!');
                  }}
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            )}
            <p className="text-xs text-gray-400 mt-2">
              Diesen Link in Stellenportale oder Social-Media-Anzeigen einbinden.
            </p>
          </div>

          {/* Indeed-Modus */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Indeed-Modus</label>
            <Select
              value={form.indeed_mode}
              onChange={(e) => updateField('indeed_mode', e.target.value)}
              options={INDEED_MODES}
            />
            <p className="text-xs text-gray-400 mt-1">
              Indeed Apply erfordert Partnerfreigabe. Im Redirect-Modus werden Bewerber zum eigenen Formular weitergeleitet.
            </p>
          </div>

          {/* Meta Hinweis */}
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
            <p className="text-sm text-blue-700">
              <strong>Meta Lead Ads:</strong> Die Verknuepfung mit Meta-Formularen folgt in einer spaeteren Phase.
              Bewerbungen ueber bestehende Meta-Webhooks laufen weiterhin.
            </p>
          </div>

          <div className="flex justify-between pt-4">
            <Button variant="ghost" onClick={() => setStep(0)}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Zurueck
            </Button>
            <Button onClick={() => setStep(2)}>
              Weiter
              <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </Card>
      )}

      {/* Schritt 3: Zusammenfassung */}
      {step === 2 && (
        <Card className="p-6 space-y-5">
          <h3 className="font-semibold text-gray-900">Zusammenfassung</h3>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="text-gray-500">Titel</dt>
              <dd className="font-medium text-gray-900">{form.title}</dd>
            </div>
            {form.location && (
              <div>
                <dt className="text-gray-500">Standort</dt>
                <dd className="font-medium text-gray-900">{form.location}</dd>
              </div>
            )}
            {form.employment_type && (
              <div>
                <dt className="text-gray-500">Anstellungsart</dt>
                <dd className="font-medium text-gray-900">{form.employment_type}</dd>
              </div>
            )}
            {form.salary_range && (
              <div>
                <dt className="text-gray-500">Gehaltsspanne</dt>
                <dd className="font-medium text-gray-900">{form.salary_range}</dd>
              </div>
            )}
            <div>
              <dt className="text-gray-500">Indeed-Modus</dt>
              <dd className="font-medium text-gray-900">
                {INDEED_MODES.find((m) => m.value === form.indeed_mode)?.label}
              </dd>
            </div>
          </dl>
          {form.description && (
            <div>
              <p className="text-sm text-gray-500 mb-1">Beschreibung</p>
              <div className="text-sm text-gray-900 whitespace-pre-wrap bg-gray-50 rounded-lg p-3">
                {form.description}
              </div>
            </div>
          )}

          <div className="flex justify-between pt-4">
            <Button variant="ghost" onClick={() => setStep(1)}>
              <ArrowLeft className="w-4 h-4 mr-1" />
              Zurueck
            </Button>
            <div className="flex gap-3">
              <Button variant="ghost" onClick={handleSaveAsDraft}>
                Als Entwurf speichern
              </Button>
              <Button onClick={handleActivate} disabled={saving}>
                {saving ? 'Wird aktiviert...' : 'Stelle aktivieren'}
              </Button>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
