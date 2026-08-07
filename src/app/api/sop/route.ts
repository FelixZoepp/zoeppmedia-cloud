import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// GET: Get all SOP phases with tasks, plus customer progress if agency_id given
export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const agencyId = searchParams.get('agency_id');

  // Get SOP template
  const { data: phases } = await supabase
    .from('sop_phases')
    .select('*')
    .order('sort_order');

  const { data: tasks } = await supabase
    .from('sop_tasks')
    .select('*')
    .order('sort_order');

  let customerSop = null;
  let customerTasks: Record<string, unknown>[] = [];

  if (agencyId) {
    const { data: sop } = await supabase
      .from('customer_sop')
      .select('*')
      .eq('agency_id', agencyId)
      .single();
    customerSop = sop;

    if (sop) {
      const { data: ct } = await supabase
        .from('customer_tasks')
        .select('*')
        .eq('customer_sop_id', sop.id)
        .order('created_at');
      customerTasks = ct || [];
    }
  }

  return NextResponse.json({
    phases: phases || [],
    tasks: tasks || [],
    customerSop,
    customerTasks,
  });
}

// POST: Initialize SOP for an agency (creates customer_sop + all customer_tasks)
export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { agency_id } = await req.json();

  // Check if already exists
  const { data: existing } = await supabase
    .from('customer_sop')
    .select('id')
    .eq('agency_id', agency_id)
    .single();

  if (existing) return NextResponse.json({ error: 'SOP already initialized' }, { status: 400 });

  // Create customer SOP
  const { data: sop, error: sopError } = await supabase
    .from('customer_sop')
    .insert({ agency_id })
    .select()
    .single();

  if (sopError) return NextResponse.json({ error: sopError.message }, { status: 500 });

  // Get all SOP tasks
  const { data: sopTasks } = await supabase
    .from('sop_tasks')
    .select('id')
    .order('sort_order');

  if (sopTasks && sopTasks.length > 0) {
    const customerTaskRows = sopTasks.map((t) => ({
      customer_sop_id: sop.id,
      sop_task_id: t.id,
      agency_id,
    }));

    await supabase.from('customer_tasks').insert(customerTaskRows);
  }

  return NextResponse.json(sop);
}
