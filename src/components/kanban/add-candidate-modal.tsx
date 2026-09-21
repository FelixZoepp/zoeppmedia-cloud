'use client';

import { useState, useEffect } from 'react';
import { User, Mail, Phone } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { toast } from 'sonner';

interface Job {
  id: string;
  title: string;
  status: string;
}

export function AddCandidateModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingJobs, setLoadingJobs] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setLoadingJobs(true);
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((data: Job[]) => {
        const activeJobs = Array.isArray(data) ? data.filter((j) => j.status === 'active') : [];
        setJobs(activeJobs);
        if (activeJobs.length === 1) {
          setSelectedJobId(activeJobs[0].id);
        }
      })
      .catch(() => setJobs([]))
      .finally(() => setLoadingJobs(false));
  }, [open]);

  function resetForm() {
    setSelectedJobId('');
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setError('');
  }

  function handleClose() {
    resetForm();
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedJobId) {
      setError('Bitte eine Stellenanzeige auswaehlen.');
      return;
    }
    setLoading(true);
    setError('');

    const res = await fetch('/api/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId: selectedJobId,
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
        email: email.trim() || null,
        phone: phone.trim() || null,
      }),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      setError(data?.error ?? 'Fehler beim Anlegen der Bewerbung.');
      setLoading(false);
      return;
    }

    if (data?.duplicateWithin30Days) {
      toast.warning('Bewerbung existiert bereits (letzte 30 Tage)');
    } else {
      toast.success('Bewerber hinzugefuegt');
    }

    resetForm();
    setLoading(false);
    onCreated();
  }

  return (
    <Modal open={open} onClose={handleClose} title="Bewerber hinzufuegen">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="cand-job" className="block text-xs font-medium text-gray-600 mb-1.5">
            Stellenanzeige *
          </label>
          {loadingJobs ? (
            <div className="h-10 rounded-lg bg-gray-100 animate-pulse" />
          ) : (
            <Select
              id="cand-job"
              value={selectedJobId}
              onChange={(e) => setSelectedJobId(e.target.value)}
              options={[
                { value: '', label: 'Bitte auswaehlen...' },
                ...jobs.map((j) => ({ value: j.id, label: j.title })),
              ]}
            />
          )}
          {jobs.length === 0 && !loadingJobs && (
            <p className="text-xs text-amber-600 mt-1">Keine aktiven Stellen gefunden.</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cand-firstname" className="block text-xs font-medium text-gray-600 mb-1.5">Vorname *</label>
            <Input
              id="cand-firstname"
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              icon={<User className="w-4 h-4" />}
              placeholder="Vorname"
            />
          </div>
          <div>
            <label htmlFor="cand-lastname" className="block text-xs font-medium text-gray-600 mb-1.5">Nachname</label>
            <Input
              id="cand-lastname"
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              placeholder="Optional"
            />
          </div>
        </div>

        <div>
          <label htmlFor="cand-email" className="block text-xs font-medium text-gray-600 mb-1.5">E-Mail</label>
          <Input
            id="cand-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            icon={<Mail className="w-4 h-4" />}
            placeholder="Optional"
          />
        </div>

        <div>
          <label htmlFor="cand-phone" className="block text-xs font-medium text-gray-600 mb-1.5">Telefon</label>
          <Input
            id="cand-phone"
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            icon={<Phone className="w-4 h-4" />}
            placeholder="Optional"
          />
        </div>

        {error && (
          <p className="text-red-600 text-xs bg-red-50 px-3 py-2 rounded-lg">{error}</p>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="button" variant="secondary" onClick={handleClose} className="flex-1">
            Abbrechen
          </Button>
          <Button type="submit" disabled={loading || loadingJobs} className="flex-1">
            {loading ? 'Speichern...' : 'Hinzufuegen'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
