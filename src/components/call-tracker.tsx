'use client';

import { useState } from 'react';
import { Phone, Clock } from 'lucide-react';
import { Button, Badge, Card, Select } from '@/components/ui';
import type { CallLog, CallResult, CallNextStep } from '@/lib/types/database';

const resultOptions: { value: CallResult; label: string }[] = [
  { value: 'termin_vereinbart', label: 'Termin vereinbart' },
  { value: 'kein_interesse', label: 'Kein Interesse' },
  { value: 'nicht_erreicht', label: 'Mailbox / Nicht erreicht' },
  { value: 'falsche_nummer', label: 'Falsche Nummer' },
  { value: 'rueckruf', label: 'Rückruf gewünscht' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

const nextStepOptions: { value: CallNextStep; label: string }[] = [
  { value: 'erneut_anrufen', label: 'Erneut anrufen' },
  { value: 'termin_bestaetigen', label: 'Termin bestätigen' },
  { value: 'absage', label: 'Absage' },
  { value: 'warten', label: 'Warten' },
];

const resultBadge: Record<CallResult, { label: string; tone: 'success' | 'neutral' | 'outline' | 'softAccent' }> = {
  termin_vereinbart: { label: 'Termin', tone: 'success' },
  kein_interesse: { label: 'Kein Interesse', tone: 'neutral' },
  nicht_erreicht: { label: 'Nicht erreicht', tone: 'outline' },
  falsche_nummer: { label: 'Falsche Nr.', tone: 'neutral' },
  rueckruf: { label: 'Rückruf', tone: 'softAccent' },
  sonstiges: { label: 'Sonstiges', tone: 'neutral' },
};

interface CallTrackerProps {
  candidateId: string;
  candidatePhone: string | null;
  callLogs: CallLog[];
  script: string | null;
  onLogCreated: (log: CallLog) => void;
}

export function CallTracker({
  candidateId,
  candidatePhone,
  callLogs,
  script,
  onLogCreated,
}: CallTrackerProps) {
  const [result, setResult] = useState<CallResult | ''>('');
  const [notes, setNotes] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!result) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result,
          notes: notes || null,
          next_step: nextStep || null,
          next_contact_date: nextDate || null,
        }),
      });
      if (res.ok) {
        const log: CallLog = await res.json();
        onLogCreated(log);
        setResult('');
        setNotes('');
        setNextStep('');
        setNextDate('');
      }
    } finally {
      setSaving(false);
    }
  }

  const nextStepSelectOptions = [
    { value: '', label: 'Nächster Schritt...' },
    ...nextStepOptions,
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Script Panel */}
      <Card padding="md">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--surface-inset)] flex items-center justify-center">
            <Phone className="w-5 h-5 text-red-500" />
          </div>
          <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Telefon-Skript</h2>
        </div>

        {candidatePhone && (
          <a
            href={`tel:${candidatePhone}`}
            className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            {candidatePhone}
          </a>
        )}

        {script ? (
          <div className="text-[15px] text-[var(--text-primary)] whitespace-pre-wrap leading-relaxed">
            {script}
          </div>
        ) : (
          <p className="text-[13px] text-[var(--text-tertiary)]">
            Noch kein Skript verfügbar. Bitte wende dich an deinen Ansprechpartner.
          </p>
        )}
      </Card>

      {/* Log Form + History */}
      <div className="space-y-4">
        <Card padding="md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-[var(--radius-md)] bg-[var(--surface-inset)] flex items-center justify-center">
              <Phone className="w-5 h-5 text-[var(--text-secondary)]" />
            </div>
            <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">Anruf protokollieren</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {/* Result radio grid */}
            <div className="grid grid-cols-2 gap-2">
              {resultOptions.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 p-2.5 rounded-lg border text-[13px] cursor-pointer transition-colors ${
                    result === opt.value
                      ? 'border-red-300 bg-red-50 text-red-700 font-medium'
                      : 'border-gray-200 text-[var(--text-primary)] hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="result"
                    value={opt.value}
                    checked={result === opt.value}
                    onChange={() => setResult(opt.value)}
                    className="sr-only"
                  />
                  {opt.label}
                </label>
              ))}
            </div>

            {/* Notes textarea */}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notiz zum Anruf..."
              rows={2}
              className="w-full rounded-[var(--radius-md)] border border-gray-200 px-3 py-2 text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-red-300 focus:ring-1 focus:ring-red-200 outline-none resize-none"
            />

            {/* Next step + date */}
            <div className="flex gap-3">
              <div className="flex-1">
                <Select
                  options={nextStepSelectOptions}
                  value={nextStep}
                  onChange={(e) => setNextStep(e.target.value)}
                />
              </div>
              <input
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                className="rounded-[var(--radius-md)] border border-gray-200 px-3 py-2 text-[15px] text-[var(--text-primary)] outline-none focus:border-red-300 focus:ring-1 focus:ring-red-200"
              />
            </div>

            <Button
              type="submit"
              variant="primary"
              size="md"
              disabled={!result || saving}
              className="w-full"
            >
              {saving ? 'Speichern...' : 'Protokoll speichern'}
            </Button>
          </form>
        </Card>

        {/* Call History */}
        {callLogs.length > 0 && (
          <Card padding="md" inset>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-[var(--radius-md)] bg-white flex items-center justify-center border border-[var(--border-default)]">
                <Clock className="w-5 h-5 text-[var(--text-secondary)]" />
              </div>
              <h2 className="text-[15px] font-semibold text-[var(--text-primary)]">
                Anruf-Verlauf ({callLogs.length})
              </h2>
            </div>
            <div className="space-y-2">
              {callLogs.map((log) => {
                const badge = resultBadge[log.result];
                return (
                  <div
                    key={log.id}
                    className="p-3 rounded-[var(--radius-md)] bg-white border border-[var(--border-default)]"
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge tone={badge?.tone ?? 'neutral'}>
                        {badge?.label ?? log.result}
                      </Badge>
                      <span className="text-[13px] text-[var(--text-tertiary)]">
                        {new Date(log.created_at).toLocaleString('de-DE', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    {log.notes && (
                      <p className="text-[15px] text-[var(--text-primary)] mt-1">{log.notes}</p>
                    )}
                    {log.next_step && (
                      <p className="text-[13px] text-[var(--text-tertiary)] mt-0.5">
                        Nächster Schritt:{' '}
                        {nextStepOptions.find((o) => o.value === log.next_step)?.label ?? log.next_step}
                        {log.next_contact_date && (
                          <> &middot; {new Date(log.next_contact_date).toLocaleDateString('de-DE')}</>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
