'use client';

import { useState } from 'react';
import { User, Mail, Phone } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function AddCandidateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const res = await fetch('/api/candidates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, phone, source: 'manual' }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error);
      setLoading(false);
      return;
    }

    setName('');
    setEmail('');
    setPhone('');
    setLoading(false);
    onCreated();
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Bewerber hinzufugen">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="cand-name" className="block text-xs font-medium text-gray-600 mb-1.5">Name *</label>
          <Input id="cand-name" type="text" value={name} onChange={(e) => setName(e.target.value)} required icon={<User className="w-4 h-4" />} placeholder="Vollständiger Name" />
        </div>
        <div>
          <label htmlFor="cand-email" className="block text-xs font-medium text-gray-600 mb-1.5">E-Mail</label>
          <Input id="cand-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} icon={<Mail className="w-4 h-4" />} placeholder="Optional" />
        </div>
        <div>
          <label htmlFor="cand-phone" className="block text-xs font-medium text-gray-600 mb-1.5">Telefon</label>
          <Input id="cand-phone" type="text" value={phone} onChange={(e) => setPhone(e.target.value)} icon={<Phone className="w-4 h-4" />} placeholder="Optional" />
        </div>

        {error && (
          <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
            Abbrechen
          </Button>
          <Button type="submit" disabled={loading} className="flex-1">
            {loading ? 'Speichern...' : 'Hinzufügen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
