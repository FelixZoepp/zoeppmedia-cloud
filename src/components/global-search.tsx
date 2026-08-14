'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Building2, User, Users } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface Agency { id: string; name: string; email: string }
interface Candidate { id: string; name: string; email: string | null; phone: string | null; agency_id: string }
interface UserResult { id: string; name: string; email: string; role: string }

interface SearchResults {
  agencies: Agency[];
  candidates: Candidate[];
  users: UserResult[];
}

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function GlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const debouncedQuery = useDebounce(query, 300);

  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults(null);
      setOpen(false);
      return;
    }

    setLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`)
      .then((r) => r.json())
      .then((data: SearchResults) => {
        setResults(data);
        setOpen(true);
        setActiveIndex(-1);
      })
      .finally(() => setLoading(false));
  }, [debouncedQuery]);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const flatItems = results
    ? [
        ...results.agencies.map((a) => ({ type: 'agency' as const, item: a })),
        ...results.candidates.map((c) => ({ type: 'candidate' as const, item: c })),
        ...results.users.map((u) => ({ type: 'user' as const, item: u })),
      ]
    : [];

  const navigateTo = useCallback((type: 'agency' | 'candidate' | 'user', id: string) => {
    setOpen(false);
    setQuery('');
    if (type === 'agency') router.push(`/clients/${id}`);
    else if (type === 'candidate') router.push(`/candidates/${id}`);
    else if (type === 'user') router.push(`/team`);
  }, [router]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open || flatItems.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIndex >= 0) {
      e.preventDefault();
      const active = flatItems[activeIndex];
      navigateTo(active.type, active.item.id);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const hasResults = results && (results.agencies.length + results.candidates.length + results.users.length) > 0;

  return (
    <div ref={containerRef} className="relative">
      <div className="hidden md:flex items-center gap-2 bg-white border border-gray-200 rounded-full px-4 py-2 w-[280px] shadow-sm focus-within:border-red-300 focus-within:shadow-md transition-shadow">
        <Search className="w-4 h-4 text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results && hasResults) setOpen(true); }}
          placeholder="Suchen... (Kunde, Bewerber)"
          className="text-sm text-gray-700 placeholder:text-gray-400 bg-transparent outline-none flex-1 min-w-0"
        />
        {loading && (
          <div className="w-3 h-3 border border-gray-300 border-t-gray-600 rounded-full animate-spin shrink-0" />
        )}
      </div>

      {open && (
        <div className="absolute top-full mt-2 left-0 w-[360px] bg-white rounded-xl border border-gray-200 shadow-xl z-50 overflow-hidden">
          {!hasResults ? (
            <p className="text-sm text-gray-400 text-center py-6">Keine Ergebnisse</p>
          ) : (
            <div className="py-2">
              {results!.agencies.length > 0 && (
                <Group
                  label="Agenturen"
                  icon={<Building2 className="w-3.5 h-3.5" />}
                  items={results!.agencies.map((a) => ({ id: a.id, primary: a.name, secondary: a.email }))}
                  type="agency"
                  flatItems={flatItems}
                  activeIndex={activeIndex}
                  onSelect={(id) => navigateTo('agency', id)}
                />
              )}
              {results!.candidates.length > 0 && (
                <Group
                  label="Bewerber"
                  icon={<User className="w-3.5 h-3.5" />}
                  items={results!.candidates.map((c) => ({ id: c.id, primary: c.name, secondary: c.email || c.phone || '' }))}
                  type="candidate"
                  flatItems={flatItems}
                  activeIndex={activeIndex}
                  onSelect={(id) => navigateTo('candidate', id)}
                />
              )}
              {results!.users.length > 0 && (
                <Group
                  label="Nutzer"
                  icon={<Users className="w-3.5 h-3.5" />}
                  items={results!.users.map((u) => ({ id: u.id, primary: u.name, secondary: u.email }))}
                  type="user"
                  flatItems={flatItems}
                  activeIndex={activeIndex}
                  onSelect={(id) => navigateTo('user', id)}
                />
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Group({
  label,
  icon,
  items,
  type,
  flatItems,
  activeIndex,
  onSelect,
}: {
  label: string;
  icon: React.ReactNode;
  items: { id: string; primary: string; secondary: string }[];
  type: 'agency' | 'candidate' | 'user';
  flatItems: { type: 'agency' | 'candidate' | 'user'; item: { id: string } }[];
  activeIndex: number;
  onSelect: (id: string) => void;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 px-4 py-2">
        <span className="text-gray-400">{icon}</span>
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      {items.map((item) => {
        const flatIdx = flatItems.findIndex((f) => f.type === type && f.item.id === item.id);
        const isActive = flatIdx === activeIndex;
        return (
          <button
            key={item.id}
            onClick={() => onSelect(item.id)}
            className={`w-full text-left px-4 py-2.5 flex flex-col transition-colors ${
              isActive ? 'bg-red-50' : 'hover:bg-gray-50'
            }`}
          >
            <span className="text-sm font-medium text-gray-900">{item.primary}</span>
            {item.secondary && (
              <span className="text-xs text-gray-400 truncate">{item.secondary}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
