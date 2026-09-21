'use client';

import { useEffect, useState, useCallback } from 'react';
import Script from 'next/script';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Phone, CheckCircle, AlertCircle, Loader2, Shield } from 'lucide-react';

interface WaAccount {
  id: string;
  waba_id: string;
  phone_number_id: string;
  display_number: string | null;
  status: string;
  quality_rating: string | null;
  messaging_limit: string | null;
  connected_at: string;
}

interface WaTemplate {
  id: string;
  name: string;
  status: string;
  preset_key: string | null;
}

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

  useEffect(() => { loadData(); }, [loadData]);

  // Embedded Signup Callback
  useEffect(() => {
    if (!envConfigured) return;

    function handleMessage(event: MessageEvent) {
      if (event.origin !== 'https://www.facebook.com' && event.origin !== 'https://web.facebook.com') return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'WA_EMBEDDED_SIGNUP' && data.data?.code) {
          fetch('/api/whatsapp/embedded-signup/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: data.data.code }),
          })
            .then(r => r.json())
            .then(result => {
              if (result.ok) {
                toast.success('WhatsApp erfolgreich verbunden!');
                loadData();
              } else {
                toast.error(result.error || 'Verbindung fehlgeschlagen');
              }
            })
            .catch(() => toast.error('Verbindung fehlgeschlagen'));
        }
      } catch { /* ignore non-JSON messages */ }
    }

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [envConfigured, loadData]);

  function launchEmbeddedSignup() {
    // FB JS SDK muss geladen sein
    const FB = (window as unknown as { FB?: { login: (cb: (res: { authResponse?: { code?: string } }) => void, opts: Record<string, unknown>) => void } }).FB;
    if (!FB) {
      toast.error('Facebook SDK konnte nicht geladen werden');
      return;
    }
    FB.login(
      (response) => {
        if (response.authResponse?.code) {
          fetch('/api/whatsapp/embedded-signup/callback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: response.authResponse.code }),
          })
            .then(r => r.json())
            .then(result => {
              if (result.ok) {
                toast.success('WhatsApp erfolgreich verbunden!');
                loadData();
              } else {
                toast.error(result.error || 'Verbindung fehlgeschlagen');
              }
            })
            .catch(() => toast.error('Verbindung fehlgeschlagen'));
        }
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
          <div className="flex items-center gap-4 mb-4">
            <div className="w-9 h-9 rounded-xl bg-green-50 flex items-center justify-center">
              <CheckCircle className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">WhatsApp verbunden</h2>
              <p className="text-sm text-gray-400">{account.display_number || account.phone_number_id}</p>
            </div>
          </div>
          <div className="space-y-3 pl-12">
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 w-28">Status</span>
              <Badge tone={account.status === 'connected' ? 'success' : 'softAccent'}>
                {account.status === 'connected' ? 'Verbunden' : 'Getrennt'}
              </Badge>
            </div>
            {account.quality_rating && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-28">Qualität</span>
                <span className="text-sm font-medium text-gray-900">{account.quality_rating}</span>
              </div>
            )}
            {account.messaging_limit && (
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-400 w-28">Limit</span>
                <span className="text-sm font-medium text-gray-900">{account.messaging_limit}</span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-400 w-28">Verbunden seit</span>
              <span className="text-sm text-gray-900">{new Date(account.connected_at).toLocaleDateString('de-DE')}</span>
            </div>
          </div>
        </Card>
      ) : (
        <Card padding="md" className="mb-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center">
              <Phone className="w-5 h-5 text-gray-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-900">WhatsApp nicht verbunden</h2>
              <p className="text-sm text-gray-400">Verbinde deine Nummer, um Bewerber per WhatsApp zu kontaktieren.</p>
            </div>
          </div>
          {envConfigured ? (
            <div className="pl-12">
              <Button onClick={launchEmbeddedSignup} size="md">
                <Phone className="w-4 h-4" />
                WhatsApp verbinden
              </Button>
            </div>
          ) : (
            <div className="pl-12">
              <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 rounded-lg p-3">
                <AlertCircle className="w-4 h-4 shrink-0" />
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
              <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-gray-50">
                <span className="text-sm text-gray-900">{t.name}</span>
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
