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

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError('E-Mail oder Passwort falsch.');
      setLoading(false);
      return;
    }

    // Update last_login (ignore errors — non-critical)
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (authUser) {
        await supabase
          .from('users')
          .update({ last_login: new Date().toISOString() })
          .eq('id', authUser.id);
      }
    } catch {
      // non-critical
    }

    // Check user role to redirect correctly
    const { data: { user: currentUser } } = await supabase.auth.getUser();
    if (currentUser) {
      const { data: profile } = await supabase
        .from('users')
        .select('role')
        .eq('id', currentUser.id)
        .single();

      const role = profile?.role as string;
      if (role === 'admin' || role === 'employee') {
        window.location.href = '/admin';
        return;
      }
    }

    window.location.href = '/dashboard';
  }

  return (
    <div className="w-full max-w-sm">
      <Card padding="lg" className="shadow-md">
        <div className="flex items-center gap-4 mb-10">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white font-bold text-lg">
            Z
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Zoepp Media Cloud</h1>
            <p className="text-[14px] text-gray-600">Willkommen zuruck</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="space-y-8">
          <div>
            <label htmlFor="email" className="block text-[14px] font-medium text-gray-600 mb-2">E-Mail</label>
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
            <label htmlFor="password" className="block text-[14px] font-medium text-gray-600 mb-2">Passwort</label>
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
            <p className="text-red-600 text-[14px] bg-red-50 px-5 py-4 rounded-lg">{error}</p>
          )}

          <Button type="submit" disabled={loading} size="lg" className="w-full">
            {loading ? 'Anmelden...' : 'Anmelden'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
