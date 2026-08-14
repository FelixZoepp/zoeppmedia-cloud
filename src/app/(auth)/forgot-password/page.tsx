'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    setLoading(false);
    setSent(true);
  }

  return (
    <div className="w-full max-w-sm">
      <Card padding="lg" className="shadow-md">
        <div className="flex items-center gap-4 mb-6">
          <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center text-white font-bold text-lg">
            Z
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Passwort vergessen</h1>
            <p className="text-sm text-gray-600">Wir senden dir einen Reset-Link</p>
          </div>
        </div>

        {sent ? (
          <div className="text-center py-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
              <Mail className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-medium text-gray-900 mb-1">E-Mail gesendet</p>
            <p className="text-sm text-gray-500 mb-4">
              Falls ein Konto mit dieser E-Mail existiert, erhaltst du einen Reset-Link.
            </p>
            <Link href="/login" className="text-sm font-medium text-red-600 hover:text-red-700">
              Zurück zum Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-600 mb-2">
                E-Mail
              </label>
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

            <Button type="submit" disabled={loading} size="lg" className="w-full">
              {loading ? 'Wird gesendet...' : 'Link senden'}
            </Button>

            <p className="text-center">
              <Link href="/login" className="text-sm text-gray-500 hover:text-gray-700">
                Zurück zum Login
              </Link>
            </p>
          </form>
        )}
      </Card>
    </div>
  );
}
