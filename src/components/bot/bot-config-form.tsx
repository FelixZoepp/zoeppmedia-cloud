'use client';

/**
 * BotConfigForm — Formular zur Konfiguration des KI-Vorqualifizierungsbots.
 * Phase 3 Task 10.
 *
 * Lädt GET /api/jobs/[id]/bot, speichert via PUT.
 * Preset-Auswahl mit Bestätigungs-Modal.
 * Einbettung der QuestionEditor-Komponente.
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Card } from '@/components/ui/card';
import { QuestionEditor, type QuestionDraft, draftToApi, apiToDraft } from './question-editor';
import { Save, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Typen
// ---------------------------------------------------------------------------

interface BotConfigData {
  persona:       string;
  tone:          string;
  formality:     'du' | 'sie';
  language:      string;
  intro_text:    string | null;
  faq:           Array<{ q: string; a: string }>;
  max_turns:     number;
  scoring_rules: { a_min: number; b_min: number };
  active:        boolean;
}

interface PresetInfo {
  key: string;
  name: string;
}

interface Props {
  jobId: string;
}

const FORMALITY_OPTIONS = [
  { value: 'du',  label: 'Du' },
  { value: 'sie', label: 'Sie' },
];

const EMPTY_CONFIG: BotConfigData = {
  persona:       '',
  tone:          '',
  formality:     'du',
  language:      'de',
  intro_text:    '',
  faq:           [],
  max_turns:     10,
  scoring_rules: { a_min: 80, b_min: 50 },
  active:        false,
};

// ---------------------------------------------------------------------------
// Komponente
// ---------------------------------------------------------------------------

export function BotConfigForm({ jobId }: Props) {
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [config, setConfig]         = useState<BotConfigData>(EMPTY_CONFIG);
  const [questions, setQuestions]   = useState<QuestionDraft[]>([]);
  const [presets, setPresets]       = useState<PresetInfo[]>([]);

  // Preset-Modal
  const [pendingPreset, setPendingPreset] = useState<string | null>(null);

  // FAQ-Editor: neu hinzufügen
  const [faqQ, setFaqQ] = useState('');
  const [faqA, setFaqA] = useState('');

  // ----------------------------------------------------------------
  // Laden
  // ----------------------------------------------------------------

  async function load() {
    setLoading(true);
    try {
      const res  = await fetch(`/api/jobs/${jobId}/bot`);
      const data = await res.json();

      if (data.config) {
        setConfig({
          persona:       data.config.persona       ?? '',
          tone:          data.config.tone           ?? '',
          formality:     data.config.formality      ?? 'du',
          language:      data.config.language       ?? 'de',
          intro_text:    data.config.intro_text     ?? '',
          faq:           data.config.faq            ?? [],
          max_turns:     data.config.max_turns      ?? 10,
          scoring_rules: data.config.scoring_rules  ?? { a_min: 80, b_min: 50 },
          active:        data.config.active         ?? false,
        });
      }

      setQuestions(
        (data.questions ?? []).map((q: Record<string, unknown>) => apiToDraft(q as Parameters<typeof apiToDraft>[0]))
      );
      setPresets(data.presets ?? []);
    } catch {
      toast.error('Konfiguration konnte nicht geladen werden');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ----------------------------------------------------------------
  // Speichern
  // ----------------------------------------------------------------

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/bot`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          config: {
            ...config,
            intro_text: config.intro_text || null,
          },
          questions: questions.map(draftToApi),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Speichern fehlgeschlagen');
      } else {
        toast.success('Bot-Konfiguration gespeichert');
      }
    } catch {
      toast.error('Netzwerkfehler beim Speichern');
    } finally {
      setSaving(false);
    }
  }

  // ----------------------------------------------------------------
  // Preset anwenden
  // ----------------------------------------------------------------

  async function applyPreset(presetKey: string) {
    setPendingPreset(null);
    setSaving(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}/bot`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          preset_key: presetKey,
          config: {
            ...config,
            intro_text: config.intro_text || null,
          },
          questions: questions.map(draftToApi),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.error ?? 'Preset konnte nicht angewendet werden');
      } else {
        toast.success('Preset übernommen');
        await load(); // neu laden um Preset-Fragen zu sehen
      }
    } catch {
      toast.error('Netzwerkfehler');
    } finally {
      setSaving(false);
    }
  }

  // ----------------------------------------------------------------
  // FAQ-Helfer
  // ----------------------------------------------------------------

  function addFaq() {
    if (!faqQ.trim() || !faqA.trim()) return;
    setConfig(c => ({ ...c, faq: [...c.faq, { q: faqQ.trim(), a: faqA.trim() }] }));
    setFaqQ('');
    setFaqA('');
  }

  function removeFaq(idx: number) {
    setConfig(c => ({ ...c, faq: c.faq.filter((_, i) => i !== idx) }));
  }

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <div className="w-7 h-7 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Presets */}
      <Card className="p-5">
        <h4 className="text-sm font-semibold text-gray-800 mb-3">Branchenpresets</h4>
        <div className="flex flex-wrap gap-2">
          {presets.map(p => (
            <button
              key={p.key}
              type="button"
              onClick={() => setPendingPreset(p.key)}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              {p.name}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-gray-400">
          Preset auswählen ersetzt die bestehenden Fragen mit Branchenstandards.
        </p>
      </Card>

      {/* Allgemeine Konfiguration */}
      <Card className="p-5 space-y-4">
        <h4 className="text-sm font-semibold text-gray-800">Allgemein</h4>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Persona</label>
            <Input
              value={config.persona}
              onChange={e => setConfig(c => ({ ...c, persona: e.target.value }))}
              placeholder="z.B. freundliche Recruiting-Assistentin"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tonalität</label>
            <Input
              value={config.tone}
              onChange={e => setConfig(c => ({ ...c, tone: e.target.value }))}
              placeholder="z.B. warm, klar, direkt"
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Anrede</label>
            <Select
              value={config.formality}
              onChange={e => setConfig(c => ({ ...c, formality: e.target.value as 'du' | 'sie' }))}
              options={FORMALITY_OPTIONS}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max. Turns</label>
            <Input
              type="number"
              min={5}
              max={50}
              value={config.max_turns}
              onChange={e => setConfig(c => ({ ...c, max_turns: Number(e.target.value) }))}
            />
          </div>
          <div className="flex items-end pb-0.5">
            <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.active}
                onChange={e => setConfig(c => ({ ...c, active: e.target.checked }))}
                className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500"
              />
              Bot aktiv
            </label>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Begrüßungstext</label>
          <textarea
            value={config.intro_text ?? ''}
            onChange={e => setConfig(c => ({ ...c, intro_text: e.target.value }))}
            rows={3}
            placeholder="Hallo! Kurz ein paar Fragen, damit wir dich optimal vermitteln können."
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none resize-y"
          />
        </div>
      </Card>

      {/* Schwellenwerte */}
      <Card className="p-5 space-y-4">
        <h4 className="text-sm font-semibold text-gray-800">Scoring-Schwellen</h4>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              A-Schwelle (min. Score für Label A)
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              value={config.scoring_rules.a_min}
              onChange={e => setConfig(c => ({
                ...c,
                scoring_rules: { ...c.scoring_rules, a_min: Number(e.target.value) },
              }))}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              B-Schwelle (min. Score für Label B)
            </label>
            <Input
              type="number"
              min={0}
              max={100}
              value={config.scoring_rules.b_min}
              onChange={e => setConfig(c => ({
                ...c,
                scoring_rules: { ...c.scoring_rules, b_min: Number(e.target.value) },
              }))}
            />
          </div>
        </div>
        <p className="text-xs text-gray-400">
          A-Schwelle muss über B-Schwelle liegen. Unterhalb von B-Schwelle = Label C.
        </p>
      </Card>

      {/* FAQ */}
      <Card className="p-5 space-y-3">
        <h4 className="text-sm font-semibold text-gray-800">FAQ</h4>
        {config.faq.length === 0 && (
          <p className="text-xs text-gray-400">Noch keine FAQ-Einträge.</p>
        )}
        {config.faq.map((entry, idx) => (
          <div key={idx} className="flex items-start gap-3 bg-gray-50 rounded-lg p-3">
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-gray-600">F: {entry.q}</p>
              <p className="text-xs text-gray-500 mt-0.5">A: {entry.a}</p>
            </div>
            <button
              type="button"
              onClick={() => removeFaq(idx)}
              className="text-red-400 hover:text-red-600 text-xs shrink-0"
            >
              Entfernen
            </button>
          </div>
        ))}
        <div className="space-y-2">
          <Input
            value={faqQ}
            onChange={e => setFaqQ(e.target.value)}
            placeholder="Frage"
          />
          <Input
            value={faqA}
            onChange={e => setFaqA(e.target.value)}
            placeholder="Antwort"
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={addFaq}
            disabled={!faqQ.trim() || !faqA.trim()}
          >
            FAQ hinzufügen
          </Button>
        </div>
      </Card>

      {/* Fragen-Editor */}
      <Card className="p-5">
        <h4 className="text-sm font-semibold text-gray-800 mb-3">Fragen</h4>
        <QuestionEditor questions={questions} onChange={setQuestions} />
      </Card>

      {/* Speichern */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4" />
          {saving ? 'Speichert…' : 'Konfiguration speichern'}
        </Button>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading || saving}>
          <RefreshCw className="w-4 h-4" />
          Neu laden
        </Button>
      </div>

      {/* Preset-Bestätigungs-Modal */}
      <Modal
        open={pendingPreset !== null}
        onClose={() => setPendingPreset(null)}
        title="Preset übernehmen?"
      >
        <p className="text-sm text-gray-700 mb-6">
          Bestehende Fragen werden durch die Preset-Fragen ersetzt. Die übrigen
          Konfigurationsfelder bleiben unverändert.
        </p>
        <div className="flex gap-3 justify-end">
          <Button variant="ghost" onClick={() => setPendingPreset(null)}>
            Abbrechen
          </Button>
          <Button onClick={() => pendingPreset && applyPreset(pendingPreset)}>
            Übernehmen
          </Button>
        </div>
      </Modal>
    </div>
  );
}
