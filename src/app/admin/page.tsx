'use client';

import { useEffect, useState } from 'react';
import type { Agency } from '@/lib/types/database';

type AgencyWithMeta = Agency & {
  candidate_count: number;
  last_login: string | null;
};

export default function AdminPage() {
  const [agencies, setAgencies] = useState<AgencyWithMeta[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/agencies')
      .then((res) => res.json())
      .then((data) => {
        setAgencies(data);
        setLoading(false);
      });
  }, []);

  if (loading) return <p className="text-gray-500">Laden...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Agenturen</h1>
      {agencies.length === 0 ? (
        <p className="text-gray-500">Noch keine Agenturen. Lade eine ein!</p>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Agentur</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Ansprechpartner</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Bewerber</th>
                <th className="text-left px-6 py-3 text-sm font-medium text-gray-500">Letzter Login</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {agencies.map((a) => (
                <tr key={a.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <a href={`/admin/agencies/${a.id}`} className="text-blue-600 hover:underline font-medium">
                      {a.name}
                    </a>
                  </td>
                  <td className="px-6 py-4 text-gray-600">{a.contact_name}</td>
                  <td className="px-6 py-4 text-gray-600">{a.candidate_count}</td>
                  <td className="px-6 py-4 text-gray-500 text-sm">
                    {a.last_login
                      ? new Date(a.last_login).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                      : 'Nie'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
