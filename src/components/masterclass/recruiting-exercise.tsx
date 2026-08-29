'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, Check, RotateCcw } from 'lucide-react';

interface Question {
  id: number;
  question: string;
  hint: string;
}

const QUESTIONS: Question[] = [
  {
    id: 1,
    question: 'Wie eröffnest du ein Erstgespräch nach einer Indeed-Bewerbung? Schreibe deinen Eröffnungssatz auf.',
    hint: 'Denke an: Name, Firma, Grund des Anrufs, Bestätigungsfrage.',
  },
  {
    id: 2,
    question: 'Was ist das zentrale Framing für die VG-Einladung? Formuliere es in deinen eigenen Worten.',
    hint: 'Kern: konkretes Einkommensversprechen + Zeitrahmen.',
  },
  {
    id: 3,
    question: 'Warum ist die Jürgen-Story so wirkungsvoll? Nenne mindestens 3 Gründe.',
    hint: 'Denke an: Relatabilität, Konkretion, Beweiskraft.',
  },
  {
    id: 4,
    question: 'Ein Bewerber sagt: "Ich überlege noch." — Was antwortest du?',
    hint: 'Nutze Gap-Fragen und Einkommens-Framing.',
  },
  {
    id: 5,
    question: 'Warum sollte der Probetag maximal 3 Tage in der Zukunft liegen?',
    hint: 'Denke an: Vergessen, andere Angebote, schwindende Motivation.',
  },
  {
    id: 6,
    question: 'Beschreibe das perfekte Zoom-Setup: Was muss stimmen?',
    hint: 'Kleidung, Hintergrund, Kameraposition, Ausstrahlung.',
  },
  {
    id: 7,
    question: 'Wie gehst du mit einem Bewerber um, der skeptisch fragt "Ist das seriös?"',
    hint: 'Vertrauen aufbauen: Social Proof, Professionalität, Persönlichkeitstest.',
  },
  {
    id: 8,
    question: 'Was sind die 3 Hauptgründe für eine niedrige Showrate? Ordne sie nach Häufigkeit.',
    hint: 'Vertrauen, Chance, Timing.',
  },
  {
    id: 9,
    question: 'Wie übergibst du einen qualifizierten Bewerber an den nächsten Schritt? Beschreibe den Handoff-Prozess.',
    hint: 'Bestätigungsanruf, WhatsApp, Persönlichkeitstest, Erinnerung.',
  },
  {
    id: 10,
    question: 'Schreibe eine WhatsApp-Nachricht, die du nach dem Erstgespräch an den Bewerber schickst.',
    hint: 'Kurz, persönlich, nächster Schritt klar, Termin bestätigen.',
  },
];

export function RecruitingExercise() {
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const updateAnswer = (id: number, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const answeredCount = Object.values(answers).filter((a) => a.trim().length > 0).length;
  const allAnswered = answeredCount === QUESTIONS.length;

  const reset = () => {
    setAnswers({});
    setSubmitted(false);
  };

  return (
    <Card padding="md">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-red-600" />
            Praxisübung
          </h3>
          <p className="text-sm text-gray-500 mt-1">
            Beantworte alle 10 Fragen, um dein Wissen zu festigen
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={allAnswered ? 'success' : 'neutral'}>
            {answeredCount}/{QUESTIONS.length} beantwortet
          </Badge>
          {answeredCount > 0 && (
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="w-3.5 h-3.5" />
              Zurücksetzen
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-6">
        {QUESTIONS.map((q) => {
          const answer = answers[q.id] || '';
          const hasAnswer = answer.trim().length > 0;

          return (
            <div key={q.id} className="space-y-2">
              <div className="flex items-start gap-3">
                <span className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${
                  submitted && hasAnswer
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}>
                  {submitted && hasAnswer ? <Check className="w-3.5 h-3.5" /> : q.id}
                </span>
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-900 mb-1">
                    {q.question}
                  </label>
                  <p className="text-xs text-gray-400 mb-2">Tipp: {q.hint}</p>
                  <textarea
                    value={answer}
                    onChange={(e) => updateAnswer(q.id, e.target.value)}
                    placeholder="Deine Antwort..."
                    rows={3}
                    disabled={submitted}
                    className="w-full bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 shadow-sm outline-none focus:border-red-500 focus:ring-2 focus:ring-red-100 resize-y disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-8 flex items-center justify-between">
        {!submitted ? (
          <Button
            variant="primary"
            onClick={() => setSubmitted(true)}
            disabled={!allAnswered}
          >
            <Check className="w-4 h-4" />
            Antworten abschicken
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <Badge tone="success" className="text-sm px-4 py-1.5">
              Alle Antworten gespeichert
            </Badge>
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="w-3.5 h-3.5" />
              Nochmal machen
            </Button>
          </div>
        )}
        <p className="text-xs text-gray-400">
          {allAnswered
            ? 'Alle Fragen beantwortet — bereit zum Abschicken!'
            : `Noch ${QUESTIONS.length - answeredCount} Frage${QUESTIONS.length - answeredCount !== 1 ? 'n' : ''} offen`}
        </p>
      </div>
    </Card>
  );
}
