import { getCurrentUser, isInternal } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { seedRecruitingTemplate } from '@/lib/recruiting/seed-template';
import { instantiatePipeline } from '@/lib/recruiting/instantiate-pipeline';
import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/recruiting/templates
 *
 * Lists all recruiting pipeline templates. Admin/employee only.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!isInternal(user.role)) {
    return NextResponse.json({ error: 'Nur für interne Nutzer' }, { status: 403 });
  }

  const admin = createAdminClient();

  const { data: templates, error } = await admin
    .from('recruiting_pipeline_templates')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(templates);
}

/**
 * POST /api/recruiting/templates
 *
 * Seeds/creates a template and optionally instantiates it for an agency.
 * Body: { action: 'seed' } -- seeds the default D2D template
 * Body: { action: 'instantiate', agency_id: string, template_key?: string }
 * Admin only.
 */
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (user.role !== 'admin') {
    return NextResponse.json({ error: 'Nur für Admins' }, { status: 403 });
  }

  const body = await request.json();
  const { action } = body as { action: string };

  const admin = createAdminClient();

  if (action === 'seed') {
    try {
      const template = await seedRecruitingTemplate(admin);
      return NextResponse.json(template, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      return NextResponse.json({ error: message }, { status: 500 });
    }
  }

  if (action === 'instantiate') {
    const { agency_id, template_key } = body as {
      agency_id: string;
      template_key?: string;
    };

    if (!agency_id) {
      return NextResponse.json(
        { error: 'agency_id ist erforderlich' },
        { status: 400 }
      );
    }

    try {
      const result = await instantiatePipeline(admin, agency_id, template_key);
      return NextResponse.json(result, { status: 201 });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unbekannter Fehler';
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  return NextResponse.json(
    { error: 'Ungültige action. Erlaubt: "seed", "instantiate"' },
    { status: 400 }
  );
}
