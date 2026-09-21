// src/app/api/candidates/[id]/dsgvo-export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, getEffectiveAgencyId } from '@/lib/auth';
import { canWriteRole } from '@/lib/recruiting/scope';
import { createAdminClient } from '@/lib/supabase/admin';
import { logAudit } from '@/lib/audit/log';
import { buildDsgvoExport, renderDsgvoPdf } from '@/lib/dsgvo/export';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Nicht autorisiert' }, { status: 401 });

  if (!canWriteRole(user.role))
    return NextResponse.json({ error: 'Keine Schreibrechte' }, { status: 403 });

  const agencyId = await getEffectiveAgencyId();
  if (!agencyId) return NextResponse.json({ error: 'Keine Agentur' }, { status: 403 });

  const { id } = await params;
  const svc = createAdminClient();

  const data = await buildDsgvoExport(svc, agencyId, id);
  if (!data) return NextResponse.json({ error: 'Kandidat nicht gefunden' }, { status: 404 });

  await logAudit(svc, {
    user_id: user.id,
    agency_id: agencyId,
    entity_type: 'candidate',
    entity_id: id,
    action: 'export',
  });

  const format = request.nextUrl.searchParams.get('format');

  if (format === 'pdf') {
    const pdfBytes = await renderDsgvoPdf(data);
    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="dsgvo-export-${id}.pdf"`,
      },
    });
  }

  // JSON download (default)
  const json = JSON.stringify(data, null, 2);
  return new NextResponse(json, {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="dsgvo-export-${id}.json"`,
    },
  });
}
