'use client';

import { useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import { ReviewModal } from '@/components/review-modal';
import {
  FileText, Phone, Globe, Video, Briefcase, Image,
  ClipboardCheck, MessageCircle, XCircle, Sparkles, Send,
  ChevronDown, RotateCcw,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ContentTypeKey =
  | 'ad_copy'
  | 'phone_script'
  | 'funnel_text'
  | 'video_script'
  | 'job_posting'
  | 'creative_brief'
  | 'vg_leitfaden'
  | 'follow_up'
  | 'absage';

type Status = 'idle' | 'generating' | 'preview' | 'refining';

interface Refinement {
  message: string;
  response: string;
}

interface ContentCard {
  key: ContentTypeKey;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Content type cards config                                          */
/* ------------------------------------------------------------------ */

const CARDS: ContentCard[] = [
  {
    key: 'ad_copy',
    label: 'Ad Copys',
    subtitle: '10 Varianten in 3 Winkeln',
    icon: <FileText className="w-6 h-6" />,
  },
  {
    key: 'phone_script',
    label: 'Telefon-Skript',
    subtitle: 'Vorqualifizierung + Einwandbehandlung',
    icon: <Phone className="w-6 h-6" />,
  },
  {
    key: 'funnel_text',
    label: 'Funnel-Texte',
    subtitle: '7 Screens für Perspective',
    icon: <Globe className="w-6 h-6" />,
  },
  {
    key: 'video_script',
    label: 'Video-Skript',
    subtitle: '60–90 Sekunden Recruiting',
    icon: <Video className="w-6 h-6" />,
  },
  {
    key: 'job_posting',
    label: 'Indeed-Anzeige',
    subtitle: 'SEO-optimiert mit Benefits',
    icon: <Briefcase className="w-6 h-6" />,
  },
  {
    key: 'creative_brief',
    label: 'Creative Brief',
    subtitle: 'Bildkonzepte + Text-Overlays',
    icon: <Image className="w-6 h-6" />,
  },
  {
    key: 'vg_leitfaden',
    label: 'VG-Leitfaden',
    subtitle: 'Vorstellungsgespräch-Leitfaden',
    icon: <ClipboardCheck className="w-6 h-6" />,
  },
  {
    key: 'follow_up',
    label: 'Follow-Up Skripte',
    subtitle: 'Nachfass + No-Show + Entscheidung',
    icon: <MessageCircle className="w-6 h-6" />,
  },
  {
    key: 'absage',
    label: 'Absage-Skripte',
    subtitle: 'Telefon + VG + Schriftlich',
    icon: <XCircle className="w-6 h-6" />,
  },
];

/* ------------------------------------------------------------------ */
/*  Content Type Card                                                  */
/* ------------------------------------------------------------------ */

function ContentCard({
  card,
  active,
  disabled,
  onClick,
}: {
  card: ContentCard;
  active: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer group ${
        active
          ? 'bg-red-600 border-red-600 text-white shadow-md'
          : disabled
          ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
          : 'bg-white border-gray-200 text-gray-900 hover:border-red-300 hover:bg-red-50 hover:shadow-sm'
      }`}
    >
      <div
        className={`mb-2 ${
          active ? 'text-white' : disabled ? 'text-gray-300' : 'text-red-600 group-hover:text-red-600'
        }`}
      >
        {card.icon}
      </div>
      <p className={`text-sm font-semibold leading-tight ${active ? 'text-white' : ''}`}>
        {card.label}
      </p>
      <p
        className={`text-xs mt-0.5 leading-snug ${
          active ? 'text-red-100' : disabled ? 'text-gray-300' : 'text-gray-500'
        }`}
      >
        {card.subtitle}
      </p>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Inner component (uses useSearchParams)                             */
/* ------------------------------------------------------------------ */

function AIToolsInner() {
  const searchParams = useSearchParams();

  const [agencies, setAgencies] = useState<{ value: string; label: string }[]>([]);
  const [selectedAgency, setSelectedAgency] = useState('');
  const [agenciesLoaded, setAgenciesLoaded] = useState(false);

  const [status, setStatus] = useState<Status>('idle');
  const [selectedType, setSelectedType] = useState<ContentTypeKey | null>(null);
  const [generatedContent, setGeneratedContent] = useState('');
  const [generatedId, setGeneratedId] = useState<string | null>(null);

  const [refinements, setRefinements] = useState<Refinement[]>([]);
  const [refinementInput, setRefinementInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  const [showReview, setShowReview] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const refinementInputRef = useRef<HTMLTextAreaElement>(null);

  // Track if we've already auto-triggered from URL params
  const autoTriggeredRef = useRef(false);

  /* ---- Load agencies ---- */

  useEffect(() => {
    // Try employee endpoint first (returns only assigned agencies), fall back to admin
    fetch('/api/employee/dashboard')
      .then((r) => r.json())
      .then((data) => {
        const agencyList = data.agencies || data;
        if (Array.isArray(agencyList) && agencyList.length > 0) {
          setAgencies([
            { value: '', label: 'Agentur wählen...' },
            ...agencyList.map((a: { id: string; name: string }) => ({ value: a.id, label: a.name })),
          ]);
          setAgenciesLoaded(true);
        } else {
          return fetch('/api/admin/agencies').then(r => r.json()).then(adminData => {
            if (Array.isArray(adminData)) {
              setAgencies([
                { value: '', label: 'Agentur wählen...' },
                ...adminData.map((a: { id: string; name: string }) => ({ value: a.id, label: a.name })),
              ]);
              setAgenciesLoaded(true);
            }
          });
        }
      })
      .catch(() => {
        fetch('/api/admin/agencies').then(r => r.json()).then(data => {
          if (Array.isArray(data)) {
            setAgencies([
              { value: '', label: 'Agentur wählen...' },
              ...data.map((a: { id: string; name: string }) => ({ value: a.id, label: a.name })),
            ]);
            setAgenciesLoaded(true);
          }
        }).catch(() => {});
      });
  }, []);

  /* ---- Handle URL params: auto-select agency and trigger generation ---- */

  useEffect(() => {
    if (!agenciesLoaded || autoTriggeredRef.current) return;

    const agencyParam = searchParams.get('agency');
    const typeParam = searchParams.get('type') as ContentTypeKey | null;

    if (agencyParam) {
      // Check if agency exists in list
      const match = agencies.find((a) => a.value === agencyParam);
      if (match) {
        setSelectedAgency(agencyParam);

        if (typeParam && CARDS.some((c) => c.key === typeParam)) {
          autoTriggeredRef.current = true;
          // Small delay to let state settle
          setTimeout(() => {
            setSelectedType(typeParam);
            setStatus('generating');
            setGeneratedContent('');
            setRefinements([]);
            setGeneratedId(null);

            fetch('/api/ai/generate', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ type: typeParam, agency_id: agencyParam }),
            })
              .then((res) => {
                if (!res.ok) throw new Error('Generation failed');
                return res.json();
              })
              .then((data) => {
                const content: string = data.content ?? '';
                setGeneratedContent(content);
                setGeneratedId(data.id ?? null);
                setStatus('preview');
                setShowReview(true);
                setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
              })
              .catch(() => {
                setStatus('idle');
                toast.error('Generierung fehlgeschlagen. Bitte erneut versuchen.');
              });
          }, 100);
        }
      }
    }
  }, [agenciesLoaded, agencies, searchParams]);

  /* ---- Generate content ---- */

  const generate = useCallback(
    async (type: ContentTypeKey, previousVersion?: string, feedback?: string) => {
      if (!selectedAgency) return;

      if (previousVersion && feedback) {
        setIsRefining(true);
      } else {
        setStatus('generating');
        setSelectedType(type);
        setGeneratedContent('');
        setRefinements([]);
        setGeneratedId(null);
      }

      try {
        const res = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type,
            agency_id: selectedAgency,
            context: previousVersion && feedback ? { previousVersion, feedback } : undefined,
          }),
        });

        if (!res.ok) throw new Error('Generation failed');

        const data = await res.json();
        const content: string = data.content ?? '';

        if (previousVersion && feedback) {
          setRefinements((prev) => [...prev, { message: feedback, response: content }]);
          setGeneratedContent(content);
          setIsRefining(false);
        } else {
          setGeneratedContent(content);
          setGeneratedId(data.id ?? null);
          setStatus('preview');
          // Auto-open review modal after generation
          setShowReview(true);
          setTimeout(() => previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
        }
      } catch {
        if (previousVersion && feedback) {
          setIsRefining(false);
          toast.error('Überarbeitung fehlgeschlagen.');
        } else {
          setStatus('idle');
          toast.error('Generierung fehlgeschlagen. Bitte erneut versuchen.');
        }
      }
    },
    [selectedAgency]
  );

  /* ---- Handle card click ---- */

  function handleCardClick(type: ContentTypeKey) {
    if (!selectedAgency || status === 'generating') return;
    generate(type);
  }

  /* ---- Send refinement ---- */

  async function sendRefinement() {
    if (!refinementInput.trim() || isRefining || !selectedType) return;
    const msg = refinementInput.trim();
    setRefinementInput('');
    if (refinementInputRef.current) refinementInputRef.current.style.height = '40px';
    await generate(selectedType, generatedContent, msg);
  }

  /* ---- Auto-resize textarea ---- */

  function handleRefinementInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setRefinementInput(e.target.value);
    e.target.style.height = '40px';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  }

  const agencyName = agencies.find((a) => a.value === selectedAgency)?.label ?? '';
  const currentCard = CARDS.find((c) => c.key === selectedType);
  const noAgency = !selectedAgency;

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div>
      <PageHeader label="FULFILLMENT" title="AI Tools" />

      <div className="flex gap-6 h-[calc(100vh-128px)]">
        {/* ============================================================
            LEFT: Agency selector + content type cards
        ============================================================ */}
        <div className="w-[320px] flex-shrink-0 flex flex-col gap-4">
          {/* Agency selector */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Agentur
            </p>
            <Select
              options={
                agencies.length > 0
                  ? agencies
                  : [{ value: '', label: 'Lade Agenturen...' }]
              }
              value={selectedAgency}
              onChange={(e) => {
                setSelectedAgency(e.target.value);
                setStatus('idle');
                setSelectedType(null);
                setGeneratedContent('');
                setRefinements([]);
                autoTriggeredRef.current = false;
              }}
              className="w-full"
            />
          </div>

          {/* Content type grid */}
          <div className="flex-1 overflow-y-auto">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
              Content-Typ
            </p>
            {noAgency && (
              <p className="text-xs text-gray-400 mb-3">
                Zuerst eine Agentur auswählen.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              {CARDS.map((card) => (
                <ContentCard
                  key={card.key}
                  card={card}
                  active={selectedType === card.key && status !== 'idle'}
                  disabled={noAgency || status === 'generating'}
                  onClick={() => handleCardClick(card.key)}
                />
              ))}
            </div>
          </div>
        </div>

        {/* ============================================================
            RIGHT: Preview + refinement chat
        ============================================================ */}
        <div className="flex-1 flex flex-col min-w-0 overflow-y-auto" ref={previewRef}>
          {/* IDLE state */}
          {status === 'idle' && (
            <Card padding="md" className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-sm">
                <div className="w-16 h-16 rounded-xl bg-red-600 flex items-center justify-center mx-auto mb-5 shadow-md">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  1-Click Content Generation
                </h3>
                <p className="text-gray-500 text-sm leading-relaxed">
                  Agentur auswählen, Content-Typ klicken — fertig. Kein Prompt nötig.
                </p>
              </div>
            </Card>
          )}

          {/* GENERATING state */}
          {status === 'generating' && currentCard && (
            <Card padding="md" className="flex-1 flex items-center justify-center">
              <div className="text-center max-w-sm">
                <div className="w-12 h-12 border-4 border-red-100 border-t-red-600 rounded-full animate-spin mx-auto mb-5" />
                <p className="text-base font-semibold text-gray-900">
                  Generiert {currentCard.label}
                  {agencyName ? ` für ${agencyName}` : ''}...
                </p>
                <p className="text-sm text-gray-400 mt-1">Dauert ca. 15–30 Sekunden</p>
              </div>
            </Card>
          )}

          {/* PREVIEW / REFINING state */}
          {(status === 'preview' || status === 'refining') && currentCard && (
            <div className="flex flex-col gap-4">
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-600 flex items-center justify-center text-white flex-shrink-0">
                  {currentCard.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-gray-900">{currentCard.label}</p>
                  {agencyName && (
                    <p className="text-xs text-gray-400">{agencyName}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => generate(selectedType!)}
                    disabled={isRefining}
                    className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-red-600 transition-colors cursor-pointer disabled:opacity-40"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Neu generieren
                  </button>
                  <Button
                    variant="soft"
                    size="sm"
                    onClick={() => setShowReview(true)}
                  >
                    Prüfen &amp; Freigeben
                  </Button>
                </div>
              </div>

              {/* Generated content preview */}
              <Card padding="md">
                <pre className="text-sm text-gray-900 whitespace-pre-wrap font-sans leading-relaxed">
                  {generatedContent}
                </pre>
              </Card>

              {/* Refinement history */}
              {refinements.length > 0 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                    <ChevronDown className="w-3.5 h-3.5" />
                    Überarbeitungen ({refinements.length})
                  </p>
                  {refinements.map((r, i) => (
                    <div key={i} className="space-y-2">
                      <div className="flex justify-end">
                        <div className="max-w-[80%] bg-red-600 text-white rounded-xl px-4 py-2.5">
                          <p className="text-sm">{r.message}</p>
                        </div>
                      </div>
                      <div className="flex justify-start">
                        <div className="max-w-[90%] bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm">
                          <p className="text-xs text-gray-400 mb-1">Version {i + 2}</p>
                          <pre className="text-sm text-gray-900 whitespace-pre-wrap font-sans leading-relaxed max-h-48 overflow-y-auto">
                            {r.response}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Refinement chat input */}
              <div className="sticky bottom-0 bg-gray-50 pt-2 pb-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                  Verfeinern
                </p>
                <div className="flex items-end gap-3">
                  <div className="flex-1 relative bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden focus-within:border-red-400 focus-within:ring-2 focus-within:ring-red-100 transition-all">
                    <textarea
                      ref={refinementInputRef}
                      value={refinementInput}
                      onChange={handleRefinementInput}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          sendRefinement();
                        }
                      }}
                      placeholder="Was möchtest du ändern? z.B. &quot;Hook kürzer&quot; oder &quot;Mehr Fokus auf Quereinstieg&quot;"
                      rows={1}
                      disabled={isRefining}
                      className="w-full px-4 py-2.5 text-sm text-gray-900 placeholder:text-gray-400 outline-none resize-none bg-transparent disabled:opacity-50"
                      style={{ minHeight: '40px', maxHeight: '120px' }}
                    />
                  </div>
                  <Button
                    onClick={sendRefinement}
                    disabled={!refinementInput.trim() || isRefining}
                    glow={!!refinementInput.trim() && !isRefining}
                    className="h-[40px] !px-5 flex-shrink-0"
                  >
                    {isRefining ? (
                      <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Review Modal */}
      {showReview && selectedType && selectedAgency && (
        <ReviewModal
          open={showReview}
          onClose={() => setShowReview(false)}
          content={generatedContent}
          contentType={selectedType}
          agencyId={selectedAgency}
          taskId={generatedId ?? undefined}
          onApprove={() => {
            setShowReview(false);
          }}
          onRevise={(feedback) => {
            setShowReview(false);
            if (selectedType) {
              generate(selectedType, generatedContent, feedback);
            }
          }}
          onDiscard={() => {
            setShowReview(false);
            setStatus('idle');
            setSelectedType(null);
            setGeneratedContent('');
            setRefinements([]);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page (wraps inner in Suspense for useSearchParams)           */
/* ------------------------------------------------------------------ */

export default function AIToolsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    }>
      <AIToolsInner />
    </Suspense>
  );
}
