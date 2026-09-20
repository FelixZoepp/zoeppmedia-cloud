'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PageHeader } from '@/components/ui/page-header';
import { Button } from '@/components/ui';
import { Phone, PhoneCall, PhoneMissed, UserPlus, Repeat, CheckCircle2, CalendarClock, FileText, PhoneOutgoing } from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface QueueItem {
  candidate_id: string;
  name: string;
  phone: string | null;
  agency_id: string;
  reason: 'erinnerung' | 'kadenz' | 'rueckruf' | 'neu';
  cadence_attempt: number | null;
  cadence_window: string | null;
  callback_note: string | null;
  callback_date: string | null;
  appointment_id: string | null;
  appointment_type: 'vorstellungsgespraech' | 'probetag' | null;
  appointment_at: string | null;
  created_at: string;
}

interface AgencyMeta {
  name: string;
  outbound_phone: string | null;
}

interface DialerData {
  queue: QueueItem[];
  agencies: Record<string, AgencyMeta>;
  scripts: Record<string, Record<string, string>>;
  stats: { total: number; erinnerungen: number; kadenz: number; rueckrufe: number; neue: number };
}

/* ------------------------------------------------------------------ */
/*  Konstanten                                                         */
/* ------------------------------------------------------------------ */

const RESULT_OPTIONS: { value: string; label: string }[] = [
  { value: 'termin_vereinbart', label: 'Termin vereinbart' },
  { value: 'kein_interesse', label: 'Kein Interesse' },
  { value: 'nicht_erreicht', label: 'Mailbox / Nicht erreicht' },
  { value: 'falsche_nummer', label: 'Falsche Nummer' },
  { value: 'rueckruf', label: 'Rückruf gewünscht' },
  { value: 'sonstiges', label: 'Sonstiges' },
];

const REASON_BADGE: Record<QueueItem['reason'], { tone: 'accent' | 'softAccent' | 'neutral'; label: string }> = {
  erinnerung: { tone: 'accent', label: 'Erinnerung' },
  kadenz: { tone: 'accent', label: 'Kadenz' },
  rueckruf: { tone: 'softAccent', label: 'Rückruf' },
  neu: { tone: 'neutral', label: 'Neu' },
};

const WINDOW_LABELS: Record<string, string> = {
  morning: 'Vormittag',
  afternoon: 'Nachmittag',
  evening: 'Abend',
};

const APPOINTMENT_LABELS: Record<string, string> = {
  vorstellungsgespraech: 'Vorstellungsgespräch',
  probetag: 'Probetag',
};

/** Passendes Skript für einen Queue-Eintrag wählen */
function scriptFor(item: QueueItem, scripts: Record<string, Record<string, string>>): string | null {
  const agencyScripts = scripts[item.agency_id];
  if (!agencyScripts) return null;
  if (item.reason === 'erinnerung') {
    const key = item.appointment_type === 'probetag' ? 'erinnerung_probetag' : 'erinnerung_vg';
    return agencyScripts[key] ?? agencyScripts['erstkontakt'] ?? null;
  }
  return agencyScripts['erstkontakt'] ?? null;
}

/* ------------------------------------------------------------------ */
/*  KPI Card                                                          */
/* ------------------------------------------------------------------ */

