/**
 * Lade-Gerüste: erscheinen sofort nach dem Klick (loading.tsx), bis die Seite vom Server da ist.
 * Bewusst schlicht und ohne Daten – nur die grobe Form der Seite.
 */

function Balken({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-gray-200/70 ${className}`} />;
}

function Kopf() {
  return (
    <div className="mb-6 space-y-2">
      <Balken className="h-7 w-56" />
      <Balken className="h-4 w-80 max-w-full" />
    </div>
  );
}

/** Standard: Überschrift, vier Kennzahlen, zwei Karten */
export function SeitenSkelett() {
  return (
    <div aria-busy="true" aria-label="Wird geladen">
      <Kopf />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="rounded-xl bg-card p-5 shadow-sm">
            <Balken className="h-3.5 w-24" />
            <Balken className="mt-3 h-7 w-20" />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl bg-card p-5 shadow-sm lg:col-span-2">
          <Balken className="h-4 w-40" />
          <Balken className="mt-4 h-48 w-full" />
        </div>
        <div className="space-y-3 rounded-xl bg-card p-5 shadow-sm">
          <Balken className="h-4 w-32" />
          {Array.from({ length: 5 }, (_, i) => (
            <Balken key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Bewerber-Kanban: Spalten mit Karten */
export function KanbanSkelett() {
  return (
    <div aria-busy="true" aria-label="Wird geladen">
      <Kopf />
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 5 }, (_, s) => (
          <div key={s} className="w-[260px] flex-none space-y-2.5 rounded-xl bg-panel p-3">
            <Balken className="h-4 w-24" />
            {Array.from({ length: 4 - (s % 3) }, (_, k) => (
              <div key={k} className="rounded-lg bg-card p-3 shadow-sm">
                <Balken className="h-4 w-32" />
                <Balken className="mt-2 h-3 w-20" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Inbox: Chatliste links, Verlauf rechts */
export function InboxSkelett() {
  return (
    <div aria-busy="true" aria-label="Wird geladen">
      <Kopf />
      <div className="grid gap-3 md:grid-cols-[320px_1fr]">
        <div className="space-y-2 rounded-xl bg-card p-3 shadow-sm">
          {Array.from({ length: 7 }, (_, i) => (
            <div key={i} className="flex items-center gap-3 p-1.5">
              <Balken className="h-9 w-9 flex-none rounded-full" />
              <div className="flex-1 space-y-1.5">
                <Balken className="h-3.5 w-2/3" />
                <Balken className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
        <div className="hidden space-y-3 rounded-xl bg-card p-5 shadow-sm md:block">
          {Array.from({ length: 6 }, (_, i) => (
            <Balken key={i} className={`h-10 ${i % 2 ? 'ml-auto w-1/2' : 'w-2/3'}`} />
          ))}
        </div>
      </div>
    </div>
  );
}
