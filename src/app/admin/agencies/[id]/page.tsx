'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { Agency } from '@/lib/types/database';

type AgencyDetail = {
  agency: Agency;
  totalCandidates: number;
  hired: number;
  hireRate: number;
  funnel: { stage: string; color: string; count: number }[];
  sourceBreakdown: { meta: number; indeed: number; manual: number };
  lastLogin: string | null;
  recentCandidates: number;
  upsellSignals: string[];
};

export default function AgencyDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<AgencyDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/admin/agencies/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      });
  }, [id]);

  if (loading) return <p className="text-gray-500">Laden...</p>;
  if (!data) return <p className="text-gray-500">Agentur nicht gefunden.</p>;

  const { agency, totalCandidates, hired, hireRate, funnel, sourceBreakdown, lastLogin, recentCandidates, upsellSignals } = data;

  return (
    <div>
      <Link href="/admin" className="text-blue-600 hover:underline text-sm mb-4 inline-block">&larr; Zurück</Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">{agency.name}</h1>
      <p className="text-gray-500 text-sm mb-6">{agency.contact_name} &middot; {agency.email}</p>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Bewerber gesamt</p>
          <p className="text-2xl font-bold text-gray-900">{totalCandidates}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Eingestellt</p>
          <p className="text-2xl font-bold text-green-600">{hired}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Einstellungsquote</p>
          <p className="text-2xl font-bold text-gray-900">{hireRate}%</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-sm text-gray-500">Letzte 30 Tage</p>
          <p className="text-2xl font-bold text-gray-900">{recentCandidates}</p>
        </div>
      </div>

      {/* Funnel */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-sm font-medium text-gray-500 uppercase mb-4">Conversion Funnel</h2>
        <div className="space-y-3">
          {funnel?.map((f) => {
            const maxCount = Math.max(...(funnel?.map((x) => x.count) || [1]), 1);
            const width = Math.max((f.count / maxCount) * 100, 4);
            return (
              <div key={f.stage} className="flex items-center gap-3">
                <span className="text-sm text-gray-600 w-40 flex-shrink-0">{f.stage}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    className="h-full rounded-full flex items-center px-2"
                    style={{ width: `${width}%`, backgroundColor: f.color }}
                  >
                    <span className="text-xs font-medium text-white">{f.count}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Source Breakdown */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-sm font-medium text-gray-500 uppercase mb-4">Quellen</h2>
        <div className="flex gap-6">
          <div>
            <p className="text-2xl font-bold text-blue-600">{sourceBreakdown.meta}</p>
            <p className="text-sm text-gray-500">Meta</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-purple-600">{sourceBreakdown.indeed}</p>
            <p className="text-sm text-gray-500">Indeed</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-600">{sourceBreakdown.manual}</p>
            <p className="text-sm text-gray-500">Manuell</p>
          </div>
        </div>
      </div>

      {/* Activity */}
      <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
        <h2 className="text-sm font-medium text-gray-500 uppercase mb-4">Aktivität</h2>
        <p className="text-sm">
          <span className="text-gray-500">Letzter Login:</span>{' '}
          {lastLogin
            ? new Date(lastLogin).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
            : 'Nie'}
        </p>
      </div>

      {/* Upsell Signals */}
      {upsellSignals.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <h2 className="text-sm font-medium text-amber-800 uppercase mb-3">Upsell-Signale</h2>
          <ul className="space-y-2">
            {upsellSignals.map((signal, i) => (
              <li key={i} className="text-sm text-amber-700 flex items-start gap-2">
                <span className="mt-0.5">&#9888;</span>
                <span>{signal}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
