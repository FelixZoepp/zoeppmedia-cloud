'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { User, Mail, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';

export default function RegisterPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name, email, password }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error);
      setLoading(false);
      return;
    }

    router.push('/login');
  }

  return (
    <div className="w-full max-w-sm">
      <Card padding="lg" className="shadow-[var(--shadow-md)]">
        <div className="flex items-center gap-4 mb-4">
          <div className="w-10 h-10 rounded-[var(--radius-md)] bg-gradient-to-b from-[#EF5B6F] to-[var(--red-500)] flex items-center justify-center text-white font-bold text-lg">
            Z
          </div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Registrierung</h1>
        </div>
        <p className="text-[var(--text-secondary)] text-[15px] mb-10">Erstelle deinen Zugang zur Zoepp Media Cloud.</p>

        <form onSubmit={handleRegister} className="space-y-6">
          <div>
            <label htmlFor="name" className="block text-[13px] font-medium text-[var(--text-secondary)] mb-2">Name</label>
            <Input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required icon={<User className="w-4 h-4" />} placeholder="Dein Name" />
          </div>
          <div>
            <label htmlFor="email" className="block text-[13px] font-medium text-[var(--text-secondary)] mb-2">E-Mail</label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required icon={<Mail className="w-4 h-4" />} placeholder="name@firma.de" />
          </div>
          <div>
            <label htmlFor="password" className="block text-[13px] font-medium text-[var(--text-secondary)] mb-2">Passwort (min. 8 Zeichen)</label>
            <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} icon={<Lock className="w-4 h-4" />} placeholder="Sicheres Passwort" />
          </div>

          {error && (
            <p className="text-[var(--danger-600)] text-[13px] bg-red-50 px-3 py-2 rounded-[var(--radius-sm)]">{error}</p>
          )}

          <Button type="submit" disabled={loading} size="lg" className="w-full">
            {loading ? 'Wird erstellt...' : 'Registrieren'}
          </Button>
        </form>
      </Card>
    </div>
  );
}
