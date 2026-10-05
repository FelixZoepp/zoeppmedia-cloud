'use client';
import { SplitText } from '@/components/ui/motion';

import { useState } from 'react';
import { Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirm) {
      setError('Passwörter stimmen nicht überein.');
      return;
    }
    if (password.length < 8) {
      setError('Passwort muss mindestens 8 Zeichen lang sein.');
      return;
    }

    setLoading(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setError('Fehler beim Zurücksetzen: ' + updateError.message);
      setLoading(false);
      return;
    }

    router.push('/login');
  }

  return (
    <div className="w-full max-w-sm">
      <Card padding="lg" className="shadow-[0_30px_80px_-40px_#1a151466]">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-11 h-11 rounded-[12px] bg-gradient-to-b from-red-700 to-red-950 flex items-center justify-center text-white shadow-hero font-bold text-lg">
            Z
          </div>
          <div>
            <SplitText as="h1" text="Neues Passwort" className="text-[28px] font-semibold leading-tight tracking-[-0.035em]" />
            <p className="text-sm text-gray-600">Wähle ein sicheres Passwort</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-600 mb-2">
              Neues Passwort
            </label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              icon={<Lock className="w-4 h-4" />}
              placeholder="Mindestens 8 Zeichen"
            />
          </div>
          <div>
            <label htmlFor="confirm" className="block text-sm font-medium text-gray-600 mb-2">
              Passwort bestätigen
            </label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              icon={<Lock className="w-4 h-4" />}
              placeholder="Passwort wiederholen"
            />
          </div>

          {error && (
            <p className="text-red-700 text-sm bg-red-50 px-4 py-3 rounded-[12px]">{error}</p>
          )}

          <Button type="submit" disabled={loading} size="lg" className="w-full">
            {loading ? 'Wird gespeichert...' : 'Passwort setzen'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
