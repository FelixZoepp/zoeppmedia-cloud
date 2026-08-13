'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  Globe,
  Rocket,
  Sparkles,
  FileText,
} from 'lucide-react';

type WizardStep = 1 | 2 | 3 | 4;

interface BrandInfo {
  company_name: string;
  primary_color: string;
  contact_name: string;
  contact_phone: string;
  logo_url: string | null;
  regions: string[];
  job_title: string;
}

export default function PerspectiveFunnelPage() {
  const { id } = useParams<{ id: string }>();
  const [step, setStep] = useState<WizardStep>(1);
  const [loading, setLoading] = useState(false);
  const [funnelText, setFunnelText] = useState('');
  const [brandInfo, setBrandInfo] = useState<BrandInfo | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Step 2 checkboxes
  const [domainConnected, setDomainConnected] = useState(false);
  const [pixelInstalled, setPixelInstalled] = useState(false);

  // Step 3
  const [liveUrl, setLiveUrl] = useState('');
  const [saving, setSaving] = useState(false);

  // Check if funnel already exists
  const [existingUrl, setExistingUrl] = useState<string | null>(null);

  useEffect(() => {
    // Check for existing funnel
    fetch(`/api/perspective/funnels?agency_id=${id}`)
      .then((r) => r.json())
      .then((funnels) => {
        if (Array.isArray(funnels) && funnels.length > 0) {
          const published = funnels.find(
            (f: { status: string; url: string | null }) => f.status === 'published' && f.url
          );
          if (published) {
            setExistingUrl(published.url);
            setLiveUrl(published.url);
            setStep(4);
          }
        }
      })
      .catch(() => {});
  }, [id]);

  async function generateFunnel() {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/perspective/generate-funnel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency_id: id }),
      });

      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Fehler beim Generieren');
        return;
      }

      const data = await res.json();
      setFunnelText(data.funnel_text);
      setBrandInfo(data.brand_info);
    } catch {
      setError('Netzwerkfehler');
    } finally {
      setLoading(false);
    }
  }

  function copyFunnelText() {
    navigator.clipboard.writeText(funnelText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function saveFunnelUrl() {
    if (!liveUrl.trim()) return;
    setSaving(true);

    try {
      const res = await fetch('/api/perspective/save-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agency_id: id, url: liveUrl.trim() }),
      });

      if (res.ok) {
        setExistingUrl(liveUrl.trim());
        setStep(4);
      }
    } finally {
      setSaving(false);
    }
  }

  const steps = [
    { num: 1, label: 'Funnel generieren' },
    { num: 2, label: 'Domain verbinden' },
    { num: 3, label: 'Veröffentlichen' },
    { num: 4, label: 'Fertig' },
  ];

  return (
    <div className="max-w-4xl">
      <Link
        href={`/clients/${id}/fulfillment`}
        className="inline-flex items-center gap-1.5 text-gray-600 hover:text-red-500 text-sm mb-8 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Zurück zum Fulfillment
      </Link>

      <PageHeader
        label="PERSPECTIVE"
        title="Funnel erstellen"
        description="Schritt-für-Schritt Recruiting-Funnel in Perspective aufbauen"
      />

      {/* Step Progress */}
      <div className="flex items-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center gap-2">
            <button
              onClick={() => {
                if (s.num < step || (s.num === 4 && existingUrl)) setStep(s.num as WizardStep);
              }}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                s.num === step
                  ? 'bg-red-600 text-white'
                  : s.num < step
                    ? 'bg-green-100 text-green-700 cursor-pointer hover:bg-green-200'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {s.num < step ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <span>{s.num}</span>
              )}
              {s.label}
            </button>
            {i < steps.length - 1 && (
              <ChevronRight className="w-4 h-4 text-gray-300" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Generate Funnel */}
      {step === 1 && (
        <div className="space-y-6">
          <Card padding="lg">
            <div className="flex items-center gap-4 mb-6">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900">Funnel-Texte generieren</h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Basierend auf den Onboarding-Daten werden die 7 Screens des Recruiting-Funnels vorbefüllt.
                </p>
              </div>
            </div>

            {!funnelText && (
              <Button
                variant="primary"
                onClick={generateFunnel}
                disabled={loading}
              >
                <Sparkles className="w-4 h-4" />
                {loading ? 'Generiert...' : 'Funnel-Texte generieren'}
              </Button>
            )}

            {error && (
              <p className="text-sm text-red-600 mt-4">{error}</p>
            )}

            {funnelText && (
              <div className="space-y-6 mt-4">
                {/* Brand info summary */}
                {brandInfo && (
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Agentur-Daten</p>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div>
                        <span className="text-gray-500">Firma:</span>{' '}
                        <span className="font-medium text-gray-900">{brandInfo.company_name}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Stelle:</span>{' '}
                        <span className="font-medium text-gray-900">{brandInfo.job_title}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Region:</span>{' '}
                        <span className="font-medium text-gray-900">{brandInfo.regions.join(', ') || 'k.A.'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">Farbe:</span>{' '}
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="w-3 h-3 rounded-full inline-block"
                            style={{ backgroundColor: brandInfo.primary_color }}
                          />
                          <span className="font-mono text-xs text-gray-900">{brandInfo.primary_color}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Funnel text preview */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                      Generierte Funnel-Texte
                    </p>
                    <Button variant="ghost" size="sm" onClick={copyFunnelText}>
                      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Kopiert' : 'Kopieren'}
                    </Button>
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 max-h-96 overflow-y-auto">
                    <pre className="text-sm text-gray-900 whitespace-pre-wrap font-sans leading-relaxed">
                      {funnelText}
                    </pre>
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-2 border-t border-gray-200">
                  <Button variant="primary" onClick={() => setStep(2)}>
                    Weiter <ChevronRight className="w-4 h-4" />
                  </Button>
                  <p className="text-xs text-gray-400">
                    Kopiere die Texte und erstelle den Funnel manuell in Perspective.
                  </p>
                </div>
              </div>
            )}
          </Card>

          {funnelText && (
            <Card padding="md" className="!bg-blue-50 !border-blue-200">
              <div className="flex items-start gap-3">
                <FileText className="w-5 h-5 text-blue-600 mt-0.5 shrink-0" />
                <div>
                  <h3 className="text-sm font-semibold text-blue-900 mb-1">Anleitung: Funnel in Perspective erstellen</h3>
                  <ol className="text-sm text-blue-800 space-y-1.5 list-decimal list-inside">
                    <li>Perspective Dashboard öffnen und neuen Funnel erstellen</li>
                    <li>Die kopierten Texte Screen für Screen einfügen (7 Screens)</li>
                    <li>Logo und Primärfarbe (<span className="font-mono">{brandInfo?.primary_color}</span>) setzen</li>
                    <li>Kontaktformular auf Screen 6 konfigurieren (Name, E-Mail, Telefon)</li>
                    <li>Webhook-URL hinterlegen für automatischen Lead-Import</li>
                  </ol>
                </div>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Step 2: Connect Domain */}
      {step === 2 && (
        <Card padding="lg">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <Globe className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Domain und Pixel verbinden</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Nils verbindet die Subdomain auf traumvertriebsjob.de und installiert den Meta Pixel.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Anleitung für Nils
              </p>
              <ol className="text-sm text-gray-700 space-y-2 list-decimal list-inside">
                <li>In Perspective unter Einstellungen die Custom Domain konfigurieren</li>
                <li>Subdomain anlegen: <span className="font-mono text-red-600">{brandInfo?.company_name?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'kunde'}.traumvertriebsjob.de</span></li>
                <li>DNS-Eintrag (CNAME) bei dem Domain-Provider setzen</li>
                <li>SSL-Zertifikat automatisch aktivieren lassen</li>
                <li>Meta Pixel ID im Funnel hinterlegen</li>
                <li>Conversion-Events konfigurieren (Lead, CompleteRegistration)</li>
              </ol>
            </div>

            <div className="space-y-3">
              <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={domainConnected}
                  onChange={() => setDomainConnected(!domainConnected)}
                  className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 accent-red-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Subdomain verbunden</p>
                  <p className="text-xs text-gray-500">DNS-Eintrag gesetzt und SSL aktiv</p>
                </div>
              </label>

              <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={pixelInstalled}
                  onChange={() => setPixelInstalled(!pixelInstalled)}
                  className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-500 accent-red-600"
                />
                <div>
                  <p className="text-sm font-medium text-gray-900">Meta Pixel installiert</p>
                  <p className="text-xs text-gray-500">Pixel ID hinterlegt und Events konfiguriert</p>
                </div>
              </label>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
              <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
                Zurück
              </Button>
              <Button
                variant="primary"
                onClick={() => setStep(3)}
                disabled={!domainConnected || !pixelInstalled}
              >
                Weiter <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Step 3: Publish */}
      {step === 3 && (
        <Card padding="lg">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <Rocket className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Funnel veröffentlichen</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Trage die Live-URL ein, sobald der Funnel veröffentlicht ist.
              </p>
            </div>
          </div>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Live-URL des Funnels
              </label>
              <Input
                type="url"
                value={liveUrl}
                onChange={(e) => setLiveUrl(e.target.value)}
                placeholder="https://kunde.traumvertriebsjob.de"
              />
              <p className="text-xs text-gray-400 mt-1.5">
                Diese URL wird als Karriereseite gespeichert und für die Ad-Copy verwendet.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
              <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
                Zurück
              </Button>
              <Button
                variant="primary"
                onClick={saveFunnelUrl}
                disabled={!liveUrl.trim() || saving}
              >
                <Rocket className="w-4 h-4" />
                {saving ? 'Speichert...' : 'Als veröffentlicht markieren'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Step 4: Done */}
      {step === 4 && (
        <Card padding="lg">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-green-100 flex items-center justify-center">
              <Check className="w-5 h-5 text-green-700" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Funnel ist live</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Der Recruiting-Funnel wurde erfolgreich veröffentlicht.
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-green-700 uppercase tracking-wider mb-1">Live-URL</p>
                  <a
                    href={existingUrl || liveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-green-800 hover:underline inline-flex items-center gap-1.5"
                  >
                    {existingUrl || liveUrl}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
                <Badge tone="success">Veröffentlicht</Badge>
              </div>
            </div>

            <p className="text-sm text-gray-600">
              Die URL wurde als Karriereseite gespeichert und steht für die Ad-Copy-Generierung bereit.
              Neue Bewerber, die sich über den Funnel bewerben, erscheinen automatisch in der Pipeline.
            </p>

            <div className="flex items-center gap-3 pt-4 border-t border-gray-200">
              <Link href={`/clients/${id}/fulfillment`}>
                <Button variant="secondary" size="sm">
                  <ArrowLeft className="w-4 h-4" /> Zurück zum Fulfillment
                </Button>
              </Link>
              <a
                href={existingUrl || liveUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="primary" size="sm">
                  <ExternalLink className="w-4 h-4" /> Funnel öffnen
                </Button>
              </a>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}
