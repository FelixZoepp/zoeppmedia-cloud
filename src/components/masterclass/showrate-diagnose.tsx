'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ShieldAlert, Sparkles, Clock, ChevronDown, ChevronUp } from 'lucide-react';

interface DiagnosticCard {
  key: string;
  title: string;
  subtitle: string;
  icon: typeof ShieldAlert;
  color: string;
  borderColor: string;
  symptoms: string[];
  fixes: string[];
}

const DIAGNOSTICS: DiagnosticCard[] = [
  {
    key: 'vertrauen',
    title: 'Vertrauen',
    subtitle: 'Zu wenig Vertrauen aufgebaut',
    icon: ShieldAlert,
    color: 'bg-red-50 text-red-700',
    borderColor: 'border-red-200 hover:border-red-400',
    symptoms: [
      'Bewerber stellt viele skeptische Fragen',
      'Antwortet kurz und einsilbig',
      'Klingt unsicher oder desinteressiert',
      'Fragt nach "Ist das seriös?"',
    ],
    fixes: [
      'Professionelles Auftreten im Zoom (Poloshirt, guter Hintergrund)',
      'Social Proof einsetzen (Jürgen-Story, Abrechner zeigen)',
      'Persönlichkeitstest vorab schicken — zeigt Professionalität',
      'Bestätigungsanruf durch Jürgen oder Top-Vertriebler',
      'WhatsApp-Nachricht mit Infos direkt nach dem Gespräch',
    ],
  },
  {
    key: 'chance',
    title: 'Chance',
    subtitle: 'Die Chance nicht richtig vermittelt',
    icon: Sparkles,
    color: 'bg-amber-50 text-amber-700',
    borderColor: 'border-amber-200 hover:border-amber-400',
    symptoms: [
      'Bewerber sagt "Ich überleg noch"',
      'Kein echtes Interesse spürbar',
      'Bewerber vergleicht mit anderen Jobs',
      'Fragt nicht nach Details zum Verdienst',
    ],
    fixes: [
      'Einkommens-Framing klar kommunizieren (fünfstellig in 6 Monaten)',
      'Gap aufzeigen: "Kannst du dir das in deinem aktuellen Job leisten?"',
      'Konkreten Abrechner zeigen (14.000€/Monat)',
      'Ziele des Bewerbers erfragen und mit der Chance verknüpfen',
      'Probetag als "Beweistag" framen — nicht als Bewerbungsgespräch',
    ],
  },
  {
    key: 'timing',
    title: 'Timing',
    subtitle: 'Zu weit in die Zukunft terminiert',
    icon: Clock,
    color: 'bg-blue-50 text-blue-700',
    borderColor: 'border-blue-200 hover:border-blue-400',
    symptoms: [
      'Termin liegt mehr als 3 Tage in der Zukunft',
      'Bewerber hat zwischenzeitlich anderes Angebot angenommen',
      'Erinnerungsnachricht wird ignoriert',
      'Bewerber "vergisst" den Termin',
    ],
    fixes: [
      'Termin maximal 2-3 Tage in die Zukunft setzen',
      'Am besten morgen oder übermorgen terminieren',
      'Bestätigungsnachricht per WhatsApp sofort nach Terminvereinbarung',
      'Jürgen ruft als Bestätigung an und stellt sich vor',
      'Am Tag vorher nochmal kurze Erinnerung schicken',
    ],
  },
];

export function ShowrateDiagnose() {
  const [expanded, setExpanded] = useState<string | null>(null);

  const toggle = (key: string) => {
    setExpanded((prev) => (prev === key ? null : key));
  };

  return (
    <Card padding="md">
      <div className="mb-6">
        <h3 className="text-base font-bold text-gray-900">Showrate-Diagnose</h3>
        <p className="text-sm text-gray-500 mt-1">
          Warum erscheinen Bewerber nicht? Klicke auf eine Ursache, um Symptome und Lösungen zu sehen.
        </p>
      </div>

      <div className="space-y-3">
        {DIAGNOSTICS.map((diag) => {
          const Icon = diag.icon;
          const isOpen = expanded === diag.key;

          return (
            <div
              key={diag.key}
              className={`border rounded-xl transition-all ${diag.borderColor} ${
                isOpen ? 'shadow-sm' : ''
              }`}
            >
              <button
                onClick={() => toggle(diag.key)}
                className="w-full flex items-center gap-4 p-4 cursor-pointer text-left"
              >
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${diag.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <h4 className="text-sm font-semibold text-gray-900">{diag.title}</h4>
                  <p className="text-xs text-gray-500">{diag.subtitle}</p>
                </div>
                {isOpen ? (
                  <ChevronUp className="w-4 h-4 text-gray-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-gray-400" />
                )}
              </button>

              {isOpen && (
                <div className="px-4 pb-4 space-y-4">
                  <div>
                    <h5 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Symptome</h5>
                    <ul className="space-y-1.5">
                      {diag.symptoms.map((s, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 flex-shrink-0" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h5 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-2">Lösungen</h5>
                    <ul className="space-y-1.5">
                      {diag.fixes.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-green-400 mt-1.5 flex-shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
