import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser, isInternal } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase/server';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !isInternal(user.role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('playbook_entries')
    .select('*')
    .order('problem_key');

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Admin only' }, { status: 403 });
  }

  const body = await request.json();
  const { problem_key, title, description, causes, immediate_actions, long_term_actions, escalation_trigger } = body;

  if (!problem_key || !title || !description) {
    return NextResponse.json({ error: 'problem_key, title und description sind erforderlich.' }, { status: 400 });
  }

  const supabase = await createServerClient();
  const { data, error } = await supabase
    .from('playbook_entries')
    .insert({
      problem_key,
      title,
      description,
      causes: causes ?? [],
      immediate_actions: immediate_actions ?? [],
      long_term_actions: long_term_actions ?? [],
      escalation_trigger: escalation_trigger || null,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
