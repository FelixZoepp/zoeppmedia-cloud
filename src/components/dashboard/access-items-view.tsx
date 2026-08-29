'use client';

import { useEffect, useState, useCallback } from 'react';
import { toast } from 'sonner';
import {
  CheckCircle2, Circle, ExternalLink, Loader2, Lock, ShieldCheck,
} from 'lucide-react';

interface AccessItemData {
  id: string;
  label: string;
  typ: string;
  pflicht: boolean;
  status: string;
  hinweis_fuer_kunden: string | null;
  anleitung_url: string | null;
}

export function AccessItemsView({ agencyId }: { agencyId: string }) {
  const [items, setItems] = useState<AccessItemData[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchItems = useCallback(async () => {
    try {
      const res = await fetch('/api/access-items');
      if (!res.ok) throw new Error();
      const data = await res.json();
      if (Array.isArray(data)) setItems(data);
    } catch {
      // Silently handle
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function markErfuellt(itemId: string) {
    setUpdating(itemId);
    try {
      const res = await fetch(`/api/access-items/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'erfuellt' }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Fehler');
      }

      // Optimistic update
      setItems((prev) =>
        prev.map((i) => (i.id === itemId ? { ...i, status: 'erfuellt' } : i))
      );
      toast.success('Zugang als erledigt markiert');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Fehler beim Aktualisieren');
    } finally {
      setUpdating(null);
    }
  }

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm animate-pulse">
        <div className="h-4 bg-gray-100 rounded w-40 mb-4" />
        <div className="h-3 bg-gray-100 rounded-full w-full mb-6" />
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 bg-gray-50 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (items.length === 0) return null;

  const pflichtItems = items.filter((i) => i.pflicht);
  const optionalItems = items.filter((i) => !i.pflicht);
  const fulfilledCount = items.filter((i) => i.status === 'erfuellt' || i.status === 'nicht_noetig').length;
  const totalCount = items.length;
  const progressPercent = totalCount > 0 ? Math.round((fulfilledCount / totalCount) * 100) : 0;

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
          <Lock className="w-4 h-4 text-red-600" />
        </div>
        <div className="flex-1">
          <span className="text-xs font-semibold uppercase tracking-wider text-red-600">
            Zugänge
          </span>
          <span className="text-xs text-gray-400 ml-2">
            {fulfilledCount}/{totalCount} erledigt
          </span>
        </div>
        <span className="text-sm font-bold text-gray-900">{progressPercent}%</span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-5">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            progressPercent === 100 ? 'bg-green-500' : 'bg-red-600'
          }`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>

      {/* Pflicht Items */}
      {pflichtItems.length > 0 && (
        <div className="mb-4">
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Pflicht
          </h3>
          <div className="space-y-1.5">
            {pflichtItems.map((item) => (
              <AccessItemRow
                key={item.id}
                item={item}
                updating={updating === item.id}
                onMarkErfuellt={() => markErfuellt(item.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Optional Items */}
      {optionalItems.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Optional
          </h3>
          <div className="space-y-1.5">
            {optionalItems.map((item) => (
              <AccessItemRow
                key={item.id}
                item={item}
                updating={updating === item.id}
                onMarkErfuellt={() => markErfuellt(item.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── AccessItemRow ────────────────────────────────────────── */

function AccessItemRow({
  item,
  updating,
  onMarkErfuellt,
}: {
  item: AccessItemData;
  updating: boolean;
  onMarkErfuellt: () => void;
}) {
  const isDone = item.status === 'erfuellt' || item.status === 'nicht_noetig';

  return (
    <div
      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
        isDone ? '' : item.status === 'angefragt' ? 'bg-amber-50' : 'bg-red-50'
      }`}
    >
      {/* Status icon */}
      <div className="flex-shrink-0">
        {isDone ? (
          <CheckCircle2 className="w-5 h-5 text-green-500" />
        ) : item.status === 'angefragt' ? (
          <ShieldCheck className="w-5 h-5 text-amber-500" />
        ) : (
          <Circle className="w-5 h-5 text-red-400" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span
          className={`text-sm block ${
            isDone ? 'text-gray-400' : 'font-medium text-gray-900'
          }`}
        >
          {item.label}
        </span>
        {item.hinweis_fuer_kunden && !isDone && (
          <span className="text-xs text-gray-500 block mt-0.5">
            {item.hinweis_fuer_kunden}
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {item.anleitung_url && !isDone && (
          <a
            href={item.anleitung_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-red-600 hover:text-red-700 font-medium flex items-center gap-0.5"
          >
            Anleitung
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {!isDone && (
          <button
            onClick={onMarkErfuellt}
            disabled={updating}
            className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:cursor-not-allowed flex items-center gap-1"
          >
            {updating ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <CheckCircle2 className="w-3 h-3" />
            )}
            Erledigt
          </button>
        )}
      </div>
    </div>
  );
}