function KpiCard({ label, value, icon, iconBg = 'bg-gray-100', iconColor = 'text-gray-600' }: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  iconBg?: string;
  iconColor?: string;
}) {
  return (
    <Card padding="md" className="flex items-start gap-4">
      <div className={`flex-shrink-0 w-11 h-11 rounded-xl ${iconBg} flex items-center justify-center ${iconColor}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider truncate">{label}</p>
        <p className="text-2xl font-bold mt-1 tabular-nums leading-tight text-gray-900">{value}</p>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Queue Row                                                          */
/* ------------------------------------------------------------------ */

function QueueRow({ item, agency, script, onLogged }: {
  item: QueueItem;
  agency: AgencyMeta | undefined;
  script: string | null;
  onLogged: (candidateId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [result, setResult] = useState('');
  const [notes, setNotes] = useState('');
  const [nextDate, setNextDate] = useState('');
  const [apptType, setApptType] = useState<'vorstellungsgespraech' | 'probetag'>('vorstellungsgespraech');
  const [apptAt, setApptAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const badge = REASON_BADGE[item.reason];

  async function handleSubmit() {
    if (!result) return;
    if (result === 'termin_vereinbart' && !apptAt) {
      setError('Bitte Datum und Uhrzeit für den Termin angeben.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/candidates/${item.candidate_id}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result,
          notes: notes || null,
          next_step: result === 'rueckruf' ? 'erneut_anrufen' : null,
          next_contact_date: result === 'rueckruf' && nextDate ? nextDate : null,
        }),
      });
      if (!res.ok) throw new Error('Speichern fehlgeschlagen');

      // Termin vereinbart → Termin anlegen (löst später die Erinnerung aus)
      if (result === 'termin_vereinbart' && apptAt) {
        const apptRes = await fetch(`/api/candidates/${item.candidate_id}/appointments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: apptType,
            scheduled_at: new Date(apptAt).toISOString(),
            notes: notes || null,
          }),
        });
        if (!apptRes.ok) throw new Error('Anruf gespeichert, aber Termin konnte nicht angelegt werden');
      }

      // Erinnerungsanruf → als erledigt markieren
      if (item.reason === 'erinnerung' && item.appointment_id) {
        await fetch(`/api/appointments/${item.appointment_id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reminder_done: true }),
        }).catch(() => {});
      }

      onLogged(item.candidate_id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-4 rounded-xl bg-white border border-gray-200">
      <div className="flex items-center gap-3 flex-wrap">
        <Badge tone={badge.tone}>
          {badge.label}
          {item.reason === 'kadenz' && item.cadence_attempt != null && ` · Versuch #${(item.cadence_attempt ?? 0) + 1}`}
          {item.reason === 'erinnerung' && item.appointment_type && ` · ${APPOINTMENT_LABELS[item.appointment_type]}`}
        </Badge>
        <span className="text-sm font-semibold text-gray-900">{item.name}</span>
        <span className="text-xs text-gray-400">{agency?.name ?? item.agency_id.slice(0, 8)}</span>
        {item.reason === 'erinnerung' && item.appointment_at && (
          <span className="text-xs font-medium text-red-600">
            {new Date(item.appointment_at).toLocaleString('de-DE', { weekday: 'short', hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })} Uhr
          </span>
        )}
        {item.reason === 'kadenz' && item.cadence_window && (
          <span className="text-xs text-gray-400">{WINDOW_LABELS[item.cadence_window] ?? item.cadence_window}</span>
        )}
        {item.reason === 'rueckruf' && item.callback_date && (
          <span className="text-xs text-gray-400">
            fällig {new Date(item.callback_date).toLocaleDateString('de-DE')}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          {item.phone ? (
            <a
              href={`tel:${item.phone}`}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-50 text-green-700 text-xs font-semibold hover:bg-green-100 transition-colors"
            >
              <Phone className="w-3.5 h-3.5" />
              {item.phone}
            </a>
          ) : (
            <span className="text-xs text-gray-400">Keine Nummer</span>
          )}
          {script && (
            <button
              onClick={() => setShowScript((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                showScript
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : 'border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              Skript
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {expanded ? 'Schließen' : 'Ergebnis'}
          </button>
        </div>
      </div>

      {agency?.outbound_phone && (
        <p className="inline-flex items-center gap-1.5 text-xs text-gray-500 mt-2">
          <PhoneOutgoing className="w-3.5 h-3.5 text-gray-400" />
          Callen mit: <span className="font-semibold text-gray-700">{agency.outbound_phone}</span>
        </p>
      )}

      {item.callback_note && (
        <p className="text-xs text-gray-500 mt-2">Notiz: {item.callback_note}</p>
      )}

      {showScript && script && (
        <div className="mt-3 p-4 rounded-lg bg-gray-50 border border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            {item.reason === 'erinnerung'
              ? `Skript: Erinnerung ${APPOINTMENT_LABELS[item.appointment_type ?? 'vorstellungsgespraech']}`
              : 'Skript: Erstkontakt'}
          </p>
          <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{script}</p>
        </div>
      )}

      {expanded && (
        <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {RESULT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                  result === opt.value
                    ? 'border-red-200 bg-red-50 text-red-700 font-medium'
                    : 'border-gray-200 text-gray-900 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name={`result-${item.candidate_id}`}
                  value={opt.value}
                  checked={result === opt.value}
                  onChange={() => setResult(opt.value)}
                  className="sr-only"
                />
                {opt.label}
              </label>
            ))}
          </div>

          {result === 'termin_vereinbart' && (
            <div className="flex gap-3 flex-wrap items-center p-3 rounded-lg bg-green-50 border border-green-100">
              <CalendarClock className="w-4 h-4 text-green-600" />
              <select
                value={apptType}
                onChange={(e) => setApptType(e.target.value as 'vorstellungsgespraech' | 'probetag')}
                className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-white"
              >
                <option value="vorstellungsgespraech">Vorstellungsgespräch</option>
                <option value="probetag">Probetag</option>
              </select>
              <input
                type="datetime-local"
                value={apptAt}
                onChange={(e) => setApptAt(e.target.value)}
                className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-white"
              />
              <span className="text-xs text-green-700">Erinnerungsanruf wird automatisch eingeplant</span>
            </div>
          )}

          <div className="flex gap-3 flex-wrap">
            <input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Notiz zum Anruf..."
              className="flex-1 min-w-48 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:ring-2 focus:ring-red-100 outline-none bg-white"
            />
            {result === 'rueckruf' && (
              <input
                type="date"
                value={nextDate}
                onChange={(e) => setNextDate(e.target.value)}
                className="h-10 rounded-lg border border-gray-300 px-3 text-sm text-gray-900 outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 bg-white"
              />
            )}
            <Button variant="primary" size="md" disabled={!result || saving} onClick={handleSubmit}>
              {saving ? 'Speichern...' : 'Speichern'}
            </Button>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Component                                                     */
/* ------------------------------------------------------------------ */

export function DialerClient() {
  const [data, setData] = useState<DialerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'alle' | QueueItem['reason']>('alle');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dialer/queue');
      if (!res.ok) throw new Error(`Fehler ${res.status}`);
      const json: DialerData = await res.json();
      setData(json);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 60_000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleLogged = useCallback((candidateId: string) => {
    setData((prev) => {
      if (!prev) return prev;
      const queue = prev.queue.filter((i) => i.candidate_id !== candidateId);
      return {
        ...prev,
        queue,
        stats: {
          total: queue.length,
          erinnerungen: queue.filter((i) => i.reason === 'erinnerung').length,
          kadenz: queue.filter((i) => i.reason === 'kadenz').length,
          rueckrufe: queue.filter((i) => i.reason === 'rueckruf').length,
          neue: queue.filter((i) => i.reason === 'neu').length,
        },
      };
    });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-6xl">
        <PageHeader label="DIALER" title="Call-Warteschlange" />
        <Card padding="md">
          <p className="text-sm text-red-600">{error}</p>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const visible = filter === 'alle' ? data.queue : data.queue.filter((i) => i.reason === filter);

  const filterButtons: { value: 'alle' | QueueItem['reason']; label: string; count: number }[] = [
    { value: 'alle', label: 'Alle', count: data.stats.total },
    { value: 'erinnerung', label: 'Erinnerungen', count: data.stats.erinnerungen },
    { value: 'kadenz', label: 'Kadenz', count: data.stats.kadenz },
    { value: 'rueckruf', label: 'Rückrufe', count: data.stats.rueckrufe },
    { value: 'neu', label: 'Neu', count: data.stats.neue },
  ];

  return (
    <div className="max-w-6xl">
      <PageHeader
        label="DIALER"
        title="Call-Warteschlange"
        description="Termin-Erinnerungen, fällige Kadenz-Anrufe, Rückrufe und neue Bewerber über alle Kunden"
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <KpiCard label="In der Schlange" value={data.stats.total} icon={<PhoneCall className="w-5 h-5" />} iconBg="bg-red-50" iconColor="text-red-600" />
        <KpiCard label="Erinnerungen" value={data.stats.erinnerungen} icon={<CalendarClock className="w-5 h-5" />} iconBg="bg-purple-50" iconColor="text-purple-600" />
        <KpiCard label="Kadenz fällig" value={data.stats.kadenz} icon={<PhoneMissed className="w-5 h-5" />} iconBg="bg-amber-50" iconColor="text-amber-600" />
        <KpiCard label="Rückrufe" value={data.stats.rueckrufe} icon={<Repeat className="w-5 h-5" />} iconBg="bg-blue-50" iconColor="text-blue-600" />
        <KpiCard label="Neue Bewerber" value={data.stats.neue} icon={<UserPlus className="w-5 h-5" />} iconBg="bg-green-50" iconColor="text-green-600" />
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {filterButtons.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
              filter === f.value
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {f.label} ({f.count})
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <Card padding="md">
          <p className="text-sm text-gray-500">Keine offenen Anrufe — alles abtelefoniert.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {visible.map((item) => (
            <QueueRow
              key={item.candidate_id}
              item={item}
              agency={data.agencies[item.agency_id]}
              script={scriptFor(item, data.scripts)}
              onLogged={handleLogged}
            />
          ))}
        </div>
      )}
    </div>
  );
}
