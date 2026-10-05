'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Building2, User, Users, X } from 'lucide-react';
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
  const [mobileOpen, setMobileOpen] = useState(false);
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

  // ⌘K / Strg+K fokussiert die Suche
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
    setMobileOpen(false);
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
      <button
        type="button"
        onClick={() => { setMobileOpen(true); setTimeout(() => inputRef.current?.focus(), 30); }}
        className="grid h-[50px] w-[50px] place-items-center rounded-full bg-card text-ink md:hidden"
        aria-label="Suchen"
      >
        <Search className="h-[21px] w-[21px]" />
      </button>
      <div
        className={`${
          mobileOpen ? 'fixed inset-x-2.5 top-2.5 z-50 flex items-center gap-2 rounded-2xl bg-panel p-2 shadow-[0_18px_40px_-18px_#1a151480]' : 'hidden'
        } md:static md:block md:w-[380px] md:max-w-full md:bg-transparent md:p-0 md:shadow-none`}
      >
        <div className="relative min-w-0 flex-1">
        <Search className="pointer-events-none absolute left-[18px] top-1/2 h-[21px] w-[21px] -translate-y-1/2 text-ink" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results && hasResults) setOpen(true); }}
          placeholder="Kunden & Bewerber suchen"
          aria-label="Kunden und Bewerber suchen"
          className="h-[50px] w-full rounded-full bg-card pl-[50px] pr-16 text-[15px] text-ink outline-none placeholder:text-gray-500 focus-visible:shadow-[var(--focus)] [&::-webkit-search-cancel-button]:hidden"
        />
        {loading ? (
          <div className="absolute right-4 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border border-gray-300 border-t-gray-700" />
        ) : (
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden md:block -translate-y-1/2 rounded-[7px] bg-panel px-2 py-[3px] font-sans text-xs font-medium text-ink">
            ⌘ K
          </kbd>
        )}
        </div>
        {mobileOpen && (
          <button
            type="button"
            onClick={() => { setMobileOpen(false); setOpen(false); }}
            className="grid h-[50px] w-[50px] flex-shrink-0 place-items-center rounded-full bg-card md:hidden"
            aria-label="Suche schließen"
          >
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {open && (
        <div className={`fx-dlg ${mobileOpen ? 'fixed inset-x-2.5 top-[82px] max-h-[70dvh] overflow-y-auto' : 'absolute top-full left-0 w-[380px]'} mt-2 md:absolute md:inset-x-auto md:top-full md:left-0 md:w-[380px] bg-card rounded-xl shadow-[0_0_0_1px_var(--hair),0_18px_40px_-16px_#1a151459] z-50 overflow-hidden`}>
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
