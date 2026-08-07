import { createServerClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase.from('users').select('role').eq('id', user.id).single();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'employee')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { conversation_id, message, agency_id, conversation_type } = await req.json();

  let convId = conversation_id;

  // Create new conversation if needed
  if (!convId) {
    const { data: conv, error } = await supabase
      .from('ai_conversations')
      .insert({
        agency_id,
        user_id: user.id,
        conversation_type: conversation_type || 'general',
        title: message.substring(0, 100),
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    convId = conv.id;
  }

  // Save user message
  await supabase.from('ai_messages').insert({
    conversation_id: convId,
    role: 'user',
    content: message,
  });

  // Fetch onboarding data for context
  const { data: onboarding } = await supabase
    .from('onboarding_submissions')
    .select('*')
    .eq('agency_id', agency_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Placeholder AI response (ready for Claude API)
  const aiResponse = `Basierend auf dem Kontext für ${onboarding?.company_name || 'den Kunden'} (${onboarding?.industry || 'D2D'}):

Hier würde die AI-Antwort stehen. Verbinde die Claude API mit ANTHROPIC_API_KEY für echte Generierung.

Deine Nachricht: "${message}"`;

  // Save assistant message
  const { data: assistantMsg } = await supabase
    .from('ai_messages')
    .insert({
      conversation_id: convId,
      role: 'assistant',
      content: aiResponse,
    })
    .select()
    .single();

  // Update conversation timestamp
  await supabase
    .from('ai_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', convId);

  return NextResponse.json({
    conversation_id: convId,
    message: assistantMsg,
  });
}

export async function GET(req: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const conversationId = searchParams.get('conversation_id');
  const agencyId = searchParams.get('agency_id');

  if (conversationId) {
    const { data: messages } = await supabase
      .from('ai_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at');
    return NextResponse.json(messages);
  }

  if (agencyId) {
    const { data: conversations } = await supabase
      .from('ai_conversations')
      .select('*')
      .eq('agency_id', agencyId)
      .order('updated_at', { ascending: false });
    return NextResponse.json(conversations);
  }

  return NextResponse.json([]);
}
