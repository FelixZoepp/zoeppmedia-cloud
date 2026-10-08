import { notFound } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { ladeVertrag, ladeAgbUrl } from '@/lib/vertrag/bestaetigen';
import { vertragZeilen } from '@/lib/vertrag/daten';
import { VertragFormular } from '@/components/vertrag/vertrag-formular';

export const metadata = { title: 'Vertrag bestätigen – Zoepp Media', robots: { index: false, follow: false } };

export default async function VertragPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const svc = createAdminClient();
  const vertrag = await ladeVertrag(svc, token);
  if (!vertrag) notFound();
  const agbUrl = await ladeAgbUrl(svc);

  return (
    <div className="flex min-h-screen items-start justify-center bg-gray-50 p-4 sm:items-center">
      <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-lg">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-red-600">Zoepp Media</p>
        <h1 className="mb-1 text-xl font-bold text-gray-900">Vertrag bestätigen</h1>
        <p className="mb-5 text-sm text-gray-600">
          Bitte prüfe die Eckdaten unserer Zusammenarbeit und bestätige sie. Danach legst du deinen Zugang zur Cloud an.
        </p>

        <dl className="mb-5 divide-y divide-gray-100 rounded-xl border border-gray-200 text-sm">
          {vertragZeilen(vertrag.daten).map(([label, wert]) => (
            <div key={label} className="grid grid-cols-1 gap-0.5 px-4 py-2.5 sm:grid-cols-3 sm:gap-4">
              <dt className="font-medium text-gray-500">{label}</dt>
              <dd className="text-gray-900 sm:col-span-2">{wert}</dd>
            </div>
          ))}
        </dl>

        <VertragFormular
          token={token}
          agbUrl={agbUrl}
          bestaetigt={vertrag.status === 'bestaetigt' ? { name: vertrag.unterzeichner_name, am: vertrag.bestaetigt_am } : null}
        />
      </div>
    </div>
  );
}
