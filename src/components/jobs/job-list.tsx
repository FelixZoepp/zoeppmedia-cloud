'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Plus, MapPin, Users, Calendar } from 'lucide-react';

interface JobRow {
  id: string;
  title: string;
  slug: string;
  status: 'draft' | 'active' | 'paused' | 'closed';
  location: string | null;
  employment_type: string | null;
  created_at: string;
  applications: { count: number }[];
}

const statusLabels: Record<string, string> = {
  draft: 'Entwurf',
  active: 'Aktiv',
  paused: 'Pausiert',
  closed: 'Geschlossen',
};

const statusTones: Record<string, 'accent' | 'softAccent' | 'neutral'> = {
  draft: 'neutral',
  active: 'accent',
  paused: 'softAccent',
  closed: 'neutral',
};

export function JobList() {
  const router = useRouter();
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/jobs')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setJobs(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        label="STELLENANZEIGEN"
        title="Stellenanzeigen"
        action={
          <Button onClick={() => router.push('/jobs/new')} size="md">
            <Plus className="w-4 h-4" />
            Neue Stelle
          </Button>
        }
      />

      {jobs.length === 0 ? (
        <Card className="p-12 text-center">
          <p className="text-gray-500 mb-4">Noch keine Stellenanzeigen vorhanden.</p>
          <Button onClick={() => router.push('/jobs/new')} size="md">
            <Plus className="w-4 h-4" />
            Erste Stelle anlegen
          </Button>
        </Card>
      ) : (
        <div className="grid gap-4">
          {jobs.map((job) => {
            const appCount = job.applications?.[0]?.count ?? 0;
            return (
              <Card
                key={job.id}
                className="p-5 cursor-pointer hover:shadow-sm transition-shadow"
                onClick={() => router.push(`/jobs/${job.id}`)}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{job.title}</h3>
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      {job.location && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3.5 h-3.5" />
                          {job.location}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Users className="w-3.5 h-3.5" />
                        {appCount} Bewerbung{appCount !== 1 ? 'en' : ''}
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {new Date(job.created_at).toLocaleDateString('de-DE')}
                      </span>
                    </div>
                  </div>
                  <Badge tone={statusTones[job.status] ?? 'neutral'}>
                    {statusLabels[job.status] ?? job.status}
                  </Badge>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
