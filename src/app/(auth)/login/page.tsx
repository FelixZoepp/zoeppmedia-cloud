'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createClient();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError('E-Mail oder Passwort falsch.');
      setLoading(false);
      return;
    }

    const { data: { user: authUser } } = await supabase.auth.getUser();
    if (authUser) {
      await supabase
        .from('users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', authUser.id);
    }

    router.push('/dashboard');
    router.refresh();
  }

  return (
    <div className="w-full max-w-sm">
      <Card padding="lg" className="shadow-[var(--shadow-md)]">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-[var(--radius-md)] bg-gradient-to-b from-[#EF5B6F] to-[var(--red-500)] flex items-center justify-center text-white font-bold text-lg">
            Z
          </div>
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)]">Zoepp Media Cloud</h1>
            <p className="text-[13px] text-[var(--text-secondary)]">Willkommen zuruck</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">E-Mail</label>
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
            <label htmlFor="password" className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Passwort</label>
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
            <p className="text-[var(--danger-600)] text-[13px] bg-red-50 px-3 py-2 rounded-[var(--radius-sm)]">{error}</p>
          )}

          <Button type="submit" disabled={loading} size="lg" className="w-full">
            {loading ? 'Anmelden...' : 'Anmelden'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
