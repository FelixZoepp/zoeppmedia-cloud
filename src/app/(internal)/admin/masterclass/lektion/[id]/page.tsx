'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowLeft,
  Bold,
  ChevronLeft,
  ChevronRight,
  Code2,
  Eye,
  FileText,
  GraduationCap,
  ImagePlus,
  Italic,
  Link2,
  List,
  ListOrdered,
  Paperclip,
  PlayCircle,
  Plus,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Button, Card, Input } from '@/components/ui';
import { createClient } from '@/lib/supabase/client';
import { formatZeit, parseZeit, videoEmbedUrl, type Anhang, type Kapitel, type Lesson, type Module } from '@/lib/masterclass/lesson';

const BUCKET = 'onboarding-assets';

interface Detail {
  lesson: Lesson;
  module: Module | null;
  modules: Module[];
  vorher: { id: string; title: string } | null;
  nachher: { id: string; title: string } | null;
  schema_ready?: boolean;
}

type Form = Pick<
  Lesson,
  | 'title'
  | 'module_id'
  | 'description'
  | 'video_url'
  | 'duration_minutes'
  | 'status'
  | 'typ'
  | 'content_html'
  | 'tags'
  | 'thumbnail_url'
  | 'kapitel'
  | 'anhaenge'
  | 'pflicht'
  | 'kein_vorzeitiges_abschliessen'
  | 'mit_ki_erstellt'
>;

function toForm(l: Lesson): Form {
  return {
    title: l.title,
    module_id: l.module_id,
    description: l.description,
    video_url: l.video_url,
    duration_minutes: l.duration_minutes,
    status: l.status,
    typ: l.typ,
    content_html: l.content_html,
    tags: l.tags,
    thumbnail_url: l.thumbnail_url,
    kapitel: l.kapitel,
    anhaenge: l.anhaenge,
    pflicht: l.pflicht,
    kein_vorzeitiges_abschliessen: l.kein_vorzeitiges_abschliessen,
    mit_ki_erstellt: l.mit_ki_erstellt,
  };
}

