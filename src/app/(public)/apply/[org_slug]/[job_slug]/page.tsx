import { createAdminClient } from '@/lib/supabase/admin';
import { ApplyForm } from './apply-form';

export default async function ApplyPage({
  params,
}: {
  params: Promise<{ org_slug: string; job_slug: string }>;
}) {
  const { org_slug, job_slug } = await params;
  const supabase = createAdminClient();

  // Agentur via Slug laden
  const { data: agency } = await supabase
    .from('agencies')
    .select('id, name, slug, privacy_url')
    .eq('slug', org_slug)
    .single();

  if (!agency) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Seite nicht gefunden</h1>
          <p className="text-gray-500">Diese Stelle ist nicht verfügbar.</p>
        </div>
      </div>
    );
  }

  // Job via Slug + agency_id laden, nur aktive
  const { data: job } = await supabase
    .from('jobs')
    .select('id, title, slug, description, location, employment_type')
    .eq('agency_id', agency.id)
    .eq('slug', job_slug)
    .eq('status', 'active')
    .single();

  if (!job) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Stelle nicht verfügbar</h1>
          <p className="text-gray-500">Diese Stelle ist aktuell nicht ausgeschrieben.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12 px-4">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-gray-900">{job.title}</h1>
          <p className="text-gray-500 mt-1">{agency.name}</p>
          {job.location && <p className="text-sm text-gray-400 mt-1">{job.location}</p>}
        </div>

        {job.description && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">Stellenbeschreibung</h2>
            <div className="text-sm text-gray-700 whitespace-pre-wrap">{job.description}</div>
          </div>
        )}

        <ApplyForm agencyId={agency.id} agencySlug={agency.slug} jobId={job.id} jobTitle={job.title} privacyUrl={agency.privacy_url ?? null} />
      </div>
    </div>
  );
}
