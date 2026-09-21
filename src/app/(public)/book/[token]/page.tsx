import { createAdminClient } from '@/lib/supabase/admin';
import { SlotPicker } from '@/components/book/slot-picker';
import { notFound } from 'next/navigation';

export default async function BookPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const svc = createAdminClient();

  const { data: appt } = await svc
    .from('appointments')
    .select('id, agency_id, status, token_expires_at, type, location, starts_at, ends_at, application_id')
    .eq('booking_token', token)
    .maybeSingle();

  if (!appt) notFound();

  const expired = appt.token_expires_at && new Date(appt.token_expires_at) < new Date();
  if (expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="max-w-md rounded-lg bg-white p-8 text-center shadow">
          <h1 className="mb-2 text-xl font-semibold text-gray-900">Link abgelaufen</h1>
          <p className="text-gray-600">
            Dieser Buchungslink ist leider nicht mehr gültig.
            Bitte kontaktiere uns für einen neuen Link.
          </p>
        </div>
      </div>
    );
  }

  // Agency + Job-Infos laden
  const { data: application } = await svc.from('applications')
    .select('job_id').eq('id', appt.application_id).eq('agency_id', appt.agency_id).single();
  const { data: job } = await svc.from('jobs')
    .select('title').eq('id', application?.job_id).single();
  const { data: agency } = await svc.from('agencies')
    .select('name, timezone').eq('id', appt.agency_id).single();

  const hasBooking = appt.status === 'booked' || appt.status === 'confirmed';

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg">
        <h1 className="mb-1 text-xl font-semibold text-gray-900">
          Termin buchen
        </h1>
        <p className="mb-6 text-sm text-gray-600">
          {job?.title ?? 'Stelle'} bei {agency?.name ?? 'Unternehmen'}
        </p>
        <SlotPicker
          token={token}
          appointmentType={appt.type}
          location={appt.location}
          hasBooking={hasBooking}
          bookedStart={appt.starts_at}
          bookedEnd={appt.ends_at}
          agencyTimezone={agency?.timezone ?? 'Europe/Berlin'}
        />
      </div>
    </div>
  );
}
