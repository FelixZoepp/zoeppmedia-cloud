'use client';

import { useEffect, useState, useCallback } from 'react';
import { KanbanBoard } from '@/components/kanban/board';
import { ApplicationTableView } from '@/components/candidates/table-view';
import { CsvImportModal } from '@/components/candidates/csv-import-modal';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { PageHeader } from '@/components/ui/page-header';
import type { ApplicationRow } from '@/components/kanban/board';
import type { PipelineStage } from '@/lib/types/database';
import { Plus, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CandidatesPage() {
  const [view, setView] = useState<'kanban' | 'table'>('kanban');
  const [applications, setApplications] = useState<ApplicationRow[]>([]);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [jobs, setJobs] = useState<{ id: string; title: string }[]>([]);
  const [users, setUsers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [tableLoaded, setTableLoaded] = useState(false);
  const [csvImportOpen, setCsvImportOpen] = useState(false);
  const [csvImportJobId, setCsvImportJobId] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [stagesRes, appsRes, jobsRes, usersRes] = await Promise.all([
        fetch('/api/pipeline-stages').then((r) => (r.ok ? r.json() : [])),
        fetch('/api/applications').then((r) => r.json()),
        fetch('/api/jobs').then((r) => r.json()),
        fetch('/api/team').then((r) => r.json()),
      ]);
      if (Array.isArray(stagesRes)) setStages(stagesRes);
      if (Array.isArray(appsRes)) setApplications(appsRes);
      if (Array.isArray(jobsRes)) {
        const mapped = jobsRes.map((j: { id: string; title: string }) => ({ id: j.id, title: j.title }));
        setJobs(mapped);
        if (mapped.length > 0 && !csvImportJobId) setCsvImportJobId(mapped[0].id);
      }
      if (Array.isArray(usersRes)) {
        setUsers(usersRes.map((u: { user_id: string; name: string }) => ({ id: u.user_id, name: u.name })));
      }
      setTableLoaded(true);
    } finally {
      setLoading(false);
    }
  }, [csvImportJobId]);

  const openCsvImport = useCallback(async () => {
    if (jobs.length === 0) {
      const res = await fetch('/api/jobs');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setJobs(data.map((j: { id: string; title: string }) => ({ id: j.id, title: j.title })));
          setCsvImportJobId(data[0].id);
        }
      }
    } else if (!csvImportJobId && jobs.length > 0) {
      setCsvImportJobId(jobs[0].id);
    }
    setCsvImportOpen(true);
  }, [jobs, csvImportJobId]);

  useEffect(() => {
    if (view === 'table') {
      loadData();
    }
  }, [view, loadData, refreshKey]);

  return (
    <div>
      <PageHeader
        label="PIPELINE"
        title="Pipeline"
        action={
          <div className="flex items-center gap-2">
            <SegmentedControl
              items={[
                { value: 'kanban', label: 'Kanban' },
                { value: 'table', label: 'Tabelle' },
              ]}
              value={view}
              onChange={(v) => setView(v as 'kanban' | 'table')}
            />
            <a
              href="/api/export/candidates"
              download
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition-colors"
            >
              CSV
            </a>
            <Button variant="ghost" onClick={openCsvImport} size="md">
              <Upload className="w-4 h-4" />
              CSV-Import
            </Button>
            <Button onClick={() => setRefreshKey((k) => k + 1)} size="md">
              <Plus className="w-4 h-4" />
              Neuer Bewerber
            </Button>
          </div>
        }
      />

      {view === 'kanban' && <KanbanBoard key={refreshKey} hideHeader />}

      {view === 'table' && (
        loading && !tableLoaded ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="p-6">
            <ApplicationTableView
              applications={applications}
              stages={stages}
              jobs={jobs}
              users={users}
              onRefresh={() => setRefreshKey((k) => k + 1)}
            />
          </div>
        )
      )}

      {csvImportOpen && csvImportJobId && (
        <CsvImportModal
          open={csvImportOpen}
          onClose={() => setCsvImportOpen(false)}
          jobId={csvImportJobId}
          onImported={() => {
            setCsvImportOpen(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
