'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function SettingsPage() {
  const [agency, setAgency] = useState<{ name: string; email: string; phone: string | null; id: string } | null>(null);
  const [user, setUser] = useState<{ name: string; email: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function load() {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) return;

      const { data: profile } = await supabase
        .from('users')
        .select('name, email, agency_id')
        .eq('id', authUser.id)
        .single();

      if (profile) {
        setUser({ name: profile.name, email: profile.email });

        const { data: ag } = await supabase
          .from('agencies')
          .select('id, name, email, phone')
          .eq('id', profile.agency_id)
          .single();

        if (ag) setAgency(ag);
      }
      setLoading(false);
    }
    load();
  }, [supabase]);

  if (loading) return <p className="p-8 text-gray-500">Laden...</p>;

  const webhookUrl = agency
    ? `${window.location.origin}/api/webhooks/meta?agency=${agency.id}`
    : '';

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Einstellungen</h1>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-sm font-medium text-gray-500 uppercase mb-3">Dein Profil</h2>
        <p className="text-sm"><span className="text-gray-500">Name:</span> {user?.name}</p>
        <p className="text-sm mt-1"><span className="text-gray-500">E-Mail:</span> {user?.email}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-sm font-medium text-gray-500 uppercase mb-3">Agentur</h2>
        <p className="text-sm"><span className="text-gray-500">Name:</span> {agency?.name}</p>
        <p className="text-sm mt-1"><span className="text-gray-500">E-Mail:</span> {agency?.email}</p>
        {agency?.phone && <p className="text-sm mt-1"><span className="text-gray-500">Telefon:</span> {agency.phone}</p>}
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-sm font-medium text-gray-500 uppercase mb-3">Meta Webhook URL</h2>
        <p className="text-xs text-gray-500 mb-2">Diese URL bei Meta Lead Ads als Webhook hinterlegen:</p>
        <code className="text-sm bg-gray-50 p-3 rounded-lg block break-all">{webhookUrl}</code>
        <button
          onClick={() => navigator.clipboard.writeText(webhookUrl)}
          className="mt-2 text-sm text-blue-600 hover:underline"
        >
          Kopieren
        </button>
      </div>
    </div>
  );
}
