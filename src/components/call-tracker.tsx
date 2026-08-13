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
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Script Panel */}
      <Card padding="md">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
            <Phone className="w-5 h-5 text-red-600" />
          </div>
          <h2 className="text-sm font-semibold text-gray-900">Telefon-Skript</h2>
        </div>

        {candidatePhone && (
          <a
            href={`tel:${candidatePhone}`}
            className="inline-flex items-center gap-3 mb-4 px-4 py-2 rounded-lg bg-green-50 text-green-700 text-sm font-medium hover:bg-green-100 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            {candidatePhone}
          </a>
        )}

        {script ? (
          <div className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
            {script}
          </div>
        ) : (
          <p className="text-xs text-gray-400">
            Noch kein Skript verfügbar. Bitte wende dich an deinen Ansprechpartner.
          </p>
        )}
      </Card>

      {/* Log Form + History */}
      <div className="space-y-4">
        <Card padding="md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
              <Phone className="w-5 h-5 text-gray-600" />
            </div>
            <h2 className="text-sm font-semibold text-gray-900">Anruf protokollieren</h2>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Result radio grid */}
            <div className="grid grid-cols-2 gap-3">
              {resultOptions.map((opt) => (
                <label
                  key={opt.value}
                  className={`flex items-center gap-2 p-3 rounded-lg border text-xs cursor-pointer transition-colors ${
                    result === opt.value
                      ? 'border-red-200 bg-red-50 text-red-700 font-medium'
                      : 'border-gray-200 text-gray-900 hover:border-gray-300'
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
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none resize-none bg-white"
            />

            {/* Next step + date */}
            <div className="flex gap-4">
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
                className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-white"
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
              <div className="w-9 h-9 rounded-xl bg-white flex items-center justify-center border border-gray-200">
                <Clock className="w-5 h-5 text-gray-600" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">
                Anruf-Verlauf ({callLogs.length})
              </h2>
            </div>
            <div className="space-y-4">
              {callLogs.map((log) => {
                const badge = resultBadge[log.result];
                return (
                  <div
                    key={log.id}
                    className="p-4 rounded-xl bg-white border border-gray-200"
                  >
                    <div className="flex items-center gap-3 flex-wrap">
                      <Badge tone={badge?.tone ?? 'neutral'}>
                        {badge?.label ?? log.result}
                      </Badge>
                      <span className="text-xs text-gray-400">
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
                      <p className="text-sm text-gray-900 mt-1">{log.notes}</p>
                    )}
                    {log.next_step && (
                      <p className="text-xs text-gray-400 mt-0.5">
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
