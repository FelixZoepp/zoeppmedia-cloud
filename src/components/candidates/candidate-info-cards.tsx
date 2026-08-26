'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ShieldCheck,
  ShieldX,
  Ban,
  Check,
  X,
  AlertTriangle,
  PhoneCall,
  Clock,
  Zap,
  CircleDot,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types for API responses                                            */
/* ------------------------------------------------------------------ */

type ConsentEvent = {
  id: string;
  channel: 'whatsapp' | 'email' | 'sms' | 'phone_recording';
  event_type: 'opt_in' | 'opt_out' | 'recording_consent' | 'recording_decline';
  source: string;
  created_at: string;
  created_by_user: { name: string } | null;
};

type NoshowCandidate = {
  id: string;
  name: string;
  noshow_points: number;
  blacklisted: boolean;
  blacklist_reason: string | null;
  blacklisted_at: string | null;
  blacklist_expires_at: string | null;
};

type NoshowEvent = {
  id: string;
  event_type: 'no_show' | 'late_cancel' | 'point_override';
  points: number;
  appointment_type: string | null;
  reason: string | null;
  created_at: string;
  created_by_user: { name: string } | null;
};

type NoshowData = {
  candidate: NoshowCandidate;
  events: NoshowEvent[];
};

type CadenceData = {
  cadence_active: boolean;
  cadence_attempt: number | null;
  cadence_next_at: string | null;
  cadence_next_window: string | null;
  cadence_stopped_reason: string | null;
  preferred_call_window: string | null;
};

type CandidateForSpeed = {
  first_dial_at?: string | null;
  first_contact_at?: string | null;
  created_at: string;
};

