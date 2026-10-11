'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import Script from 'next/script';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Phone, CheckCircle, AlertCircle, Loader2, Shield, RefreshCw, Unlink } from 'lucide-react';

interface WaAccount {
  id: string;
  waba_id: string;
  phone_number_id: string;
  display_number: string | null;
  verified_name: string | null;
  status: string;
  fehler: string | null;
  quality_rating: string | null;
  messaging_limit: string | null;
  connected_at: string;
}

interface WaTemplate {
  id: string;
  name: string;
  status: string;
  preset_key: string | null;
  meta_fehler?: string | null;
}

const QUALITAET: Record<string, string> = { GREEN: 'Hoch', YELLOW: 'Mittel – Achtung', RED: 'Niedrig – Sperrgefahr', UNKNOWN: 'Noch keine Bewertung' };

export default function WhatsAppSettingsPage() {
  const [account, setAccount] = useState<WaAccount | null>(null);
  const [templates, setTemplates] = useState<WaTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>('');

  // Manual connect form (admin only)
  const [manualWaba, setManualWaba] = useState('');
  const [manualPhone, setManualPhone] = useState('');
  const [manualToken, setManualToken] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [arbeitet, setArbeitet] = useState(false);
  // Von Meta im Embedded Signup gemeldete Nummer + Konto (kommt per postMessage vor dem Login-Callback)
  const sitzung = useRef<{ waba_id?: string; phone_number_id?: string }>({});

  const META_APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || '';
  const META_ES_CONFIG_ID = process.env.NEXT_PUBLIC_META_ES_CONFIG_ID || '';
  const envConfigured = META_APP_ID !== '' && META_ES_CONFIG_ID !== '';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const meRes = await fetch('/api/auth/me');
      const me = meRes.ok ? await meRes.json() : null;
      setUserRole(me?.role || '');

      const [accRes, tmplRes] = await Promise.all([
        fetch('/api/whatsapp/account').then(r => r.ok ? r.json() : null),
        fetch('/api/whatsapp/templates').then(r => r.ok ? r.json() : []),
      ]);
      setAccount(accRes);
      if (Array.isArray(tmplRes)) setTemplates(tmplRes);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(loadData, 0);
    return () => clearTimeout(t);
  }, [loadData]);

  // Embedded Signup: Meta meldet Nummer + Konto per postMessage (event FINISH); der Code kommt im Login-Callback
  useEffect(() => {
    if (!envConfigured) return;
    function handleMessage(event: MessageEvent) {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type === 'WA_EMBEDDED_SIGNUP') {
          if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA' || data.data?.phone_number_id) {
            sitzung.current = { waba_id: data.data?.waba_id, phone_number_id: data.data?.phone_number_id };
          } else if (data.event === 'CANCEL') {
            toast.info('Verbindung abgebrochen');
          } else if (data.event === 'ERROR') {
            toast.error(data.data?.error_message || 'Meta meldet einen Fehler beim Verbinden');
          }
        }
      } catch {
        /* keine JSON-Nachricht */
      }
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [envConfigured]);

  async function sendeCode(code: string) {
    setArbeitet(true);
    try {
      // Sitzungsdaten kommen meist vor dem Callback – kurz warten, falls nicht
      for (let i = 0; i < 10 && !sitzung.current.phone_number_id; i++) await new Promise((r) => setTimeout(r, 300));
      const res = await fetch('/api/whatsapp/embedded-signup/callback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, ...sitzung.current }),
      });
      const result = await res.json();
      if (!res.ok) toast.error(result.error || 'Verbindung fehlgeschlagen');
      else if (result.ok) toast.success('WhatsApp verbunden – die Vorlagen sind bei Meta eingereicht');
      else toast.warning('Nummer gespeichert, Einrichtung aber noch unvollständig – Details unten');
      loadData();
    } catch {
      toast.error('Verbindung fehlgeschlagen');
    } finally {
      setArbeitet(false);
    }
  }

  async function pruefen() {
    setArbeitet(true);
    try {
      const res = await fetch('/api/whatsapp/account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ aktion: 'pruefen' }) });
      const r = await res.json();
      if (!res.ok) toast.error(r.error || 'Prüfung fehlgeschlagen');
      else if (r.ok) toast.success('Alles in Ordnung – Nummer ist verbunden');
      else toast.warning('Noch nicht vollständig eingerichtet – Details unten');
      loadData();
    } finally {
      setArbeitet(false);
    }
  }

  async function trennen() {
    if (!confirm('Nummer wirklich trennen? Der Bot schreibt danach über diese Nummer niemanden mehr an.')) return;
    const res = await fetch('/api/whatsapp/account', { method: 'DELETE' });
    if (!res.ok) return toast.error('Trennen fehlgeschlagen');
    toast.success('Nummer getrennt');
    loadData();
  }

  function launchEmbeddedSignup() {
    // FB JS SDK muss geladen sein
    const FB = (window as unknown as { FB?: { login: (cb: (res: { authResponse?: { code?: string } }) => void, opts: Record<string, unknown>) => void } }).FB;
    if (!FB) {
      toast.error('Facebook SDK konnte nicht geladen werden');
      return;
    }
    FB.login(
      (response) => {
        if (response.authResponse?.code) void sendeCode(response.authResponse.code);
      },
      {
        config_id: META_ES_CONFIG_ID,
        response_type: 'code',
        override_default_response_type: true,
        extras: {
          setup: {},
          featureType: '',
          sessionInfoVersion: '3',
        },
      }
    );
  }

  async function handleManualConnect() {
    if (!manualWaba || !manualPhone || !manualToken) {
      toast.error('Alle Felder sind erforderlich');
      return;
    }
    setManualSaving(true);
    try {
      const res = await fetch('/api/whatsapp/manual-connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          wabaId: manualWaba,
          phoneNumberId: manualPhone,
          accessToken: manualToken,
        }),
      });
      const result = await res.json();
      if (result.ok) {
        toast.success('WhatsApp manuell verbunden!');
        setManualWaba('');
        setManualPhone('');
        setManualToken('');
        loadData();
      } else {
        toast.error(result.error || 'Verbindung fehlgeschlagen');
      }
    } finally {
      setManualSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl">
      <PageHeader label="EINSTELLUNGEN" title="WhatsApp" />

      {/* FB JS SDK Script */}
      {envConfigured && (
        <Script
          async
          strategy="lazyOnload"
          crossOrigin="anonymous"
          src={`https://connect.facebook.net/de_DE/sdk.js#xfbml=true&version=v23.0&appId=${META_APP_ID}`}
        />
      )}

      {/* Status */}
      {account ? (
        <Card padding="md" className="mb-6">
          <div className="mb-4 flex items-center gap-4">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${account.status === 'connected' ? 'bg-green-50' : 'bg-amber-50'}`}>
              {account.status === 'connected' ? <CheckCircle className="h-5 w-5 text-green-600" /> : <AlertCircle className="h-5 w-5 text-amber-600" />}
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold text-gray-900">{account.status === 'connected' ? 'WhatsApp verbunden' : 'Einrichtung noch nicht abgeschlossen'}</h2>
              <p className="text-sm text-gray-500">
                {account.display_number || account.phone_number_id}
                {account.verified_name ? ` · ${account.verified_name}` : ''}
              </p>
            </div>
          </div>
          <div className="space-y-3 pl-12">
            {account.fehler && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{account.fehler}</p>}
            {account.quality_rating && (
              <div className="flex items-center gap-3">
                <span className="w-28 text-sm text-gray-400">Qualität</span>
                <span className={`text-sm font-medium ${account.quality_rating === 'RED' ? 'text-red-700' : account.quality_rating === 'YELLOW' ? 'text-amber-700' : 'text-gray-900'}`}>
                  {QUALITAET[account.quality_rating] ?? account.quality_rating}
                </span>
              </div>
            )}
            {account.messaging_limit && (
              <div className="flex items-center gap-3">
                <span className="w-28 text-sm text-gray-400">Tageslimit</span>
                <span className="text-sm font-medium text-gray-900">{account.messaging_limit.replace('TIER_', '').replace('K', '.000')} neue Gespräche</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="w-28 text-sm text-gray-400">Verbunden seit</span>
              <span className="text-sm text-gray-900">{new Date(account.connected_at).toLocaleDateString('de-DE')}</span>
            </div>
            {(userRole === 'agency_owner' || userRole === 'admin') && (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="secondary" size="sm" onClick={pruefen} disabled={arbeitet}>
                  {arbeitet ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Erneut prüfen
                </Button>
                <Button variant="ghost" size="sm" onClick={trennen} disabled={arbeitet}>
                  <Unlink className="h-4 w-4" /> Trennen
                </Button>
              </div>
            )}
          </div>
        </Card>
      ) : (
        <Card padding="md" className="mb-6">
          <div className="mb-4 flex items-center gap-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-100">
              <Phone className="h-5 w-5 text-gray-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">WhatsApp nicht verbunden</h2>
              <p className="text-sm text-gray-400">Verbinde deine Nummer – danach schreibt unser KI-Assistent neue Bewerber sofort an.</p>
            </div>
          </div>
          {envConfigured ? (
            <div className="pl-12">
              <Button onClick={launchEmbeddedSignup} size="md" disabled={arbeitet}>
                {arbeitet ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                {arbeitet ? 'Wird eingerichtet …' : 'WhatsApp verbinden'}
              </Button>
            </div>
          ) : (
            <div className="pl-12">
              <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-600">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>Noch nicht konfiguriert — Meta-App-ID und Embedded-Signup-Config fehlen in den Umgebungsvariablen.</span>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Vorlagen-Status */}
      {templates.length > 0 && (
        <Card padding="md" className="mb-6">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Vorlagen-Status</h2>
          <div className="space-y-2">
            {templates.map(t => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg bg-gray-50">
                <span className="min-w-0 text-sm text-gray-900">
                  {t.name}
                  {t.meta_fehler && <span className="block truncate text-xs text-amber-700" title={t.meta_fehler}>{t.meta_fehler}</span>}
                </span>
                <Badge tone={t.status === 'approved' ? 'success' : t.status === 'rejected' ? 'softAccent' : 'neutral'}>
                  {t.status === 'approved' ? 'Freigegeben' : t.status === 'rejected' ? 'Abgelehnt' : t.status === 'paused' ? 'Pausiert' : 'Ausstehend'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Manual Connect — nur Platform-Admin */}
      {userRole === 'admin' && (
        <Card padding="md" className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center">
              <Shield className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Manuell verbinden (Admin)</h2>
              <p className="text-sm text-gray-400">Für Tests vor Meta-App-Freigabe</p>
            </div>
          </div>
          <div className="space-y-3 pl-12">
            <Input
              placeholder="WABA ID"
              value={manualWaba}
              onChange={e => setManualWaba(e.target.value)}
            />
            <Input
              placeholder="Phone Number ID"
              value={manualPhone}
              onChange={e => setManualPhone(e.target.value)}
            />
            <Input
              placeholder="Access Token"
              type="password"
              value={manualToken}
              onChange={e => setManualToken(e.target.value)}
            />
            <Button onClick={handleManualConnect} disabled={manualSaving} size="md" variant="secondary">
              {manualSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {manualSaving ? 'Wird verbunden...' : 'Manuell verbinden'}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
