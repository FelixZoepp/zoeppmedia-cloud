'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AlertTriangle, ArrowDown, ArrowUp, Clock, FileText, Paperclip, Pencil, PlayCircle, Plus, Trash2, ListOrdered } from 'lucide-react';
import { Button, Card, Input, Modal, PageHeader } from '@/components/ui';
import type { Lesson, Module } from '@/lib/masterclass/lesson';

async function post(body: Record<string, unknown>) {
  const res = await fetch('/api/masterclass/admin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Fehler');
  return data;
}

function move<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function AdminMasterclassPage() {
  const router = useRouter();
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [schemaReady, setSchemaReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [moduleModal, setModuleModal] = useState<{ id?: string; title: string; description: string } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/masterclass/admin');
    if (res.ok) {
      const d = (await res.json()) as { modules: Module[]; lessons: Lesson[]; schema_ready: boolean };
      setModules(d.modules);
      setLessons(d.lessons);
      setSchemaReady(d.schema_ready);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/masterclass/admin')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { modules: Module[]; lessons: Lesson[]; schema_ready: boolean } | null) => {
        if (cancelled || !d) return;
        setModules(d.modules);
        setLessons(d.lessons);
        setSchemaReady(d.schema_ready);
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveModule() {
    if (!moduleModal?.title.trim()) return toast.error('Bitte einen Titel eingeben');
    try {
      if (moduleModal.id) {
        await post({ action: 'update_module', id: moduleModal.id, title: moduleModal.title.trim(), description: moduleModal.description.trim() || null });
      } else {
        await post({ action: 'create_module', title: moduleModal.title.trim(), description: moduleModal.description.trim() || null, sort_order: modules.length + 1, published: false });
      }
      setModuleModal(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Speichern fehlgeschlagen');
    }
  }

  async function togglePublished(m: Module) {
    setModules((prev) => prev.map((x) => (x.id === m.id ? { ...x, published: !m.published } : x)));
    try {
      await post({ action: 'update_module', id: m.id, published: !m.published });
    } catch {
      toast.error('Konnte nicht gespeichert werden');
      await load();
    }
  }

  async function reorderModules(from: number, to: number) {
    const next = move(modules, from, to);
    setModules(next);
    await post({ action: 'reorder', table: 'module', ids: next.map((m) => m.id) }).catch(() => toast.error('Reihenfolge nicht gespeichert'));
  }

  async function reorderLessons(moduleId: string, from: number, to: number) {
    const inMod = lessons.filter((l) => l.module_id === moduleId);
    const next = move(inMod, from, to);
    setLessons((prev) => [...prev.filter((l) => l.module_id !== moduleId), ...next.map((l, i) => ({ ...l, sort_order: i + 1 }))]);
    await post({ action: 'reorder', table: 'lesson', ids: next.map((l) => l.id) }).catch(() => toast.error('Reihenfolge nicht gespeichert'));
  }

  async function deleteModule(m: Module) {
    const n = lessons.filter((l) => l.module_id === m.id).length;
    if (!confirm(`Modul „${m.title}“ ${n ? `mit ${n} Lektion${n === 1 ? '' : 'en'} ` : ''}wirklich löschen?`)) return;
    await post({ action: 'delete_module', id: m.id }).catch(() => toast.error('Löschen fehlgeschlagen'));
    await load();
  }

  async function newLesson(moduleId: string) {
    try {
      const created = (await post({ action: 'create_lesson', module_id: moduleId, title: 'Neue Lektion' })) as { id: string };
      router.push(`/admin/masterclass/lektion/${created.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Anlegen fehlgeschlagen');
    }
  }

  const gesamt = lessons.length;
  const live = lessons.filter((l) => l.status === 'veroeffentlicht').length;

  return (
    <div>
      <PageHeader
        title="Masterclass"
        description={`${modules.length} Module · ${gesamt} Lektionen · ${live} veröffentlicht`}
        action={
          <>
            <Link href="/masterclass" className="inline-flex h-[50px] items-center rounded-full px-6 text-base font-medium text-ink shadow-[inset_0_0_0_1.5px_var(--r-950)] hover:bg-red-50">
              Live-Ansicht
            </Link>
            <Button size="lg" onClick={() => setModuleModal({ title: '', description: '' })}>
              <Plus /> Neues Modul
            </Button>
          </>
        }
      />

      {!schemaReady && (
        <div className="mb-5 flex gap-3 rounded-xl bg-amber-50 p-4 text-[14px] text-amber-900 shadow-[inset_0_0_0_1px_#fde68a]">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
          <p>
            <strong>Datenbank-Update fehlt.</strong> Titel, Beschreibung und Video werden gespeichert. Status, Inhalt, Kapitel, Anhänge, Vorschaubild und
            Eigenschaften erst, wenn die Migration <code className="rounded bg-amber-100 px-1">20261005000001_masterclass_lektionen.sql</code> eingespielt ist.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
        </div>
      ) : modules.length === 0 ? (
        <Card className="py-14 text-center">
          <p className="text-[17px] font-medium">Noch keine Module</p>
          <p className="mt-1 text-sm text-gray-600">Lege das erste Modul an und füge Lektionen hinzu.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {modules.map((m, mi) => {
            const list = lessons.filter((l) => l.module_id === m.id).sort((a, b) => a.sort_order - b.sort_order);
            return (
              <Card key={m.id} padding="none" className="overflow-hidden">
                <header className="flex flex-wrap items-center gap-3 px-5 py-4">
                  <span className="grid h-10 w-10 flex-none place-items-center rounded-full bg-red-100 text-[15px] font-semibold text-red-900">{mi + 1}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[19px] font-medium tracking-[-0.02em]">{m.title}</h2>
                    {m.description && <p className="truncate text-[13.5px] text-gray-600">{m.description}</p>}
                  </div>
                  <button
                    onClick={() => togglePublished(m)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-medium ${
                      m.published ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}
                    title="Sichtbarkeit für Kunden umschalten"
                  >
                    <span className={`h-2 w-2 rounded-full ${m.published ? 'bg-green-600' : 'bg-gray-400'}`} />
                    {m.published ? 'Veröffentlicht' : 'Entwurf'}
                  </button>
                  <div className="flex items-center gap-1">
                    <IconBtn label="Nach oben" disabled={mi === 0} onClick={() => reorderModules(mi, mi - 1)}>
                      <ArrowUp className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn label="Nach unten" disabled={mi === modules.length - 1} onClick={() => reorderModules(mi, mi + 1)}>
                      <ArrowDown className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn label="Modul bearbeiten" onClick={() => setModuleModal({ id: m.id, title: m.title, description: m.description ?? '' })}>
                      <Pencil className="h-4 w-4" />
                    </IconBtn>
                    <IconBtn label="Modul löschen" onClick={() => deleteModule(m)}>
                      <Trash2 className="h-4 w-4" />
                    </IconBtn>
                  </div>
                </header>

                <ul className="border-t border-hair">
                  {list.map((l, li) => (
                    <li key={l.id} className="group flex items-center gap-3 border-b border-hair px-5 py-3 last:border-0 hover:bg-panel/70">
                      <div className="flex flex-col opacity-40 group-hover:opacity-100">
                        <button disabled={li === 0} onClick={() => reorderLessons(m.id, li, li - 1)} aria-label="Lektion nach oben" className="disabled:opacity-20">
                          <ArrowUp className="h-3.5 w-3.5" />
                        </button>
                        <button disabled={li === list.length - 1} onClick={() => reorderLessons(m.id, li, li + 1)} aria-label="Lektion nach unten" className="disabled:opacity-20">
                          <ArrowDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      {l.thumbnail_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- Vorschaubild aus dem Storage
                        <img src={l.thumbnail_url} alt="" className="h-11 w-[72px] flex-none rounded-[10px] object-cover" />
                      ) : (
                        <span className="grid h-11 w-[72px] flex-none place-items-center rounded-[10px] bg-panel text-gray-500">
                          {l.typ === 'text' ? <FileText className="h-5 w-5" /> : <PlayCircle className="h-5 w-5" />}
                        </span>
                      )}
                      <Link href={`/admin/masterclass/lektion/${l.id}`} className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-medium hover:text-red-800">{l.title}</span>
                        <span className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[12.5px] text-gray-600">
                          <span className="inline-flex items-center gap-1">
                            <span className={`h-1.5 w-1.5 rounded-full ${l.status === 'veroeffentlicht' ? 'bg-green-600' : 'bg-gray-400'}`} />
                            {l.status === 'veroeffentlicht' ? 'Veröffentlicht' : 'Entwurf'}
                          </span>
                          {l.duration_minutes ? (
                            <span className="inline-flex items-center gap-1">
                              <Clock className="h-3 w-3" /> {l.duration_minutes} Min.
                            </span>
                          ) : null}
                          {l.kapitel.length > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <ListOrdered className="h-3 w-3" /> {l.kapitel.length} Kapitel
                            </span>
                          )}
                          {l.anhaenge.length > 0 && (
                            <span className="inline-flex items-center gap-1">
                              <Paperclip className="h-3 w-3" /> {l.anhaenge.length}
                            </span>
                          )}
                          {l.pflicht && <span className="font-medium text-red-800">Pflicht</span>}
                          {!l.video_url && l.typ === 'video' && <span className="text-amber-700">Video fehlt</span>}
                        </span>
                      </Link>
                      <Link
                        href={`/admin/masterclass/lektion/${l.id}`}
                        className="hidden h-9 items-center rounded-full px-4 text-[13.5px] font-medium shadow-[inset_0_0_0_1.5px_var(--hair)] hover:bg-card sm:inline-flex"
                      >
                        Bearbeiten
                      </Link>
                    </li>
                  ))}
                  <li className="px-5 py-3">
                    <button onClick={() => newLesson(m.id)} className="inline-flex items-center gap-1.5 text-[14px] font-medium text-red-800 hover:underline">
                      <Plus className="h-4 w-4" /> Lektion hinzufügen
                    </button>
                  </li>
                </ul>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={!!moduleModal} onClose={() => setModuleModal(null)} title={moduleModal?.id ? 'Modul bearbeiten' : 'Neues Modul'}>
        {moduleModal && (
          <div className="space-y-4">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Titel</label>
              <Input value={moduleModal.title} onChange={(e) => setModuleModal({ ...moduleModal, title: e.target.value })} placeholder="z. B. Mindset & Gatekeeper" autoFocus />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Beschreibung</label>
              <textarea
                value={moduleModal.description}
                onChange={(e) => setModuleModal({ ...moduleModal, description: e.target.value })}
                rows={3}
                className="w-full rounded-[12px] bg-card px-3.5 py-2.5 text-[15px] shadow-[inset_0_0_0_1.5px_var(--hair)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--r-700),0_0_0_4px_var(--r-100)]"
              />
            </div>
            {!moduleModal.id && <p className="text-[13px] text-gray-600">Neue Module starten als Entwurf – erst nach dem Veröffentlichen sehen Kunden sie.</p>}
            <Button className="w-full" onClick={saveModule}>
              Speichern
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid h-9 w-9 place-items-center rounded-full text-gray-600 transition-colors hover:bg-panel hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  );
}
