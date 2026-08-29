'use client';

import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import {
  GraduationCap, Phone, MessageSquare, Target, Users, Sparkles,
  Video, HelpCircle, CalendarCheck, ArrowLeftRight, AlertTriangle,
  ClipboardList, ChevronLeft, BookOpen,
} from 'lucide-react';
import Link from 'next/link';

import { OriginalFraming } from '@/components/masterclass/original-framing';
import { RecruitingFunnel } from '@/components/masterclass/recruiting-funnel';
import { RecruiterScorecard } from '@/components/masterclass/recruiter-scorecard';
import { ShowrateDiagnose } from '@/components/masterclass/showrate-diagnose';
import { FramingLibrary } from '@/components/masterclass/framing-library';
import { RecruitingExercise } from '@/components/masterclass/recruiting-exercise';

const TABS = [
  { value: 'funnel', label: 'Funnel' },
  { value: 'framings', label: 'Framings' },
  { value: 'scorecard', label: 'Scorecard' },
  { value: 'showrate', label: 'Showrate' },
  { value: 'uebung', label: 'Übung' },
];

export default function RecruitingMasterclassPage() {
  const [activeTab, setActiveTab] = useState('funnel');

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/masterclass"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Zurück zur Masterclass
        </Link>

        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
            <GraduationCap className="w-6 h-6 text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Recruiting &amp; Bewerber-Framing</h1>
            <p className="text-gray-600 mt-1">
              Lerne den kompletten Recruiting-Funnel, Framings und Skripte für Erstgespräch bis Probetag
            </p>
            <div className="flex items-center gap-2 mt-3">
              <Badge tone="softAccent">Masterclass</Badge>
              <Badge tone="neutral">13 Lektionen</Badge>
              <Badge tone="neutral">23 Framings</Badge>
            </div>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="mb-6">
        <SegmentedControl
          items={TABS}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'funnel' && (
          <div className="space-y-8">
            <RecruitingFunnel />

            {/* Overview Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card padding="sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
                    <Phone className="w-4 h-4 text-red-600" />
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900">Erstkontakt</h4>
                </div>
                <p className="text-xs text-gray-500">
                  Der erste Anruf entscheidet. Professionelle Eröffnung, klarer Rahmen, schnelle Qualifizierung.
                </p>
              </Card>
              <Card padding="sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                    <Target className="w-4 h-4 text-amber-600" />
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900">VG &amp; Probetag</h4>
                </div>
                <p className="text-xs text-gray-500">
                  Einkommens-Framing, Social Proof, Gap aufzeigen und den Probetag kurzfristig terminieren.
                </p>
              </Card>
              <Card padding="sm">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center">
                    <Users className="w-4 h-4 text-green-600" />
                  </div>
                  <h4 className="text-sm font-semibold text-gray-900">Follow-up</h4>
                </div>
                <p className="text-xs text-gray-500">
                  Saubere Übergabe, Persönlichkeitstest, Bestätigungsanruf durch Top-Vertriebler.
                </p>
              </Card>
            </div>

            {/* Funnel Lessons Inline */}
            <Card padding="md">
              <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                <BookOpen className="w-5 h-5 text-red-600" />
                Der Recruiting-Prozess im Detail
              </h3>
              <div className="space-y-4">
                {[
                  { icon: Phone, title: '1. Bewerbung eingeht', desc: 'Indeed-Bewerbung kommt rein. Schnelligkeit ist entscheidend — innerhalb von 30 Minuten anrufen.' },
                  { icon: MessageSquare, title: '2. Erstkontakt', desc: 'Professionelle Gesprächseröffnung, 2-Minuten-Rahmen setzen, schnelle Qualifizierung.' },
                  { icon: Target, title: '3. Qualifizierung', desc: 'Offene Fragen stellen: Wer bist du? Was hast du gemacht? Warum Vertrieb?' },
                  { icon: Sparkles, title: '4. VG-Einladung', desc: 'Das zentrale Framing: "Ich zeige dir, wie du in 6 Monaten fünfstellig verdienst."' },
                  { icon: Video, title: '5. Zoom-VG', desc: '15-20 Minuten, professionelles Auftreten, Schmerz-/Ziel-Fragen, Abrechner zeigen.' },
                  { icon: CalendarCheck, title: '6. Probetag', desc: 'Kurzfristig terminieren (max. 3 Tage), Jürgen-Übergabe, Bestätigungsnachricht.' },
                  { icon: ArrowLeftRight, title: '7. Handoff', desc: 'Persönlichkeitstest, WhatsApp-Kontakt, Erinnerung am Tag vorher.' },
                  { icon: Users, title: '8. Einstellung', desc: 'Nach erfolgreichem Probetag — Vertrag und Onboarding starten.' },
                ].map((step, i) => {
                  const Icon = step.icon;
                  return (
                    <div key={i} className="flex items-start gap-3">
                      <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Icon className="w-4 h-4 text-gray-600" />
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-gray-900">{step.title}</h4>
                        <p className="text-xs text-gray-500 mt-0.5">{step.desc}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'framings' && (
          <FramingLibrary />
        )}

        {activeTab === 'scorecard' && (
          <RecruiterScorecard />
        )}

        {activeTab === 'showrate' && (
          <div className="space-y-6">
            <ShowrateDiagnose />

            <Card padding="md">
              <h3 className="text-base font-bold text-gray-900 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-500" />
                Showrate-Benchmark
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-red-50 border border-red-100">
                  <p className="text-2xl font-bold text-red-700">{'<'} 50%</p>
                  <p className="text-xs text-red-600 mt-1">Kritisch — sofort Ursachen analysieren</p>
                </div>
                <div className="p-4 rounded-xl bg-amber-50 border border-amber-100">
                  <p className="text-2xl font-bold text-amber-700">50-70%</p>
                  <p className="text-xs text-amber-600 mt-1">Ausbaufähig — Optimierungspotenzial</p>
                </div>
                <div className="p-4 rounded-xl bg-green-50 border border-green-100">
                  <p className="text-2xl font-bold text-green-700">{'>'} 70%</p>
                  <p className="text-xs text-green-600 mt-1">Gut — Prozess funktioniert</p>
                </div>
              </div>
            </Card>
          </div>
        )}

        {activeTab === 'uebung' && (
          <RecruitingExercise />
        )}
      </div>
    </div>
  );
}
