'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Mail, Lock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

type LoginStep = 'credentials' | 'mfa';

export default function LoginPage() {
  const [step, setStep] = useState<LoginStep>('credentials');

  // credentials step
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // mfa step
  const [mfaCode, setMfaCode] = useState('');
  const [mfaFactorId, setMfaFactorId] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [mfaLoading, setMfaLoading] = useState(false);

  const router = useRouter();
  const supabase = createClient();

  async function redirectAfterLogin() {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setError('Anmeldung fehlgeschlagen.');
      setStep('credentials');
      return;
    }

    const userId = user.id;

    // last_login update (fire-and-forget) + role check in parallel
    const [, { data: profile }] = await Promise.all([
      supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', userId)
        .then(() => undefined, () => undefined),
      supabase.from('users').select('role').eq('id', userId).single(),
    ]);

    const role = profile?.role as string;
    if (role === 'admin' || role === 'employee') {
      window.location.href = '/admin';
      return;
    }

    window.location.href = '/dashboard';
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError || !signInData.user) {
      setError('E-Mail oder Passwort falsch.');
      setLoading(false);
      return;
    }

    // Check if MFA is required
    const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (aal?.nextLevel === 'aal2' && aal.currentLevel !== aal.nextLevel) {
      // Need MFA step — find the verified TOTP factor
      const { data: factors } = await supabase.auth.mfa.listFactors();
      const totpFactor = factors?.totp?.find((f) => f.status === 'verified');
      if (totpFactor) {
        setMfaFactorId(totpFactor.id);
        setLoading(false);
        setStep('mfa');
        return;
      }
    }

    setLoading(false);
    await redirectAfterLogin();
  }

  async function handleMfa(e: React.FormEvent) {
    e.preventDefault();
    setMfaLoading(true);
    setMfaError('');

    const { data: challengeData, error: challengeError } = await supabase.auth.mfa.challenge({
      factorId: mfaFactorId,
    });

    if (challengeError || !challengeData) {
      setMfaError('Code ungültig.');
      setMfaCode('');
      setMfaLoading(false);
      return;
    }

    const { error: verifyError } = await supabase.auth.mfa.verify({
      factorId: mfaFactorId,
      challengeId: challengeData.id,
      code: mfaCode,
    });

    if (verifyError) {
      setMfaError('Code ungültig.');
      setMfaCode('');
      setMfaLoading(false);
      return;
    }

    setMfaLoading(false);
    await redirectAfterLogin();
  }

  if (step === 'mfa') {
    return (
      <div className="w-full max-w-sm">
        <Card padding="lg" className="shadow-md">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Zwei-Faktor</h1>
              <p className="text-sm text-gray-600">Bitte bestätige deine Identität</p>
            </div>
          </div>

          <form onSubmit={handleMfa} className="space-y-4">
            <div>
              <label htmlFor="mfa-code" className="block text-sm font-medium text-gray-600 mb-2">
                Code aus deiner Authenticator-App
              </label>
              <Input
                id="mfa-code"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                autoFocus
                placeholder="000000"
                className="font-mono tracking-widest"
              />
            </div>

            {mfaError && (
              <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{mfaError}</p>
            )}

            <Button type="submit" disabled={mfaLoading || mfaCode.length !== 6} size="lg" className="w-full">
              {mfaLoading ? 'Prüfe…' : 'Bestätigen'}
            </Button>

            <button
              type="button"
              onClick={() => { setStep('credentials'); setMfaCode(''); setMfaError(''); }}
              className="w-full text-center text-sm text-gray-500 hover:text-gray-700"
            >
              Zurück zur Anmeldung
            </button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm">
      <Card padding="lg" className="shadow-md">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white font-bold text-lg">
            Z
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Zoepp Media Cloud</h1>
            <p className="text-sm text-gray-600">Willkommen zuruck</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-600 mb-2">E-Mail</label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              icon={<Mail className="w-4 h-4" />}
              placeholder="name@firma.de"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-600 mb-2">Passwort</label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              icon={<Lock className="w-4 h-4" />}
              placeholder="Passwort eingeben"
            />
          </div>

          {error && (
            <p className="text-red-600 text-sm bg-red-50 px-4 py-3 rounded-lg">{error}</p>
          )}

          <Button type="submit" disabled={loading} size="lg" className="w-full">
            {loading ? 'Anmelden...' : 'Anmelden'}
          </Button>

          <p className="text-center">
            <a href="/forgot-password" className="text-sm text-gray-500 hover:text-gray-700">
              Passwort vergessen?
            </a>
          </p>
        </form>
      </Card>
    </div>
  );
}
