'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
import { Select } from '@/components/ui/select';
import { PageHeader } from '@/components/ui/page-header';
import {
  GraduationCap, Plus, Pencil, Trash2, Video, BookOpen,
  ChevronDown, ChevronRight, Save
} from 'lucide-react';

interface LessonTask {
  id: string;
  lesson_id: string;
  title: string;
  description: string | null;
  sort_order: number;
}

interface Lesson {
  id: string;
  module_id: string;
  title: string;
  description: string | null;
  video_url: string | null;
  video_provider: string;
  duration_minutes: number | null;
  sort_order: number;
  lesson_tasks: LessonTask[];
}

interface Module {
  id: string;
  title: string;
  description: string | null;
  sort_order: number;
  published: boolean;
}

export default function AdminMasterclassPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedModule, setExpandedModule] = useState<string | null>(null);

  // Modal states
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [showLessonModal, setShowLessonModal] = useState(false);
  const [editingModule, setEditingModule] = useState<Module | null>(null);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);
  const [selectedModuleId, setSelectedModuleId] = useState<string>('');

  // Form states
  const [moduleTitle, setModuleTitle] = useState('');
  const [moduleDesc, setModuleDesc] = useState('');
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonDesc, setLessonDesc] = useState('');
  const [lessonVideoUrl, setLessonVideoUrl] = useState('');
  const [lessonVideoProvider, setLessonVideoProvider] = useState('youtube');
  const [lessonDuration, setLessonDuration] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    const res = await fetch('/api/masterclass');
    const data = await res.json();
    setModules(data.modules);
    setLessons(data.lessons);
    setLoading(false);
  }

  async function saveModule() {
    setSaving(true);
    const payload = editingModule
      ? { action: 'update_module', id: editingModule.id, title: moduleTitle, description: moduleDesc || null }
      : { action: 'create_module', title: moduleTitle, description: moduleDesc || null, sort_order: modules.length + 1, published: true };

    await fetch('/api/masterclass/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setShowModuleModal(false);
    setEditingModule(null);
    setModuleTitle('');
    setModuleDesc('');
    setSaving(false);
    await loadData();
  }

  async function saveLesson() {
    setSaving(true);
    const payload = editingLesson
      ? {
          action: 'update_lesson', id: editingLesson.id,
          title: lessonTitle, description: lessonDesc || null,
          video_url: lessonVideoUrl || null, video_provider: lessonVideoProvider,
          duration_minutes: lessonDuration ? parseInt(lessonDuration) : null,
        }
      : {
          action: 'create_lesson', module_id: selectedModuleId,
          title: lessonTitle, description: lessonDesc || null,
          video_url: lessonVideoUrl || null, video_provider: lessonVideoProvider,
          duration_minutes: lessonDuration ? parseInt(lessonDuration) : null,
          sort_order: lessons.filter((l) => l.module_id === selectedModuleId).length + 1,
        };

    await fetch('/api/masterclass/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    setShowLessonModal(false);
    setEditingLesson(null);
    resetLessonForm();
    setSaving(false);
    await loadData();
  }

  async function deleteModule(id: string) {
    if (!confirm('Modul und alle Lektionen löschen?')) return;
    await fetch('/api/masterclass/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_module', id }),
    });
    await loadData();
  }

  async function deleteLesson(id: string) {
    if (!confirm('Lektion löschen?')) return;
    await fetch('/api/masterclass/admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete_lesson', id }),
    });
    await loadData();
  }

  function openEditModule(mod: Module) {
    setEditingModule(mod);
    setModuleTitle(mod.title);
    setModuleDesc(mod.description || '');
    setShowModuleModal(true);
  }

  function openAddLesson(moduleId: string) {
    setSelectedModuleId(moduleId);
    resetLessonForm();
    setShowLessonModal(true);
  }

  function openEditLesson(lesson: Lesson) {
    setEditingLesson(lesson);
    setLessonTitle(lesson.title);
    setLessonDesc(lesson.description || '');
    setLessonVideoUrl(lesson.video_url || '');
    setLessonVideoProvider(lesson.video_provider || 'youtube');
    setLessonDuration(lesson.duration_minutes?.toString() || '');
    setShowLessonModal(true);
  }

  function resetLessonForm() {
    setLessonTitle('');
    setLessonDesc('');
    setLessonVideoUrl('');
    setLessonVideoProvider('youtube');
    setLessonDuration('');
    setEditingLesson(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-red-200 border-t-red-500 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        label="VERWALTUNG"
        title="Masterclass verwalten"
        description={`${modules.length} Module, ${lessons.length} Lektionen`}
        action={
          <Button onClick={() => { setEditingModule(null); setModuleTitle(''); setModuleDesc(''); setShowModuleModal(true); }}>
            <Plus className="w-4 h-4" /> Modul
          </Button>
        }
      />

      <div className="space-y-8">
        {modules.map((mod) => {
          const modLessons = lessons.filter((l) => l.module_id === mod.id);
          const isExpanded = expandedModule === mod.id;

          return (
            <Card key={mod.id} padding="sm" className="!p-0 overflow-hidden">
              <button
                onClick={() => setExpandedModule(isExpanded ? null : mod.id)}
                className="w-full flex items-center gap-4 p-5 hover:bg-[var(--surface-subtle)] transition-colors cursor-pointer"
              >
                {isExpanded ? <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" /> : <ChevronRight className="w-4 h-4 text-[var(--text-tertiary)]" />}
                <span className="font-semibold text-[15px] text-[var(--text-primary)] flex-1 text-left">{mod.title}</span>
                <Badge tone="neutral">{modLessons.length} Lektionen</Badge>
                <button onClick={(e) => { e.stopPropagation(); openEditModule(mod); }} className="p-1 hover:bg-[var(--surface-inset)] rounded-[var(--radius-xs)] cursor-pointer">
                  <Pencil className="w-4 h-4 text-[var(--text-tertiary)]" />
                </button>
                <button onClick={(e) => { e.stopPropagation(); deleteModule(mod.id); }} className="p-1 hover:bg-red-50 rounded-[var(--radius-xs)] cursor-pointer">
                  <Trash2 className="w-4 h-4 text-[var(--text-tertiary)] hover:text-red-500" />
                </button>
              </button>

              {isExpanded && (
                <div className="border-t border-[var(--border-default)] px-5 pb-5">
                  <div className="space-y-3 mt-4">
                    {modLessons.map((lesson) => (
                      <div key={lesson.id} className="flex items-center gap-4 px-4 py-3 bg-[var(--surface-subtle)] rounded-[var(--radius-md)]">
                        <Video className="w-4 h-4 text-[var(--text-tertiary)]" />
                        <span className="text-[15px] text-[var(--text-primary)] flex-1">{lesson.title}</span>
                        {lesson.duration_minutes && <span className="text-[13px] text-[var(--text-tertiary)]">{lesson.duration_minutes}m</span>}
                        {lesson.lesson_tasks?.length > 0 && <Badge tone="softAccent">{lesson.lesson_tasks.length} Tasks</Badge>}
                        <button onClick={() => openEditLesson(lesson)} className="p-1 hover:bg-white rounded-[var(--radius-xs)] cursor-pointer">
                          <Pencil className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                        </button>
                        <button onClick={() => deleteLesson(lesson.id)} className="p-1 hover:bg-red-50 rounded-[var(--radius-xs)] cursor-pointer">
                          <Trash2 className="w-3.5 h-3.5 text-[var(--text-tertiary)]" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => openAddLesson(mod.id)} className="mt-3">
                    <Plus className="w-3.5 h-3.5" /> Lektion hinzufügen
                  </Button>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Module Modal */}
      <Modal open={showModuleModal} onClose={() => setShowModuleModal(false)} title={editingModule ? 'Modul bearbeiten' : 'Neues Modul'}>
        <div className="space-y-6">
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Titel</label>
            <Input value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} placeholder="z.B. Bewerber-Management" />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Beschreibung</label>
            <textarea
              value={moduleDesc}
              onChange={(e) => setModuleDesc(e.target.value)}
              rows={3}
              className="w-full px-4 py-3 border border-[var(--border-default)] rounded-[var(--radius-md)] text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] bg-white shadow-[var(--shadow-xs)] outline-none resize-none"
              placeholder="Kurze Beschreibung"
            />
          </div>
          <div className="flex gap-4 pt-3">
            <Button variant="secondary" onClick={() => setShowModuleModal(false)} className="flex-1">Abbrechen</Button>
            <Button onClick={saveModule} disabled={!moduleTitle || saving} className="flex-1">
              <Save className="w-4 h-4" /> {saving ? 'Speichern...' : 'Speichern'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Lesson Modal */}
      <Modal open={showLessonModal} onClose={() => setShowLessonModal(false)} title={editingLesson ? 'Lektion bearbeiten' : 'Neue Lektion'}>
        <div className="space-y-6">
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Titel</label>
            <Input value={lessonTitle} onChange={(e) => setLessonTitle(e.target.value)} placeholder="z.B. Pipeline richtig nutzen" />
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Beschreibung</label>
            <textarea
              value={lessonDesc}
              onChange={(e) => setLessonDesc(e.target.value)}
              rows={2}
              className="w-full px-4 py-3 border border-[var(--border-default)] rounded-[var(--radius-md)] text-[15px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] bg-white shadow-[var(--shadow-xs)] outline-none resize-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Video URL</label>
              <Input value={lessonVideoUrl} onChange={(e) => setLessonVideoUrl(e.target.value)} icon={<Video className="w-4 h-4" />} placeholder="YouTube/Vimeo URL" />
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Provider</label>
              <Select
                value={lessonVideoProvider}
                onChange={(e) => setLessonVideoProvider(e.target.value)}
                options={[
                  { value: 'youtube', label: 'YouTube' },
                  { value: 'vimeo', label: 'Vimeo' },
                ]}
              />
            </div>
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Dauer (Minuten)</label>
            <Input type="number" value={lessonDuration} onChange={(e) => setLessonDuration(e.target.value)} placeholder="z.B. 10" />
          </div>
          <div className="flex gap-4 pt-3">
            <Button variant="secondary" onClick={() => setShowLessonModal(false)} className="flex-1">Abbrechen</Button>
            <Button onClick={saveLesson} disabled={!lessonTitle || saving} className="flex-1">
              <Save className="w-4 h-4" /> {saving ? 'Speichern...' : 'Speichern'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
