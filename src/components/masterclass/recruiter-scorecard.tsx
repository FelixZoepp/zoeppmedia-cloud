'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Star, UserCheck, UserX, CalendarCheck, Briefcase } from 'lucide-react';

const CRITERIA = [
  { key: 'motivation', label: 'Motivation & Antrieb' },
  { key: 'kommunikation', label: 'Kommunikationsfähigkeit' },
  { key: 'belastbarkeit', label: 'Belastbarkeit & Durchhaltevermögen' },
  { key: 'lernbereitschaft', label: 'Lernbereitschaft' },
  { key: 'auftreten', label: 'Professionelles Auftreten' },
  { key: 'zuverlaessigkeit', label: 'Zuverlässigkeit & Pünktlichkeit' },
  { key: 'teamfaehigkeit', label: 'Teamfähigkeit' },
  { key: 'verkaufstalent', label: 'Verkaufstalent / Überzeugungskraft' },
  { key: 'coachbarkeit', label: 'Coachbarkeit' },
  { key: 'verfuegbarkeit', label: 'Zeitliche Verfügbarkeit' },
];

type Decision = 'kein_fit' | 'vg' | 'probetag' | 'einstellung' | null;

const DECISIONS: { value: Decision; label: string; icon: typeof UserX; color: string }[] = [
  { value: 'kein_fit', label: 'Kein Fit', icon: UserX, color: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100' },
  { value: 'vg', label: 'VG', icon: CalendarCheck, color: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100' },
  { value: 'probetag', label: 'Probetag', icon: Briefcase, color: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' },
  { value: 'einstellung', label: 'Einstellung', icon: UserCheck, color: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' },
];

export function RecruiterScorecard() {
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [decision, setDecision] = useState<Decision>(null);
  const [candidateName, setCandidateName] = useState('');

  const setRating = (key: string, value: number) => {
    setRatings((prev) => ({ ...prev, [key]: value }));
  };

  const totalScore = Object.values(ratings).reduce((sum, v) => sum + v, 0);
  const maxScore = CRITERIA.length * 5;
  const ratedCount = Object.keys(ratings).length;
  const avgScore = ratedCount > 0 ? (totalScore / ratedCount).toFixed(1) : '0.0';

  const scoreTone = (): 'accent' | 'neutral' | 'success' => {
    const avg = parseFloat(avgScore);
    if (avg < 2.5) return 'accent';
    if (avg < 3.5) return 'neutral';
    return 'success';
  };

  const reset = () => {
    setRatings({});
    setDecision(null);
    setCandidateName('');
  };

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <UserCheck className="w-5 h-5 text-red-600" />
            Recruiter-Scorecard
          </h3>
          <p className="text-sm text-gray-500 mt-1">Bewerte den Bewerber objektiv in 10 Kriterien</p>
        </div>
        <div className="flex items-center gap-3">
          {ratedCount > 0 && (
            <Badge tone={scoreTone()}>
              {totalScore}/{maxScore} Punkte &middot; &Oslash; {avgScore}
            </Badge>
          )}
          <Button variant="ghost" size="sm" onClick={reset}>Zurücksetzen</Button>
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-600 mb-1.5">Name des Bewerbers</label>
        <input
          type="text"
          value={candidateName}
          onChange={(e) => setCandidateName(e.target.value)}
          placeholder="z.B. Max Mustermann"
          className="w-full max-w-sm h-10 bg-white border border-gray-300 rounded-lg px-3 text-sm text-gray-900 shadow-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100"
        />
      </div>

      <div className="space-y-4 mb-8">
        {CRITERIA.map((criterion) => {
          const rating = ratings[criterion.key] || 0;
          return (
            <div key={criterion.key} className="flex items-center gap-4">
              <span className="text-sm text-gray-700 w-56 flex-shrink-0">{criterion.label}</span>
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((value) => (
                  <button
                    key={value}
                    onClick={() => setRating(criterion.key, value)}
                    className="p-1 transition-colors cursor-pointer hover:scale-110"
                    title={`${value} von 5`}
                  >
                    <Star
                      className={`w-5 h-5 ${
                        value <= rating
                          ? 'text-amber-400 fill-amber-400'
                          : 'text-gray-200'
                      }`}
                    />
                  </button>
                ))}
              </div>
              <span className="text-xs text-gray-400 w-8">{rating > 0 ? `${rating}/5` : ''}</span>
            </div>
          );
        })}
      </div>

      <div>
        <h4 className="text-sm font-semibold text-gray-900 mb-3">Entscheidung</h4>
        <div className="flex flex-wrap gap-3">
          {DECISIONS.map((d) => {
            const Icon = d.icon;
            const isActive = decision === d.value;
            return (
              <button
                key={d.value}
                onClick={() => setDecision(d.value)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border text-sm font-medium transition-all cursor-pointer ${
                  isActive
                    ? `${d.color} ring-2 ring-offset-1 ring-gray-300`
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <Icon className="w-4 h-4" />
                {d.label}
              </button>
            );
          })}
        </div>
      </div>

      {ratedCount === CRITERIA.length && decision && (
        <div className="mt-6 p-4 bg-gray-50 rounded-xl border border-gray-200">
          <h4 className="text-sm font-semibold text-gray-900 mb-2">Zusammenfassung</h4>
          <p className="text-sm text-gray-600">
            {candidateName || 'Bewerber'} &mdash; Score: <strong>{totalScore}/{maxScore}</strong> (&Oslash; {avgScore}) &mdash; Entscheidung: <strong>{DECISIONS.find((d) => d.value === decision)?.label}</strong>
          </p>
        </div>
      )}
    </Card>
  );
}