/* ------------------------------------------------------------------ */
/*  Helper: format duration                                            */
/* ------------------------------------------------------------------ */

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}min`;
  return `${minutes}min`;
}

function ttfcStatus(ms: number): { label: string; color: string } {
  const minutes = ms / 60_000;
  if (minutes <= 5) return { label: 'Sehr schnell', color: 'text-green-600' };
  if (minutes <= 30) return { label: 'Gut', color: 'text-green-500' };
  if (minutes <= 120) return { label: 'Akzeptabel', color: 'text-amber-500' };
  return { label: 'Zu langsam', color: 'text-red-500' };
}

/* ------------------------------------------------------------------ */
/*  Sub-components: Status row                                         */
/* ------------------------------------------------------------------ */

function StatusRow({ label, active }: { label: string; active: boolean }) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-gray-600">{label}</span>
      {active ? (
        <Check className="w-4 h-4 text-green-500" />
      ) : (
        <X className="w-4 h-4 text-red-500" />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Card section header (matching existing page pattern)               */
/* ------------------------------------------------------------------ */

function CardHeader({
  icon,
  title,
  badge,
}: {
  icon: React.ReactNode;
  title: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 mb-4">
      <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
        {icon}
      </div>
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {badge}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Skeleton loader                                                    */
/* ------------------------------------------------------------------ */

function CardSkeleton() {
  return (
    <Card padding="md">
      <div className="animate-pulse space-y-3">
        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-gray-200" />
          <div className="h-4 w-24 bg-gray-200 rounded" />
        </div>
        <div className="pl-12 space-y-2">
          <div className="h-3 w-full bg-gray-100 rounded" />
          <div className="h-3 w-3/4 bg-gray-100 rounded" />
          <div className="h-3 w-1/2 bg-gray-100 rounded" />
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  1. Consent Status Card                                             */
/* ------------------------------------------------------------------ */

function ConsentCard({ candidateId }: { candidateId: string }) {
  const [events, setEvents] = useState<ConsentEvent[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/candidates/${candidateId}/consent`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((data) => setEvents(data))
      .catch(() => setError(true));
  }, [candidateId]);

  if (error) return null;
  if (!events) return <CardSkeleton />;

  // Derive current state from events (most recent event per channel wins)
  const latestByChannel: Record<string, ConsentEvent> = {};
  for (const evt of events) {
    const key =
      evt.channel === 'phone_recording' ? 'recording' : evt.channel;
    if (!latestByChannel[key]) {
      latestByChannel[key] = evt;
    }
  }

  const whatsappOptIn =
    latestByChannel['whatsapp']?.event_type === 'opt_in';
  const emailOptIn = latestByChannel['email']?.event_type === 'opt_in';
  const smsOptIn = latestByChannel['sms']?.event_type === 'opt_in';
  const recordingConsent =
    latestByChannel['recording']?.event_type === 'recording_consent';
  const doNotContact =
    !whatsappOptIn && !emailOptIn && !smsOptIn && events.length > 0;

  return (
    <Card padding="md">
      <CardHeader
        icon={<ShieldCheck className="w-5 h-5 text-gray-600" />}
        title="DSGVO Consent"
      />
      <div className="pl-12">
        {doNotContact && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-red-50 rounded-lg">
            <Ban className="w-4 h-4 text-red-600" />
            <span className="text-sm font-medium text-red-700">
              Nicht kontaktieren
            </span>
          </div>
        )}
        <StatusRow label="WhatsApp Opt-in" active={whatsappOptIn} />
        <StatusRow label="E-Mail Opt-in" active={emailOptIn} />
        <StatusRow label="SMS Opt-in" active={smsOptIn} />
        <StatusRow
          label="Aufnahme-Einwilligung"
          active={recordingConsent}
        />
        {events.length === 0 && (
          <p className="text-sm text-gray-400 py-1">
            Keine Consent-Events vorhanden.
          </p>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  2. No-Show / Blacklist Card                                        */
/* ------------------------------------------------------------------ */

function NoshowCard({ candidateId }: { candidateId: string }) {
  const [data, setData] = useState<NoshowData | null>(null);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const fetchData = useCallback(() => {
    fetch(`/api/candidates/${candidateId}/noshow`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => setData(d))
      .catch(() => setError(true));
  }, [candidateId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function postEvent(eventType: 'no_show' | 'late_cancel') {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/candidates/${candidateId}/noshow`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: eventType }),
      });
      if (res.ok) fetchData();
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return null;
  if (!data) return <CardSkeleton />;

  const { candidate: c, events } = data;
  const points = Number(c.noshow_points) || 0;

  // Points color
  const pointsColor =
    points === 0
      ? 'text-green-600'
      : points < 2
        ? 'text-amber-500'
        : 'text-red-600';

  return (
    <Card
      padding="md"
      className={c.blacklisted ? 'border-red-300 bg-red-50/30' : ''}
    >
      <CardHeader
        icon={<ShieldX className="w-5 h-5 text-gray-600" />}
        title="No-Show / Blacklist"
        badge={
          c.blacklisted ? (
            <Badge tone="accent">Gesperrt</Badge>
          ) : undefined
        }
      />
      <div className="pl-12 space-y-3">
        {/* Points display */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Punkte</span>
          <span className={`text-sm font-semibold ${pointsColor}`}>
            {points.toFixed(1)} / 3.0
          </span>
        </div>

        {/* Points bar */}
        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              points >= 3
                ? 'bg-red-500'
                : points >= 2
                  ? 'bg-amber-500'
                  : 'bg-green-500'
            }`}
            style={{ width: `${Math.min((points / 3) * 100, 100)}%` }}
          />
        </div>

        {/* Blacklist info */}
        {c.blacklisted && (
          <div className="space-y-1 pt-1">
            {c.blacklist_reason && (
              <p className="text-sm text-red-700">
                <span className="font-medium">Grund:</span>{' '}
                {c.blacklist_reason}
              </p>
            )}
            {c.blacklisted_at && (
              <p className="text-sm text-red-600">
                <span className="font-medium">Gesperrt am:</span>{' '}
                {new Date(c.blacklisted_at).toLocaleDateString('de-DE')}
              </p>
            )}
            {c.blacklist_expires_at && (
              <p className="text-sm text-red-600">
                <span className="font-medium">Ablauf:</span>{' '}
                {new Date(c.blacklist_expires_at).toLocaleDateString(
                  'de-DE'
                )}
              </p>
            )}
          </div>
        )}

        {/* Action buttons */}
        {!c.blacklisted && (
          <div className="flex gap-2 pt-1">
            <Button
              variant="soft"
              size="sm"
              disabled={submitting}
              onClick={() => postEvent('no_show')}
            >
              No-Show eintragen
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={submitting}
              onClick={() => postEvent('late_cancel')}
            >
              Absage eintragen
            </Button>
          </div>
        )}

        {/* Event history */}
        {events.length > 0 && (
          <div className="pt-2 border-t border-gray-200 space-y-2">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Verlauf
            </p>
            {events.slice(0, 5).map((evt) => {
              const typeLabel =
                evt.event_type === 'no_show'
                  ? 'No-Show'
                  : evt.event_type === 'late_cancel'
                    ? 'Absage'
                    : 'Korrektur';
              return (
                <div
                  key={evt.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div className="flex items-center gap-2">
                    <CircleDot
                      className={`w-3 h-3 ${
                        evt.points > 0
                          ? 'text-red-400'
                          : 'text-green-400'
                      }`}
                    />
                    <span className="text-gray-700">{typeLabel}</span>
                    <span className="text-gray-400">
                      {evt.points > 0 ? '+' : ''}
                      {evt.points}
                    </span>
                  </div>
                  <span className="text-gray-400 text-xs">
                    {new Date(evt.created_at).toLocaleDateString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  3. Kadenz Card                                                     */
/* ------------------------------------------------------------------ */

const WINDOW_LABELS: Record<string, string> = {
  morning: 'Morgens (08-12)',
  afternoon: 'Nachmittags (12-17)',
  evening: 'Abends (17-20)',
};

function CadenceCard({ candidateId }: { candidateId: string }) {
  const [data, setData] = useState<CadenceData | null>(null);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const fetchData = useCallback(() => {
    fetch(`/api/candidates/${candidateId}/cadence`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoaded(true);
      })
      .catch(() => {
        setError(true);
        setLoaded(true);
      });
  }, [candidateId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  async function toggleCadence() {
    if (!data) return;
    setSubmitting(true);
    try {
      const action = data.cadence_active ? 'stop' : 'start';
      const res = await fetch(`/api/candidates/${candidateId}/cadence`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(action === 'stop' ? { reason: 'manual' } : {}),
        }),
      });
      if (res.ok) fetchData();
    } finally {
      setSubmitting(false);
    }
  }

  if (error) return null;
  if (!loaded) return <CardSkeleton />;
  if (!data) return null;

  // Only show if cadence was ever active or is active
  const hasActivity =
    data.cadence_active ||
    data.cadence_attempt !== null ||
    data.cadence_stopped_reason !== null;

  if (!hasActivity) return null;

  const stopReasonLabels: Record<string, string> = {
    manual: 'Manuell gestoppt',
    reached: 'Erreicht',
    max_attempts: 'Max. Versuche erreicht',
    preferred_window_set: 'Bevorzugtes Zeitfenster gesetzt',
    appointment_set: 'Termin vereinbart',
  };

  return (
    <Card padding="md">
      <CardHeader
        icon={<PhoneCall className="w-5 h-5 text-gray-600" />}
        title="Kadenz"
        badge={
          data.cadence_active ? (
            <Badge tone="success">Aktiv</Badge>
          ) : (
            <Badge tone="neutral">Gestoppt</Badge>
          )
        }
      />
      <div className="pl-12 space-y-2">
        {data.cadence_active && (
          <>
            <div className="flex items-center justify-between py-1">
              <span className="text-sm text-gray-600">Versuch</span>
              <span className="text-sm font-medium text-gray-900">
                {data.cadence_attempt ?? 1} / 6
              </span>
            </div>
            {data.cadence_next_at && (
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-gray-600">
                  Nächster Anruf
                </span>
                <span className="text-sm text-gray-900">
                  {new Date(data.cadence_next_at).toLocaleString('de-DE', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            )}
            {data.cadence_next_window && (
              <div className="flex items-center justify-between py-1">
                <span className="text-sm text-gray-600">Zeitfenster</span>
                <span className="text-sm text-gray-900">
                  {WINDOW_LABELS[data.cadence_next_window] ??
                    data.cadence_next_window}
                </span>
              </div>
            )}
          </>
        )}

        {!data.cadence_active && data.cadence_stopped_reason && (
          <div className="flex items-center justify-between py-1">
            <span className="text-sm text-gray-600">Grund</span>
            <span className="text-sm text-gray-900">
              {stopReasonLabels[data.cadence_stopped_reason] ??
                data.cadence_stopped_reason}
            </span>
          </div>
        )}

        {data.preferred_call_window && (
          <div className="flex items-center justify-between py-1">
            <span className="text-sm text-gray-600">Bevorzugt</span>
            <span className="text-sm text-gray-900">
              {WINDOW_LABELS[data.preferred_call_window] ??
                data.preferred_call_window}
            </span>
          </div>
        )}

        <div className="pt-2">
          <Button
            variant={data.cadence_active ? 'ghost' : 'soft'}
            size="sm"
            disabled={submitting}
            onClick={toggleCadence}
          >
            {data.cadence_active ? 'Kadenz stoppen' : 'Kadenz starten'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  4. Speed-to-Lead Card                                              */
/* ------------------------------------------------------------------ */

function SpeedToLeadCard({
  candidate,
}: {
  candidate: CandidateForSpeed;
}) {
  const createdAt = new Date(candidate.created_at).getTime();
  const firstDialAt = candidate.first_dial_at
    ? new Date(candidate.first_dial_at).getTime()
    : null;
  const firstContactAt = candidate.first_contact_at
    ? new Date(candidate.first_contact_at).getTime()
    : null;

  const ttfd = firstDialAt ? firstDialAt - createdAt : null;
  const ttfc = firstContactAt ? firstContactAt - createdAt : null;

  return (
    <Card padding="md">
      <CardHeader
        icon={<Zap className="w-5 h-5 text-gray-600" />}
        title="Speed-to-Lead"
      />
      <div className="pl-12 space-y-2">
        {/* Time to First Dial */}
        <div className="flex items-center justify-between py-1">
          <span className="text-sm text-gray-600">Erster Anruf</span>
          {ttfd !== null ? (
            <span className="text-sm font-medium text-gray-900">
              {formatDuration(ttfd)}
            </span>
          ) : (
            <span className="text-sm text-amber-500">
              Noch nicht angerufen
            </span>
          )}
        </div>

        {/* Time to First Contact */}
        <div className="flex items-center justify-between py-1">
          <span className="text-sm text-gray-600">Erster Kontakt</span>
          {ttfc !== null ? (
            <span className="text-sm font-medium text-gray-900">
              {formatDuration(ttfc)}
            </span>
          ) : firstDialAt !== null ? (
            <span className="text-sm text-amber-500">
              Noch nicht erreicht
            </span>
          ) : (
            <span className="text-sm text-gray-400">&mdash;</span>
          )}
        </div>

        {/* TTFC Ampel */}
        {ttfc !== null && (
          <div className="flex items-center justify-between py-1">
            <span className="text-sm text-gray-600">Bewertung</span>
            <div className="flex items-center gap-1.5">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  ttfcStatus(ttfc).color === 'text-green-600' ||
                  ttfcStatus(ttfc).color === 'text-green-500'
                    ? 'bg-green-500'
                    : ttfcStatus(ttfc).color === 'text-amber-500'
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }`}
              />
              <span
                className={`text-sm font-medium ${ttfcStatus(ttfc).color}`}
              >
                {ttfcStatus(ttfc).label}
              </span>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Main export                                                        */
/* ------------------------------------------------------------------ */

interface CandidateInfoCardsProps {
  candidateId: string;
  candidate?: CandidateForSpeed;
}

export function CandidateInfoCards({
  candidateId,
  candidate,
}: CandidateInfoCardsProps) {
  return (
    <div className="space-y-6">
      {candidate && <SpeedToLeadCard candidate={candidate} />}
      <ConsentCard candidateId={candidateId} />
      <NoshowCard candidateId={candidateId} />
      <CadenceCard candidateId={candidateId} />
    </div>
  );
}
