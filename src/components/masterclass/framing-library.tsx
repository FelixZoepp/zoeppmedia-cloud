'use client';

import { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { OriginalFraming } from './original-framing';

interface Framing {
  category: string;
  title: string;
  situation: string;
  quote: string;
}

const FRAMINGS: Framing[] = [
  {
    category: 'Erstkontakt',
    title: 'Gesprächseröffnung',
    situation: 'Erster Anruf nach Indeed-Bewerbung',
    quote: 'Moin, grüß dich. Hasan hier aus dem Team von B&C. Ich rufe an, weil du dich bei uns über Indeed für eine Stelle im Vertrieb beworben hast. Ist das richtig?',
  },
  {
    category: 'Erstkontakt',
    title: 'Gesprächsrahmen setzen',
    situation: 'Nach Bestätigung der Bewerbung',
    quote: 'Super. In diesem kurzen Gespräch geht es erst einmal darum, in zwei Minuten zu schauen, ob es grundsätzlich zwischen uns passt. Wenn wir beide merken, dass es Sinn ergibt, würde ich dich zu einem Vorstellungsgespräch einladen – im Büro oder über Zoom, je nachdem. Ist das für dich passend?',
  },
  {
    category: 'Qualifikation',
    title: 'Offene Qualifizierungsfrage',
    situation: 'Einstieg in die Qualifizierung',
    quote: 'Ich habe nebenbei deinen Lebenslauf geöffnet, aber du kannst mir trotzdem ein oder zwei Sachen über dich erzählen. Wer bist du? Was hast du bisher gemacht? Wieso möchtest du jetzt in den Vertrieb und weshalb hast du deinen alten Job gekündigt?',
  },
  {
    category: 'VG closen',
    title: 'Das zentrale VG-Framing',
    situation: 'Übergang zum Vorstellungsgespräch',
    quote: 'Okay, hey, ich merke schon, dass es grundsätzlich Sinn ergibt, wenn wir uns einmal zusammensetzen. Ich würde vorschlagen, dass wir ein Vorstellungsgespräch vereinbaren, damit wir dich näher kennenlernen und du auch uns kennenlernst. In diesem Gespräch zeige ich dir konkret, wie du innerhalb von sechs Monaten auf ein fünfstelliges Einkommen beziehungsweise auf fünfstellige Provisionen pro Monat kommen kannst. Hättest du darauf Bock?',
  },
  {
    category: 'VG closen',
    title: 'Kurzform Merksatz',
    situation: 'Das zentrale Framing in einem Satz',
    quote: 'Ich zeige dir in dem Termin, wie du in sechs Monaten auf ein fünfstelliges Einkommen kommst.',
  },
  {
    category: 'Jürgen Social Proof',
    title: 'Jürgen Story',
    situation: 'Social Proof im Telefongespräch oder VG',
    quote: 'Der Jürgen zum Beispiel, der kam vorher aus Bayern, ist extra zu uns nach Berlin gezogen, der hatte gar nichts, der wusste auch gar nichts, der verdient jetzt jeden Monat 14.000 Euro.',
  },
  {
    category: 'Jürgen Social Proof',
    title: 'Jürgen als VG-Einladung',
    situation: 'Nach der Jürgen-Story',
    quote: 'Und das würde ich dir auch gerne mal zeigen im Vorstellungsgespräch, wie der Jürgen es geschafft hat, innerhalb von unter sechs Monaten fünfstellig zu verdienen.',
  },
  {
    category: 'Probetag-Framing',
    title: 'Probetag Fokus setzen',
    situation: 'Framing für den Probetag',
    quote: 'Ey, im Probetag zeigen wir dir, wie so Jürgen es schafft, am Tag über 1000 Euro zu verdienen. Das siehst du am Probetag.',
  },
  {
    category: 'Zoom-Framing',
    title: 'Zoom-Call Rahmen',
    situation: 'Vorstellungsgespräch per Zoom ankündigen',
    quote: '15 bis 20 Minuten ist auf Zoom, wo wir uns mal ein bisschen besser kennenlernen. Ich halte einen kurzen Vortrag, zeige dir das mal kurz, kannst alle deine Fragen stellen. Und wenn das passt, dann wäre es was, wo wir das für mal einen Probetag vereinbaren würden. Passt das für dich?',
  },
  {
    category: 'Ziel-/Schmerz-Fragen',
    title: 'Ausgangslage abholen',
    situation: 'Beginn des Vorstellungsgesprächs',
    quote: 'Hol mich mal noch kurz ab, ist ja ein bisschen länger her, dass wir gesprochen haben: Was hast du beruflich gemacht?',
  },
  {
    category: 'Ziel-/Schmerz-Fragen',
    title: 'In den Schmerz gehen',
    situation: 'Nach der Ausgangslage',
    quote: 'Aber es klingt ja alles so, als wenn man da jetzt noch nicht wirklich richtig Zukunft machen kann, ne?',
  },
  {
    category: 'Ziel-/Schmerz-Fragen',
    title: 'Geld-Realität',
    situation: 'Schmerz vertiefen',
    quote: 'Und das Geld reicht wahrscheinlich auch nicht.',
  },
  {
    category: 'Ziel-/Schmerz-Fragen',
    title: 'Ziele erfragen',
    situation: 'Desired State öffnen',
    quote: 'Was hast du denn für Ziele?',
  },
  {
    category: 'Ziel-/Schmerz-Fragen',
    title: 'Gap aufzeigen',
    situation: 'Nach dem Ziel — Gap zwischen Ist und Soll',
    quote: 'Glaubst du denn, dass du in deiner aktuellen Ausgangslage das so kaufen könntest?',
  },
  {
    category: 'Probetag closen',
    title: 'Fit bestätigen',
    situation: 'Übergang zum Probetag',
    quote: 'Pass auf, ich merke, das passt zwischen uns.',
  },
  {
    category: 'Probetag closen',
    title: 'Abrechner zeigen',
    situation: 'Visueller Beweis',
    quote: 'Guck mal, hier ist ein Abrechner, der letzten Monat 14.000 Euro verdient.',
  },
  {
    category: 'Probetag closen',
    title: 'Probetag terminieren',
    situation: 'Konkreten Termin setzen',
    quote: 'Der zeigt dir morgen mal, oder wie auch immer, zeigt dir übermorgen, zwei Tagen, am besten Fall mal, aber kurzfristig Termin, maximal drei Tage in die Zukunft, wieso er jeden Tag, wieso er jeden Monat 14.000 Euro verdient. Wann passt es dir da?',
  },
  {
    category: 'Professionalität',
    title: 'Auftreten',
    situation: 'Vorbereitung auf den Zoom-Call',
    quote: 'Alles muss absolut professionell sein. Poloshirt, du musst gut gepflegt sein, du musst geil sein, du musst, ne, alles muss passen, komplett.',
  },
  {
    category: 'Professionalität',
    title: 'Wirkung',
    situation: 'Warum Professionalität wichtig ist',
    quote: 'Es muss einfach Geld aussehen.',
  },
  {
    category: 'Professionalität',
    title: 'Hintergrund',
    situation: 'Setup des Zoom-Calls',
    quote: 'Das muss so aussehen, als ob du bei Baller, als ob du Kohle hast.',
  },
  {
    category: 'Professionalität',
    title: 'Kameraperspektive',
    situation: 'Kameraposition im Zoom',
    quote: 'Du guckst immer auf die Leute herab eigentlich, verstehst du? Du bist nicht auf Augenhöhe, sondern du guckst immer auf die Leute herab.',
  },
  {
    category: 'Follow-up / Handoff',
    title: 'Übergabe an Jürgen',
    situation: 'Nach dem Vorstellungsgespräch',
    quote: 'Leute einterminieren, zu Jürgen gehen, Jürgen ruft normal als Bestätigung, stellt sich vor, schreibt mit dem kurz über WhatsApp.',
  },
  {
    category: 'Follow-up / Handoff',
    title: 'Persönlichkeitstest',
    situation: 'Test vor dem VG zuschicken',
    quote: 'Hey, pass auf. Zur Vorbereitung auf das Vorstellungsgespräch arbeiten wir mit einem Persönlichkeitstest, damit wir noch ein paar zusätzliche Informationen über dich haben und dich besser kennenlernen können. Deshalb schicke ich dir den Test einmal zu. Fülle das Ganze bitte aus und sende es anschließend ab. Dann bekommen wir das Ergebnis direkt zugeschickt.',
  },
];

const CATEGORIES = Array.from(new Set(FRAMINGS.map((f) => f.category)));

export function FramingLibrary() {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const filtered = useMemo(() => {
    let result = FRAMINGS;

    if (activeCategory) {
      result = result.filter((f) => f.category === activeCategory);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (f) =>
          f.title.toLowerCase().includes(q) ||
          f.quote.toLowerCase().includes(q) ||
          f.situation.toLowerCase().includes(q) ||
          f.category.toLowerCase().includes(q)
      );
    }

    return result;
  }, [search, activeCategory]);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-gray-900">Framing-Bibliothek</h3>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} von {FRAMINGS.length} Framings
          </p>
        </div>
      </div>

      <div className="mb-4">
        <Input
          icon={<Search className="w-4 h-4" />}
          placeholder="Framings durchsuchen..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => setActiveCategory(null)}
          className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors cursor-pointer ${
            activeCategory === null
              ? 'bg-red-50 text-red-700 border border-red-200'
              : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
          }`}
        >
          Alle
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors cursor-pointer ${
              activeCategory === cat
                ? 'bg-red-50 text-red-700 border border-red-200'
                : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            {cat}
            <Badge tone="neutral" className="ml-1.5 text-[10px]">
              {FRAMINGS.filter((f) => f.category === cat).length}
            </Badge>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-sm text-gray-500">Keine Framings gefunden.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((framing, i) => (
            <div key={`${framing.category}-${framing.title}-${i}`}>
              {(i === 0 || filtered[i - 1].category !== framing.category) && (
                <div className="mt-6 mb-3 first:mt-0">
                  <Badge tone="softAccent">{framing.category}</Badge>
                </div>
              )}
              <OriginalFraming
                title={framing.title}
                situation={framing.situation}
                quote={framing.quote}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
