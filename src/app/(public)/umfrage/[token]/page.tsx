import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeUmfrage } from '@/lib/surveys/versand';
import { UmfrageFormular } from '@/components/umfrage/umfrage-formular';

export const metadata = { title: 'Feedback – Zoepp Media', robots: { index: false, follow: false } };

export default async function UmfragePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const umfrage = await ladeUmfrage(createAdminClient(), token);
  if (!umfrage) notFound();

  return (
    <div className="flex min-h-screen items-start justify-center bg-gray-50 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-lg">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-600">Zoepp Media</p>
        <h1 className="mb-1 text-xl font-bold text-gray-900">{umfrage.titel}</h1>
        {umfrage.beschreibung && <p className="mb-5 text-sm text-gray-600">{umfrage.beschreibung}</p>}
        {umfrage.status === 'erledigt' ? (
          <p className="py-6 text-center text-gray-700">Danke, dein Feedback ist schon bei uns angekommen.</p>
        ) : (
          <UmfrageFormular token={token} fragen={umfrage.fragen} />
        )}
      </div>
    </div>
  );
}
