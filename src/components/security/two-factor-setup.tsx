'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { ShieldCheck, ShieldOff, Loader2 } from 'lucide-react';

type SetupState = 'loading' | 'inactive' | 'enrolling' | 'active';

interface EnrollData {
  factorId: string;
  qrCode: string;
  secret: string;
}

export function TwoFactorSetup() {
  const [state, setState] = useState<SetupState>('loading');
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [unenrolling, setUnenrolling] = useState(false);
  const [activeFactorId, setActiveFactorId] = useState<string | null>(null);

  const supabase = createClient();

  useEffect(() => {
    checkFactors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function checkFactors() {
    setState('loading');
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast.error('Fehler beim Laden der 2FA-Einstellungen.');
      setState('inactive');
      return;
    }
    const verified = data?.totp?.find((f) => f.status === 'verified');
    if (verified) {
      setActiveFactorId(verified.id);
      setState('active');
    } else {
      setState('inactive');
    }
  }

  async function startEnroll() {
    setState('enrolling');
    setCode('');
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' });
    if (error || !data) {
      toast.error('Fehler beim Aktivieren der 2FA.');
      setState('inactive');
      return;
    }
    setEnrollData({
      factorId: data.id,
      qrCode: data.totp.qr_code,
      secret: data.totp.secret,
    });
  }

  async function verifyCode() {
    if (!enrollData) return;
    if (code.length !== 6) {
      toast.error('Bitte gib einen 6-stelligen Code ein.');
      return;
    }
    setVerifying(true);
    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: enrollData.factorId,
    });
    if (challengeError || !challengeData) {
      toast.error('Fehler beim Erstellen der Challenge.');
      setVerifying(false);
      setCode('');
      return;
    }
    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: enrollData.factorId,
      challengeId: challengeData.id,
      code,
    });
    setVerifying(false);
    if (verifyError) {
      toast.error('Code ungültig. Bitte erneut versuchen.');
      setCode('');
      return;
    }
    toast.success('Zwei-Faktor-Authentifizierung aktiviert');
    setActiveFactorId(enrollData.factorId);
    setEnrollData(null);
    setCode('');
    setState('active');
  }

  async function unenroll() {
    if (!activeFactorId) return;
    if (!confirm('2FA wirklich entfernen? Dein Konto wird danach weniger geschützt.')) return;
    setUnenrolling(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: activeFactorId });
    setUnenrolling(false);
    if (error) {
      toast.error('Fehler beim Entfernen der 2FA.');
      return;
    }
    toast.success('Zwei-Faktor-Authentifizierung entfernt');
    setActiveFactorId(null);
    setState('inactive');
  }

  function cancelEnroll() {
    setEnrollData(null);
    setCode('');
    setState('inactive');
  }

  if (state === 'loading') {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400 py-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Lade 2FA-Status…
      </div>
    );
  }

  if (state === 'active') {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Zwei-Faktor-Authentifizierung ist <strong>aktiviert</strong>.</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={unenroll}
          disabled={unenrolling}
        >
          <ShieldOff className="w-4 h-4 mr-1.5" />
          {unenrolling ? 'Wird entfernt…' : '2FA entfernen'}
        </Button>
      </div>
    );
  }

  if (state === 'enrolling' && enrollData) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-gray-600">
          Scanne den QR-Code mit deiner Authenticator-App (z.&nbsp;B. Google Authenticator oder Authy).
        </p>
        <div className="flex flex-col items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={enrollData.qrCode}
            alt="QR-Code für 2FA"
            className="w-40 h-40 border border-gray-200 rounded-lg"
          />
          <div>
            <p className="text-xs text-gray-500 mb-1">Oder Secret manuell eingeben:</p>
            <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded select-all break-all">
              {enrollData.secret}
            </code>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">
            Code aus deiner Authenticator-App
          </label>
          <div className="flex items-center gap-2">
            <Input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              className="w-32 font-mono tracking-widest"
              autoFocus
            />
            <Button
              size="sm"
              variant="primary"
              onClick={verifyCode}
              disabled={verifying || code.length !== 6}
            >
              {verifying ? 'Prüfe…' : 'Bestätigen'}
            </Button>
            <Button size="sm" variant="secondary" onClick={cancelEnroll} disabled={verifying}>
              Abbrechen
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // inactive
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Schütze dein Konto mit einem zusätzlichen Einmal-Code beim Anmelden.
      </p>
      <Button size="sm" variant="primary" onClick={startEnroll}>
        <ShieldCheck className="w-4 h-4 mr-1.5" />
        2FA aktivieren
      </Button>
    </div>
  );
}