async function uploadFile(folder: string, file: File): Promise<string> {
  const supabase = createClient();
  const safe = file.name.replace(/[^\w.\-]+/g, '_').slice(-80);
  const path = `${folder}/${Date.now()}-${safe}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export default function LessonEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saved, setSaved] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<'allgemein' | 'kapitel'>('allgemein');
  const [previewStart, setPreviewStart] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/masterclass/lessons/${id}`)
      .then(async (res) => {
        if (cancelled) return;
        if (!res.ok) {
          toast.error('Lektion nicht gefunden');
          router.push('/admin/masterclass');
          return;
        }
        const d = (await res.json()) as Detail;
        setDetail(d);
        const f = toForm(d.lesson);
        setForm(f);
        setSaved(JSON.stringify(f));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [id, router]);

  const dirty = !!form && JSON.stringify(form) !== saved;
  const set = <K extends keyof Form>(key: K, value: Form[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const save = useCallback(async () => {
    if (!form || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/masterclass/lessons/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          description: form.description?.trim() || null,
          video_url: form.video_url?.trim() || null,
          content_html: form.content_html?.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error((data as { error?: string }).error ?? 'Speichern fehlgeschlagen');
        return;
      }
      const l = (data as { lesson: Lesson; schema_ready: boolean }).lesson;
      const f = toForm(l);
      setForm(f);
      setSaved(JSON.stringify(f));
      toast.success((data as { schema_ready: boolean }).schema_ready ? 'Gespeichert' : 'Gespeichert (ohne neue Felder – Datenbank-Update fehlt)');
    } finally {
      setSaving(false);
    }
  }, [form, id, saving]);

  // ⌘S / Strg+S speichert
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        save();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [save]);

  // Ungespeicherte Änderungen beim Verlassen schützen
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  async function remove() {
    if (!confirm('Lektion wirklich löschen?')) return;
    const res = await fetch(`/api/masterclass/lessons/${id}`, { method: 'DELETE' });
    if (!res.ok) return toast.error('Löschen fehlgeschlagen');
    toast.success('Lektion gelöscht');
    router.push('/admin/masterclass');
  }

  const embed = useMemo(() => videoEmbedUrl(form?.video_url ?? null, previewStart), [form?.video_url, previewStart]);

  if (!detail || !form) {
    return (
      <div className="flex justify-center py-24">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-red-200 border-t-red-700" />
      </div>
    );
  }

  const modulTitel = detail.modules.find((m) => m.id === form.module_id)?.title ?? detail.module?.title ?? '';
  const ready = detail.schema_ready !== false;

  return (
    <div>
      {/* Brotkrumen */}
      <nav className="fx-fade mb-3 flex flex-wrap items-center gap-2 text-[14px] text-gray-600">
        <GraduationCap className="h-4 w-4" />
        <Link href="/admin/masterclass" className="hover:text-ink">Masterclass</Link>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="max-w-[220px] truncate">{modulTitel}</span>
        <ChevronRight className="h-3.5 w-3.5" />
        <span className="max-w-[260px] truncate text-gray-500">{form.title || 'Neue Lektion'}</span>
      </nav>

      {/* Kopf */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/admin/masterclass" className="grid h-11 w-11 place-items-center rounded-full hover:bg-gray-100" aria-label="Zurück zur Übersicht">
          <ArrowLeft className="h-6 w-6" />
        </Link>
        <h1 className="min-w-0 flex-1 truncate text-[clamp(26px,2.6vw,36px)] font-semibold tracking-[-0.035em]">{form.title || 'Neue Lektion'}</h1>
        <div className="flex items-center gap-2">
          <button
            disabled={!detail.vorher}
            onClick={() => detail.vorher && router.push(`/admin/masterclass/lektion/${detail.vorher.id}`)}
            title={detail.vorher ? `Vorherige: ${detail.vorher.title}` : undefined}
            aria-label="Vorherige Lektion"
            className="grid h-11 w-11 place-items-center rounded-full hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            disabled={!detail.nachher}
            onClick={() => detail.nachher && router.push(`/admin/masterclass/lektion/${detail.nachher.id}`)}
            title={detail.nachher ? `Nächste: ${detail.nachher.title}` : undefined}
            aria-label="Nächste Lektion"
            className="grid h-11 w-11 place-items-center rounded-full hover:bg-gray-100 disabled:opacity-30"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <Link href={`/masterclass/lektion/${id}`} target="_blank" className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[15px] font-medium shadow-[inset_0_0_0_1.5px_var(--r-950)] hover:bg-red-50">
            <Eye className="h-[18px] w-[18px]" /> Live-Ansicht
          </Link>
          <Button onClick={save} disabled={!dirty || saving}>
            {saving ? 'Speichert …' : dirty ? 'Speichern' : 'Gespeichert'}
          </Button>
        </div>
      </div>

      {!ready && (
        <div className="mb-5 flex gap-3 rounded-xl bg-amber-50 p-4 text-[14px] text-amber-900 shadow-[inset_0_0_0_1px_#fde68a]">
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-none" />
          <p>Datenbank-Update fehlt: Gespeichert werden vorerst nur Name, Modul, Kurzbeschreibung, Video und Dauer.</p>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Linke Spalte */}
        <div className="min-w-0 space-y-4">
          {form.typ === 'video' && (
            <Card padding="none" className="overflow-hidden">
              {embed ? (
                <div className="aspect-video bg-ink">
                  <iframe key={embed} src={embed} title="Video-Vorschau" allow="autoplay; fullscreen; picture-in-picture" allowFullScreen className="h-full w-full" />
                </div>
              ) : (
                <div className="grid aspect-video place-items-center bg-panel text-center">
                  <div>
                    <PlayCircle className="mx-auto h-10 w-10 text-gray-400" />
                    <p className="mt-2 text-[15px] font-medium">Noch kein Video</p>
                    <p className="text-[13px] text-gray-600">Link von YouTube, Vimeo oder Loom unten eintragen.</p>
                  </div>
                </div>
              )}
            </Card>
          )}

          {/* Tabs */}
          <div className="flex gap-6 border-b border-hair px-1">
            {(['allgemein', 'kapitel'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`-mb-px border-b-2 px-1 pb-3 text-[15px] font-medium transition-colors ${tab === t ? 'border-red-800 text-red-800' : 'border-transparent text-gray-600 hover:text-ink'}`}
              >
                {t === 'allgemein' ? 'Allgemein' : `Kapitel${form.kapitel.length ? ` (${form.kapitel.length})` : ''}`}
              </button>
            ))}
          </div>

          {tab === 'allgemein' ? (
            <>
              <Card>
                <h2 className="text-[19px] font-medium tracking-[-0.02em]">{form.typ === 'video' ? 'Video-Lektion' : 'Text-Lektion'}</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Typ">
                    <select value={form.typ} onChange={(e) => set('typ', e.target.value as Form['typ'])} className={selectCls}>
                      <option value="video">Video</option>
                      <option value="text">Text</option>
                    </select>
                  </Field>
                  <Field label="Gehört zu">
                    <select value={form.module_id} onChange={(e) => set('module_id', e.target.value)} className={selectCls}>
                      {detail.modules.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="mt-4 space-y-4">
                  <Field label="Name">
                    <Input value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="z. B. Gatekeeper überwinden" />
                  </Field>
                  {form.typ === 'video' && (
                    <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_140px]">
                      <Field label="Video-Link" hint="YouTube, Vimeo oder Loom">
                        <Input value={form.video_url ?? ''} onChange={(e) => set('video_url', e.target.value)} placeholder="https://www.youtube.com/watch?v=…" />
                      </Field>
                      <Field label="Dauer (Min.)">
                        <Input
                          type="number"
                          min={0}
                          value={form.duration_minutes ?? ''}
                          onChange={(e) => set('duration_minutes', e.target.value === '' ? null : Math.max(0, Math.round(Number(e.target.value))))}
                        />
                      </Field>
                    </div>
                  )}
                  <Field label="Kurzbeschreibung" hint="Erscheint in der Lektionsübersicht">
                    <textarea value={form.description ?? ''} onChange={(e) => set('description', e.target.value)} rows={3} className={textareaCls} />
                  </Field>
                  <Field label="Tags" hint="Enter fügt einen Tag hinzu">
                    <TagInput value={form.tags} onChange={(v) => set('tags', v)} />
                  </Field>
                </div>
              </Card>

              <Card>
                <h2 className="text-[19px] font-medium tracking-[-0.02em]">Inhalt</h2>
                <div className="mt-4">
                  <RichText value={form.content_html ?? ''} onChange={(v) => set('content_html', v)} />
                </div>
              </Card>
            </>
          ) : (
            <Card>
              <h2 className="text-[19px] font-medium tracking-[-0.02em]">Kapitel</h2>
              <p className="mt-1 text-[13.5px] text-gray-600">Sprungmarken im Video. Kunden klicken auf ein Kapitel und das Video startet an dieser Stelle.</p>
              <ChapterEditor value={form.kapitel} onChange={(v) => set('kapitel', v)} onPreview={(s) => setPreviewStart(s)} />
            </Card>
          )}

          <div className="flex items-center justify-between pt-1">
            <Link href="/admin/masterclass" className="inline-flex items-center gap-2 text-[15px] text-gray-600 hover:text-ink">
              <ArrowLeft className="h-4 w-4" /> Zurück
            </Link>
            <button onClick={remove} className="inline-flex items-center gap-2 text-[15px] font-medium text-red-700 hover:underline">
              <Trash2 className="h-4 w-4" /> Lektion löschen
            </button>
          </div>
        </div>

        {/* Rechte Spalte */}
        <div className="space-y-4">
          <Card>
            <h2 className="text-[19px] font-medium tracking-[-0.02em]">Status</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-full bg-panel p-1">
              {(['entwurf', 'veroeffentlicht'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => set('status', s)}
                  className={`inline-flex items-center justify-center gap-2 rounded-full py-2 text-[14px] font-medium transition-colors ${
                    form.status === s ? 'bg-card text-ink shadow-sm' : 'text-gray-600 hover:text-ink'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${s === 'veroeffentlicht' ? 'bg-green-600' : 'bg-gray-400'}`} />
                  {s === 'veroeffentlicht' ? 'Veröffentlicht' : 'Entwurf'}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] text-gray-600">Entwürfe sehen nur Admins.</p>
          </Card>

          <AiCard titel={form.title} modul={modulTitel} beschreibung={form.description ?? ''} onApply={(v) => setForm((f) => (f ? { ...f, ...v, mit_ki_erstellt: true } : f))} />

          <Card>
            <h2 className="text-[19px] font-medium tracking-[-0.02em]">Vorschaubild</h2>
            <ThumbnailPicker lessonId={id} value={form.thumbnail_url} onChange={(v) => set('thumbnail_url', v)} />
          </Card>

          <Card>
            <h2 className="text-[19px] font-medium tracking-[-0.02em]">Anhänge</h2>
            <Attachments lessonId={id} value={form.anhaenge} onChange={(v) => set('anhaenge', v)} />
          </Card>

          <Card>
            <h2 className="text-[19px] font-medium tracking-[-0.02em]">Eigenschaften</h2>
            <div className="mt-3 space-y-3.5">
              <Toggle label="Verpflichtend" hint="Lektion zählt als Pflicht im Fortschritt" value={form.pflicht} onChange={(v) => set('pflicht', v)} />
              <Toggle
                label="Kein vorzeitiges Abschließen"
                hint="„Erledigt“ ist erst nach Ablauf der Videodauer möglich"
                value={form.kein_vorzeitiges_abschliessen}
                onChange={(v) => set('kein_vorzeitiges_abschliessen', v)}
              />
              <div className="flex items-center justify-between gap-3 text-[14.5px]">
                <span>Mit KI erstellt</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${form.mit_ki_erstellt ? 'bg-red-950 text-red-50' : 'bg-panel text-gray-500'}`}>KI</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

/* ── Bausteine ─────────────────────────────────────────────────── */

const selectCls =
  'h-11 w-full cursor-pointer rounded-[12px] bg-card px-3.5 text-[15px] shadow-[inset_0_0_0_1.5px_var(--hair)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--r-700),0_0_0_4px_var(--r-100)]';
const textareaCls =
  'w-full rounded-[12px] bg-card px-3.5 py-2.5 text-[15px] shadow-[inset_0_0_0_1.5px_var(--hair)] outline-none focus:shadow-[inset_0_0_0_1.5px_var(--r-700),0_0_0_4px_var(--r-100)]';

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-baseline gap-2 text-[14px] font-medium">
        {label}
        {hint && <span className="text-[12.5px] font-normal text-gray-500">{hint}</span>}
      </span>
      {children}
    </label>
  );
}

function Toggle({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="min-w-0">
        <span className="block text-[14.5px]">{label}</span>
        {hint && <span className="block text-[12.5px] text-gray-500">{hint}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={label}
        onClick={() => onChange(!value)}
        className={`relative h-7 w-12 flex-none rounded-full transition-colors ${value ? 'bg-red-800' : 'bg-gray-200'}`}
      >
        <span className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-white shadow transition-transform duration-300 ease-fern ${value ? 'translate-x-6' : 'translate-x-1'}`} />
      </button>
    </div>
  );
}

function TagInput({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const t = text.trim().replace(/,$/, '');
    if (t && !value.includes(t)) onChange([...value, t].slice(0, 20));
    setText('');
  };
  return (
    <div className="flex min-h-11 flex-wrap items-center gap-1.5 rounded-[12px] bg-card px-2 py-1.5 shadow-[inset_0_0_0_1.5px_var(--hair)] focus-within:shadow-[inset_0_0_0_1.5px_var(--r-700),0_0_0_4px_var(--r-100)]">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-red-50 py-1 pl-2.5 pr-1 text-[13px] font-medium text-red-800">
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} className="grid h-5 w-5 place-items-center rounded-full hover:bg-red-100" aria-label={`${t} entfernen`}>
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            add();
          } else if (e.key === 'Backspace' && !text && value.length) {
            onChange(value.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={value.length ? '' : 'Tag'}
        className="h-8 min-w-[80px] flex-1 bg-transparent px-1.5 text-[15px] outline-none focus-visible:shadow-none"
      />
    </div>
  );
}

/** Einfacher Rich-Text-Editor (contentEditable) mit HTML-Ansicht; das Speichern filtert serverseitig */
function RichText({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [mode, setMode] = useState<'editor' | 'html'>('editor');
  const ref = useRef<HTMLDivElement>(null);
  const lastValue = useRef<string | null>(null);

  // Nur von außen kommende Änderungen (Laden, KI) in den Editor schreiben – sonst springt der Cursor
  useEffect(() => {
    if (mode === 'editor' && ref.current && value !== lastValue.current) {
      ref.current.innerHTML = value;
      lastValue.current = value;
    }
  }, [value, mode]);

  const cmd = (command: string, arg?: string) => {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    const html = ref.current?.innerHTML ?? '';
    lastValue.current = html;
    onChange(html);
  };

  return (
    <div>
      <div className="mb-3 inline-flex rounded-full bg-panel p-1">
        {(['editor', 'html'] as const).map((m) => (
          <button
            key={m}
            onClick={() => {
              if (m === 'editor') lastValue.current = null;
              setMode(m);
            }}
            className={`inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[14px] font-medium ${mode === m ? 'bg-card text-red-800 shadow-sm' : 'text-gray-600'}`}
          >
            {m === 'editor' ? <Eye className="h-4 w-4" /> : <Code2 className="h-4 w-4" />} {m === 'editor' ? 'Editor' : 'HTML'}
          </button>
        ))}
      </div>
      {mode === 'editor' ? (
        <div className="overflow-hidden rounded-[14px] shadow-[inset_0_0_0_1.5px_var(--hair)]">
          <div className="flex flex-wrap items-center gap-1 border-b border-hair px-2 py-1.5">
            <ToolBtn label="Überschrift" onClick={() => cmd('formatBlock', 'h3')}>
              <span className="text-[13px] font-semibold">H</span>
            </ToolBtn>
            <ToolBtn label="Absatz" onClick={() => cmd('formatBlock', 'p')}>
              <span className="text-[13px]">¶</span>
            </ToolBtn>
            <ToolBtn label="Fett" onClick={() => cmd('bold')}>
              <Bold className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn label="Kursiv" onClick={() => cmd('italic')}>
              <Italic className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn label="Aufzählung" onClick={() => cmd('insertUnorderedList')}>
              <List className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn label="Nummerierte Liste" onClick={() => cmd('insertOrderedList')}>
              <ListOrdered className="h-4 w-4" />
            </ToolBtn>
            <ToolBtn
              label="Link"
              onClick={() => {
                const url = prompt('Link-Adresse (https://…)');
                if (url && /^https?:\/\//.test(url)) cmd('createLink', url);
              }}
            >
              <Link2 className="h-4 w-4" />
            </ToolBtn>
          </div>
          <div
            ref={ref}
            contentEditable
            suppressContentEditableWarning
            onInput={() => {
              const html = ref.current?.innerHTML ?? '';
              lastValue.current = html;
              onChange(html);
            }}
            data-placeholder="Inhalt"
            className="lesson-content min-h-[220px] px-4 py-3 text-[15px] leading-relaxed outline-none empty:before:text-gray-400 empty:before:content-[attr(data-placeholder)]"
          />
        </div>
      ) : (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={12} className={`${textareaCls} font-mono text-[13px]`} spellCheck={false} />
      )}
    </div>
  );
}

function ToolBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={onClick} title={label} aria-label={label} className="grid h-9 min-w-9 place-items-center rounded-[10px] px-2 text-gray-700 hover:bg-panel">
      {children}
    </button>
  );
}

function ChapterEditor({ value, onChange, onPreview }: { value: Kapitel[]; onChange: (v: Kapitel[]) => void; onPreview: (s: number) => void }) {
  const [zeit, setZeit] = useState('');
  const [titel, setTitel] = useState('');
  const add = () => {
    const s = parseZeit(zeit);
    if (s === null) return toast.error('Zeit als mm:ss angeben, z. B. 1:15');
    if (!titel.trim()) return toast.error('Bitte einen Kapitelnamen eingeben');
    onChange([...value, { sekunden: s, titel: titel.trim() }].sort((a, b) => a.sekunden - b.sekunden));
    setZeit('');
    setTitel('');
  };
  return (
    <div className="mt-4 space-y-2">
      {value.map((k, i) => (
        <div key={`${k.sekunden}-${i}`} className="flex items-center gap-2 rounded-[14px] bg-panel px-3 py-2">
          <button onClick={() => onPreview(k.sekunden)} className="w-16 flex-none text-left font-mono text-[14px] font-medium text-red-800 hover:underline" title="In der Vorschau abspielen">
            {formatZeit(k.sekunden)}
          </button>
          <input
            value={k.titel}
            onChange={(e) => onChange(value.map((x, xi) => (xi === i ? { ...x, titel: e.target.value } : x)))}
            className="h-9 min-w-0 flex-1 rounded-[10px] bg-transparent px-2 text-[15px] outline-none focus:bg-card"
          />
          <button onClick={() => onChange(value.filter((_, xi) => xi !== i))} className="grid h-8 w-8 place-items-center rounded-full text-gray-500 hover:bg-card hover:text-red-700" aria-label="Kapitel entfernen">
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <div className="flex flex-wrap gap-2 pt-2">
        <Input value={zeit} onChange={(e) => setZeit(e.target.value)} placeholder="1:15" className="w-24" />
        <Input value={titel} onChange={(e) => setTitel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Kapitelname" className="min-w-[180px] flex-1" />
        <Button variant="secondary" onClick={add}>
          <Plus /> Kapitel
        </Button>
      </div>
    </div>
  );
}

function ThumbnailPicker({ lessonId, value, onChange }: { lessonId: string; value: string | null; onChange: (v: string | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-3">
      {value ? (
        // eslint-disable-next-line @next/next/no-img-element -- Vorschaubild aus dem Storage
        <img src={value} alt="Vorschaubild" className="aspect-video w-full rounded-[14px] object-cover" />
      ) : (
        <div className="grid aspect-video place-items-center rounded-[14px] bg-panel text-gray-500">
          <ImagePlus className="h-8 w-8" />
        </div>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => ref.current?.click()}>
          {busy ? 'Lädt …' : value ? 'Ändern' : 'Hochladen'}
        </Button>
        <Button variant="ghost" size="sm" disabled={!value} onClick={() => onChange(null)}>
          Entfernen
        </Button>
      </div>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          if (f.size > 5 * 1024 * 1024) return toast.error('Bild ist zu groß (max. 5 MB)');
          setBusy(true);
          try {
            onChange(await uploadFile(`masterclass/${lessonId}/vorschau`, f));
          } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
          } finally {
            setBusy(false);
          }
        }}
      />
    </div>
  );
}

function Attachments({ lessonId, value, onChange }: { lessonId: string; value: Anhang[]; onChange: (v: Anhang[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);

  async function upload(files: FileList | File[]) {
    setBusy(true);
    try {
      const added: Anhang[] = [];
      for (const f of Array.from(files)) {
        if (f.size > 50 * 1024 * 1024) {
          toast.error(`${f.name} ist zu groß (max. 50 MB)`);
          continue;
        }
        added.push({ name: f.name, url: await uploadFile(`masterclass/${lessonId}/anhaenge`, f), art: 'datei' });
      }
      if (added.length) onChange([...value, ...added]);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      <button
        type="button"
        onClick={() => ref.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
        }}
        className={`flex w-full flex-col items-center gap-1 rounded-[14px] px-4 py-6 text-center transition-colors ${drag ? 'bg-red-50 shadow-[inset_0_0_0_2px_var(--r-700)]' : 'bg-panel'}`}
      >
        <Upload className="h-7 w-7 text-gray-500" />
        <span className="text-[14.5px] font-medium text-red-800">{busy ? 'Lädt hoch …' : 'Dateien auswählen'}</span>
        <span className="text-[13px] text-gray-600">oder hier ablegen · bis 50 MB</span>
      </button>
      <input ref={ref} type="file" multiple className="hidden" onChange={(e) => e.target.files && upload(e.target.files).then(() => (e.target.value = ''))} />
      <button
        type="button"
        onClick={() => {
          const url = prompt('Link-Adresse (https://…)');
          if (!url) return;
          if (!/^https?:\/\//.test(url)) return toast.error('Bitte eine vollständige URL mit https:// angeben');
          const name = prompt('Anzeigename', url.replace(/^https?:\/\//, '').slice(0, 60)) || url;
          onChange([...value, { name, url, art: 'link' }]);
        }}
        className="inline-flex items-center gap-2 px-1 text-[14.5px] font-medium hover:text-red-800"
      >
        <Link2 className="h-4 w-4" /> Link hinzufügen
      </button>
      {value.length > 0 && (
        <ul className="space-y-1.5">
          {value.map((a, i) => (
            <li key={`${a.url}-${i}`} className="flex items-center gap-2 rounded-[12px] bg-panel px-3 py-2 text-[14px]">
              {a.art === 'link' ? <Link2 className="h-4 w-4 flex-none text-gray-500" /> : <Paperclip className="h-4 w-4 flex-none text-gray-500" />}
              <a href={a.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 truncate hover:text-red-800">
                {a.name}
              </a>
              <button onClick={() => onChange(value.filter((_, xi) => xi !== i))} className="grid h-7 w-7 place-items-center rounded-full text-gray-500 hover:bg-card hover:text-red-700" aria-label="Anhang entfernen">
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AiCard({
  titel,
  modul,
  beschreibung,
  onApply,
}: {
  titel: string;
  modul: string;
  beschreibung: string;
  onApply: (v: { description: string; content_html: string; tags: string[]; kapitel?: Kapitel[] }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [notizen, setNotizen] = useState('');
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const res = await fetch('/api/masterclass/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titel, modul, notizen, beschreibung }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return toast.error((d as { error?: string }).error ?? 'KI-Vorschlag fehlgeschlagen');
      const v = d as { kurzbeschreibung: string; inhalt_html: string; tags: string[]; kapitel: Kapitel[] };
      onApply({ description: v.kurzbeschreibung, content_html: v.inhalt_html, tags: v.tags, ...(v.kapitel.length ? { kapitel: v.kapitel } : {}) });
      toast.success('Vorschlag übernommen – bitte prüfen und speichern');
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl p-[22px] shadow-[inset_0_0_0_2px_var(--r-700)]">
      <div className="flex items-start gap-3.5">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-[14px] bg-gradient-to-b from-red-700 to-red-950 text-red-50">
          <Sparkles className="h-6 w-6" />
        </span>
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[17px] font-medium">
            KI-Assistent <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">Neu</span>
          </p>
          <p className="mt-0.5 text-[13.5px] text-gray-600">Füllt Kurzbeschreibung, Inhalt und Tags vor – aus Titel und deinen Notizen.</p>
        </div>
      </div>
      {open ? (
        <div className="mt-4 space-y-3">
          <textarea
            value={notizen}
            onChange={(e) => setNotizen(e.target.value)}
            rows={6}
            placeholder={'Stichpunkte oder Transkript einfügen.\nMit Zeitmarken („01:15 Einwände“) entstehen auch Kapitel.'}
            className={`${textareaCls} text-[14px]`}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={run} disabled={busy || !titel.trim()} className="flex-1">
              {busy ? 'Schreibt …' : 'Vorschlag erstellen'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Abbrechen
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" className="mt-4 w-full" onClick={() => setOpen(true)}>
          <FileText /> Mit KI ausfüllen
        </Button>
      )}
    </section>
  );
}
